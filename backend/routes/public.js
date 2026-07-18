const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { fetchCompleta, esImagenPublica } = require('../services/cotizacion_data');
const { generarCotizacionPDF } = require('../services/pdf');

// Rutas SIN autenticación (link enviado al cliente). HT-AP-03 §7.5.

async function registrarVista(cot, req) {
  await db.run('INSERT INTO cotizacion_vistas (cotizacion_id, ip, user_agent) VALUES ($1,$2,$3)',
    [cot.id, req.ip || null, (req.headers['user-agent'] || '').slice(0, 300)]);
  // enviada → vista (no revierte estados posteriores).
  if (cot.estado === 'enviada') {
    await db.run(`UPDATE cotizaciones SET estado='vista' WHERE id=$1 AND estado='enviada'`, [cot.id]);
  }
}

// GET /api/public/cotizacion/:token — datos para la vista pública (registra la visita)
router.get('/cotizacion/:token', async (req, res) => {
  try {
    const data = await fetchCompleta({ token: req.params.token });
    if (!data) return res.status(404).json({ error: 'Cotización no encontrada' });
    await registrarVista(data.cot, req);
    const { cot, items, cliente, vendedor, emisor } = data;
    res.json({
      numero: cot.numero, version: cot.version, created_at: cot.created_at, titulo: cot.titulo,
      validez_dias: cot.validez_dias, condiciones: cot.condiciones,
      subtotal: cot.subtotal, descuento_pct: cot.descuento_pct, iva_pct: cot.iva_pct, total: cot.total,
      estado: cot.estado, cliente, vendedor, emisor,
      items: items.map(it => ({
        descripcion: it.descripcion || it.producto_nombre, marca: it.marca,
        cantidad: it.cantidad, precio_unitario: it.precio_unitario, total_linea: it.total_linea,
        imagen: (it.mostrar_imagen !== false && esImagenPublica(it.url_imagen)) ? it.url_imagen : null,
        ficha: esImagenPublica(it.ficha_tecnica_url) ? it.ficha_tecnica_url : null,
        descripcion_completa: (it.mostrar_descripcion !== false && it.descripcion_completa) ? it.descripcion_completa : null,
      })),
    });
  } catch (err) {
    console.error('[public/cotizacion]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/public/cotizacion/:token/pdf — PDF público
router.get('/cotizacion/:token/pdf', async (req, res) => {
  try {
    const data = await fetchCompleta({ token: req.params.token });
    if (!data) return res.status(404).json({ error: 'Cotización no encontrada' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${data.cot.numero}.pdf"`);
    await generarCotizacionPDF(data, res);
  } catch (err) {
    console.error('[public/cotizacion/pdf]', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

// === Etapa 3C — Encuesta post-cierre ===
const timeline = require('../services/timeline');

// GET /api/public/encuesta/:token
router.get('/encuesta/:token', async (req, res) => {
  try {
    const encuesta = await db.get(
      `SELECT en.id, en.respondida_en, n.titulo AS negocio_titulo, e.razon_social AS empresa_nombre
       FROM encuestas en JOIN negocios n ON n.id = en.negocio_id
       LEFT JOIN empresas e ON e.id = n.empresa_id
       WHERE en.token_publico = $1`,
      [req.params.token]
    );
    if (!encuesta) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const cfg = await db.get('SELECT pregunta FROM encuesta_config WHERE id = 1');
    res.json({
      negocio_titulo: encuesta.negocio_titulo, empresa_nombre: encuesta.empresa_nombre,
      ya_respondida: !!encuesta.respondida_en,
      pregunta: cfg ? cfg.pregunta : '¿Qué tan probable es que nos recomiendes? (0 a 10)',
    });
  } catch (err) {
    console.error('[public/encuesta GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/public/encuesta/:token {puntaje, comentario}
router.post('/encuesta/:token', async (req, res) => {
  try {
    const { puntaje, comentario } = req.body;
    if (puntaje === undefined || puntaje === null || puntaje < 0 || puntaje > 10) {
      return res.status(400).json({ error: 'El puntaje debe ser un número entre 0 y 10' });
    }
    const encuesta = await db.get(
      `SELECT en.*, n.contacto_id, n.empresa_id FROM encuestas en JOIN negocios n ON n.id = en.negocio_id
       WHERE en.token_publico = $1`,
      [req.params.token]
    );
    if (!encuesta) return res.status(404).json({ error: 'Encuesta no encontrada' });
    if (encuesta.respondida_en) return res.status(409).json({ error: 'Esta encuesta ya fue respondida' });

    await db.run('INSERT INTO encuesta_respuestas (encuesta_id, puntaje, comentario) VALUES ($1,$2,$3)',
      [encuesta.id, puntaje, comentario || null]);
    await db.run('UPDATE encuestas SET respondida_en = now() WHERE id = $1', [encuesta.id]);
    await timeline.registrar({
      negocio_id: encuesta.negocio_id, contacto_id: encuesta.contacto_id, empresa_id: encuesta.empresa_id,
      tipo: 'encuesta_respondida', descripcion: `Encuesta respondida: puntaje ${puntaje}/10`,
      referencia_id: encuesta.id,
    });
    res.status(201).json({ message: 'Gracias por tu respuesta' });
  } catch (err) {
    console.error('[public/encuesta POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// === Bot de WhatsApp — webhook (nota de cambio v1.8 §7) ===
// PENDIENTE DE PROBAR CONTRA META: depende de credenciales de Meta (tenant/
// client id/token, ver correo a IT) que aún no existen. La lógica sigue la
// documentación estable de la Cloud API (mensajes de texto e interactivos),
// pero no se ha podido validar de extremo a extremo con un webhook real.
const crypto = require('crypto');
const { normalizarTelefono } = require('../services/dedup');
const { sugerirVendedor } = require('../services/asignacion');
const { esHorarioHabil } = require('../services/horario');
const whatsapp = require('../services/whatsapp');
const mensajes = require('../services/whatsapp_mensajes');
const r2 = require('../services/r2');

const MEDIA_TIPOS = { image: 'imagen', video: 'video', audio: 'audio', document: 'documento' };

// Registra un mensaje entrante; si trae media (foto/audio/video/documento),
// lo descarga de Meta (URL temporal, requiere el token) y lo sube a R2 antes
// de guardar la referencia. Si algo falla en la descarga/subida, igual se
// registra el mensaje (con su texto/caption) para no perder el hilo.
async function registrarEntrante({ contacto, leadId, tipoMedia, mediaId, textoEntrante }) {
  if (!tipoMedia || !mediaId) {
    await mensajes.registrar({ contacto_id: contacto.id, lead_id: leadId, direccion: 'entrante', texto: textoEntrante });
    return;
  }
  const descarga = await whatsapp.descargarMedia(mediaId);
  if (!descarga) {
    await mensajes.registrar({ contacto_id: contacto.id, lead_id: leadId, direccion: 'entrante', texto: textoEntrante, tipo: tipoMedia });
    return;
  }
  const ext = (descarga.mimeType || '').split('/')[1]?.split(';')[0] || 'bin';
  const key = `whatsapp/${contacto.id}/${Date.now()}-${mediaId}.${ext}`;
  await r2.subir(key, descarga.buffer, descarga.mimeType);
  await mensajes.registrar({
    contacto_id: contacto.id, lead_id: leadId, direccion: 'entrante', texto: textoEntrante,
    tipo: tipoMedia, archivo_key: key, archivo_mime: descarga.mimeType,
  });
}

// GET /api/public/whatsapp/webhook — verificación (handshake de Meta al configurar el webhook)
router.get('/whatsapp/webhook', (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (modo === 'subscribe' && token && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

function firmaValida(req) {
  if (!process.env.WHATSAPP_APP_SECRET) return true; // sin secreto configurado: no se valida (solo mientras se prueba)
  const firma = req.headers['x-hub-signature-256'];
  if (!firma || !req.rawBody) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(req.rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado)); } catch { return false; }
}

// Procesa un mensaje entrante: fuera de horario solo avisa y registra el lead;
// en horario hábil pregunta la categoría (lista de opciones); si el mensaje es
// la respuesta a esa lista, asigna vendedor con el mismo motor que usa el
// canal web (sugerirVendedor) y entrega la conversación (deja de "hablar").
async function procesarMensaje(m) {
  const telefono_e164 = normalizarTelefono('+' + m.from);
  if (!telefono_e164) return;

  let contacto = await db.get('SELECT * FROM contactos WHERE telefono_e164 = $1', [telefono_e164]);
  if (!contacto) {
    const r = await db.run(
      `INSERT INTO contactos (nombre, telefono_e164, origen) VALUES ($1,$2,'whatsapp') RETURNING *`,
      ['(WhatsApp)', telefono_e164]
    );
    contacto = r.rows[0];
  }

  const tipoMedia = MEDIA_TIPOS[m.type];
  const mediaId = tipoMedia ? m[m.type]?.id : null;
  const textoEntrante = m.text?.body ?? m.interactive?.list_reply?.title ?? m.interactive?.button_reply?.title
    ?? (tipoMedia ? (m[m.type]?.caption || `[${tipoMedia}]`) : '[mensaje no soportado]');
  const cfg = await db.get('SELECT * FROM whatsapp_bot_config WHERE id = 1');
  const ultimoLead = await db.get('SELECT * FROM leads WHERE contacto_id = $1 ORDER BY created_at DESC LIMIT 1', [contacto.id]);

  // El bot ya entregó esta conversación a un vendedor: no vuelve a intervenir,
  // solo se registra el mensaje para que se vea en la Bandeja de WhatsApp.
  if (ultimoLead && ultimoLead.bot_estado === 'derivado') {
    await registrarEntrante({ contacto, leadId: ultimoLead.id, tipoMedia, mediaId, textoEntrante });
    return;
  }

  const lead = ultimoLead && ['esperando_categoria', 'recontactando'].includes(ultimoLead.bot_estado) ? ultimoLead : null;

  // ¿Es la respuesta a la lista de categorización?
  const idOpcion = m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id;
  if (lead && idOpcion !== undefined) {
    const opciones = cfg.opciones_categorizacion || [];
    const elegida = opciones[Number(idOpcion)];
    if (elegida) {
      const sug = await sugerirVendedor({ contacto_id: contacto.id, categoria: elegida.categoria });
      // Igual que el canal web: si no hay vendedor disponible, el lead queda
      // 'nuevo' con solo una sugerencia (se asigna a mano desde Cola de
      // asignación), en vez de marcarse 'asignado' sin dueño.
      if (sug.vendedor_id) {
        await db.run(
          `UPDATE leads SET estado='asignado', vendedor_id=$1, vendedor_sugerido_id=$1, asignacion_modo='automatica_apertura',
                  bot_estado='derivado', bot_proxima_accion=NULL WHERE id=$2`,
          [sug.vendedor_id, lead.id]
        );
      } else {
        await db.run(
          `UPDATE leads SET vendedor_sugerido_id=NULL, bot_estado='derivado', bot_proxima_accion=NULL WHERE id=$1`,
          [lead.id]
        );
      }
      await db.run(`INSERT INTO lead_respuestas (lead_id, campo, valor, capturado_por) VALUES ($1,'categoria',$2,'bot')`, [lead.id, elegida.categoria]);
      await mensajes.registrar({ contacto_id: contacto.id, lead_id: lead.id, direccion: 'entrante', texto: textoEntrante });
      if (cfg.mensaje_confirmacion) {
        await whatsapp.enviar(telefono_e164, cfg.mensaje_confirmacion);
        await mensajes.registrar({ contacto_id: contacto.id, lead_id: lead.id, direccion: 'saliente', texto: cfg.mensaje_confirmacion });
      }
      return;
    }
  }

  const enHorario = await esHorarioHabil();
  if (!enHorario) {
    await whatsapp.enviar(telefono_e164, cfg.mensaje_fuera_horario);
    let leadId = lead?.id;
    if (!leadId) {
      const r = await db.run(`INSERT INTO leads (contacto_id, origen, creado_por, estado) VALUES ($1,'whatsapp','bot','nuevo') RETURNING id`, [contacto.id]);
      leadId = r.rows[0].id;
    }
    await registrarEntrante({ contacto, leadId, tipoMedia, mediaId, textoEntrante });
    await mensajes.registrar({ contacto_id: contacto.id, lead_id: leadId, direccion: 'saliente', texto: cfg.mensaje_fuera_horario });
    return;
  }

  if (!lead) {
    const pasos = await db.all('SELECT * FROM whatsapp_recontacto_pasos ORDER BY orden');
    const primerPaso = pasos[0];
    const r = await db.run(
      `INSERT INTO leads (contacto_id, origen, creado_por, estado, bot_estado, bot_proxima_accion)
       VALUES ($1,'whatsapp','bot','nuevo','esperando_categoria',$2) RETURNING id`,
      [contacto.id, primerPaso ? new Date(Date.now() + primerPaso.tiempo_espera_horas * 3600000) : null]
    );
    await whatsapp.enviarLista(telefono_e164, cfg.mensaje_categorizacion, cfg.opciones_categorizacion);
    await registrarEntrante({ contacto, leadId: r.rows[0].id, tipoMedia, mediaId, textoEntrante });
    await mensajes.registrar({ contacto_id: contacto.id, lead_id: r.rows[0].id, direccion: 'saliente', texto: cfg.mensaje_categorizacion });
  } else {
    // Ya hay un lead esperando categoría y el cliente escribió texto libre (o
    // mandó un archivo) en vez de elegir una opción de la lista: se registra
    // el mensaje y se deja la pregunta activa — el recontacto la reintenta
    // más tarde.
    await registrarEntrante({ contacto, leadId: lead.id, tipoMedia, mediaId, textoEntrante });
  }
}

// POST /api/public/whatsapp/webhook — mensajes entrantes
router.post('/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200); // Meta espera 200 de inmediato; se procesa después.
  try {
    if (!firmaValida(req)) { console.error('[whatsapp/webhook] Firma inválida'); return; }
    const mensajes = req.body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
    for (const m of mensajes) await procesarMensaje(m);
  } catch (err) {
    console.error('[whatsapp/webhook] Error procesando mensaje:', err);
  }
});

module.exports = router;
