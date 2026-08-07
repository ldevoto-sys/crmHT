// Aviso de casos de Postventa vencidos (HT-AP-03 nota v1.25): a las 8:30am
// hora de Chile, si hay al menos un caso abierto con la fecha límite de
// respuesta ya vencida, avisa por correo a quienes gestionan Postventa y a
// la línea de mando comercial. Mismo patrón que el informe diario
// (services/informeDiario.js): chequeo horario cada 15 min desde server.js,
// con una tabla de control para no reenviar dos veces el mismo día.
const { db } = require('../db');
const email = require('./email');

function fechaChileHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

// Un caso "vencido" es uno abierto (etapa tipo='abierta', no resuelto/
// rechazado) cuya fecha límite de respuesta ya pasó — mismo criterio que
// slaEstado() en el frontend (frontend/src/utils/sla.js), calculado en el
// servidor con la fecha de hoy en Chile.
async function casosVencidos(hoy = fechaChileHoy()) {
  return db.all(
    `SELECT cp.id, cp.titulo, cp.prioridad, cp.fecha_limite_respuesta,
            coalesce(e.razon_social, trim(c.nombre || ' ' || coalesce(c.apellido, ''))) AS cliente_nombre,
            t.nombre AS tecnico_nombre,
            ($1::date - cp.fecha_limite_respuesta::date)::int AS dias_atraso
     FROM casos_postventa cp
     JOIN postventa_etapas pe ON pe.id = cp.etapa_id
     JOIN contactos c ON c.id = cp.contacto_id
     LEFT JOIN empresas e ON e.id = cp.empresa_id
     LEFT JOIN users t ON t.id = cp.tecnico_asignado_id
     WHERE pe.tipo = 'abierta'
       AND cp.fecha_limite_respuesta IS NOT NULL
       AND cp.fecha_limite_respuesta::date < $1::date
     ORDER BY cp.fecha_limite_respuesta ASC`,
    [hoy]
  );
}

// Destinatarios: quien gestiona Postventa (es_encargado_postventa) más la
// línea de mando comercial (administrador, jefe comercial, gerencia) — igual
// se les avise aunque no gestionen el módulo día a día.
async function destinatarios() {
  return db.all(
    `SELECT nombre, email FROM users
     WHERE activo = true AND email IS NOT NULL AND email <> ''
       AND (es_encargado_postventa = true OR rol IN ('administrador', 'jefe_comercial', 'gerencia'))`
  );
}

// Arma y envía el aviso si hay casos vencidos. No verifica si ya se envió
// hoy — eso lo hace enviarPostventaVencidosSiCorresponde() (o el endpoint
// manual, que reenvía a propósito).
async function enviarPostventaVencidosSiHay(hoy = fechaChileHoy()) {
  const casos = await casosVencidos(hoy);
  if (!casos.length) return { enviados: 0, casos: 0 };

  const usuarios = await destinatarios();
  if (!usuarios.length) {
    console.warn('[postventaVencidos] Hay casos vencidos pero no hay destinatarios configurados; no se envía nada.');
    return { enviados: 0, casos: casos.length };
  }

  let enviados = 0;
  for (const usuario of usuarios) {
    try {
      const resultado = await email.postventaVencido(usuario, casos);
      if (resultado.enviado) enviados++;
    } catch (err) {
      console.error(`[postventaVencidos] Error enviando a ${usuario.email}:`, err.message);
    }
  }
  console.log(`[postventaVencidos] ${casos.length} caso(s) vencido(s), aviso enviado a ${enviados}/${usuarios.length} usuarios.`);
  return { enviados, casos: casos.length };
}

// Llamado desde el chequeo horario de server.js: dispara solo entre las
// 8:30 y las 8:44 hora de Chile (el chequeo corre cada 15 min, así que cae
// en algún punto de esa ventana), y solo una vez por día.
async function enviarPostventaVencidosSiCorresponde() {
  // Mismo criterio que el informe diario: el envío automático solo sale
  // desde producción (VITE_AMBIENTE_LABEL solo está definida en staging).
  if (process.env.VITE_AMBIENTE_LABEL) return;

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const partes = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  if (partes.hour !== '08' || Number(partes.minute) < 30) return;

  const hoy = fechaChileHoy();
  const yaEnviado = await db.get('SELECT 1 FROM postventa_vencidos_envios WHERE fecha = $1', [hoy]);
  if (yaEnviado) return;

  await enviarPostventaVencidosSiHay(hoy);
  await db.run('INSERT INTO postventa_vencidos_envios (fecha) VALUES ($1) ON CONFLICT (fecha) DO NOTHING', [hoy]);
}

module.exports = { enviarPostventaVencidosSiHay, enviarPostventaVencidosSiCorresponde, casosVencidos, fechaChileHoy };
