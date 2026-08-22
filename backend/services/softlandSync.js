// Rutina nocturna de la Reportería Comercial + Softland (HT-AP-03, acordado
// con Gerencia 19-08-2026): a las 23:00 hora Chile recarga las tablas de
// caché desde la réplica de Softland. Adaptada de generar_dashboard.py
// (Luis), que hacía esto mismo a mano desde su equipo.
//
// Modelo de datos acordado (19-08-2026):
// - Cotizado: solo Softland, y solo hasta jul-2026 (la consulta ya corta la
//   fecha) — desde ago-2026 se lee en vivo desde `cotizaciones` del CRM, NO
//   de acá (eso lo hace el endpoint del reporte, no esta rutina).
// - Cerrado (NV emitidas) y Facturado: siempre Softland, todos los años,
//   SIN cruce con el pipeline del CRM y sin exigir que el negocio esté
//   marcado "Ganado" — cuentan las NV que Softland generó, punto (decisión
//   explícita: hay vendedores que no marcan todo como ganado en el CRM, y
//   hay NV sin cotización asociada en ningún sistema).
//
// Corrección 20-08-2026: "Facturado" se agrupa por la FECHA REAL DE LA
// FACTURA (WG_vsnpCuboVentas.Fecha — la misma tabla y criterio que usa la
// "Consulta de Ventas por Vendedor" nativa de Softland), no por la fecha de
// la nota de venta que la origina.
//
// Rediseño 22-08-2026 — backfill único + ventana viva (acordado con
// Comercial): Softland no genera cotizaciones, NV ni facturas retroactivas
// de meses más viejos que el mes abierto y el anterior — ese historial más
// viejo está "congelado" y no tiene sentido volver a pedírselo a la réplica
// todas las noches. Desde ahora:
// - El historial (todo lo anterior a la ventana viva) se consulta UNA sola
//   vez por dataset (reporte_softland_backfill lleva el registro) y de ahí
//   en adelante nunca se vuelve a tocar.
// - Cada corrida (nocturna o manual) solo vuelve a consultar y reemplazar
//   el mes abierto + el mes anterior ("ventana viva") — el resto de la
//   tabla queda intacto.
// - "Cotizado" y el nuevo detalle de Cotizaciones no tienen ventana viva
//   propia: su "mes abierto" ya lo cubre el CRM en vivo (ago-2026 en
//   adelante), así que el historial de Softland (hasta jul-2026) se
//   consulta una única vez y no se vuelve a sincronizar nunca más.
// - Se agrega detalle documento por documento (no solo agregado mensual)
//   de Cotizaciones, Notas de Venta (todas, no solo pendientes) y Facturas,
//   para las pestañas de listado con filtro y exportación (nota de cambio
//   v1.31).
const { db } = require('../db');
const softland = require('./softland');

function fechaChileHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

// Mes abierto + mes anterior = la única franja que Softland todavía puede
// modificar (documentos nuevos, correcciones). `desde` es el primer día del
// mes anterior — límite inferior de la ventana viva y límite superior del
// historial congelado.
function ventanaViva() {
  const hoy = new Date(`${fechaChileHoy()}T00:00:00Z`);
  const anioAct = hoy.getUTCFullYear(), mesAct = hoy.getUTCMonth() + 1;
  const base = new Date(Date.UTC(anioAct, mesAct - 2, 1)); // día 1 del mes anterior
  const anioAnt = base.getUTCFullYear(), mesAnt = base.getUTCMonth() + 1;
  const desde = `${anioAnt}-${String(mesAnt).padStart(2, '0')}-01`;
  const etiqueta = `${anioAnt}-${String(mesAnt).padStart(2, '0')}`;
  return { anioAct, mesAct, anioAnt, mesAnt, desde, etiqueta };
}

async function faltaBackfill(client, dataset) {
  const { rows } = await client.query('SELECT 1 FROM reporte_softland_backfill WHERE dataset = $1', [dataset]);
  return rows.length === 0;
}
async function marcarBackfillHecho(client, dataset, hasta) {
  await client.query(
    `INSERT INTO reporte_softland_backfill (dataset, completado_hasta) VALUES ($1,$2)
     ON CONFLICT (dataset) DO UPDATE SET completado_hasta = $2, ejecutado_en = now()`,
    [dataset, hasta]
  );
}

// ===== Cotizado / Cerrado / Facturado agregados (reporte_softland_mensual) =====

// Cotizado: corte fijo, no cambia con la ventana viva — el "mes abierto" de
// cotizado ya lo cubre el CRM en vivo desde ago-2026. Se consulta una sola
// vez para siempre (ver faltaBackfill('mensual_historico')).
const SQL_COTIZADO = `
  SELECT
      YEAR(c.CtFem)             AS Anio,
      MONTH(c.CtFem)            AS Mes,
      c.VenCod                  AS VenCod,
      ISNULL(v.VenDes,'')       AS NombreVendedor,
      COUNT(DISTINCT c.CotNum)  AS Cotizaciones,
      SUM(c.CtNetoAfecto + c.CtNetoExento) AS MontoCotizaciones
  FROM softland.nwcotiza c
  LEFT JOIN softland.cwtvend v ON c.VenCod = v.VenCod
  WHERE c.CtFem >= '2023-01-01' AND c.CtFem < '2026-08-01'
    AND c.CtEstado <> 'N'
  GROUP BY YEAR(c.CtFem), MONTH(c.CtFem), c.VenCod, v.VenDes
`;

const SQL_CERRADO_HISTORICO = `
  SELECT YEAR(nv.nvFem) AS Anio, MONTH(nv.nvFem) AS Mes, nv.VenCod AS VenCod, ISNULL(v.VenDes,'') AS NombreVendedor,
      COUNT(DISTINCT nv.NVNumero) AS NVEmitidas, SUM(nv.nvNetoAfecto + nv.nvNetoExento) AS MontoNV
  FROM softland.nw_nventa nv
  LEFT JOIN softland.cwtvend v ON nv.VenCod = v.VenCod
  WHERE nv.nvFem >= '2023-01-01' AND nv.nvFem < @desde AND nv.nvEstado <> 'N'
  GROUP BY YEAR(nv.nvFem), MONTH(nv.nvFem), nv.VenCod, v.VenDes
`;
const SQL_CERRADO_VIVO = `
  SELECT YEAR(nv.nvFem) AS Anio, MONTH(nv.nvFem) AS Mes, nv.VenCod AS VenCod, ISNULL(v.VenDes,'') AS NombreVendedor,
      COUNT(DISTINCT nv.NVNumero) AS NVEmitidas, SUM(nv.nvNetoAfecto + nv.nvNetoExento) AS MontoNV
  FROM softland.nw_nventa nv
  LEFT JOIN softland.cwtvend v ON nv.VenCod = v.VenCod
  WHERE nv.nvFem >= @desde AND nv.nvEstado <> 'N'
  GROUP BY YEAR(nv.nvFem), MONTH(nv.nvFem), nv.VenCod, v.VenDes
`;

const SQL_FACTURADO_HISTORICO = `
  SELECT YEAR(v.Fecha) AS Anio, MONTH(v.Fecha) AS Mes, ISNULL(v.CodVendedor,'') AS VenCod, ISNULL(vend.VenDes,'Sin Vendedor') AS NombreVendedor,
      COUNT(DISTINCT v.Folio) AS NumDoctos, SUM(v.TOTALNETO) AS TotalNeto
  FROM softland.WG_vsnpCuboVentas v
  LEFT JOIN softland.cwtvend vend ON v.CodVendedor = vend.VenCod
  WHERE v.Fecha >= '2023-01-01' AND v.Fecha < @desde
  GROUP BY YEAR(v.Fecha), MONTH(v.Fecha), v.CodVendedor, vend.VenDes
`;
const SQL_FACTURADO_VIVO = `
  SELECT YEAR(v.Fecha) AS Anio, MONTH(v.Fecha) AS Mes, ISNULL(v.CodVendedor,'') AS VenCod, ISNULL(vend.VenDes,'Sin Vendedor') AS NombreVendedor,
      COUNT(DISTINCT v.Folio) AS NumDoctos, SUM(v.TOTALNETO) AS TotalNeto
  FROM softland.WG_vsnpCuboVentas v
  LEFT JOIN softland.cwtvend vend ON v.CodVendedor = vend.VenCod
  WHERE v.Fecha >= @desde
  GROUP BY YEAR(v.Fecha), MONTH(v.Fecha), v.CodVendedor, vend.VenDes
`;

// NV pendientes de facturar del año en curso — sin cambios de diseño: ya es
// una consulta "viva" por naturaleza (solo pendientes, no historial).
const SQL_NV_PENDIENTES = `
  SELECT
      nv.NVNumero                         AS NVNumero,
      nv.nvFem                            AS FechaNV,
      nv.VenCod                           AS VenCod,
      ISNULL(v.VenDes,'Sin Vendedor')     AS NombreVendedor,
      nv.CodAux                           AS CodCliente,
      ISNULL(a.NomAux, nv.NomCon)         AS NombreCliente,
      nv.NumOC                            AS NumOC,
      SUM(det.nvTotLinea)                 AS MontoPendiente
  FROM softland.nw_nventa nv
  INNER JOIN softland.nw_detnv det ON nv.NVNumero = det.NVNumero
  LEFT  JOIN softland.cwtvend v    ON nv.VenCod   = v.VenCod
  LEFT  JOIN softland.cwtauxi a    ON nv.CodAux   = a.CodAux
  LEFT  JOIN (
      SELECT DISTINCT nvnumero FROM softland.iw_gsaen
      WHERE Tipo IN ('F','E','B') AND nvnumero > 0
  ) f ON nv.NVNumero = f.nvnumero
  WHERE YEAR(nv.nvFem) = YEAR(GETDATE())
    AND nv.nvEstado NOT IN ('N','n','C','c')
    AND f.nvnumero IS NULL
    AND (det.nvCant - det.nvCantDesp) > 0
  GROUP BY nv.NVNumero, nv.nvFem, nv.VenCod, v.VenDes, nv.CodAux, a.NomAux, nv.NomCon, nv.NumOC
`;

// ===== Detalle documento por documento (nota de cambio v1.31) =====

// Cotizaciones: mismo corte fijo que SQL_COTIZADO — se consulta una sola
// vez, nunca más (el "mes abierto" ya lo cubre el CRM en vivo).
const SQL_COTIZACIONES_DOC = `
  SELECT
      c.CotNum                          AS CotNum,
      c.CtFem                           AS Fecha,
      c.VenCod                          AS VenCod,
      ISNULL(v.VenDes,'')               AS NombreVendedor,
      c.CodAux                          AS CodCliente,
      ISNULL(a.NomAux,'Sin Cliente')    AS NombreCliente,
      (c.CtNetoAfecto + c.CtNetoExento) AS Monto
  FROM softland.nwcotiza c
  LEFT JOIN softland.cwtvend v ON c.VenCod = v.VenCod
  LEFT JOIN softland.cwtauxi a ON c.CodAux = a.CodAux
  WHERE c.CtFem >= '2023-01-01' AND c.CtFem < '2026-08-01'
    AND c.CtEstado <> 'N'
`;

// nw_nventa es tabla de encabezado (una fila por NV) — no hace falta
// agrupar, a diferencia de SQL_NV_PENDIENTES que sí agrupa por el join con
// el detalle de líneas.
const SQL_NV_DOC_HISTORICO = `
  SELECT
      nv.NVNumero                          AS NVNumero,
      nv.nvFem                             AS Fecha,
      nv.VenCod                            AS VenCod,
      ISNULL(v.VenDes,'Sin Vendedor')      AS NombreVendedor,
      nv.CodAux                            AS CodCliente,
      ISNULL(a.NomAux, nv.NomCon)          AS NombreCliente,
      nv.NumOC                             AS NumOC,
      (nv.nvNetoAfecto + nv.nvNetoExento)  AS Monto
  FROM softland.nw_nventa nv
  LEFT JOIN softland.cwtvend v ON nv.VenCod = v.VenCod
  LEFT JOIN softland.cwtauxi a ON nv.CodAux = a.CodAux
  WHERE nv.nvFem >= '2023-01-01' AND nv.nvFem < @desde AND nv.nvEstado <> 'N'
`;
const SQL_NV_DOC_VIVO = `
  SELECT
      nv.NVNumero                          AS NVNumero,
      nv.nvFem                             AS Fecha,
      nv.VenCod                            AS VenCod,
      ISNULL(v.VenDes,'Sin Vendedor')      AS NombreVendedor,
      nv.CodAux                            AS CodCliente,
      ISNULL(a.NomAux, nv.NomCon)          AS NombreCliente,
      nv.NumOC                             AS NumOC,
      (nv.nvNetoAfecto + nv.nvNetoExento)  AS Monto
  FROM softland.nw_nventa nv
  LEFT JOIN softland.cwtvend v ON nv.VenCod = v.VenCod
  LEFT JOIN softland.cwtauxi a ON nv.CodAux = a.CodAux
  WHERE nv.nvFem >= @desde AND nv.nvEstado <> 'N'
`;

// WG_vsnpCuboVentas SÍ tiene varias filas por Folio (vista tipo cubo, una
// línea por producto facturado — de ahí que el agregado use COUNT(DISTINCT
// Folio)), así que acá hace falta agrupar por Folio para tener una fila por
// factura. Vendedor/cliente/fecha se asumen constantes dentro de un mismo
// folio (una factura tiene un solo cliente) — MAX/MIN solo para que el
// GROUP BY no los exija en la clave.
const SQL_FACTURAS_DOC_HISTORICO = `
  SELECT
      v.Folio                                 AS Folio,
      MIN(v.Fecha)                            AS Fecha,
      MAX(ISNULL(v.CodVendedor,''))           AS VenCod,
      MAX(ISNULL(vend.VenDes,'Sin Vendedor')) AS NombreVendedor,
      MAX(v.CodAux)                           AS CodCliente,
      MAX(ISNULL(cli.NomAux,'Sin Cliente'))   AS NombreCliente,
      SUM(v.TOTALNETO)                        AS Monto
  FROM softland.WG_vsnpCuboVentas v
  LEFT JOIN softland.cwtvend vend ON v.CodVendedor = vend.VenCod
  LEFT JOIN softland.cwtauxi cli ON v.CodAux = cli.CodAux
  WHERE v.Fecha >= '2023-01-01' AND v.Fecha < @desde
  GROUP BY v.Folio
`;
const SQL_FACTURAS_DOC_VIVO = `
  SELECT
      v.Folio                                 AS Folio,
      MIN(v.Fecha)                            AS Fecha,
      MAX(ISNULL(v.CodVendedor,''))           AS VenCod,
      MAX(ISNULL(vend.VenDes,'Sin Vendedor')) AS NombreVendedor,
      MAX(v.CodAux)                           AS CodCliente,
      MAX(ISNULL(cli.NomAux,'Sin Cliente'))   AS NombreCliente,
      SUM(v.TOTALNETO)                        AS Monto
  FROM softland.WG_vsnpCuboVentas v
  LEFT JOIN softland.cwtvend vend ON v.CodVendedor = vend.VenCod
  LEFT JOIN softland.cwtauxi cli ON v.CodAux = cli.CodAux
  WHERE v.Fecha >= @desde
  GROUP BY v.Folio
`;

// Combina las tres consultas mensuales por (año, mes, vencod) — no siempre
// tienen las mismas filas (un vendedor puede tener NV sin cotizaciones ese
// mes, facturación de NV de un mes anterior, etc.), así que se completa con
// 0 lo que falte. Cotizado/Cerrado/Facturado son intencionalmente
// independientes entre sí: cada uno tiene su propia fecha base (fecha de
// cotización, fecha de NV, fecha de factura respectivamente).
function combinarMensual(cotizado, cerrado, facturado) {
  const filas = new Map();
  const clave = (anio, mes, vencod) => `${anio}-${mes}-${vencod}`;
  const base = (r) => ({
    anio: r.Anio, mes: r.Mes, vencod: r.VenCod, nombre_vendedor: r.NombreVendedor || null,
    cotizado_monto: 0, cotizado_cant: 0, cerrado_monto: 0, cerrado_cant: 0, facturado_monto: 0, facturado_cant: 0,
  });
  const fila = (r) => {
    const k = clave(r.Anio, r.Mes, r.VenCod);
    if (!filas.has(k)) filas.set(k, base(r));
    const f = filas.get(k);
    if (!f.nombre_vendedor) f.nombre_vendedor = r.NombreVendedor || null;
    return f;
  };

  for (const r of cotizado) {
    const f = fila(r);
    f.cotizado_monto = Number(r.MontoCotizaciones) || 0;
    f.cotizado_cant = Number(r.Cotizaciones) || 0;
  }
  for (const r of cerrado) {
    const f = fila(r);
    f.cerrado_monto = Number(r.MontoNV) || 0;
    f.cerrado_cant = Number(r.NVEmitidas) || 0;
  }
  for (const r of facturado) {
    const f = fila(r);
    f.facturado_monto = Number(r.TotalNeto) || 0;
    f.facturado_cant = Number(r.NumDoctos) || 0;
  }
  return Array.from(filas.values());
}

async function insertarMensualBackfill(client, filas) {
  for (const f of filas) {
    await client.query(
      `INSERT INTO reporte_softland_mensual
         (anio, mes, vencod, nombre_vendedor, cotizado_monto, cotizado_cant, cerrado_monto, cerrado_cant, facturado_monto, facturado_cant)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (anio, mes, vencod) DO UPDATE SET
         nombre_vendedor = COALESCE(EXCLUDED.nombre_vendedor, reporte_softland_mensual.nombre_vendedor),
         cotizado_monto = EXCLUDED.cotizado_monto, cotizado_cant = EXCLUDED.cotizado_cant,
         cerrado_monto = EXCLUDED.cerrado_monto, cerrado_cant = EXCLUDED.cerrado_cant,
         facturado_monto = EXCLUDED.facturado_monto, facturado_cant = EXCLUDED.facturado_cant`,
      [f.anio, f.mes, f.vencod, f.nombre_vendedor, f.cotizado_monto, f.cotizado_cant, f.cerrado_monto, f.cerrado_cant, f.facturado_monto, f.facturado_cant]
    );
  }
}

// Ventana viva: se resetea cerrado/facturado del mes abierto + el anterior
// (sin tocar cotizado, que no tiene ventana viva propia) y se vuelve a
// insertar lo que haya — así una NV/factura que desapareció o cambió de mes
// en Softland no deja basura de la corrida anterior.
async function upsertMensualVivo(client, filas, ventana) {
  await client.query(
    `UPDATE reporte_softland_mensual SET cerrado_monto = 0, cerrado_cant = 0, facturado_monto = 0, facturado_cant = 0
     WHERE (anio = $1 AND mes = $2) OR (anio = $3 AND mes = $4)`,
    [ventana.anioAnt, ventana.mesAnt, ventana.anioAct, ventana.mesAct]
  );
  for (const f of filas) {
    await client.query(
      `INSERT INTO reporte_softland_mensual
         (anio, mes, vencod, nombre_vendedor, cotizado_monto, cotizado_cant, cerrado_monto, cerrado_cant, facturado_monto, facturado_cant)
       VALUES ($1,$2,$3,$4,0,0,$5,$6,$7,$8)
       ON CONFLICT (anio, mes, vencod) DO UPDATE SET
         nombre_vendedor = COALESCE(EXCLUDED.nombre_vendedor, reporte_softland_mensual.nombre_vendedor),
         cerrado_monto = EXCLUDED.cerrado_monto, cerrado_cant = EXCLUDED.cerrado_cant,
         facturado_monto = EXCLUDED.facturado_monto, facturado_cant = EXCLUDED.facturado_cant`,
      [f.anio, f.mes, f.vencod, f.nombre_vendedor, f.cerrado_monto, f.cerrado_cant, f.facturado_monto, f.facturado_cant]
    );
  }
}

function anioMesDeFecha(fecha) {
  const d = new Date(fecha);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

async function upsertCotizacionDoc(client, r) {
  const { anio, mes } = anioMesDeFecha(r.Fecha);
  await client.query(
    `INSERT INTO reporte_softland_cotizaciones (cot_num, anio, mes, fecha, vencod, nombre_vendedor, cod_cliente, nombre_cliente, monto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (cot_num) DO UPDATE SET
       anio = EXCLUDED.anio, mes = EXCLUDED.mes, fecha = EXCLUDED.fecha, vencod = EXCLUDED.vencod,
       nombre_vendedor = EXCLUDED.nombre_vendedor, cod_cliente = EXCLUDED.cod_cliente,
       nombre_cliente = EXCLUDED.nombre_cliente, monto = EXCLUDED.monto`,
    [String(r.CotNum), anio, mes, r.Fecha, r.VenCod, r.NombreVendedor, r.CodCliente, r.NombreCliente, Number(r.Monto) || 0]
  );
}

async function upsertNvDoc(client, r) {
  const { anio, mes } = anioMesDeFecha(r.Fecha);
  await client.query(
    `INSERT INTO reporte_softland_notas_venta (nv_numero, anio, mes, fecha, vencod, nombre_vendedor, cod_cliente, nombre_cliente, num_oc, monto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (nv_numero) DO UPDATE SET
       anio = EXCLUDED.anio, mes = EXCLUDED.mes, fecha = EXCLUDED.fecha, vencod = EXCLUDED.vencod,
       nombre_vendedor = EXCLUDED.nombre_vendedor, cod_cliente = EXCLUDED.cod_cliente,
       nombre_cliente = EXCLUDED.nombre_cliente, num_oc = EXCLUDED.num_oc, monto = EXCLUDED.monto`,
    [String(r.NVNumero), anio, mes, r.Fecha, r.VenCod, r.NombreVendedor, r.CodCliente, r.NombreCliente, r.NumOC, Number(r.Monto) || 0]
  );
}

async function upsertFacturaDoc(client, r) {
  const { anio, mes } = anioMesDeFecha(r.Fecha);
  await client.query(
    `INSERT INTO reporte_softland_facturas (folio, anio, mes, fecha, vencod, nombre_vendedor, cod_cliente, nombre_cliente, monto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (folio) DO UPDATE SET
       anio = EXCLUDED.anio, mes = EXCLUDED.mes, fecha = EXCLUDED.fecha, vencod = EXCLUDED.vencod,
       nombre_vendedor = EXCLUDED.nombre_vendedor, cod_cliente = EXCLUDED.cod_cliente,
       nombre_cliente = EXCLUDED.nombre_cliente, monto = EXCLUDED.monto`,
    [String(r.Folio), anio, mes, r.Fecha, r.VenCod, r.NombreVendedor, r.CodCliente, r.NombreCliente, Number(r.Monto) || 0]
  );
}

// Cotizaciones: backfill único, para siempre — no tiene ventana viva propia.
async function sincronizarCotizacionesDoc(client) {
  if (!(await faltaBackfill(client, 'cotizaciones_doc'))) return 0;
  const filas = await softland.query(SQL_COTIZACIONES_DOC);
  for (const r of filas) await upsertCotizacionDoc(client, r);
  await marcarBackfillHecho(client, 'cotizaciones_doc', '2026-07');
  return filas.length;
}

async function sincronizarNotasVentaDoc(client, ventana) {
  let totalHistorico = 0;
  if (await faltaBackfill(client, 'notas_venta_doc')) {
    const filas = await softland.query(SQL_NV_DOC_HISTORICO, { desde: ventana.desde });
    for (const r of filas) await upsertNvDoc(client, r);
    await marcarBackfillHecho(client, 'notas_venta_doc', ventana.etiqueta);
    totalHistorico = filas.length;
  }
  await client.query(
    `DELETE FROM reporte_softland_notas_venta WHERE (anio = $1 AND mes = $2) OR (anio = $3 AND mes = $4)`,
    [ventana.anioAnt, ventana.mesAnt, ventana.anioAct, ventana.mesAct]
  );
  const vivos = await softland.query(SQL_NV_DOC_VIVO, { desde: ventana.desde });
  for (const r of vivos) await upsertNvDoc(client, r);
  return totalHistorico + vivos.length;
}

async function sincronizarFacturasDoc(client, ventana) {
  let totalHistorico = 0;
  if (await faltaBackfill(client, 'facturas_doc')) {
    const filas = await softland.query(SQL_FACTURAS_DOC_HISTORICO, { desde: ventana.desde });
    for (const r of filas) await upsertFacturaDoc(client, r);
    await marcarBackfillHecho(client, 'facturas_doc', ventana.etiqueta);
    totalHistorico = filas.length;
  }
  await client.query(
    `DELETE FROM reporte_softland_facturas WHERE (anio = $1 AND mes = $2) OR (anio = $3 AND mes = $4)`,
    [ventana.anioAnt, ventana.mesAnt, ventana.anioAct, ventana.mesAct]
  );
  const vivos = await softland.query(SQL_FACTURAS_DOC_VIVO, { desde: ventana.desde });
  for (const r of vivos) await upsertFacturaDoc(client, r);
  return totalHistorico + vivos.length;
}

async function sincronizar() {
  const hoy = fechaChileHoy();
  const ventana = ventanaViva();
  try {
    const client = await db.pool.connect();
    let filasMensual = 0, filasPendientes = 0, filasCotizacionesDoc = 0, filasNvDoc = 0, filasFacturasDoc = 0;
    try {
      await client.query('BEGIN');

      if (await faltaBackfill(client, 'mensual_historico')) {
        const [cotizado, cerradoHist, facturadoHist] = await Promise.all([
          softland.query(SQL_COTIZADO),
          softland.query(SQL_CERRADO_HISTORICO, { desde: ventana.desde }),
          softland.query(SQL_FACTURADO_HISTORICO, { desde: ventana.desde }),
        ]);
        const historico = combinarMensual(cotizado, cerradoHist, facturadoHist);
        await insertarMensualBackfill(client, historico);
        await marcarBackfillHecho(client, 'mensual_historico', ventana.etiqueta);
        filasMensual += historico.length;
      }
      const [cerradoVivo, facturadoVivo] = await Promise.all([
        softland.query(SQL_CERRADO_VIVO, { desde: ventana.desde }),
        softland.query(SQL_FACTURADO_VIVO, { desde: ventana.desde }),
      ]);
      const vivo = combinarMensual([], cerradoVivo, facturadoVivo);
      await upsertMensualVivo(client, vivo, ventana);
      filasMensual += vivo.length;

      const nvPendientes = await softland.query(SQL_NV_PENDIENTES);
      await client.query('TRUNCATE reporte_softland_nv_pendientes');
      for (const p of nvPendientes) {
        await client.query(
          `INSERT INTO reporte_softland_nv_pendientes
             (nv_numero, fecha_nv, vencod, nombre_vendedor, cod_cliente, nombre_cliente, num_oc, monto_pendiente)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [String(p.NVNumero), p.FechaNV, p.VenCod, p.NombreVendedor, p.CodCliente, p.NombreCliente, p.NumOC, Number(p.MontoPendiente) || 0]
        );
      }
      filasPendientes = nvPendientes.length;

      filasCotizacionesDoc = await sincronizarCotizacionesDoc(client);
      filasNvDoc = await sincronizarNotasVentaDoc(client, ventana);
      filasFacturasDoc = await sincronizarFacturasDoc(client, ventana);

      await client.query(
        `INSERT INTO reporte_softland_sync (fecha, ok, filas_mensual, filas_pendientes)
         VALUES ($1, true, $2, $3)
         ON CONFLICT (fecha) DO UPDATE SET ejecutado_en = now(), ok = true, filas_mensual = $2, filas_pendientes = $3, error = NULL`,
        [hoy, filasMensual, filasPendientes]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log(`[softlandSync] OK — mensual:${filasMensual} pendientes:${filasPendientes} cotizacionesDoc:${filasCotizacionesDoc} nvDoc:${filasNvDoc} facturasDoc:${filasFacturasDoc}`);
    return { ok: true, filas_mensual: filasMensual, filas_pendientes: filasPendientes };
  } catch (err) {
    console.error('[softlandSync] Error:', err.message);
    await db.run(
      `INSERT INTO reporte_softland_sync (fecha, ok, error)
       VALUES ($1, false, $2)
       ON CONFLICT (fecha) DO UPDATE SET ejecutado_en = now(), ok = false, error = $2`,
      [hoy, err.message]
    ).catch(e2 => console.error('[softlandSync] Además falló registrar el error:', e2.message));
    return { ok: false, error: err.message };
  }
}

// Llamado desde el chequeo horario de server.js: dispara solo entre las
// 23:00 y las 23:14 hora de Chile, solo una vez por día, y solo en
// producción (staging se sincroniza a mano con el botón "Actualizar" del
// reporte — no tiene sentido cargar la réplica de Softland dos veces cada
// noche por ambos ambientes).
async function sincronizarSiCorresponde() {
  if (process.env.VITE_AMBIENTE_LABEL) return; // definida solo en staging

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const partes = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  if (partes.hour !== '23' || Number(partes.minute) >= 15) return;

  const hoy = fechaChileHoy();
  const yaCorrido = await db.get('SELECT 1 FROM reporte_softland_sync WHERE fecha = $1 AND ok = true', [hoy]);
  if (yaCorrido) return;

  await sincronizar();
}

module.exports = { sincronizar, sincronizarSiCorresponde, fechaChileHoy };
