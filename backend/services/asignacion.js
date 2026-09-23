// Motor de asignación (HT-AP-03 §7.1). Evalúa en orden y se detiene en la
// primera regla que aplique: 0) vendedor propio del contacto, 1) vendedor
// de cuenta (empresa), 2) regla por categoría, 3) round-robin entre
// vendedores activos con recibe_round_robin.
const { db } = require('../db');

async function sugerirVendedor({ contacto_id = null, categoria = null } = {}) {
  // 0. El contacto mismo ya tiene un vendedor asignado (ficha de contacto o
  // sincronizado desde un chat anterior, ver services/sincronizarVendedor.js)
  // — antes solo se miraba el vendedor de la empresa (regla 1), así que un
  // contacto con vendedor propio pero sin empresa (o con una sin vendedor
  // de cuenta) nunca lo usaba al escribir de nuevo por WhatsApp (23-09-2026,
  // pedido de Luis Devoto).
  if (contacto_id) {
    const propio = await db.get(
      `SELECT c.vendedor_id FROM contactos c WHERE c.id = $1 AND c.vendedor_id IS NOT NULL`, [contacto_id]);
    if (propio && propio.vendedor_id) {
      const ok = await db.get('SELECT id FROM users WHERE id=$1 AND activo=true', [propio.vendedor_id]);
      if (ok) return { vendedor_id: propio.vendedor_id, modo: 'vendedor_del_contacto' };
    }
  }

  // 1. Vendedor de cuenta (empresa del contacto).
  if (contacto_id) {
    const row = await db.get(
      `SELECT e.vendedor_id FROM contactos c
       JOIN empresas e ON e.id = c.empresa_id
       WHERE c.id = $1 AND e.vendedor_id IS NOT NULL`, [contacto_id]);
    if (row && row.vendedor_id) {
      const ok = await db.get('SELECT id FROM users WHERE id=$1 AND activo=true', [row.vendedor_id]);
      if (ok) return { vendedor_id: row.vendedor_id, modo: 'vendedor_de_cuenta' };
    }
  }

  // 2. Regla por categoría.
  if (categoria) {
    const r = await db.get(
      `SELECT ra.vendedor_id FROM reglas_asignacion ra
       JOIN users u ON u.id = ra.vendedor_id AND u.activo = true
       WHERE ra.tipo = 'por_categoria' AND ra.activo = true AND lower(ra.parametro) = lower($1)
       ORDER BY ra.prioridad LIMIT 1`, [categoria]);
    if (r && r.vendedor_id) return { vendedor_id: r.vendedor_id, modo: 'por_categoria' };
  }

  // 3. Round-robin.
  const vendedores = await db.all(
    `SELECT id FROM users WHERE activo = true AND rol = 'vendedor' AND recibe_round_robin = true ORDER BY id`);
  if (vendedores.length === 0) return { vendedor_id: null, modo: 'round_robin' };
  const estado = await db.get('SELECT ultimo_vendedor_id FROM round_robin_estado WHERE id = 1');
  const ids = vendedores.map(v => v.id);
  const idx = estado && estado.ultimo_vendedor_id ? ids.indexOf(estado.ultimo_vendedor_id) : -1;
  const siguiente = ids[(idx + 1) % ids.length];
  await db.run('UPDATE round_robin_estado SET ultimo_vendedor_id = $1 WHERE id = 1', [siguiente]);
  return { vendedor_id: siguiente, modo: 'round_robin' };
}

module.exports = { sugerirVendedor };
