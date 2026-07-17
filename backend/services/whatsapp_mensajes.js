// Historial de mensajes de WhatsApp (Bandeja WhatsApp) — registro de todo lo
// entrante/saliente y evaluación de la ventana de 24 h de Meta: fuera de ella
// solo se puede responder con plantillas pre-aprobadas, no con texto libre.
const { db } = require('../db');

async function registrar({ contacto_id, lead_id = null, direccion, texto, enviado_por_id = null }) {
  await db.run(
    `INSERT INTO whatsapp_mensajes (contacto_id, lead_id, direccion, texto, enviado_por_id) VALUES ($1,$2,$3,$4,$5)`,
    [contacto_id, lead_id, direccion, texto, enviado_por_id]
  );
}

async function ventanaAbierta(contacto_id) {
  const ultimo = await db.get(
    `SELECT created_at FROM whatsapp_mensajes WHERE contacto_id=$1 AND direccion='entrante' ORDER BY created_at DESC LIMIT 1`,
    [contacto_id]
  );
  if (!ultimo) return false;
  return Date.now() - new Date(ultimo.created_at).getTime() < 24 * 3600000;
}

module.exports = { registrar, ventanaAbierta };
