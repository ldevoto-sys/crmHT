// Rutina nocturna de la Reportería Comercial + Softland (HT-AP-03, acordado
// con Gerencia 19-08-2026): a las 23:00 hora Chile recarga completa las
// tablas de caché (reporte_softland_mensual, reporte_softland_nv_pendientes)
// desde la réplica de Softland. Adaptada de generar_dashboard.py (Luis),
// que hacía esto mismo a mano desde su equipo.
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
const { db } = require('../db');
const softland = require('./softland');

function fechaChileHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

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

// Cerrado = NV emitidas; Facturado = las de esas NV que ya tienen factura/
// boleta/nota de crédito asociada (iw_gsaen). Sin corte de fecha: todos los
// años disponibles, siempre recalculado completo.
const SQL_CERRADO_FACTURADO = `
  SELECT
      YEAR(nv.nvFem)                      AS Anio,
      MONTH(nv.nvFem)                     AS Mes,
      nv.VenCod                           AS VenCod,
      ISNULL(v.VenDes,'')                 AS NombreVendedor,
      COUNT(DISTINCT nv.NVNumero)         AS NVEmitidas,
      COUNT(DISTINCT f.nvnumero)          AS NVFacturadas,
      SUM(nv.nvNetoAfecto + nv.nvNetoExento) AS MontoNV,
      SUM(CASE WHEN f.nvnumero IS NOT NULL
               THEN nv.nvNetoAfecto + nv.nvNetoExento
               ELSE 0 END)                AS MontoFacturado
  FROM softland.nw_nventa nv
  LEFT JOIN softland.cwtvend v ON nv.VenCod = v.VenCod
  LEFT JOIN (
      SELECT DISTINCT nvnumero FROM softland.iw_gsaen
      WHERE Tipo IN ('F','E','B') AND nvnumero > 0
  ) f ON nv.NVNumero = f.nvnumero
  WHERE YEAR(nv.nvFem) BETWEEN 2023 AND YEAR(GETDATE())
    AND nv.nvEstado <> 'N'
  GROUP BY YEAR(nv.nvFem), MONTH(nv.nvFem), nv.VenCod, v.VenDes
`;

// NV pendientes de facturar del año en curso, agregadas por NV (no por línea
// de detalle — igual que el reporte, si más adelante hace falta el detalle
// línea por línea esta consulta se extiende, no se rediseña).
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

// Combina las dos consultas mensuales por (año, mes, vencod) — no siempre
// tienen las mismas filas (un vendedor puede tener NV sin cotizaciones ese
// mes, o viceversa), así que se completa con 0 lo que falte.
function combinarMensual(cotizado, cerradoFacturado) {
  const filas = new Map();
  const clave = (anio, mes, vencod) => `${anio}-${mes}-${vencod}`;

  for (const r of cotizado) {
    const k = clave(r.Anio, r.Mes, r.VenCod);
    filas.set(k, {
      anio: r.Anio, mes: r.Mes, vencod: r.VenCod, nombre_vendedor: r.NombreVendedor || null,
      cotizado_monto: Number(r.MontoCotizaciones) || 0, cotizado_cant: Number(r.Cotizaciones) || 0,
      cerrado_monto: 0, cerrado_cant: 0, facturado_monto: 0, facturado_cant: 0,
    });
  }
  for (const r of cerradoFacturado) {
    const k = clave(r.Anio, r.Mes, r.VenCod);
    const existente = filas.get(k);
    if (existente) {
      existente.cerrado_monto = Number(r.MontoNV) || 0;
      existente.cerrado_cant = Number(r.NVEmitidas) || 0;
      existente.facturado_monto = Number(r.MontoFacturado) || 0;
      existente.facturado_cant = Number(r.NVFacturadas) || 0;
      if (!existente.nombre_vendedor) existente.nombre_vendedor = r.NombreVendedor || null;
    } else {
      filas.set(k, {
        anio: r.Anio, mes: r.Mes, vencod: r.VenCod, nombre_vendedor: r.NombreVendedor || null,
        cotizado_monto: 0, cotizado_cant: 0,
        cerrado_monto: Number(r.MontoNV) || 0, cerrado_cant: Number(r.NVEmitidas) || 0,
        facturado_monto: Number(r.MontoFacturado) || 0, facturado_cant: Number(r.NVFacturadas) || 0,
      });
    }
  }
  return Array.from(filas.values());
}

async function sincronizar() {
  const hoy = fechaChileHoy();
  try {
    const [cotizado, cerradoFacturado, nvPendientes] = await Promise.all([
      softland.query(SQL_COTIZADO),
      softland.query(SQL_CERRADO_FACTURADO),
      softland.query(SQL_NV_PENDIENTES),
    ]);
    const mensual = combinarMensual(cotizado, cerradoFacturado);

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE reporte_softland_mensual');
      for (const f of mensual) {
        await client.query(
          `INSERT INTO reporte_softland_mensual
             (anio, mes, vencod, nombre_vendedor, cotizado_monto, cotizado_cant, cerrado_monto, cerrado_cant, facturado_monto, facturado_cant)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [f.anio, f.mes, f.vencod, f.nombre_vendedor, f.cotizado_monto, f.cotizado_cant, f.cerrado_monto, f.cerrado_cant, f.facturado_monto, f.facturado_cant]
        );
      }
      await client.query('TRUNCATE reporte_softland_nv_pendientes');
      for (const p of nvPendientes) {
        await client.query(
          `INSERT INTO reporte_softland_nv_pendientes
             (nv_numero, fecha_nv, vencod, nombre_vendedor, cod_cliente, nombre_cliente, num_oc, monto_pendiente)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [String(p.NVNumero), p.FechaNV, p.VenCod, p.NombreVendedor, p.CodCliente, p.NombreCliente, p.NumOC, Number(p.MontoPendiente) || 0]
        );
      }
      await client.query(
        `INSERT INTO reporte_softland_sync (fecha, ok, filas_mensual, filas_pendientes)
         VALUES ($1, true, $2, $3)
         ON CONFLICT (fecha) DO UPDATE SET ejecutado_en = now(), ok = true, filas_mensual = $2, filas_pendientes = $3, error = NULL`,
        [hoy, mensual.length, nvPendientes.length]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log(`[softlandSync] OK — ${mensual.length} fila(s) mensuales, ${nvPendientes.length} NV pendiente(s).`);
    return { ok: true, filas_mensual: mensual.length, filas_pendientes: nvPendientes.length };
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
