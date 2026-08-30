// Memoria de conversaciones de WhatsApp (visión a futuro discutida en
// HT-AP-03, punto 3: estadísticas y automatizaciones futuras sobre el
// historial de la Bandeja). Corre una vez al día, hora de Chile, y en dos
// pasos, para que nunca haga falta reprocesar todo el historial:
//
// 1) Resumen diario: por cada contacto con actividad el día anterior, arma
//    un resumen corto (con el LLM) leyendo solo los mensajes de ESE día.
// 2) Memoria maestra: funde ese resumen nuevo con la memoria acumulada que
//    ya existía para el contacto (si había), pidiéndole al LLM que la
//    actualice manteniéndola compacta — no que la recalcule desde cero.
//
// Sin ANTHROPIC_API_KEY configurada, no falla: registra y no hace nada,
// mismo patrón que services/whatsapp.js sin credenciales de Meta.
const { db } = require('../db');
const { diaAnterior, fechaChileHoy } = require('./informeDiario');

const MODELO = 'claude-haiku-4-5-20251001'; // resume/funde texto corto en volumen — no necesita el modelo más grande.
const LARGO_MAXIMO_MEMORIA = 'no más de 300 palabras';

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

async function contactosConActividad(fecha) {
  return db.all(
    `SELECT DISTINCT contacto_id FROM whatsapp_mensajes WHERE date(created_at) = $1::date`,
    [fecha]
  );
}

async function mensajesDelDia(contactoId, fecha) {
  return db.all(
    `SELECT direccion, texto, tipo, created_at FROM whatsapp_mensajes
     WHERE contacto_id = $1 AND date(created_at) = $2::date ORDER BY created_at ASC`,
    [contactoId, fecha]
  );
}

function transcripcion(mensajes) {
  return mensajes.map(m => {
    const quien = m.direccion === 'entrante' ? 'Cliente' : 'Hidrotécnica';
    const contenido = m.tipo === 'texto' ? m.texto : `[${m.tipo}] ${m.texto}`;
    return `${quien}: ${contenido}`;
  }).join('\n');
}

// Genera y guarda el resumen diario de un contacto — no hace nada si ya
// existe uno para esa fecha (idempotente, se puede volver a llamar sin
// riesgo de duplicar).
async function generarResumenDiario(contactoId, fecha) {
  const existente = await db.get(
    'SELECT 1 FROM whatsapp_resumen_diario WHERE contacto_id = $1 AND fecha = $2',
    [contactoId, fecha]
  );
  if (existente) return;

  const mensajes = await mensajesDelDia(contactoId, fecha);
  if (!mensajes.length) return;

  const c = client();
  if (!c) {
    console.log(`[whatsappMemoria] Sin ANTHROPIC_API_KEY configurada; no se generó el resumen del ${fecha} para contacto ${contactoId}.`);
    return;
  }

  try {
    const resp = await c.messages.create({
      model: MODELO,
      max_tokens: 300,
      system: 'Resumes conversaciones de WhatsApp de atención comercial de una empresa técnica (Hidrotécnica). Sé breve, concreto y neutral: qué consultó o necesitó el cliente, qué se respondió, y si quedó algo pendiente. No inventes información que no esté en la conversación.',
      messages: [{ role: 'user', content: `Resume esta conversación del ${fecha} en un párrafo corto:\n\n${transcripcion(mensajes)}` }],
    });
    const resumen = resp.content?.[0]?.text?.trim();
    if (!resumen) return;

    await db.run(
      `INSERT INTO whatsapp_resumen_diario (contacto_id, fecha, resumen, cantidad_mensajes)
       VALUES ($1,$2,$3,$4) ON CONFLICT (contacto_id, fecha) DO NOTHING`,
      [contactoId, fecha, resumen, mensajes.length]
    );
  } catch (err) {
    console.error(`[whatsappMemoria] Error generando resumen diario (contacto ${contactoId}, ${fecha}):`, err.message);
  }
}

// Funde el resumen diario recién generado con la memoria acumulada del
// contacto. Si no había memoria previa, la memoria queda siendo ese primer
// resumen.
async function actualizarMemoriaMaestra(contactoId, fecha) {
  const diario = await db.get(
    'SELECT resumen FROM whatsapp_resumen_diario WHERE contacto_id = $1 AND fecha = $2',
    [contactoId, fecha]
  );
  if (!diario) return;

  const previa = await db.get('SELECT memoria FROM whatsapp_memoria WHERE contacto_id = $1', [contactoId]);

  let memoriaNueva = diario.resumen;
  if (previa?.memoria) {
    const c = client();
    if (!c) {
      console.log(`[whatsappMemoria] Sin ANTHROPIC_API_KEY configurada; no se actualizó la memoria maestra del contacto ${contactoId}.`);
      return;
    }
    try {
      const resp = await c.messages.create({
        model: MODELO,
        max_tokens: 400,
        system: `Mantienes una memoria acumulada y compacta (${LARGO_MAXIMO_MEMORIA}) sobre la relación comercial de Hidrotécnica con un cliente, a partir de sus conversaciones de WhatsApp. Cada día se te entrega la memoria actual y lo nuevo del día — devuelves la memoria actualizada completa, integrando lo nuevo, resumiendo o eliminando detalles antiguos que ya no sean relevantes para mantenerla dentro del largo indicado. No inventes información.`,
        messages: [{
          role: 'user',
          content: `Memoria actual:\n${previa.memoria}\n\nNuevo del ${fecha}:\n${diario.resumen}\n\nDevuelve la memoria actualizada.`,
        }],
      });
      const texto = resp.content?.[0]?.text?.trim();
      if (texto) memoriaNueva = texto;
    } catch (err) {
      console.error(`[whatsappMemoria] Error actualizando memoria maestra (contacto ${contactoId}):`, err.message);
      return;
    }
  }

  await db.run(
    `INSERT INTO whatsapp_memoria (contacto_id, memoria, ultima_fecha_incorporada)
     VALUES ($1,$2,$3)
     ON CONFLICT (contacto_id) DO UPDATE SET memoria = $2, ultima_fecha_incorporada = $3, actualizado_en = now()`,
    [contactoId, memoriaNueva, fecha]
  );
}

async function generarMemoriaDelDia(fecha) {
  const contactos = await contactosConActividad(fecha);
  for (const { contacto_id } of contactos) {
    await generarResumenDiario(contacto_id, fecha);
    await actualizarMemoriaMaestra(contacto_id, fecha);
  }
  return { contactos: contactos.length };
}

// Llamado desde el chequeo horario de server.js: corre una vez al día, de
// madrugada hora de Chile, sobre el día anterior (ya cerrado por completo).
// A diferencia del informe diario por correo, esto no envía nada afuera —
// corre igual en staging que en producción, para poder probarlo.
async function generarMemoriaSiCorresponde() {
  const hora = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (hora !== '03') return;

  const hoy = fechaChileHoy();
  const yaCorrio = await db.get('SELECT 1 FROM whatsapp_memoria_envios WHERE fecha = $1', [hoy]);
  if (yaCorrio) return;

  const fecha = diaAnterior(hoy);
  const resultado = await generarMemoriaDelDia(fecha);
  await db.run('INSERT INTO whatsapp_memoria_envios (fecha) VALUES ($1) ON CONFLICT (fecha) DO NOTHING', [hoy]);
  console.log(`[whatsappMemoria] Memoria del ${fecha} procesada (${resultado.contactos} contactos con actividad).`);
}

module.exports = { generarMemoriaDelDia, generarMemoriaSiCorresponde };
