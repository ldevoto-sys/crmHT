// Sincronización del vendedor entre contacto ↔ chat (lead) ↔ negocios
// (23-09-2026, pedido de Luis Devoto). Antes eran tres campos totalmente
// independientes (contactos.vendedor_id, leads.vendedor_id,
// negocios.vendedor_id) que se desincronizaban con el tiempo — ver
// docs/HT-AP-03-nota-cambio-*.md de esta fecha para el caso real que lo
// disparó.
//
// Quien llama a esto ya actualizó el lado que originó el cambio (el lead
// en routes/leads.js, el contacto en routes/contactos.js); esta función
// solo se encarga de la parte que ambos necesitan: reflejarlo en los
// negocios ABIERTOS del contacto. Los negocios ya cerrados (ganados o
// perdidos) nunca se tocan — pedido explícito: no reasignar
// retroactivamente algo que ya se definió.
const { db } = require('../db');

async function sincronizarNegociosAbiertos(contactoId, vendedorId, client = db) {
  await client.run(
    `UPDATE negocios n SET vendedor_id = $1
     FROM pipeline_etapas pe
     WHERE n.etapa_id = pe.id AND n.contacto_id = $2 AND pe.tipo = 'abierta' AND n.vendedor_id IS DISTINCT FROM $1`,
    [vendedorId, contactoId]
  );
}

// El lead que representa "el chat" de un contacto para efectos de
// asignación — mismo criterio que ya usa GET /whatsapp/conversaciones
// (el más reciente por contacto), no necesariamente el único que existe.
async function leadMasReciente(contactoId, client = db) {
  return client.get('SELECT * FROM leads WHERE contacto_id = $1 ORDER BY created_at DESC LIMIT 1', [contactoId]);
}

// Aplica vendedorId al lead más reciente del contacto (creándolo si no
// existe ninguno — caso de un contacto cuyo teléfono se consiguió por
// correo u otro medio, nunca escribió por WhatsApp, mismo caso ya resuelto
// para "Enviar plantilla WhatsApp") y a sus negocios abiertos. No toca
// contactos.vendedor_id — eso lo decide quien llama (routes/contactos.js
// ya lo actualizó antes de llamar acá; routes/leads.js lo actualiza aparte,
// ver ese archivo).
async function sincronizarLeadYNegocios(contactoId, vendedorId, client = db) {
  const lead = await leadMasReciente(contactoId, client);
  if (!lead && vendedorId) {
    // creado_por: el CHECK de la tabla solo admite 'bot'|'callcenter'|
    // 'vendedor'|'web' — ninguno describe exactamente "un administrador
    // asignó esto a mano desde la ficha o la Bandeja", así que se usa
    // 'callcenter' como el más cercano a "lo hizo alguien del equipo
    // comercial", no un dato con lógica propia aguas abajo.
    await client.run(
      `INSERT INTO leads (contacto_id, origen, creado_por, estado, vendedor_id, vendedor_sugerido_id, asignacion_modo, bot_estado)
       VALUES ($1,'manual','callcenter','asignado',$2,$2,'manual','derivado')`,
      [contactoId, vendedorId]
    );
  } else if (lead.vendedor_id !== vendedorId) {
    await client.run(
      `UPDATE leads SET vendedor_id = $1,
              estado = CASE WHEN estado IN ('convertido','descartado') THEN estado ELSE 'asignado' END,
              asignacion_modo = 'manual', bot_estado = 'derivado', bot_proxima_accion = NULL
       WHERE id = $2`,
      [vendedorId, lead.id]
    );
  }
  await sincronizarNegociosAbiertos(contactoId, vendedorId, client);
}

module.exports = { sincronizarNegociosAbiertos, sincronizarLeadYNegocios, leadMasReciente };
