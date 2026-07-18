// Envío de mensajes de WhatsApp vía la API de Meta (WhatsApp Cloud API).
// Sin credenciales configuradas, no falla: registra y no hace nada, igual que
// services/email.js con SMTP. Se activa cuando existan WHATSAPP_ACCESS_TOKEN
// y WHATSAPP_PHONE_NUMBER_ID (nota de cambio v1.8 §7 — pendiente de IT/Meta).

// Traduce los errores más comunes de la Cloud API a un mensaje entendible
// para quien está usando el CRM (no un JSON técnico). Si no reconoce el
// código, muestra el mensaje que trae Meta o, en último caso, el texto crudo.
function errorAmigable(bodyText) {
  let parsed;
  try { parsed = JSON.parse(bodyText); } catch { return bodyText; }
  const err = parsed?.error;
  if (!err) return bodyText;
  if (err.code === 131030) {
    return 'Este número de WhatsApp está en modo de prueba: solo puede enviar mensajes a destinatarios autorizados en Meta. Agrega el número del cliente en Meta → Configuración de la API → destinatarios de prueba (o espera a que se use el número de producción).';
  }
  if (err.code === 190) {
    return 'El token de acceso de WhatsApp no es válido o venció. Avisa al equipo técnico para renovarlo.';
  }
  if (err.code === 131047) {
    return 'Pasaron más de 24 h desde el último mensaje del cliente: solo se puede responder con una plantilla aprobada por Meta.';
  }
  return err.error_data?.details || err.message || bodyText;
}

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
      return { enviado: false, motivo: errorAmigable(err) };
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
      return { enviado: false, motivo: errorAmigable(err) };
    }
    return { enviado: true };
  } catch (e) {
    console.error('[whatsapp] Error enviando lista a', telefonoE164, ':', e.message);
    return { enviado: false, motivo: e.message };
  }
}

// Documento (ej. PDF de una cotización) enviado por link público — no requiere
// subirlo antes a Meta. Solo funciona dentro de la ventana de 24 h de servicio
// al cliente (igual que un mensaje de texto libre).
async function enviarDocumento(telefonoE164, urlDocumento, nombreArchivo, caption) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.log(`[whatsapp] Sin credenciales configuradas; no se envió documento a ${telefonoE164}.`);
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
          type: 'document',
          document: { link: urlDocumento, filename: nombreArchivo, ...(caption ? { caption } : {}) },
        }),
      }
    );
    if (!resp.ok) {
      const err = await resp.text();
      console.error('[whatsapp] Error enviando documento a', telefonoE164, ':', err);
      return { enviado: false, motivo: errorAmigable(err) };
    }
    return { enviado: true };
  } catch (e) {
    console.error('[whatsapp] Error enviando documento a', telefonoE164, ':', e.message);
    return { enviado: false, motivo: e.message };
  }
}

const TIPO_WHATSAPP = { imagen: 'image', video: 'video', audio: 'audio', documento: 'document' };

// Envío genérico de media por link público (imagen/video/audio/documento) —
// usado para adjuntos que sube un vendedor desde la Bandeja. audio no admite
// caption en la API de Meta.
async function enviarMedia(telefonoE164, tipo, urlArchivo, { nombreArchivo, caption } = {}) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.log(`[whatsapp] Sin credenciales configuradas; no se envió ${tipo} a ${telefonoE164}.`);
    return { enviado: false, motivo: 'WhatsApp no configurado' };
  }
  const tipoApi = TIPO_WHATSAPP[tipo];
  if (!tipoApi) return { enviado: false, motivo: `Tipo de media no soportado: ${tipo}` };
  const media = { link: urlArchivo };
  if (tipoApi === 'document') media.filename = nombreArchivo;
  if (caption && tipoApi !== 'audio') media.caption = caption;
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefonoE164.replace('+', ''),
          type: tipoApi,
          [tipoApi]: media,
        }),
      }
    );
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[whatsapp] Error enviando ${tipo} a`, telefonoE164, ':', err);
      return { enviado: false, motivo: errorAmigable(err) };
    }
    return { enviado: true };
  } catch (e) {
    console.error(`[whatsapp] Error enviando ${tipo} a`, telefonoE164, ':', e.message);
    return { enviado: false, motivo: e.message };
  }
}

// Descarga un media entrante (foto/audio/video/documento que mandó el
// cliente): primero se consulta la URL temporal de Meta para ese media id,
// luego se descarga el binario — ambos pasos requieren el mismo token.
async function descargarMedia(mediaId) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) {
    console.log('[whatsapp] Sin credenciales configuradas; no se descargó el media', mediaId);
    return null;
  }
  try {
    const infoResp = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
    });
    if (!infoResp.ok) {
      console.error('[whatsapp] Error consultando media', mediaId, ':', await infoResp.text());
      return null;
    }
    const info = await infoResp.json();
    const binResp = await fetch(info.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } });
    if (!binResp.ok) {
      console.error('[whatsapp] Error descargando media', mediaId, ':', await binResp.text());
      return null;
    }
    const buffer = Buffer.from(await binResp.arrayBuffer());
    return { buffer, mimeType: info.mime_type || binResp.headers.get('content-type') };
  } catch (e) {
    console.error('[whatsapp] Error descargando media', mediaId, ':', e.message);
    return null;
  }
}

module.exports = { enviar, enviarLista, enviarDocumento, enviarMedia, descargarMedia };
