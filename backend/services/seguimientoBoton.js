// Respuestas del cliente a los botones de la plantilla de WhatsApp
// "Seguimiento de cotización" (nota de cambio pendiente de redactar,
// 14-09-2026) — y a la encuesta de causa de no cierre que se envía después
// si el cliente indicó que no comprará.
//
// El negocio correcto se identifica con el mecanismo nativo de WhatsApp: al
// enviar cada mensaje que interesa correlacionar, Meta devuelve un id propio
// (wa_message_id, ver whatsapp.js); cuando el cliente responde tocando un
// botón o una opción de lista, el webhook trae ese mismo id en
// m.context.id. El vínculo queda en whatsapp_correlacion. Nunca se adivina
// el negocio por "el más reciente del contacto" — un mismo contacto puede
// tener más de un negocio abierto a la vez.
const { db } = require('../db');
const timeline = require('./timeline');
const whatsapp = require('./whatsapp');
const mensajes = require('./whatsapp_mensajes');
const secuencias = require('./secuencias');
const { cambiarEtapaNegocio } = require('../routes/negocios');

// Deben calzar exactamente con los botones configurados en la plantilla
// "seguimiento_coti" dentro de Meta Business Manager — si se edita el texto
// de esos botones allá, hay que actualizar esto también.
const BOTON_NO_COMPRA = 'no realizaré la compra';
const BOTON_MAS_INFO = 'necesito más información';

const MENSAJE_ENCUESTA = '¿Cuál fue el motivo principal por el que no continuarás con la compra? Nos ayuda a mejorar.';

// Punto de entrada único desde routes/public.js#procesarMensaje. Devuelve
// true si la respuesta se identificó y ya se actuó sobre ella (el llamador
// no debe seguir el flujo normal del bot de categorización de leads); false
// si no hay vínculo conocido o no se reconoce el contenido — se sigue
// tratando como un mensaje cualquiera.
async function manejarRespuesta(m) {
  const waMessageId = m.context?.id;
  if (!waMessageId) return false;
  const correlacion = await db.get('SELECT * FROM whatsapp_correlacion WHERE wa_message_id = $1', [waMessageId]);
  if (!correlacion) return false;

  if (correlacion.proposito === 'seguimiento_coti' && m.type === 'button') {
    return manejarBotonSeguimiento(correlacion.negocio_id, m.button?.text || '');
  }
  if (correlacion.proposito === 'encuesta_no_cierre' && m.type === 'interactive' && m.interactive?.list_reply) {
    return manejarRespuestaEncuesta(correlacion.negocio_id, m.interactive.list_reply.id);
  }
  return false;
}

async function manejarBotonSeguimiento(negocioId, textoBoton) {
  const negocio = await db.get('SELECT * FROM negocios WHERE id = $1', [negocioId]);
  if (!negocio) return false;
  const texto = textoBoton.trim().toLowerCase();

  if (texto === BOTON_NO_COMPRA) {
    const etapaPerdida = await db.get(
      `SELECT id FROM pipeline_etapas WHERE pipeline_id = $1 AND tipo = 'perdida' LIMIT 1`, [negocio.pipeline_id]
    );
    if (!etapaPerdida) {
      console.error('[seguimientoBoton] Pipeline', negocio.pipeline_id, 'sin etapa "perdida" — no se pudo mover el negocio', negocioId);
      return false;
    }
    // Causa pendiente: se pregunta por encuesta 1 minuto después (ver
    // enviarEncuestasPendientesSiCorresponde) — cambiarEtapaNegocio la exige
    // por defecto, permitirPerdidaSinCausa es justo para este caso.
    await cambiarEtapaNegocio(negocio.id, etapaPerdida.id, {
      causa_no_cierre_detalle: 'Cliente indicó por WhatsApp que no realizará la compra — motivo pendiente de encuesta automática',
      permitirPerdidaSinCausa: true,
    }, null);
    await db.run(
      `INSERT INTO whatsapp_encuesta_no_cierre (negocio_id, contacto_id, enviar_en)
       VALUES ($1, $2, now() + interval '1 minute')
       ON CONFLICT (negocio_id) DO NOTHING`,
      [negocio.id, negocio.contacto_id]
    );
    return true;
  }

  if (texto === BOTON_MAS_INFO) {
    const etapasAbiertas = await db.all(
      `SELECT * FROM pipeline_etapas WHERE pipeline_id = $1 AND tipo = 'abierta'`, [negocio.pipeline_id]
    );
    const etapaNegociacion = etapasAbiertas.find(e => e.nombre.trim().toLowerCase() === 'negociación');
    if (etapaNegociacion) {
      await cambiarEtapaNegocio(negocio.id, etapaNegociacion.id, {}, null);
      return true;
    }
    // Este pipeline no tiene una etapa "Negociación" — no se inventa una
    // (mismo criterio que services/sugerenciasFacturacion.js con
    // "Facturado"). Se pausa la secuencia para que no siga corriendo como si
    // el cliente no hubiera respondido, y se avisa a un humano con una tarea.
    await secuencias.pausarPorRespuestaCliente(negocio);
    await timeline.registrar({
      negocio_id: negocio.id, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
      tipo: 'seguimiento_auto',
      descripcion: 'Cliente respondió "Necesito más información" por WhatsApp — el pipeline no tiene una etapa "Negociación" configurada, no se movió automáticamente.',
    });
    if (negocio.vendedor_id) {
      await db.run(
        `INSERT INTO tareas (titulo, descripcion, fecha_vencimiento, asignado_a_id, creado_por_id, contacto_id, empresa_id, negocio_id)
         VALUES ($1,$2,now(),$3,$3,$4,$5,$6)`,
        [
          'Cliente pidió más información por WhatsApp',
          'Respondió "Necesito más información" al seguimiento de su cotización. Revisa y avanza el negocio a mano (este pipeline no tiene una etapa "Negociación").',
          negocio.vendedor_id, negocio.contacto_id, negocio.empresa_id, negocio.id,
        ]
      );
    }
    return true;
  }

  return false; // botón de otra plantilla — se registra como mensaje normal
}

async function manejarRespuestaEncuesta(negocioId, causaIdStr) {
  const causaId = Number(causaIdStr);
  if (!causaId) return false;
  const causa = await db.get('SELECT id FROM causas_no_cierre WHERE id = $1 AND activo = true', [causaId]);
  if (!causa) return false;
  const negocio = await db.get('SELECT id, contacto_id, empresa_id FROM negocios WHERE id = $1', [negocioId]);
  if (!negocio) return false;
  await db.run('UPDATE negocios SET causa_no_cierre_id = $1, causa_no_cierre_detalle = NULL WHERE id = $2', [causaId, negocioId]);
  await timeline.registrar({
    negocio_id: negocioId, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
    tipo: 'seguimiento_auto', descripcion: 'Cliente respondió la encuesta de causa de no cierre por WhatsApp.',
  });
  return true;
}

// Job cada 1 minuto (server.js) — envía la encuesta a quienes ya cumplieron
// el minuto de espera desde que dijeron que no comprarán. No usa el
// intervalo de 15 min del resto de los jobs del proyecto porque acá el
// minuto de espera es parte del requisito, no un detalle de implementación.
async function enviarEncuestasPendientesSiCorresponde() {
  const pendientes = await db.all(
    `SELECT e.id, e.negocio_id, e.contacto_id, c.telefono_e164
     FROM whatsapp_encuesta_no_cierre e
     JOIN contactos c ON c.id = e.contacto_id
     WHERE e.enviado_en IS NULL AND e.enviar_en <= now()`
  );
  if (!pendientes.length) return;

  const causas = await db.all(`SELECT id, nombre FROM causas_no_cierre WHERE activo = true ORDER BY nombre`);
  if (!causas.length) {
    console.error('[seguimientoBoton] No hay causas de no cierre activas configuradas — no se puede enviar la encuesta');
    return;
  }
  const opciones = causas.map(c => ({ id: c.id, label: c.nombre }));

  for (const p of pendientes) {
    const resultado = await whatsapp.enviarLista(p.telefono_e164, MENSAJE_ENCUESTA, opciones);
    if (!resultado.enviado) {
      console.error('[seguimientoBoton] No se pudo enviar la encuesta de causa de no cierre (negocio', p.negocio_id, '):', resultado.motivo);
      continue;
    }
    await db.run('UPDATE whatsapp_encuesta_no_cierre SET enviado_en = now() WHERE id = $1', [p.id]);
    if (resultado.wa_message_id) {
      await db.run(
        `INSERT INTO whatsapp_correlacion (wa_message_id, negocio_id, proposito) VALUES ($1,$2,'encuesta_no_cierre')
         ON CONFLICT (wa_message_id) DO NOTHING`,
        [resultado.wa_message_id, p.negocio_id]
      );
    }
    await mensajes.registrar({ contacto_id: p.contacto_id, direccion: 'saliente', texto: MENSAJE_ENCUESTA });
  }
}

module.exports = { manejarRespuesta, enviarEncuestasPendientesSiCorresponde };
