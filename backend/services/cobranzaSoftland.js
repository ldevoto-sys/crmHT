// Sincronización de documentos (facturas) con saldo pendiente de pago desde
// Softland, para el módulo de Cobranzas (Fase 2). Consulta validada en el
// skill HT-IN-01 §4.7 — confirmada contra el reporte nativo "Estado de
// Deuda" de Softland (folios 49387 y 50340, más 5 clientes reales
// adicionales). Disparada a mano desde el botón "Actualizar desde Softland"
// (sin cron: se refresca cuando el encargado de cobranza lo pide, igual que
// el botón "Actualizar" de Reportería Softland en staging).
const softland = require('./softland');
const { db } = require('../db');

const SQL_DOCUMENTOS_PENDIENTES = `
SELECT
    c.NumDoc                              AS Folio,
    ISNULL(a.CodAux, c.CodAux)            AS CodigoCliente,
    ISNULL(a.RutAux, c.RutAux)            AS RutCliente,
    ISNULL(a.NomAux,'Sin Cliente')        AS NombreCliente,
    c.Monto                               AS MontoTotalFactura,
    c.Total                               AS SaldoPendiente,
    c.Fecha                               AS FechaEmision,
    c.Vencimiento                         AS FechaVencimiento,
    ISNULL(cv.CodVendedor,'')             AS VenCod,
    ISNULL(v.VenDes,'Sin Vendedor')       AS NombreVendedor
FROM softland.WG_vsnpCartolaCliente c
LEFT JOIN softland.cwtauxi a
       ON c.CodAux = a.CodAux
LEFT JOIN (
    SELECT Folio, MAX(CodVendedor) AS CodVendedor
    FROM softland.WG_vsnpCuboVentas
    GROUP BY Folio
) cv ON cv.Folio = c.NumDoc
LEFT JOIN softland.cwtvend v
       ON cv.CodVendedor = v.VenCod
WHERE c.TtdCod IN ('21','51')   -- Factura de venta afecta / exenta electrónica
  AND c.Total > 0               -- solo con saldo pendiente
ORDER BY c.Vencimiento
`;

// Reemplaza la tabla completa: un folio que ya no aparece (porque se pagó
// entero) simplemente deja de estar en cobranza_documentos tras esta corrida.
async function actualizarDocumentosPendientes() {
  const filas = await softland.query(SQL_DOCUMENTOS_PENDIENTES);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cobranza_documentos');
    for (const r of filas) {
      await client.query(
        `INSERT INTO cobranza_documentos
           (folio, codigo_cliente, rut_cliente, nombre_cliente, monto_total, saldo_pendiente,
            fecha_emision, fecha_vencimiento, vendedor_codigo, vendedor_nombre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (folio) DO NOTHING`,
        [
          String(r.Folio), r.CodigoCliente || null, r.RutCliente || null, r.NombreCliente,
          Number(r.MontoTotalFactura) || 0, Number(r.SaldoPendiente) || 0,
          r.FechaEmision, r.FechaVencimiento, r.VenCod || null, r.NombreVendedor,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { total: filas.length };
}

module.exports = { actualizarDocumentosPendientes };
