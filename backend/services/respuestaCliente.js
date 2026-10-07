// Respuesta del cliente por WhatsApp a un negocio en seguimiento comercial
// (nota de cambio v1.42, 07-10-2026).
//
// Hasta ahora solo el toque de un botón de la plantilla "Seguimiento de
// cotización" (services/seguimientoBoton.js) hacía algo con el negocio; una
// respuesta escrita a mano, o el botón de otra plantilla, quedaba solo en la
// Bandeja y la secuencia seguía enviando recordatorios (caso real: una
// clienta escribió "No realizaré la compra" y 2 días después recibió el
// correo "Última revisión de tu cotización").
//
// Regla, para cualquier mensaje entrante de un contacto con negocios
// abiertos que estén en "Cotizado" o con una secuencia de seguimiento en
// curso:
//   1. Se pausa la secuencia de esos negocios (el cliente respondió).
//   2. Si el texto es un rechazo claro y hay un solo negocio en seguimiento:
//      pasa a "Perdido" y se pregunta la causa por WhatsApp (mismo camino que
//      el botón "No realizaré la compra"). Con varios negocios no se adivina
//      cuál: tarea al vendedor.
//   3. Si no es rechazo y hay UN solo negocio en "Cotizado": pasa a
//      "Negociación" (mismo camino que mover la tarjeta a mano).
//   4. Si hay varios en "Cotizado": no se adivina cuál es — tarea al
//      vendedor para que elija. Mismo criterio que seguimientoBoton.js.
const { db } = require('../db');
const timeline = require('./timeline');
const secuencias = require('./secuencias');
const seguimientoBoton = require('./seguimientoBoton');
const { cambiarEtapaNegocio } = require('../routes/negocios');

const MAX_TEXTO = 200;

function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Frases de rechazo explícito. Deliberadamente conservadoras: solo se usan
// para pedir confirmación a una persona, nunca para cerrar el negocio solo.
// Se evita "no" suelto ("no sé", "no me llegó la cotización") para no
// confundir una duda con un rechazo.
const PATRONES_RECHAZO = [
  /\bno (voy a|vamos a|quiero|queremos|realizare|realizaremos|hare|haremos|comprare|compraremos|continuare|continuaremos|seguire|seguiremos|avanzare|avanzaremos|concretare|concretaremos|tomare|tomaremos|aceptare|aceptaremos) (la |el |con |con la |con el )?(compra|cotizacion|trabajo|servicio|proyecto|pedido|seguir|continuar|avanzar|adelante|comprar|contratar)/,
  /\bno (me|nos) interesa/,
  /\bya no (me|nos) interesa/,
  /\bya no (lo |la )?(necesito|necesitamos|requiero|requerimos|preciso|precisamos)/,
  /\bno (lo |la )?(necesito|necesitamos|requiero|requerimos) (ya|mas|por ahora|por el momento)/,
  /\bno realizare la compra/,
  /\bno realizaremos la compra/,
  /\b(decidimos|decidi|optamos|opte) (no|por otra|por otro|por no)/,
  /\bno (seguire|seguiremos|continuare|continuaremos) (adelante|con (el|la|esto))/,
  /\bya (compre|compramos|contrate|contratamos|adquiri|adquirimos|resolvi|resolvimos) (en|con|por) (otr|otra|otro|alguien|un tercero)/,
  /\b(lo|la) (descarto|descartamos|cancelo|cancelamos)\b/,
  /\bdesisto\b|\bdesistimos\b|\bdeclino\b|\bdeclinamos\b/,
  /\bno gracias\b/,
];

function esRechazo(texto) {
  const t = normalizar(texto);
  if (!t || t.length > 300) return false;
  return PATRONES_RECHAZO.some(re => re.test(t));
}

async function negociosEnSeguimiento(contactoId) {
  return db.all(
    `SELECT n.id, n.titulo, n.contacto_id, n.empresa_id, n.pipeline_id, n.vendedor_id,
            pe.nombre AS etapa_nombre,
            (lower(pe.nombre) = 'cotizado') AS en_cotizado,
            EXISTS (SELECT 1 FROM negocio_secuencias ns WHERE ns.negocio_id = n.id AND ns.estado = 'activa') AS secuencia_activa
     FROM negocios n
     JOIN pipeline_etapas pe ON pe.id = n.etapa_id
     WHERE n.contacto_id = $1 AND pe.tipo = 'abierta'
       AND (lower(pe.nombre) = 'cotizado'
            OR EXISTS (SELECT 1 FROM negocio_secuencias ns WHERE ns.negocio_id = n.id AND ns.estado = 'activa'))
     ORDER BY n.id`,
    [contactoId]
  );
}

async function etapaNegociacion(pipelineId) {
  const etapas = await db.all(
    `SELECT id, nombre FROM pipeline_etapas WHERE pipeline_id = $1 AND tipo = 'abierta' AND activo = true`, [pipelineId]
  );
  return etapas.find(e => normalizar(e.nombre) === 'negociacion') || null;
}

// Una tarea por vendedor (el del negocio, o el del contacto si el negocio no
// tiene), sin repetir si ya hay una pendiente igual para el mismo contacto —
// el cliente puede escribir varios mensajes seguidos.
async function crearTarea({ contacto, negocios, titulo, descripcion }) {
  const porVendedor = new Map();
  for (const n of negocios) {
    const v = n.vendedor_id || contacto.vendedor_id;
    if (!v) continue;
    if (!porVendedor.has(v)) porVendedor.set(v, []);
    porVendedor.get(v).push(n);
  }
  for (const [vendedorId, lista] of porVendedor) {
    const dup = await db.get(
      `SELECT id FROM tareas WHERE contacto_id = $1 AND asignado_a_id = $2 AND titulo = $3 AND estado = 'pendiente' LIMIT 1`,
      [contacto.id, vendedorId, titulo]
    );
    if (dup) continue;
    const unico = lista.length === 1 ? lista[0] : null;
    const detalle = lista.map(n => `• ${n.titulo || 'Negocio ' + n.id} (#${n.id}, etapa ${n.etapa_nombre})`).join('\n');
    await db.run(
      `INSERT INTO tareas (titulo, descripcion, fecha_vencimiento, asignado_a_id, creado_por_id, contacto_id, empresa_id, negocio_id)
       VALUES ($1,$2,now(),$3,$3,$4,$5,$6)`,
      [titulo, `${descripcion}\n\nNegocios abiertos:\n${detalle}`, vendedorId, contacto.id, unico?.empresa_id ?? null, unico?.id ?? null]
    );
  }
}

async function nota(negocio, descripcion) {
  await timeline.registrar({
    negocio_id: negocio.id, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
    tipo: 'seguimiento_auto', descripcion,
  });
}

// Punto de entrada desde routes/public.js#procesarMensaje. Nunca lanza: un
// error acá no debe impedir que el mensaje se registre en la Bandeja.
async function procesarRespuesta({ contacto, texto }) {
  try {
    const negocios = await negociosEnSeguimiento(contacto.id);
    if (!negocios.length) return;

    const extracto = String(texto || '').slice(0, MAX_TEXTO);
    const rechazo = esRechazo(texto);
    const cotizados = negocios.filter(n => n.en_cotizado);

    if (!rechazo && cotizados.length === 1) {
      const n = cotizados[0];
      const destino = await etapaNegociacion(n.pipeline_id);
      if (destino) {
        await cambiarEtapaNegocio(n.id, destino.id, {}, null);
        await nota(n, `Cliente respondió por WhatsApp ("${extracto}") — el negocio pasó de "${n.etapa_nombre}" a "${destino.nombre}" automáticamente.`);
      } else {
        await nota(n, `Cliente respondió por WhatsApp ("${extracto}") — el pipeline no tiene una etapa "Negociación" activa, no se movió automáticamente.`);
        await crearTarea({
          contacto, negocios: [n], titulo: 'Cliente respondió por WhatsApp',
          descripcion: `Respondió: "${extracto}". Revisa y avanza el negocio a mano (este pipeline no tiene una etapa "Negociación").`,
        });
      }
    } else if (rechazo && negocios.length === 1) {
      // Un solo negocio en seguimiento: es inequívoco cuál cerrar. Mismo
      // camino que el botón "No realizaré la compra": pasa a Perdido y se
      // pregunta la causa por encuesta.
      const n = negocios[0];
      const movido = await seguimientoBoton.marcarPerdidoPorRechazo(
        n, `Cliente indicó por WhatsApp que no realizará la compra ("${extracto}") — motivo pendiente de encuesta automática`
      );
      if (movido) {
        await nota(n, `Cliente respondió por WhatsApp con un rechazo ("${extracto}") — el negocio pasó de "${n.etapa_nombre}" a Perdido automáticamente; se le pregunta la causa por WhatsApp.`);
      } else {
        await nota(n, `Cliente respondió por WhatsApp con un rechazo ("${extracto}") — el pipeline no tiene una etapa "perdida", no se movió automáticamente.`);
        await crearTarea({
          contacto, negocios: [n], titulo: 'Rechazo del cliente por WhatsApp',
          descripcion: `Respondió: "${extracto}". Marca el negocio como Perdido con su causa de no cierre (el pipeline no tiene una etapa "perdida" configurada para hacerlo automático).`,
        });
      }
    } else if (rechazo) {
      // Varios negocios en seguimiento: no se adivina cuál cerrar.
      for (const n of negocios) {
        await nota(n, `Cliente respondió por WhatsApp con un rechazo ("${extracto}") — tiene ${negocios.length} negocios en seguimiento, no se movió ninguno automáticamente; se avisó al vendedor.`);
      }
      await crearTarea({
        contacto, negocios, titulo: 'Rechazo del cliente por WhatsApp: elegir negocio',
        descripcion: `Respondió: "${extracto}". Tiene más de un negocio en seguimiento; confirma cuál rechaza y márcalo como Perdido con su causa de no cierre.`,
      });
    } else if (cotizados.length > 1) {
      for (const n of cotizados) {
        await nota(n, `Cliente respondió por WhatsApp ("${extracto}") — tiene ${cotizados.length} negocios en "Cotizado", no se movió ninguno automáticamente.`);
      }
      await crearTarea({
        contacto, negocios: cotizados, titulo: 'Cliente respondió por WhatsApp: elegir negocio',
        descripcion: `Respondió: "${extracto}". Tiene más de un negocio en "Cotizado"; revisa cuál corresponde y muévelo a Negociación.`,
      });
    }

    // Después de mover (si se movió): lo que quede con secuencia activa se
    // pausa — el cliente respondió, no deben seguir llegando recordatorios.
    for (const n of negocios) {
      await secuencias.pausarPorRespuestaCliente(n);
    }
  } catch (err) {
    console.error('[respuestaCliente] Error procesando respuesta del contacto', contacto?.id, err);
  }
}

module.exports = { procesarRespuesta, esRechazo };
