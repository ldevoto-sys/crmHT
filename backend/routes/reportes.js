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
  const params = [];
  let filtroVendedor = '';
  if (vendedorId) { params.push(vendedorId); filtroVendedor = 'AND n.vendedor_id = $1'; }
  return db.all(
    `SELECT pe.id AS etapa_id, pe.nombre AS etapa_nombre, pe.orden, pe.tipo,
            count(n.id)::int AS cantidad, coalesce(sum(n.monto_estimado), 0) AS monto_total
     FROM pipeline_etapas pe
     LEFT JOIN negocios n ON n.etapa_id = pe.id ${filtroVendedor}
     WHERE pe.activo = true
     GROUP BY pe.id, pe.nombre, pe.orden, pe.tipo
     ORDER BY pe.orden`,
    params
  );
}

async function causasNoCierre(req) {
  const vendedorId = vendedorFiltro(req);
  const { desde, hasta } = req.query;
  const clauses = [`n.causa_no_cierre_id IS NOT NULL`];
  const params = [];
  let i = 1;
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
  const params = [];
  let where = 'WHERE h.salio_en IS NOT NULL';
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
  const { desde, hasta } = req.query;
  const clauses = ["pe.tipo IN ('ganada','perdida')"];
  const params = [];
  let i = 1;
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

const REPORTES = {
  embudo: { fn: embudo, headers: ['etapa_nombre', 'cantidad', 'monto_total'] },
  causas: { fn: causasNoCierre, headers: ['causa', 'cantidad', 'monto_total'] },
  tiempos: { fn: tiemposEtapa, headers: ['etapa_nombre', 'dias_promedio', 'tramos'] },
  ranking: { fn: rankingVendedores, headers: ['vendedor_nombre', 'ganados', 'perdidos', 'monto_ganado', 'tasa_cierre_pct'] },
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
