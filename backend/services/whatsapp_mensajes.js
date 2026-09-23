// Historial de mensajes de WhatsApp (Bandeja WhatsApp) — registro de todo lo
// entrante/saliente y evaluación de la ventana de 24 h de Meta: fuera de ella
// solo se puede responder con plantillas pre-aprobadas, no con texto libre.
const { db } = require('../db');

async function registrar({
  contacto_id, lead_id = null, direccion, texto, enviado_por_id = null,
  tipo = 'texto', archivo_key = null, archivo_nombre = null, archivo_mime = null,
  wa_message_id = null, respondido_a_id = null, wa_timestamp = null,
}) {
  const r = await db.run(
    `INSERT INTO whatsapp_mensajes (contacto_id, lead_id, direccion, texto, enviado_por_id, tipo, archivo_key, archivo_nombre, archivo_mime, wa_message_id, respondido_a_id, wa_timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [contacto_id, lead_id, direccion, texto, enviado_por_id, tipo, archivo_key, archivo_nombre, archivo_mime, wa_message_id, respondido_a_id, wa_timestamp]
  );
  // Un mensaje nuevo del cliente reabre y desarchiva la conversación, aunque
  // se hubiera cerrado o archivado a mano antes.
  if (direccion === 'entrante') {
    await db.run(
      `INSERT INTO whatsapp_conversaciones (contacto_id, cerrada_manual, archivada) VALUES ($1, false, false)
       ON CONFLICT (contacto_id) DO UPDATE SET
         cerrada_manual = false, cerrada_en = NULL, cerrada_por_id = NULL,
         archivada = false, archivada_en = NULL, archivada_por_id = NULL`,
      [contacto_id]
    );
  }
  return r.rows[0].id;
}

// Devuelve el id local del mensaje con ese wamid, o null si no está (mensaje
// de antes de que existiera esta correlación, o de otra cuenta). Se usa para
// resolver a qué mensaje reacciona o responde el cliente (context.id /
// reaction.message_id del webhook), y para que el vendedor pueda reaccionar/
// citar un mensaje entrante desde la Bandeja.
async function buscarIdPorWaMessageId(waMessageId) {
  if (!waMessageId) return null;
  const fila = await db.get('SELECT id FROM whatsapp_mensajes WHERE wa_message_id = $1', [waMessageId]);
  return fila?.id ?? null;
}

// Aplica la reacción vigente sobre el mensaje con ese wamid — reemplaza
// cualquier reacción anterior de la misma persona (así lo maneja Meta: un
// solo emoji vigente por reactor). emoji vacío = se quitó la reacción.
// Devuelve true si encontró el mensaje (false si no hay ningún wa_message_id
// que calce — cae al registro de siempre en routes/public.js, para no
// perder la señal en silencio).
async function marcarReaccion(waMessageId, emoji, reaccionPor) {
  if (!waMessageId) return false;
  const r = await db.run(
    `UPDATE whatsapp_mensajes SET reaccion_emoji = $1, reaccion_por = $2 WHERE wa_message_id = $3`,
    [emoji || null, emoji ? reaccionPor : null, waMessageId]
  );
  return r.rowCount > 0;
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

// Archivar oculta la conversación de la Bandeja (ver GET /conversaciones);
// se desarchiva sola si el cliente vuelve a escribir (mismo criterio que
// cerrarManual, ver registrar() arriba).
async function archivarManual(contacto_id, usuario_id) {
  await db.run(
    `INSERT INTO whatsapp_conversaciones (contacto_id, archivada, archivada_en, archivada_por_id) VALUES ($1, true, now(), $2)
     ON CONFLICT (contacto_id) DO UPDATE SET archivada = true, archivada_en = now(), archivada_por_id = $2`,
    [contacto_id, usuario_id]
  );
}

async function desarchivarManual(contacto_id) {
  await db.run(
    `UPDATE whatsapp_conversaciones SET archivada = false, archivada_en = NULL, archivada_por_id = NULL WHERE contacto_id = $1`,
    [contacto_id]
  );
}

// Evita repetir el aviso de "fuera de horario" en cada mensaje de una misma
// racha fuera de horario (ver routes/public.js#procesarMensaje).
async function yaAvisoFueraHorario(contacto_id) {
  const c = await db.get('SELECT fuera_horario_enviado_en FROM whatsapp_conversaciones WHERE contacto_id = $1', [contacto_id]);
  return !!c?.fuera_horario_enviado_en;
}

async function marcarAvisoFueraHorarioEnviado(contacto_id) {
  await db.run(
    `INSERT INTO whatsapp_conversaciones (contacto_id, fuera_horario_enviado_en) VALUES ($1, now())
     ON CONFLICT (contacto_id) DO UPDATE SET fuera_horario_enviado_en = now()`,
    [contacto_id]
  );
}

// Se llama cada vez que se procesa un mensaje EN horario hábil, para que la
// próxima racha fuera de horario vuelva a avisar.
async function limpiarAvisoFueraHorario(contacto_id) {
  await db.run(`UPDATE whatsapp_conversaciones SET fuera_horario_enviado_en = NULL WHERE contacto_id = $1`, [contacto_id]);
}

module.exports = {
  registrar, ventanaAbierta, cerrarManual, archivarManual, desarchivarManual,
  yaAvisoFueraHorario, marcarAvisoFueraHorarioEnviado, limpiarAvisoFueraHorario,
  buscarIdPorWaMessageId, marcarReaccion,
};
