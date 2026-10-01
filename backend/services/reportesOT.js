// Reportes de Órdenes de Trabajo (pestaña "OT's" de Reportes, v1.40,
// 01-10-2026). Todas las consultas parten de la misma CTE `base`: una fila
// por OT con su valor de venta, técnicos y fechas.
//
// Definiciones (acordadas con Luis Devoto):
// - Valor de venta: monto NETO de la cotización más reciente del negocio
//   (mismo criterio que sincronizarMontoEstimado(): en cotizaciones de
//   origen "operaciones" el neto es el subtotal; en el resto, subtotal menos
//   descuento). Si el negocio no tiene cotización (ej. cargado por el
//   importador de oportunidades), se toma negocios.monto_estimado.
// - Ejecutada: la OT tiene fecha de ejecución. Cuenta en el período de esa
//   fecha, aunque el negocio ya esté en "Facturado".
// - Programada: la OT entró alguna vez a la etapa "Programado" (o trae horas
//   programadas, como las cargadas por el importador directo a "Ejecutado").
//   Cuenta en el período en que entró; sin historial, el de su fecha de
//   ejecución o, si no tiene, el de creación de la OT.
// - Pendiente: hoy en la etapa "Programado" y sin fecha de ejecución.
// - Horas-hombre: horas de trabajo × cantidad de técnicos (3 técnicos en una
//   OT de 6 horas = 18 horas-hombre). No hay horas "reales": se usan las
//   programadas.
// - Por técnico: cada técnico suma las horas completas de la OT; el valor de
//   venta se reparte en partes iguales entre los técnicos de la OT, para que
//   la suma por técnico coincida con el total.
const { db } = require('../db');

const FECHA_CHILE = `(now() AT TIME ZONE 'America/Santiago')::date`;

function construir(query, vendedorId, { conRango = true } = {}) {
  const params = [];
  const p = valor => { params.push(valor); return `$${params.length}`; };
  const where = [];
  if (vendedorId) where.push(`n.vendedor_id = ${p(vendedorId)}`);
  if (query.cliente_id) where.push(`n.empresa_id = ${p(query.cliente_id)}`);
  if (query.tipo_trabajo) where.push(`n.tipo_trabajo = ${p(query.tipo_trabajo)}`);
  if (query.tecnico_id) where.push(`EXISTS (SELECT 1 FROM ot_tecnicos tf WHERE tf.ot_id = o.id AND tf.user_id = ${p(query.tecnico_id)})`);

  let progOK = 'programada_en IS NOT NULL';
  let ejecOK = 'fecha_ejecucion IS NOT NULL';
  if (conRango) {
    const desde = p(query.desde || null); const hasta = p(query.hasta || null);
    const rango = col => `(${desde}::date IS NULL OR ${col} >= ${desde}::date) AND (${hasta}::date IS NULL OR ${col} <= ${hasta}::date)`;
    progOK = `programada_en IS NOT NULL AND ${rango('programada_en::date')}`;
    ejecOK = `fecha_ejecucion IS NOT NULL AND ${rango('fecha_ejecucion')}`;
  }
  const pendiente = `fecha_ejecucion IS NULL AND lower(etapa_actual) = 'programado'`;

  const cte = `
    WITH base AS (
      SELECT o.id AS ot_id, o.negocio_id, o.horas_programadas, o.fecha_ejecucion, o.id_fracttal,
             n.tipo_trabajo, n.titulo, n.empresa_id, e.razon_social AS cliente, pe.nombre AS etapa_actual,
             COALESCE(cot.neto, n.monto_estimado, 0) AS valor, (cot.neto IS NULL) AS sin_cotizacion,
             CASE WHEN o.horas_programadas IS NOT NULL OR hp.entro IS NOT NULL
                  THEN COALESCE(hp.entro, o.fecha_ejecucion::timestamp, o.created_at) END AS programada_en,
             (SELECT COUNT(*) FROM ot_tecnicos t WHERE t.ot_id = o.id)::int AS n_tecnicos
      FROM ordenes_trabajo o
      JOIN negocios n ON n.id = o.negocio_id
      LEFT JOIN empresas e ON e.id = n.empresa_id
      LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id
      LEFT JOIN LATERAL (
        SELECT CASE WHEN c.origen = 'operaciones' THEN c.subtotal
                    ELSE ROUND(c.subtotal * (1 - COALESCE(c.descuento_pct, 0) / 100.0)) END AS neto
        FROM cotizaciones c WHERE c.negocio_id = n.id ORDER BY c.created_at DESC LIMIT 1
      ) cot ON true
      LEFT JOIN LATERAL (
        SELECT MIN(h.entro_en) AS entro FROM negocio_etapa_historial h
        JOIN pipeline_etapas p2 ON p2.id = h.etapa_id
        WHERE h.negocio_id = n.id AND lower(p2.nombre) = 'programado'
      ) hp ON true
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    )`;
  return { cte, params, progOK, ejecOK, pendiente, p };
}

const TECNICOS_TEXTO = `(SELECT string_agg(u.nombre, ', ' ORDER BY u.nombre) FROM ot_tecnicos t JOIN users u ON u.id = t.user_id WHERE t.ot_id = base.ot_id)`;

// Una sola fila con los totales del período y lo pendiente hoy.
async function otsKpis(query, vendedorId) {
  const c = construir(query, vendedorId);
  return db.all(
    `${c.cte}
     SELECT COUNT(*) FILTER (WHERE ${c.progOK})::int AS programadas_cantidad,
            COALESCE(SUM(valor) FILTER (WHERE ${c.progOK}), 0)::float8 AS programadas_valor,
            COUNT(*) FILTER (WHERE ${c.ejecOK})::int AS ejecutadas_cantidad,
            COALESCE(SUM(valor) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS ejecutadas_valor,
            COALESCE(SUM(COALESCE(horas_programadas, 0) * n_tecnicos) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS horas_hombre_ejecutadas,
            COUNT(*) FILTER (WHERE ${c.pendiente})::int AS pendientes_cantidad,
            COALESCE(SUM(valor) FILTER (WHERE ${c.pendiente}), 0)::float8 AS pendientes_valor,
            COALESCE(SUM(COALESCE(horas_programadas, 0) * n_tecnicos) FILTER (WHERE ${c.pendiente}), 0)::float8 AS horas_hombre_pendientes,
            COUNT(*) FILTER (WHERE (${c.progOK} OR ${c.ejecOK}) AND sin_cotizacion)::int AS sin_cotizacion_cantidad
     FROM base`,
    c.params
  );
}

async function otsResumenMensual(query, vendedorId) {
  const c = construir(query, vendedorId);
  return db.all(
    `${c.cte}
     SELECT mes,
            SUM(prog_cant)::int AS programadas_cantidad, SUM(prog_valor)::float8 AS programadas_valor,
            SUM(ejec_cant)::int AS ejecutadas_cantidad, SUM(ejec_valor)::float8 AS ejecutadas_valor,
            SUM(horas_hombre)::float8 AS horas_hombre_ejecutadas
     FROM (
       SELECT to_char(programada_en, 'YYYY-MM') AS mes, 1 AS prog_cant, valor AS prog_valor, 0 AS ejec_cant, 0 AS ejec_valor, 0 AS horas_hombre
       FROM base WHERE ${c.progOK}
       UNION ALL
       SELECT to_char(fecha_ejecucion, 'YYYY-MM'), 0, 0, 1, valor, COALESCE(horas_programadas, 0) * n_tecnicos
       FROM base WHERE ${c.ejecOK}
     ) x GROUP BY mes ORDER BY mes`,
    c.params
  );
}

async function otsPorTipo(query, vendedorId) {
  const c = construir(query, vendedorId);
  return db.all(
    `${c.cte}
     SELECT COALESCE(tipo_trabajo, 'sin_tipo') AS tipo_trabajo,
            COUNT(*) FILTER (WHERE ${c.progOK})::int AS programadas_cantidad,
            COALESCE(SUM(valor) FILTER (WHERE ${c.progOK}), 0)::float8 AS programadas_valor,
            COUNT(*) FILTER (WHERE ${c.ejecOK})::int AS ejecutadas_cantidad,
            COALESCE(SUM(valor) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS ejecutadas_valor,
            COALESCE(SUM(COALESCE(horas_programadas, 0) * n_tecnicos) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS horas_hombre_ejecutadas
     FROM base GROUP BY 1
     HAVING COUNT(*) FILTER (WHERE ${c.progOK} OR ${c.ejecOK}) > 0
     ORDER BY ejecutadas_valor DESC, programadas_valor DESC`,
    c.params
  );
}

async function otsPorTecnico(query, vendedorId) {
  const c = construir(query, vendedorId);
  const filtroTecnico = query.tecnico_id ? `WHERE u.id = ${c.p(query.tecnico_id)}` : '';
  return db.all(
    `${c.cte}
     SELECT u.id AS tecnico_id, u.nombre AS tecnico_nombre,
            COUNT(*) FILTER (WHERE ${c.progOK})::int AS programadas_cantidad,
            COUNT(*) FILTER (WHERE ${c.ejecOK})::int AS ejecutadas_cantidad,
            COALESCE(SUM(COALESCE(b.horas_programadas, 0)) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS horas_ejecutadas,
            COALESCE(SUM(b.valor / NULLIF(b.n_tecnicos, 0)) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS ejecutadas_valor_prorrateado,
            COUNT(*) FILTER (WHERE ${c.pendiente})::int AS pendientes_cantidad,
            COALESCE(SUM(COALESCE(b.horas_programadas, 0)) FILTER (WHERE ${c.pendiente}), 0)::float8 AS horas_pendientes
     FROM base b
     JOIN ot_tecnicos t ON t.ot_id = b.ot_id
     JOIN users u ON u.id = t.user_id
     ${filtroTecnico}
     GROUP BY u.id, u.nombre
     ORDER BY ejecutadas_valor_prorrateado DESC, u.nombre`,
    c.params
  );
}

// OT hoy en "Programado" sin ejecutar, las más antiguas primero.
async function otsPendientes(query, vendedorId) {
  const c = construir(query, vendedorId, { conRango: false });
  return db.all(
    `${c.cte}
     SELECT negocio_id, 'OT-' || negocio_id AS ot, cliente, titulo, COALESCE(tipo_trabajo, 'sin_tipo') AS tipo_trabajo,
            ${TECNICOS_TEXTO} AS tecnicos, horas_programadas::float8 AS horas_programadas,
            (COALESCE(horas_programadas, 0) * n_tecnicos)::float8 AS horas_hombre,
            valor::float8 AS valor, sin_cotizacion, to_char(programada_en, 'DD-MM-YYYY') AS programada_el,
            GREATEST(0, ${FECHA_CHILE} - programada_en::date)::int AS dias_en_programado
     FROM base WHERE ${c.pendiente}
     ORDER BY programada_en NULLS LAST LIMIT 300`,
    c.params
  );
}

// Detalle OT por OT (programadas o ejecutadas en el período) — para la tabla
// y la exportación CSV.
async function otsDetalle(query, vendedorId) {
  const c = construir(query, vendedorId);
  return db.all(
    `${c.cte}
     SELECT negocio_id, 'OT-' || negocio_id AS ot, cliente, titulo, COALESCE(tipo_trabajo, 'sin_tipo') AS tipo_trabajo,
            etapa_actual, ${TECNICOS_TEXTO} AS tecnicos, horas_programadas::float8 AS horas_programadas,
            (COALESCE(horas_programadas, 0) * n_tecnicos)::float8 AS horas_hombre,
            to_char(programada_en, 'DD-MM-YYYY') AS programada_el, to_char(fecha_ejecucion, 'DD-MM-YYYY') AS fecha_ejecucion,
            valor::float8 AS valor, CASE WHEN sin_cotizacion THEN 'monto del negocio' ELSE 'cotización' END AS origen_valor,
            id_fracttal
     FROM base WHERE (${c.progOK} OR ${c.ejecOK})
     ORDER BY COALESCE(fecha_ejecucion, programada_en::date) DESC, negocio_id DESC LIMIT 5000`,
    c.params
  );
}

module.exports = { otsKpis, otsResumenMensual, otsPorTipo, otsPorTecnico, otsPendientes, otsDetalle };
