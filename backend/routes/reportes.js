const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { toCSV } = require('../utils/csv');

const PUEDE_VER_TODOS = ['administrador', 'jefe_comercial', 'gerencia'];
const PUEDE_VER = ['administrador', 'jefe_comercial', 'gerencia', 'vendedor'];

router.use(authenticate);
router.use(authorize(...PUEDE_VER));

// Si el usuario no puede ver todos los vendedores, se fuerza a sus propios números.
function vendedorFiltro(req) {
  if (PUEDE_VER_TODOS.includes(req.user.rol)) return req.query.vendedor_id || null;
  return req.user.id;
}

async function embudo(req) {
  const vendedorId = vendedorFiltro(req);
  const { desde, hasta, pipeline_id } = req.query;
  const pipelineId = pipeline_id || 1;
  const params = [];
  const condiciones = [];
  let i = 1;
  if (vendedorId) { condiciones.push(`n.vendedor_id = $${i++}`); params.push(vendedorId); }
  if (desde) { condiciones.push(`n.fecha_cierre_estimada >= $${i++}`); params.push(desde); }
  if (hasta) { condiciones.push(`n.fecha_cierre_estimada <= $${i++}`); params.push(hasta); }
  const filtroJoin = condiciones.length ? `AND ${condiciones.join(' AND ')}` : '';
  params.push(pipelineId);
  return db.all(
    `SELECT pe.id AS etapa_id, pe.nombre AS etapa_nombre, pe.orden, pe.tipo,
            count(n.id)::int AS cantidad, coalesce(sum(n.monto_estimado), 0) AS monto_total
     FROM pipeline_etapas pe
     LEFT JOIN negocios n ON n.etapa_id = pe.id ${filtroJoin}
     WHERE pe.activo = true AND pe.pipeline_id = $${i}
     GROUP BY pe.id, pe.nombre, pe.orden, pe.tipo
     ORDER BY pe.orden`,
    params
  );
}

async function causasNoCierre(req) {
  const vendedorId = vendedorFiltro(req);
  const { desde, hasta, pipeline_id } = req.query;
  const clauses = [`n.causa_no_cierre_id IS NOT NULL`, `n.pipeline_id = $1`];
  const params = [pipeline_id || 1];
  let i = 2;
  if (vendedorId) { clauses.push(`n.vendedor_id = $${i++}`); params.push(vendedorId); }
  if (desde) { clauses.push(`n.fecha_cierre >= $${i++}`); params.push(desde); }
  if (hasta) { clauses.push(`n.fecha_cierre <= $${i++}`); params.push(hasta); }
  return db.all(
    `SELECT ca.nombre AS causa, count(n.id)::int AS cantidad, coalesce(sum(n.monto_estimado), 0) AS monto_total
     FROM negocios n JOIN causas_no_cierre ca ON ca.id = n.causa_no_cierre_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY ca.nombre ORDER BY cantidad DESC`,
    params
  );
}

async function tiemposEtapa(req) {
  const vendedorId = vendedorFiltro(req);
  const { pipeline_id } = req.query;
  const params = [pipeline_id || 1];
  let where = 'WHERE h.salio_en IS NOT NULL AND n.pipeline_id = $1';
  if (vendedorId) { params.push(vendedorId); where += ` AND n.vendedor_id = $${params.length}`; }
  return db.all(
    `SELECT pe.id AS etapa_id, pe.nombre AS etapa_nombre, pe.orden,
            round(avg(EXTRACT(EPOCH FROM (h.salio_en - h.entro_en)) / 86400)::numeric, 1) AS dias_promedio,
            count(*)::int AS tramos
     FROM negocio_etapa_historial h
     JOIN pipeline_etapas pe ON pe.id = h.etapa_id
     JOIN negocios n ON n.id = h.negocio_id
     ${where}
     GROUP BY pe.id, pe.nombre, pe.orden ORDER BY pe.orden`,
    params
  );
}

async function rankingVendedores(req) {
  const { desde, hasta, pipeline_id } = req.query;
  const clauses = ["pe.tipo IN ('ganada','perdida')", `n.pipeline_id = $1`];
  const params = [pipeline_id || 1];
  let i = 2;
  if (desde) { clauses.push(`n.fecha_cierre >= $${i++}`); params.push(desde); }
  if (hasta) { clauses.push(`n.fecha_cierre <= $${i++}`); params.push(hasta); }
  const vendedorId = vendedorFiltro(req);
  if (vendedorId) { clauses.push(`n.vendedor_id = $${i++}`); params.push(vendedorId); }
  return db.all(
    `SELECT u.id AS vendedor_id, u.nombre AS vendedor_nombre,
            count(*) FILTER (WHERE pe.tipo = 'ganada')::int AS ganados,
            count(*) FILTER (WHERE pe.tipo = 'perdida')::int AS perdidos,
            coalesce(sum(n.monto_estimado) FILTER (WHERE pe.tipo = 'ganada'), 0) AS monto_ganado,
            round(
              (count(*) FILTER (WHERE pe.tipo = 'ganada')::numeric /
               nullif(count(*), 0)) * 100, 1
            ) AS tasa_cierre_pct
     FROM negocios n
     JOIN pipeline_etapas pe ON pe.id = n.etapa_id
     JOIN users u ON u.id = n.vendedor_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY u.id, u.nombre ORDER BY monto_ganado DESC`,
    params
  );
}

// Cotizaciones generadas por día (fecha de creación de la última versión de
// cada una), con su monto total. Las versiones anteriores no cuentan: no son
// una oportunidad aparte, evita duplicar/triplicar lo que se ve generado.
async function cotizacionesPorDia(req) {
  const vendedorId = vendedorFiltro(req);
  const { desde, hasta, pipeline_id } = req.query;
  const clauses = [
    `c.version = (SELECT MAX(c2.version) FROM cotizaciones c2 WHERE c2.negocio_id = c.negocio_id AND c2.numero = c.numero)`,
    `n.pipeline_id = $1`,
  ];
  const params = [pipeline_id || 1];
  let i = 2;
  if (vendedorId) { clauses.push(`n.vendedor_id = $${i++}`); params.push(vendedorId); }
  if (desde) { clauses.push(`c.created_at >= $${i++}`); params.push(desde); }
  if (hasta) { clauses.push(`c.created_at < ($${i++}::date + interval '1 day')`); params.push(hasta); }
  const where = `WHERE ${clauses.join(' AND ')}`;
  return db.all(
    `SELECT to_char(date(c.created_at), 'YYYY-MM-DD') AS fecha, count(*)::int AS cantidad, coalesce(sum(c.total), 0) AS monto_total
     FROM cotizaciones c
     JOIN negocios n ON n.id = c.negocio_id
     ${where}
     GROUP BY date(c.created_at)
     ORDER BY date(c.created_at) DESC`,
    params
  );
}

// Actividad del mes en curso por vendedor, para el gráfico del Dashboard:
// monto (y cantidad) de cotizaciones emitidas y de negocios pasados a
// cerrado-ganado dentro del rango. Mismos filtros de fecha que usan por
// separado cotizacionesPorDia (c.created_at) y rankingVendedores (n.fecha_cierre).
async function actividadMesPorVendedor(req) {
  const vendedorId = vendedorFiltro(req);
  const { desde, hasta, pipeline_id } = req.query;
  const pipelineId = pipeline_id || 1;
  const params = [pipelineId, desde, hasta, vendedorId];
  return db.all(
    `SELECT coalesce(cot.vendedor_id, gan.vendedor_id) AS vendedor_id,
            coalesce(cot.vendedor_nombre, gan.vendedor_nombre) AS vendedor_nombre,
            coalesce(cot.cantidad, 0) AS cotizaciones_cantidad,
            coalesce(cot.monto, 0) AS cotizaciones_monto,
            coalesce(gan.cantidad, 0) AS ganados_cantidad,
            coalesce(gan.monto, 0) AS ganados_monto
     FROM (
       SELECT u.id AS vendedor_id, u.nombre AS vendedor_nombre,
              count(*)::int AS cantidad, coalesce(sum(c.total), 0) AS monto
       FROM cotizaciones c
       JOIN negocios n ON n.id = c.negocio_id
       JOIN users u ON u.id = n.vendedor_id
       WHERE c.version = (SELECT MAX(c2.version) FROM cotizaciones c2 WHERE c2.negocio_id = c.negocio_id AND c2.numero = c.numero)
         AND n.pipeline_id = $1
         AND c.created_at >= $2 AND c.created_at < ($3::date + interval '1 day')
         AND ($4::int IS NULL OR n.vendedor_id = $4)
       GROUP BY u.id, u.nombre
     ) cot
     FULL JOIN (
       SELECT u.id AS vendedor_id, u.nombre AS vendedor_nombre,
              count(*)::int AS cantidad, coalesce(sum(n.monto_estimado), 0) AS monto
       FROM negocios n
       JOIN pipeline_etapas pe ON pe.id = n.etapa_id
       JOIN users u ON u.id = n.vendedor_id
       WHERE pe.tipo = 'ganada' AND n.pipeline_id = $1
         AND n.fecha_cierre >= $2 AND n.fecha_cierre <= $3
         AND ($4::int IS NULL OR n.vendedor_id = $4)
       GROUP BY u.id, u.nombre
     ) gan ON gan.vendedor_id = cot.vendedor_id
     ORDER BY cotizaciones_monto DESC, ganados_monto DESC`,
    params
  );
}

// Detalle por vendedor de la actividad comercial de un día puntual:
// contactos recién asignados, cotizaciones generadas y cotizaciones ganadas
// (el negocio se cerró ganado ese día; se usa la última cotización del
// negocio como monto representativo del cierre).
async function cotizacionesPorDiaDetalle(req) {
  const { fecha, pipeline_id } = req.query;
  const vendedorId = vendedorFiltro(req);
  const pipelineId = pipeline_id || 1;
  // "Contactos asignados" no depende de pipeline (los contactos no pertenecen
  // a uno); el filtro de pipeline solo aplica a las dos subconsultas que
  // pasan por negocios (cotizaciones generadas / ganadas).
  const filtroVendedor = vendedorId ? 'AND vendedor_id = $3' : '';
  const params = vendedorId ? [fecha, pipelineId, vendedorId] : [fecha, pipelineId];
  return db.all(
    `SELECT u.id AS vendedor_id, u.nombre AS vendedor_nombre,
            coalesce(ca.cantidad, 0) AS contactos_asignados,
            coalesce(cg.cantidad, 0) AS cotizaciones_generadas,
            coalesce(cg.monto_total, 0) AS cotizaciones_generadas_monto,
            coalesce(gz.cantidad, 0) AS cotizaciones_ganadas,
            coalesce(gz.monto_total, 0) AS cotizaciones_ganadas_monto
     FROM users u
     LEFT JOIN (
       SELECT vendedor_id, count(*)::int AS cantidad
       FROM contactos WHERE date(vendedor_asignado_en) = $1::date ${filtroVendedor}
       GROUP BY vendedor_id
     ) ca ON ca.vendedor_id = u.id
     LEFT JOIN (
       SELECT n.vendedor_id, count(*)::int AS cantidad, coalesce(sum(c.total), 0) AS monto_total
       FROM cotizaciones c JOIN negocios n ON n.id = c.negocio_id
       WHERE date(c.created_at) = $1::date AND n.pipeline_id = $2 ${filtroVendedor.replace('vendedor_id', 'n.vendedor_id')}
         AND c.version = (SELECT MAX(c2.version) FROM cotizaciones c2 WHERE c2.negocio_id = c.negocio_id AND c2.numero = c.numero)
       GROUP BY n.vendedor_id
     ) cg ON cg.vendedor_id = u.id
     LEFT JOIN (
       SELECT n.vendedor_id, count(*)::int AS cantidad, coalesce(sum(uc.total), 0) AS monto_total
       FROM negocios n
       JOIN pipeline_etapas pe ON pe.id = n.etapa_id
       JOIN LATERAL (
         SELECT total FROM cotizaciones WHERE negocio_id = n.id ORDER BY created_at DESC LIMIT 1
       ) uc ON true
       WHERE date(n.fecha_cierre) = $1::date AND pe.tipo = 'ganada' AND n.pipeline_id = $2 ${filtroVendedor.replace('vendedor_id', 'n.vendedor_id')}
       GROUP BY n.vendedor_id
     ) gz ON gz.vendedor_id = u.id
     WHERE ca.cantidad IS NOT NULL OR cg.cantidad IS NOT NULL OR gz.cantidad IS NOT NULL
     ORDER BY u.nombre`,
    params
  );
}

const REPORTES = {
  embudo: { fn: embudo, headers: ['etapa_nombre', 'cantidad', 'monto_total'] },
  causas: { fn: causasNoCierre, headers: ['causa', 'cantidad', 'monto_total'] },
  tiempos: { fn: tiemposEtapa, headers: ['etapa_nombre', 'dias_promedio', 'tramos'] },
  ranking: { fn: rankingVendedores, headers: ['vendedor_nombre', 'ganados', 'perdidos', 'monto_ganado', 'tasa_cierre_pct'] },
  cotizaciones_dia: { fn: cotizacionesPorDia, headers: ['fecha', 'cantidad', 'monto_total'] },
};

router.get('/embudo', async (req, res) => {
  try { res.json(await embudo(req)); }
  catch (err) { console.error('[reportes/embudo]', err); res.status(500).json({ error: 'Error interno' }); }
});
router.get('/causas-no-cierre', async (req, res) => {
  try { res.json(await causasNoCierre(req)); }
  catch (err) { console.error('[reportes/causas]', err); res.status(500).json({ error: 'Error interno' }); }
});
router.get('/tiempos-etapa', async (req, res) => {
  try { res.json(await tiemposEtapa(req)); }
  catch (err) { console.error('[reportes/tiempos]', err); res.status(500).json({ error: 'Error interno' }); }
});
router.get('/ranking-vendedores', async (req, res) => {
  try { res.json(await rankingVendedores(req)); }
  catch (err) { console.error('[reportes/ranking]', err); res.status(500).json({ error: 'Error interno' }); }
});
router.get('/actividad-mes', async (req, res) => {
  try { res.json(await actividadMesPorVendedor(req)); }
  catch (err) { console.error('[reportes/actividad-mes]', err); res.status(500).json({ error: 'Error interno' }); }
});
router.get('/cotizaciones-por-dia', async (req, res) => {
  try { res.json(await cotizacionesPorDia(req)); }
  catch (err) { console.error('[reportes/cotizaciones-por-dia]', err); res.status(500).json({ error: 'Error interno' }); }
});
router.get('/cotizaciones-por-dia/detalle', async (req, res) => {
  try {
    if (!req.query.fecha) return res.status(400).json({ error: 'fecha requerida' });
    res.json(await cotizacionesPorDiaDetalle(req));
  } catch (err) { console.error('[reportes/cotizaciones-por-dia/detalle]', err); res.status(500).json({ error: 'Error interno' }); }
});

// GET /api/reportes/export?tipo=embudo|causas|tiempos|ranking
router.get('/export', async (req, res) => {
  try {
    const { tipo } = req.query;
    const reporte = REPORTES[tipo];
    if (!reporte) return res.status(400).json({ error: 'Tipo de reporte inválido' });
    const filas = await reporte.fn(req);
    const csv = toCSV(reporte.headers, filas);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_${tipo}.csv"`);
    res.send('﻿' + csv);
  } catch (err) {
    console.error('[reportes/export]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
