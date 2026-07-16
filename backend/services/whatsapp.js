// Envío de mensajes de WhatsApp vía la API de Meta (WhatsApp Cloud API).
// Sin credenciales configuradas, no falla: registra y no hace nada, igual que
// services/email.js con SMTP. Se activa cuando existan WHATSAPP_ACCESS_TOKEN
// y WHATSAPP_PHONE_NUMBER_ID (nota de cambio v1.8 §7 — pendiente de IT/Meta).
async function enviar(telefonoE164, mensaje) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.log(`[whatsapp] Sin credenciales configuradas; no se envió a ${telefonoE164}.`);
    return { enviado: false, motivo: 'WhatsApp no configurado' };
  }
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefonoE164.replace('+', ''),
          type: 'text',
          text: { body: mensaje },
        }),
      }
    );
    if (!resp.ok) {
      const err = await resp.text();
      console.error('[whatsapp] Error enviando a', telefonoE164, ':', err);
      return { enviado: false, motivo: err };
    }
    return { enviado: true };
  } catch (e) {
    console.error('[whatsapp] Error enviando a', telefonoE164, ':', e.message);
    return { enviado: false, motivo: e.message };
  }
}

// Mensaje interactivo tipo "lista" (hasta 10 opciones) — se usa para la
// pregunta de categorización, en vez de interpretar texto libre.
async function enviarLista(telefonoE164, mensaje, opciones) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.log(`[whatsapp] Sin credenciales configuradas; no se envió lista a ${telefonoE164}.`);
    return { enviado: false, motivo: 'WhatsApp no configurado' };
  }
  const rows = opciones.slice(0, 10).map((o, i) => ({ id: String(i), title: o.label.slice(0, 24) }));
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefonoE164.replace('+', ''),
          type: 'interactive',
          interactive: { type: 'list', body: { text: mensaje }, action: { button: 'Elegir', sections: [{ title: 'Opciones', rows }] } },
        }),
      }
    );
    if (!resp.ok) {
      const err = await resp.text();
      console.error('[whatsapp] Error enviando lista a', telefonoE164, ':', err);
      return { enviado: false, motivo: err };
    }
    return { enviado: true };
  } catch (e) {
    console.error('[whatsapp] Error enviando lista a', telefonoE164, ':', e.message);
    return { enviado: false, motivo: e.message };
  }
}

module.exports = { enviar, enviarLista };
