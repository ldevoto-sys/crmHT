// Sincronización manual del maestro de productos desde Softland
// (softland.iw_tprod) hacia `productos` del CRM — a diferencia de
// softlandSync.js (ventas/facturas, corre sola cada noche), esta se
// dispara a mano con un botón, porque el catálogo no cambia todos los
// días (09-09-2026, HT-AP-03).
//
// iw_tprod solo trae CodProd, DesProd y DesProd2 (marca/línea) — no tiene
// precio ni categoría documentados (skill HT-IN-01 §4.4). Por eso el
// UPDATE solo toca nombre y marca: nunca se pisan precio_lista,
// categoria, imagen, ficha técnica ni atributos, que son curados a mano
// o vía el importador de catálogo (Excel) — perderlos sería un efecto
// secundario, no el propósito de este botón.
const { db } = require('../db');
const softland = require('./softland');

async function sincronizarProductos() {
  const filas = await softland.query(`
    SELECT CodProd, DesProd, DesProd2
    FROM softland.iw_tprod
    WHERE CodProd IS NOT NULL AND LTRIM(RTRIM(CodProd)) <> ''
  `);

  let creados = 0;
  let actualizados = 0;
  for (const f of filas) {
    const sku = f.CodProd.trim();
    if (!sku) continue;
    const nombre = (f.DesProd || '').trim() || sku;
    const marca = (f.DesProd2 || '').trim() || null;
    const r = await db.run(
      `INSERT INTO productos (sku, nombre, marca)
       VALUES ($1,$2,$3)
       ON CONFLICT (sku) DO UPDATE SET nombre = EXCLUDED.nombre, marca = EXCLUDED.marca
       RETURNING (xmax = 0) AS insertado`,
      [sku, nombre, marca]
    );
    if (r.rows[0].insertado) creados++; else actualizados++;
  }
  return { total: filas.length, creados, actualizados };
}

module.exports = { sincronizarProductos };
