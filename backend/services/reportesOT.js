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
// - Programada: la OT tiene fecha programada para ejecutar; cuenta en el
//   período de esa fecha.
// - Pendiente: hoy en la etapa "Programado" y sin fecha de ejecución.
//   Atrasada: pendiente con fecha programada anterior a hoy (hora de Chile).
// - Brecha: fecha de ejecución menos fecha programada, en días (positiva =
//   se ejecutó tarde, 0 = el día programado, negativa = antes). "A tiempo" =
//   brecha <= 0. Solo se calcula para OT ejecutadas que tienen fecha
//   programada.
// - Horas-hombre: horas por técnico × cantidad de técnicos (3 técnicos en una
//   OT de 6 horas = 18 horas-hombre). En OT ejecutadas se usan las horas
//   ejecutadas (reales); si la OT no las registró (anteriores a esta
//   versión) se estiman con las programadas. En pendientes, las programadas.
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

  let progOK = 'fecha_programada IS NOT NULL';
  let ejecOK = 'fecha_ejecucion IS NOT NULL';
  if (conRango) {
    const desde = p(query.desde || null); const hasta = p(query.hasta || null);
    const rango = col => `(${desde}::date IS NULL OR ${col} >= ${desde}::date) AND (${hasta}::date IS NULL OR ${col} <= ${hasta}::date)`;
    progOK = `fecha_programada IS NOT NULL AND ${rango('fecha_programada')}`;
    ejecOK = `fecha_ejecucion IS NOT NULL AND ${rango('fecha_ejecucion')}`;
  }
  const pendiente = `fecha_ejecucion IS NULL AND lower(etapa_actual) = 'programado'`;
  const atrasada = `${pendiente} AND fecha_programada < ${FECHA_CHILE}`;
  // Ejecutadas del período con brecha calculable.
  const conBrecha = `(${ejecOK}) AND fecha_programada IS NOT NULL`;

  const cte = `
    WITH base AS (
      SELECT o.id AS ot_id, o.negocio_id, o.horas_programadas, o.horas_ejecutadas, o.fecha_programada, o.fecha_ejecucion, o.id_fracttal,
             o.exige_programacion,
             n.tipo_trabajo, n.titulo, n.empresa_id, e.razon_social AS cliente, pe.nombre AS etapa_actual,
             COALESCE(cot.neto, n.monto_estimado, 0) AS valor, (cot.neto IS NULL) AS sin_cotizacion,
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
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    )`;
  return { cte, params, progOK, ejecOK, pendiente, atrasada, conBrecha, p };
}

const TECNICOS_TEXTO = `(SELECT string_agg(u.nombre, ', ' ORDER BY u.nombre) FROM ot_tecnicos t JOIN users u ON u.id = t.user_id WHERE t.ot_id = base.ot_id)`;

const HH = `COALESCE(horas_programadas, 0) * n_tecnicos`;                       // programadas
const HHE = `COALESCE(horas_ejecutadas, horas_programadas, 0) * n_tecnicos`;   // ejecutadas (reales; programadas si faltan)
const BRECHA = `(fecha_ejecucion - fecha_programada)`;

// Una sola fila con los totales del período y lo pendiente hoy.
async function otsKpis(query, vendedorId) {
  const c = construir(query, vendedorId);
  return db.all(
    `${c.cte}
     SELECT COUNT(*) FILTER (WHERE ${c.progOK})::int AS programadas_cantidad,
            COALESCE(SUM(valor) FILTER (WHERE ${c.progOK}), 0)::float8 AS programadas_valor,
            COUNT(*) FILTER (WHERE ${c.ejecOK})::int AS ejecutadas_cantidad,
            COALESCE(SUM(valor) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS ejecutadas_valor,
            COALESCE(SUM(${HHE}) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS horas_hombre_ejecutadas,
            COALESCE(SUM(${HH}) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS horas_hombre_programadas_de_ejecutadas,
            COUNT(*) FILTER (WHERE ${c.pendiente})::int AS pendientes_cantidad,
            COALESCE(SUM(valor) FILTER (WHERE ${c.pendiente}), 0)::float8 AS pendientes_valor,
            COALESCE(SUM(${HH}) FILTER (WHERE ${c.pendiente}), 0)::float8 AS horas_hombre_pendientes,
            COUNT(*) FILTER (WHERE ${c.atrasada})::int AS atrasadas_cantidad,
            COALESCE(SUM(valor) FILTER (WHERE ${c.atrasada}), 0)::float8 AS atrasadas_valor,
            COUNT(*) FILTER (WHERE ${c.conBrecha})::int AS con_brecha_cantidad,
            COUNT(*) FILTER (WHERE ${c.conBrecha} AND ${BRECHA} <= 0)::int AS a_tiempo_cantidad,
            ROUND(AVG(${BRECHA}) FILTER (WHERE ${c.conBrecha}), 1)::float8 AS brecha_promedio_dias,
            COUNT(*) FILTER (WHERE (${c.progOK} OR ${c.ejecOK}) AND sin_cotizacion)::int AS sin_cotizacion_cantidad,
            -- v1.44: OT que hoy están en Programado/Ejecutado con datos sin completar
            -- (las mismas del aviso diario, services/ot.js#alertasOT) y ejecutadas
            -- del período que suman 0 horas-hombre por falta de horas o técnicos.
            COUNT(*) FILTER (WHERE lower(etapa_actual) IN ('programado', 'ejecutado') AND exige_programacion
              AND (fecha_programada IS NULL OR COALESCE(horas_programadas, 0) <= 0 OR n_tecnicos = 0
                   OR (lower(etapa_actual) = 'ejecutado' AND (fecha_ejecucion IS NULL OR COALESCE(horas_ejecutadas, 0) <= 0))))::int AS incompletas_cantidad,
            COUNT(*) FILTER (WHERE ${c.ejecOK} AND (n_tecnicos = 0 OR COALESCE(horas_ejecutadas, horas_programadas, 0) <= 0))::int AS ejecutadas_sin_hh_cantidad
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
       SELECT to_char(fecha_programada, 'YYYY-MM') AS mes, 1 AS prog_cant, valor AS prog_valor, 0 AS ejec_cant, 0 AS ejec_valor, 0 AS horas_hombre
       FROM base WHERE ${c.progOK}
       UNION ALL
       SELECT to_char(fecha_ejecucion, 'YYYY-MM'), 0, 0, 1, valor, ${HHE}
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
            COALESCE(SUM(${HHE}) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS horas_hombre_ejecutadas,
            COALESCE(SUM(${HH}) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS horas_hombre_programadas_de_ejecutadas,
            ROUND(AVG(${BRECHA}) FILTER (WHERE ${c.conBrecha}), 1)::float8 AS brecha_promedio_dias,
            ROUND(100.0 * COUNT(*) FILTER (WHERE ${c.conBrecha} AND ${BRECHA} <= 0) / NULLIF(COUNT(*) FILTER (WHERE ${c.conBrecha}), 0))::float8 AS a_tiempo_pct
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
            COALESCE(SUM(COALESCE(b.horas_ejecutadas, b.horas_programadas, 0)) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS horas_ejecutadas,
            COALESCE(SUM(COALESCE(b.horas_programadas, 0)) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS horas_programadas_de_ejecutadas,
            COALESCE(SUM(b.valor / NULLIF(b.n_tecnicos, 0)) FILTER (WHERE ${c.ejecOK}), 0)::float8 AS ejecutadas_valor_prorrateado,
            COUNT(*) FILTER (WHERE ${c.pendiente})::int AS pendientes_cantidad,
            COUNT(*) FILTER (WHERE ${c.atrasada})::int AS atrasadas_cantidad,
            COALESCE(SUM(COALESCE(b.horas_programadas, 0)) FILTER (WHERE ${c.pendiente}), 0)::float8 AS horas_pendientes,
            ROUND(AVG(${BRECHA}) FILTER (WHERE ${c.conBrecha}), 1)::float8 AS brecha_promedio_dias,
            ROUND(100.0 * COUNT(*) FILTER (WHERE ${c.conBrecha} AND ${BRECHA} <= 0) / NULLIF(COUNT(*) FILTER (WHERE ${c.conBrecha}), 0))::float8 AS a_tiempo_pct
     FROM base b
     JOIN ot_tecnicos t ON t.ot_id = b.ot_id
     JOIN users u ON u.id = t.user_id
     ${filtroTecnico}
     GROUP BY u.id, u.nombre
     ORDER BY ejecutadas_valor_prorrateado DESC, u.nombre`,
    c.params
  );
}

// OT hoy en "Programado" sin ejecutar: primero las más atrasadas.
async function otsPendientes(query, vendedorId) {
  const c = construir(query, vendedorId, { conRango: false });
  return db.all(
    `${c.cte}
     SELECT negocio_id, 'OT-' || negocio_id AS ot, cliente, titulo, COALESCE(tipo_trabajo, 'sin_tipo') AS tipo_trabajo,
            ${TECNICOS_TEXTO} AS tecnicos, horas_programadas::float8 AS horas_programadas,
            (${HH})::float8 AS horas_hombre, valor::float8 AS valor, sin_cotizacion,
            to_char(fecha_programada, 'DD-MM-YYYY') AS fecha_programada,
            CASE WHEN fecha_programada IS NULL THEN NULL ELSE GREATEST(0, ${FECHA_CHILE} - fecha_programada) END::int AS dias_atraso
     FROM base WHERE ${c.pendiente}
     ORDER BY fecha_programada NULLS LAST, negocio_id LIMIT 300`,
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
            horas_ejecutadas::float8 AS horas_ejecutadas,
            CASE WHEN fecha_ejecucion IS NULL THEN (${HH}) ELSE (${HHE}) END::float8 AS horas_hombre,
            CASE WHEN fecha_ejecucion IS NOT NULL AND horas_ejecutadas IS NULL THEN 'estimadas con las programadas' END AS horas_origen,
            to_char(fecha_programada, 'DD-MM-YYYY') AS fecha_programada, to_char(fecha_ejecucion, 'DD-MM-YYYY') AS fecha_ejecucion,
            CASE WHEN fecha_programada IS NOT NULL AND fecha_ejecucion IS NOT NULL THEN ${BRECHA} END AS brecha_dias,
            valor::float8 AS valor, CASE WHEN sin_cotizacion THEN 'monto del negocio' ELSE 'cotización' END AS origen_valor,
            id_fracttal
     FROM base WHERE (${c.progOK} OR ${c.ejecOK})
     ORDER BY COALESCE(fecha_ejecucion, fecha_programada) DESC, negocio_id DESC LIMIT 5000`,
    c.params
  );
}

module.exports = { otsKpis, otsResumenMensual, otsPorTipo, otsPorTecnico, otsPendientes, otsDetalle };
