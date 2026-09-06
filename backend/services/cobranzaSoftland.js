// Sincronización de documentos (facturas) con saldo pendiente de pago desde
// Softland, para el módulo de Cobranzas (Fase 2). Consulta validada en el
// skill HT-IN-01 §4.7 — confirmada contra el reporte nativo "Estado de
// Deuda" de Softland (folios 49387 y 50340, más 5 clientes reales
// adicionales). Disparada a mano desde el botón "Actualizar desde Softland"
// (sin cron: se refresca cuando el encargado de cobranza lo pide, igual que
// el botón "Actualizar" de Reportería Softland en staging).
const softland = require('./softland');
const { db } = require('../db');
const { validarRut, normalizarRut } = require('../utils/validaciones');

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
  await sincronizarCuentasCliente(filas);
  return { total: filas.length };
}

// Crea/actualiza la cuenta de cliente (Fase 4 — clave codigo_cliente) para
// cada cliente que aparezca en la corrida de Softland. Si ya existe, solo se
// refresca el nombre/RUT informado — nunca se toca empresa_id/es_cuenta_paso
// de una cuenta ya vinculada o ya marcada de paso a mano.
async function sincronizarCuentasCliente(filas) {
  const clientes = new Map();
  for (const r of filas) {
    if (!r.CodigoCliente) continue; // sin código de cliente no hay cómo agrupar la cuenta
    if (!clientes.has(r.CodigoCliente)) {
      clientes.set(r.CodigoCliente, { rut: r.RutCliente || null, nombre: r.NombreCliente || null });
    }
  }
  if (clientes.size === 0) return { creadas: 0 };

  // Mapa rut normalizado → empresa_id, para no fallar el match por
  // diferencias de formato (puntos, guión, mayúscula del DV) entre lo que
  // informa Softland y lo que quedó guardado en `empresas`.
  const empresas = await db.all('SELECT id, rut FROM empresas WHERE rut IS NOT NULL AND rut <> $1', ['']);
  const empresaPorRut = new Map();
  for (const e of empresas) {
    if (validarRut(e.rut)) empresaPorRut.set(normalizarRut(e.rut), e.id);
  }

  let creadas = 0;
  for (const [codigoCliente, { rut, nombre }] of clientes) {
    const existe = await db.get('SELECT codigo_cliente FROM cobranza_cuentas_cliente WHERE codigo_cliente = $1', [codigoCliente]);
    if (existe) {
      await db.run(
        'UPDATE cobranza_cuentas_cliente SET rut_cliente = $2, nombre_cliente = $3, actualizado_en = now() WHERE codigo_cliente = $1',
        [codigoCliente, rut, nombre]
      );
      continue;
    }
    const empresaId = rut && validarRut(rut) ? empresaPorRut.get(normalizarRut(rut)) || null : null;
    await db.run(
      `INSERT INTO cobranza_cuentas_cliente (codigo_cliente, rut_cliente, nombre_cliente, empresa_id, es_cuenta_paso)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (codigo_cliente) DO NOTHING`,
      [codigoCliente, rut, nombre, empresaId, !empresaId]
    );
    creadas++;
  }
  return { creadas };
}

// Llamado desde el chequeo horario de server.js: dispara solo entre las
// 23:30 y las 23:44 hora de Chile (media hora después de la Reportería
// Comercial, para no pedirle lo mismo a la réplica de Softland al mismo
// tiempo), solo una vez por día, y solo en producción — mismo criterio que
// softlandSync.js (staging se actualiza a mano con el botón "Actualizar
// desde Softland").
async function sincronizarDocumentosSiCorresponde() {
  if (process.env.VITE_AMBIENTE_LABEL) return; // definida solo en staging

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const partes = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  if (partes.hour !== '23' || Number(partes.minute) < 30 || Number(partes.minute) >= 45) return;

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const yaCorrido = await db.get('SELECT 1 FROM cobranza_documentos_sync_ejecuciones WHERE fecha = $1 AND ok = true', [hoy]);
  if (yaCorrido) return;

  try {
    const resultado = await actualizarDocumentosPendientes();
    await db.run(
      `INSERT INTO cobranza_documentos_sync_ejecuciones (fecha, ok, total) VALUES ($1, true, $2)
       ON CONFLICT (fecha) DO UPDATE SET ejecutado_en = now(), ok = true, total = $2, error = NULL`,
      [hoy, resultado.total]
    );
  } catch (err) {
    console.error('[cobranzaSoftland] Error en sincronización automática:', err.message);
    await db.run(
      `INSERT INTO cobranza_documentos_sync_ejecuciones (fecha, ok, error) VALUES ($1, false, $2)
       ON CONFLICT (fecha) DO UPDATE SET ejecutado_en = now(), ok = false, error = $2`,
      [hoy, err.message]
    ).catch(e2 => console.error('[cobranzaSoftland] Además falló registrar el error:', e2.message));
  }
}

module.exports = { actualizarDocumentosPendientes, sincronizarDocumentosSiCorresponde };
