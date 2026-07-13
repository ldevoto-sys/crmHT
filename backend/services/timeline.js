// Registro de eventos en la línea de tiempo unificada (HT-AP-03 §6).
const { db } = require('../db');

async function registrar(evento, client = db) {
  const { contacto_id, empresa_id, negocio_id, cotizacion_id, tipo, descripcion, usuario_id, referencia_id } = evento;
  const q = `INSERT INTO timeline (contacto_id, empresa_id, negocio_id, cotizacion_id, tipo, descripcion, usuario_id, referencia_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;
  const params = [contacto_id || null, empresa_id || null, negocio_id || null, cotizacion_id || null,
                  tipo, descripcion, usuario_id || null, referencia_id || null];
  if (client === db) await db.run(q, params);
  else await client.query(q, params);
}

module.exports = { registrar };
