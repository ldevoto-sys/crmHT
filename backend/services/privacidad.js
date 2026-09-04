// Ley 21.719 — protección de datos personales. Tres piezas, validadas con
// Gerencia (rol DPO): aviso de primer contacto/reapertura, solicitud de
// eliminación de datos (con revisión humana antes de anonimizar) y purga
// automática de contactos inactivos que nunca se convirtieron en cliente.
const { db } = require('../db');
const email = require('./email');

const TEXTO_AVISO_PRIVACIDAD =
  '¡Hola! Gracias por escribir a Hidrotécnica 👋 Para ayudarte con tu consulta o cotización, ' +
  'vamos a registrar los datos de contacto que nos compartas en este chat. Puedes ver cómo los ' +
  'tratamos en nuestra Política de Privacidad: hidrotecnica.cl/politica-de-privacidad. En cualquier ' +
  'momento puedes pedirnos que eliminemos tus datos escribiendo "eliminar mis datos" o a info@hidrotecnica.cl.';

// Frases equivalentes a "eliminar mis datos" — comparación simple por
// substring sobre el texto normalizado (minúsculas, sin tildes), no NLP.
// Se mantiene una sola lista acá; si hace falta ampliarla, es el único lugar.
const FRASES_ELIMINACION = [
  'eliminar mis datos', 'elimina mis datos', 'borrar mis datos', 'borra mis datos',
  'eliminen mis datos', 'quiero que eliminen mis datos', 'eliminar mi informacion',
  'eliminar mi información', 'borrar mi informacion', 'borrar mi información',
];

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita tildes
}

function esSolicitudEliminacion(texto) {
  const norm = normalizar(texto);
  return FRASES_ELIMINACION.some(frase => norm.includes(normalizar(frase)));
}

async function mesesInactividad() {
  const cfg = await db.get('SELECT meses_inactividad FROM config_privacidad WHERE id = 1');
  return cfg?.meses_inactividad ?? 12;
}

// ¿Hay que (re)enviar el aviso de privacidad? Sí si el contacto nunca
// escribió antes, o si su último mensaje entrante fue hace >= meses_inactividad.
// Se calcula ANTES de registrar el mensaje actual (el llamador pasa el
// contacto recién resuelto, todavía sin el mensaje de este webhook guardado).
async function necesitaAvisoPrivacidad(contacto_id) {
  const ultimo = await db.get(
    `SELECT created_at FROM whatsapp_mensajes WHERE contacto_id = $1 AND direccion = 'entrante' ORDER BY created_at DESC LIMIT 1`,
    [contacto_id]
  );
  if (!ultimo) return true;
  const meses = (Date.now() - new Date(ultimo.created_at).getTime()) / (30.44 * 24 * 3600000);
  return meses >= await mesesInactividad();
}

async function marcarAvisoPrivacidadEnviado(contacto_id) {
  await db.run(
    `INSERT INTO whatsapp_conversaciones (contacto_id, aviso_privacidad_enviado_en) VALUES ($1, now())
     ON CONFLICT (contacto_id) DO UPDATE SET aviso_privacidad_enviado_en = now()`,
    [contacto_id]
  );
}

// Destinatarios de la notificación de una solicitud de eliminación — hoy el
// Gerente General en su rol de DPO (rol 'gerencia'); se incluye también
// 'administrador' por si gerencia no puede resolverla directo en el CRM.
async function destinatariosDpo() {
  return db.all(
    `SELECT nombre, email FROM users
     WHERE activo = true AND email IS NOT NULL AND email <> '' AND rol IN ('gerencia', 'administrador')`
  );
}

// Crea la solicitud si no hay ya una pendiente para ese contacto (evita
// duplicar si el cliente repite la frase), y notifica al DPO. No anonimiza
// nada acá — eso requiere revisión humana desde la pantalla de Administración.
async function registrarSolicitudEliminacion({ contacto_id, origen = 'whatsapp', texto_solicitud = null }) {
  const yaPendiente = await db.get(
    `SELECT id FROM solicitudes_eliminacion_datos WHERE contacto_id = $1 AND estado = 'pendiente'`,
    [contacto_id]
  );
  if (yaPendiente) return yaPendiente;

  const r = await db.run(
    `INSERT INTO solicitudes_eliminacion_datos (contacto_id, origen, texto_solicitud) VALUES ($1,$2,$3) RETURNING *`,
    [contacto_id, origen, texto_solicitud]
  );
  const solicitud = r.rows[0];

  const contacto = await db.get('SELECT * FROM contactos WHERE id = $1', [contacto_id]);
  const destinatarios = await destinatariosDpo();
  for (const usuario of destinatarios) {
    try {
      await email.solicitudEliminacionDatos(usuario, contacto, solicitud);
    } catch (err) {
      console.error(`[privacidad] Error notificando solicitud de eliminación a ${usuario.email}:`, err.message);
    }
  }
  return solicitud;
}

// Anonimiza los campos identificables de un contacto. No toca mensajes,
// notas ni ningún texto libre (alcance acotado, validado con Gerencia).
async function anonimizarContacto(contacto_id) {
  await db.run(
    `UPDATE contactos SET nombre = '(Eliminado)', apellido = NULL, telefono_e164 = NULL,
            email = NULL, rut_comprador = NULL, cargo = NULL, activo = false
     WHERE id = $1`,
    [contacto_id]
  );
}

// Resuelve una solicitud pendiente desde la pantalla de Administración.
// tiene_facturas es solo lo que registra quien revisa (no cambia qué se
// anonimiza) — la contabilidad de Softland no vive en la fila de contactos.
async function resolverSolicitudEliminacion(solicitudId, { estado, tiene_facturas, notas_resolucion, usuario_id }) {
  const solicitud = await db.get('SELECT * FROM solicitudes_eliminacion_datos WHERE id = $1', [solicitudId]);
  if (!solicitud || solicitud.estado !== 'pendiente') return null;

  if (estado === 'anonimizado') {
    await anonimizarContacto(solicitud.contacto_id);
  }
  const r = await db.run(
    `UPDATE solicitudes_eliminacion_datos
     SET estado = $1, tiene_facturas = $2, notas_resolucion = $3, resuelta_por_id = $4, resuelta_en = now()
     WHERE id = $5 RETURNING *`,
    [estado, tiene_facturas ?? null, notas_resolucion ?? null, usuario_id, solicitudId]
  );
  return r.rows[0];
}

function fechaChileHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

// Contactos que nunca se convirtieron (ningún lead en estado 'convertido')
// y sin ningún mensaje de WhatsApp en los últimos meses_inactividad — sin
// excepción por negocio abierto (criterio confirmado 04-09-2026: eso lo
// resuelve por separado el cierre automático de negocios estancados, que no
// forma parte de esta funcionalidad de privacidad).
async function contactosParaPurgar() {
  const meses = await mesesInactividad();
  return db.all(
    `SELECT c.id FROM contactos c
     WHERE c.activo = true
       AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.contacto_id = c.id AND l.estado = 'convertido')
       AND COALESCE(
             (SELECT MAX(wm.created_at) FROM whatsapp_mensajes wm WHERE wm.contacto_id = c.id),
             c.created_at
           ) < now() - ($1 || ' months')::interval`,
    [meses]
  );
}

async function purgarInactivos() {
  const contactos = await contactosParaPurgar();
  for (const c of contactos) await anonimizarContacto(c.id);
  return contactos.length;
}

// Llamado desde el chequeo horario de server.js — mismo patrón que
// postventaVencidos.js: corre una vez al día (fuera de horario, 04:00-04:14
// hora de Chile — 1 hora después de whatsappMemoria, que ya usa las 3am,
// para no competir por la conexión de BD al mismo tiempo) y deja constancia
// en privacidad_purga_ejecuciones para no repetirlo el mismo día.
async function purgarInactivosSiCorresponde() {
  if (process.env.VITE_AMBIENTE_LABEL) return; // solo desde producción, igual que informeDiario/postventaVencidos

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const partes = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  if (partes.hour !== '04' || Number(partes.minute) >= 15) return;

  const hoy = fechaChileHoy();
  const yaEjecutado = await db.get('SELECT 1 FROM privacidad_purga_ejecuciones WHERE fecha = $1', [hoy]);
  if (yaEjecutado) return;

  const cantidad = await purgarInactivos();
  await db.run(
    `INSERT INTO privacidad_purga_ejecuciones (fecha, contactos_anonimizados) VALUES ($1,$2)
     ON CONFLICT (fecha) DO NOTHING`,
    [hoy, cantidad]
  );
  if (cantidad) console.log(`[privacidad] Purga diaria: ${cantidad} contacto(s) inactivo(s) anonimizado(s).`);
}

module.exports = {
  TEXTO_AVISO_PRIVACIDAD,
  esSolicitudEliminacion,
  necesitaAvisoPrivacidad,
  marcarAvisoPrivacidadEnviado,
  registrarSolicitudEliminacion,
  resolverSolicitudEliminacion,
  anonimizarContacto,
  contactosParaPurgar,
  purgarInactivos,
  purgarInactivosSiCorresponde,
};
