// Alertas de respuesta por WhatsApp (15-09-2026): cuando un cliente ya
// derivado a un vendedor (bot_estado='derivado') queda sin responder, escala
// por correo + Teams en 4 niveles acumulativos — vendedor → +callcenter →
// +jefe comercial → +gerencia. Mismo mecanismo de scheduler que el resto del
// proyecto (chequeo cada 15 min desde server.js).
const { db } = require('../db');
const email = require('./email');
const teams = require('./teams');
const { minutosHabilesEntre } = require('./horario');

const NIVEL_LABEL = { 1: 'Vendedor', 2: 'Callcenter', 3: 'Jefe comercial', 4: 'Gerencia' };
const NIVEL_ROL = { 2: 'callcenter', 3: 'jefe_comercial', 4: 'gerencia' };

// Conversaciones candidatas: la última respuesta del hilo es del cliente
// (direccion='entrante'), el lead más reciente de ese contacto ya fue
// derivado a un vendedor, no está cerrada a mano desde la Bandeja (botón
// "Cerrar conversación" — decisión explícita de que no hace falta responder
// más, cuenta igual que si se hubiera respondido; se reabre sola si el
// cliente vuelve a escribir, ver whatsapp_mensajes.js#registrar), y
// pendiente_desde es el mensaje entrante más antiguo desde la última
// respuesta saliente (el reloj no se resetea si el cliente insiste con más
// mensajes, arranca en el primero sin responder).
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

function nivelParaMinutos(minutos, cfg) {
  if (minutos >= cfg.minutos_gerencia) return 4;
  if (minutos >= cfg.minutos_jefe_comercial) return 3;
  if (minutos >= cfg.minutos_callcenter) return 2;
  if (minutos >= cfg.minutos_vendedor) return 1;
  return 0;
}

// Acumulativo: el nivel N incluye a los destinatarios de los niveles 1..N,
// para que nadie deje de estar al tanto al escalar (ver diseño validado con
// Luis Devoto, 15-09-2026).
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

async function revisarAlertasRespuestaSiHay() {
  const cfg = await db.get('SELECT * FROM config_alertas_respuesta WHERE id = 1');
  if (!cfg || !cfg.activo) return;

  const pendientes = await conversacionesPendientes();
  const ahora = new Date();

  for (const conv of pendientes) {
    const minutos = await minutosHabilesEntre(new Date(conv.pendiente_desde), ahora);
    const nivel = nivelParaMinutos(minutos, cfg);
    if (nivel === 0) continue;

    const estado = await db.get('SELECT * FROM whatsapp_alertas_respuesta WHERE contacto_id = $1', [conv.contacto_id]);
    const esRachaNueva = !estado || new Date(estado.pendiente_desde).getTime() !== new Date(conv.pendiente_desde).getTime();
    const nivelAlertado = esRachaNueva ? 0 : estado.nivel_alertado;
    if (nivel <= nivelAlertado) continue; // ya se avisó este nivel (o uno mayor) para esta racha

    const nombreCompleto = `${conv.contacto_nombre} ${conv.contacto_apellido || ''}`.trim();
    const destinatarios = await destinatariosNivel(nivel, { nombre: conv.vendedor_nombre, email: conv.vendedor_email });
    const datosCorreo = {
      nivel, nivelLabel: NIVEL_LABEL[nivel], contactoNombre: nombreCompleto, empresaNombre: conv.empresa_nombre,
      vendedorNombre: conv.vendedor_nombre, minutosHabiles: minutos, ultimoMensaje: conv.ultimo_mensaje, contactoId: conv.contacto_id,
    };
    for (const usuario of destinatarios) {
      try { await email.alertaSinResponderWhatsapp(usuario, datosCorreo); }
      catch (err) { console.error('[alertasRespuestaWhatsapp] Error correo a', usuario.email, ':', err.message); }
    }
    await teams.enviarAlertaTeams(
      `WhatsApp sin responder — Nivel ${nivel} (${NIVEL_LABEL[nivel]})`,
      `${nombreCompleto}${conv.empresa_nombre ? ' · ' + conv.empresa_nombre : ''} lleva ${formatoTiempo(minutos)} hábiles sin respuesta. Vendedor: ${conv.vendedor_nombre || '—'}.`
    );

    await db.run(
      `INSERT INTO whatsapp_alertas_respuesta (contacto_id, pendiente_desde, nivel_alertado, actualizado_en)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (contacto_id) DO UPDATE SET pendiente_desde=$2, nivel_alertado=$3, actualizado_en=now()`,
      [conv.contacto_id, conv.pendiente_desde, nivel]
    );
  }
}

module.exports = { revisarAlertasRespuestaSiHay };
