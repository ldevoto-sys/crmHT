// Alertas de respuesta por WhatsApp (15/16-09-2026): tres situaciones donde
// un cliente que escribió puede quedar sin que nadie se entere, cada una con
// su propia definición de "desde cuándo está esperando":
// 1. Ya tiene vendedor asignado (bot_estado='derivado', vendedor_id) y el
//    último mensaje del hilo es del cliente, sin respuesta después — escala
//    vendedor → +callcenter → +jefe comercial → +gerencia.
// 2. El bot lo categorizó pero sugerirVendedor() no encontró a quién
//    asignarlo (queda en la Cola de asignación, vendedor_id NULL) — escala
//    directo callcenter → +jefe comercial → +gerencia (no hay vendedor al
//    que avisar primero).
// 3. El bot agotó sus reintentos de recontacto y cerró el lead solo porque
//    el CLIENTE nunca respondió la categorización — aviso único (no es una
//    escalada por tiempo, es "esto se perdió", se dispara desde
//    services/whatsapp_bot.js).
// Mismo mecanismo de scheduler que el resto del proyecto (chequeo cada 15
// min desde server.js).
const { db } = require('../db');
const email = require('./email');
const teams = require('./teams');
const { minutosHabilesEntre } = require('./horario');

const NIVEL_LABEL = { 1: 'Vendedor', 2: 'Callcenter', 3: 'Jefe comercial', 4: 'Gerencia' };
const NIVEL_ROL = { 2: 'callcenter', 3: 'jefe_comercial', 4: 'gerencia' };

// Situación 1: ya tiene vendedor. La última respuesta del hilo es del
// cliente, no está cerrada a mano desde la Bandeja (botón "Cerrar
// conversación" cuenta igual que responder — se reabre sola si el cliente
// vuelve a escribir), y pendiente_desde es el mensaje entrante más antiguo
// desde la última respuesta saliente (no se resetea si el cliente insiste
// con más mensajes, arranca en el primero sin responder).
async function conversacionesPendientes() {
  return db.all(`
    SELECT c.id AS contacto_id, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
           em.razon_social AS empresa_nombre,
           l.vendedor_id, u.nombre AS vendedor_nombre, u.email AS vendedor_email,
           ult.texto AS ultimo_mensaje, pend.pendiente_desde
    FROM (SELECT DISTINCT contacto_id FROM whatsapp_mensajes) base
    JOIN contactos c ON c.id = base.contacto_id
    LEFT JOIN empresas em ON em.id = c.empresa_id
    LEFT JOIN whatsapp_conversaciones wc ON wc.contacto_id = c.id
    JOIN LATERAL (
      SELECT * FROM leads WHERE contacto_id = c.id ORDER BY created_at DESC LIMIT 1
    ) l ON true
    JOIN users u ON u.id = l.vendedor_id
    LEFT JOIN LATERAL (
      SELECT texto, direccion, created_at FROM whatsapp_mensajes WHERE contacto_id = c.id ORDER BY created_at DESC LIMIT 1
    ) ult ON true
    JOIN LATERAL (
      SELECT MIN(created_at) AS pendiente_desde
      FROM whatsapp_mensajes
      WHERE contacto_id = c.id AND direccion = 'entrante'
        AND created_at > COALESCE(
          (SELECT MAX(created_at) FROM whatsapp_mensajes WHERE contacto_id = c.id AND direccion = 'saliente'),
          '-infinity'::timestamp
        )
    ) pend ON true
    WHERE l.bot_estado = 'derivado' AND l.vendedor_id IS NOT NULL
      AND ult.direccion = 'entrante' AND pend.pendiente_desde IS NOT NULL
      AND NOT COALESCE(wc.cerrada_manual, false)
  `);
}

// Situación 2: categorizado pero sin vendedor (Cola de asignación). Acá NO
// sirve el criterio de "último mensaje sin responder" — el bot suele mandar
// un mensaje de confirmación automático justo después de categorizar, que
// dejaría el hilo como "ya respondido" aunque nadie humano lo haya tomado.
// Por eso usa leads.derivado_en (desde cuándo quedó en este estado), no los
// mensajes.
async function leadsSinAsignar() {
  return db.all(`
    SELECT l.contacto_id, l.derivado_en AS pendiente_desde,
           c.nombre AS contacto_nombre, c.apellido AS contacto_apellido, em.razon_social AS empresa_nombre
    FROM leads l
    JOIN contactos c ON c.id = l.contacto_id
    LEFT JOIN empresas em ON em.id = c.empresa_id
    WHERE l.estado = 'nuevo' AND l.bot_estado = 'derivado' AND l.vendedor_id IS NULL AND l.derivado_en IS NOT NULL
  `);
}

function nivelParaMinutos(minutos, cfg) {
  if (minutos >= cfg.minutos_gerencia) return 4;
  if (minutos >= cfg.minutos_jefe_comercial) return 3;
  if (minutos >= cfg.minutos_callcenter) return 2;
  if (minutos >= cfg.minutos_vendedor) return 1;
  return 0;
}

// Igual, pero sin nivel 1 — no hay vendedor al que escalarle primero.
function nivelSinVendedorParaMinutos(minutos, cfg) {
  if (minutos >= cfg.minutos_gerencia) return 4;
  if (minutos >= cfg.minutos_jefe_comercial) return 3;
  if (minutos >= cfg.minutos_callcenter) return 2;
  return 0;
}

// Acumulativo: el nivel N incluye a los destinatarios de los niveles 1..N,
// para que nadie deje de estar al tanto al escalar (diseño validado con
// Luis Devoto, 15-09-2026). vendedor=null (situación 2) simplemente no
// agrega a nadie de nivel 1.
async function destinatariosNivel(nivel, vendedor) {
  const destinatarios = [];
  if (vendedor?.email) destinatarios.push(vendedor);
  for (let n = 2; n <= nivel; n++) {
    const usuarios = await db.all(
      `SELECT nombre, email FROM users WHERE activo = true AND email IS NOT NULL AND email <> '' AND rol = $1`,
      [NIVEL_ROL[n]]
    );
    destinatarios.push(...usuarios);
  }
  const vistos = new Set();
  return destinatarios.filter(d => {
    const key = d.email.toLowerCase();
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

function formatoTiempo(minutos) {
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return horas > 0 ? `${horas} h ${mins} min` : `${mins} min`;
}

// Dedup + envío + registro, compartido entre las situaciones 1 y 2 — lo
// único que cambia es cómo se calcula el nivel y si hay vendedor a incluir.
async function procesarCandidato(conv, cfg, calcularNivel, ahora) {
  const nombreCompleto = `${conv.contacto_nombre} ${conv.contacto_apellido || ''}`.trim();
  const minutos = await minutosHabilesEntre(new Date(conv.pendiente_desde), ahora);
  const nivel = calcularNivel(minutos, cfg);
  if (nivel === 0) {
    return { contacto: nombreCompleto, minutosHabiles: minutos, nivel: 0, enviado: false, motivo: 'Todavía no cruza el primer umbral' };
  }

  const estado = await db.get('SELECT * FROM whatsapp_alertas_respuesta WHERE contacto_id = $1', [conv.contacto_id]);
  const esRachaNueva = !estado || new Date(estado.pendiente_desde).getTime() !== new Date(conv.pendiente_desde).getTime();
  const nivelAlertado = esRachaNueva ? 0 : estado.nivel_alertado;
  if (nivel <= nivelAlertado) {
    return { contacto: nombreCompleto, minutosHabiles: minutos, nivel, enviado: false, motivo: `Nivel ${nivel} ya avisado para esta racha` };
  }

  const vendedor = conv.vendedor_email ? { nombre: conv.vendedor_nombre, email: conv.vendedor_email } : null;
  const destinatarios = await destinatariosNivel(nivel, vendedor);
  const datosCorreo = {
    nivel, nivelLabel: NIVEL_LABEL[nivel], contactoNombre: nombreCompleto, empresaNombre: conv.empresa_nombre,
    vendedorNombre: conv.vendedor_nombre, minutosHabiles: minutos, ultimoMensaje: conv.ultimo_mensaje, contactoId: conv.contacto_id,
    sinAsignar: !vendedor,
  };
  for (const usuario of destinatarios) {
    try { await email.alertaSinResponderWhatsapp(usuario, datosCorreo); }
    catch (err) { console.error('[alertasRespuestaWhatsapp] Error correo a', usuario.email, ':', err.message); }
  }
  await teams.enviarAlertaTeams(
    `WhatsApp sin responder — Nivel ${nivel} (${NIVEL_LABEL[nivel]})`,
    `${nombreCompleto}${conv.empresa_nombre ? ' · ' + conv.empresa_nombre : ''} lleva ${formatoTiempo(minutos)} hábiles ${vendedor ? 'sin respuesta' : 'sin asignar (Cola de asignación)'}.${vendedor ? ` Vendedor: ${conv.vendedor_nombre || '—'}.` : ''}`
  );

  await db.run(
    `INSERT INTO whatsapp_alertas_respuesta (contacto_id, pendiente_desde, nivel_alertado, actualizado_en)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (contacto_id) DO UPDATE SET pendiente_desde=$2, nivel_alertado=$3, actualizado_en=now()`,
    [conv.contacto_id, conv.pendiente_desde, nivel]
  );
  return { contacto: nombreCompleto, minutosHabiles: minutos, nivel, enviado: true, motivo: `Avisado a ${destinatarios.length} destinatario(s)` };
}

// Devuelve un diagnóstico por conversación evaluada (usado por el botón
// "Probar ahora" en Config → Alertas de respuesta).
async function revisarAlertasRespuestaSiHay() {
  const cfg = await db.get('SELECT * FROM config_alertas_respuesta WHERE id = 1');
  if (!cfg || !cfg.activo) return { activo: false, evaluadas: 0, alertadas: 0, detalle: [] };

  const ahora = new Date();
  const [conVendedor, sinAsignar] = await Promise.all([conversacionesPendientes(), leadsSinAsignar()]);
  const detalle = [];
  let alertadas = 0;

  for (const conv of conVendedor) {
    const r = await procesarCandidato(conv, cfg, nivelParaMinutos, ahora);
    if (r.enviado) alertadas++;
    detalle.push(r);
  }
  for (const lead of sinAsignar) {
    const r = await procesarCandidato(lead, cfg, nivelSinVendedorParaMinutos, ahora);
    if (r.enviado) alertadas++;
    detalle.push({ ...r, contacto: `${r.contacto} (sin asignar)` });
  }

  return { activo: true, evaluadas: conVendedor.length + sinAsignar.length, alertadas, detalle };
}

// Situación 3: el bot cerró un lead solo porque el cliente nunca respondió
// la categorización — aviso único (no es una escalada, no usa la tabla de
// dedup por nivel), llamado desde services/whatsapp_bot.js justo después de
// cerrar. No bloquea el cierre del lead si el correo/Teams fallan.
async function avisarLeadCerradoPorBot(lead) {
  try {
    const contacto = await db.get(
      `SELECT c.nombre AS contacto_nombre, c.apellido AS contacto_apellido, em.razon_social AS empresa_nombre
       FROM contactos c LEFT JOIN empresas em ON em.id = c.empresa_id WHERE c.id = $1`,
      [lead.contacto_id]
    );
    if (!contacto) return;
    const ultimo = await db.get(
      `SELECT texto FROM whatsapp_mensajes WHERE contacto_id = $1 AND direccion = 'entrante' ORDER BY created_at DESC LIMIT 1`,
      [lead.contacto_id]
    );
    const nombreCompleto = `${contacto.contacto_nombre} ${contacto.contacto_apellido || ''}`.trim();
    const datos = { contactoNombre: nombreCompleto, empresaNombre: contacto.empresa_nombre, ultimoMensaje: ultimo?.texto, contactoId: lead.contacto_id };
    const destinatarios = await destinatariosNivel(3, null); // callcenter + jefe_comercial
    for (const usuario of destinatarios) {
      try { await email.alertaLeadCerradoSinRespuesta(usuario, datos); }
      catch (err) { console.error('[alertasRespuestaWhatsapp] Error correo a', usuario.email, ':', err.message); }
    }
    await teams.enviarAlertaTeams(
      'Lead cerrado sin respuesta del cliente',
      `${nombreCompleto}${contacto.empresa_nombre ? ' · ' + contacto.empresa_nombre : ''} nunca respondió la categorización del bot — se cerró automáticamente.`
    );
  } catch (err) {
    console.error('[alertasRespuestaWhatsapp] Error avisando cierre de bot:', err.message);
  }
}

module.exports = { revisarAlertasRespuestaSiHay, avisarLeadCerradoPorBot };
