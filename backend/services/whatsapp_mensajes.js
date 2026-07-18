// Historial de mensajes de WhatsApp (Bandeja WhatsApp) — registro de todo lo
// entrante/saliente y evaluación de la ventana de 24 h de Meta: fuera de ella
// solo se puede responder con plantillas pre-aprobadas, no con texto libre.
const { db } = require('../db');

async function registrar({
  contacto_id, lead_id = null, direccion, texto, enviado_por_id = null,
  tipo = 'texto', archivo_key = null, archivo_nombre = null, archivo_mime = null,
}) {
  await db.run(
    `INSERT INTO whatsapp_mensajes (contacto_id, lead_id, direccion, texto, enviado_por_id, tipo, archivo_key, archivo_nombre, archivo_mime)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [contacto_id, lead_id, direccion, texto, enviado_por_id, tipo, archivo_key, archivo_nombre, archivo_mime]
  );
  // Un mensaje nuevo del cliente reabre la conversación, aunque se hubiera
  // cerrado a mano antes.
  if (direccion === 'entrante') {
    await db.run(
      `INSERT INTO whatsapp_conversaciones (contacto_id, cerrada_manual) VALUES ($1, false)
       ON CONFLICT (contacto_id) DO UPDATE SET cerrada_manual = false, cerrada_en = NULL, cerrada_por_id = NULL`,
      [contacto_id]
    );
  }
}

async function cerradaManualmente(contacto_id) {
  const c = await db.get('SELECT cerrada_manual FROM whatsapp_conversaciones WHERE contacto_id = $1', [contacto_id]);
  return !!c?.cerrada_manual;
}

// Abierta = dentro de la ventana de 24h de Meta (mensaje del cliente reciente)
// Y no cerrada a mano por un vendedor/admin.
async function ventanaAbierta(contacto_id) {
  if (await cerradaManualmente(contacto_id)) return false;
  const ultimo = await db.get(
    `SELECT created_at FROM whatsapp_mensajes WHERE contacto_id=$1 AND direccion='entrante' ORDER BY created_at DESC LIMIT 1`,
    [contacto_id]
  );
  if (!ultimo) return false;
  return Date.now() - new Date(ultimo.created_at).getTime() < 24 * 3600000;
}

async function cerrarManual(contacto_id, usuario_id) {
  await db.run(
    `INSERT INTO whatsapp_conversaciones (contacto_id, cerrada_manual, cerrada_en, cerrada_por_id) VALUES ($1, true, now(), $2)
     ON CONFLICT (contacto_id) DO UPDATE SET cerrada_manual = true, cerrada_en = now(), cerrada_por_id = $2`,
    [contacto_id, usuario_id]
  );
}

module.exports = { registrar, ventanaAbierta, cerrarManual };
