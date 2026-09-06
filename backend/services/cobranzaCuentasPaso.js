// Aviso de cuentas de paso de Cobranza sin registrar (Fase 4): a las 08:45
// hora de Chile, si hay al menos una cuenta de cliente todavía sin empresa
// vinculada, avisa por correo a quien gestiona Cobranza y a la línea de
// mando comercial. Mismo patrón que postventaVencidos.js: chequeo horario
// cada 15 min desde server.js, con una tabla de control para no reenviar
// dos veces el mismo día.
const { db } = require('../db');
const email = require('./email');

function fechaChileHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

async function cuentasDePaso() {
  return db.all(
    `SELECT codigo_cliente, nombre_cliente, rut_cliente
     FROM cobranza_cuentas_cliente
     WHERE es_cuenta_paso = true
     ORDER BY nombre_cliente NULLS LAST`
  );
}

// Destinatarios: quien gestiona Cobranza (es_encargado_cobranza) más la
// línea de mando comercial.
async function destinatarios() {
  return db.all(
    `SELECT nombre, email FROM users
     WHERE activo = true AND email IS NOT NULL AND email <> '' AND rol <> 'integrador'
       AND lower(email) <> 'admin@hidrotecnica.cl'
       AND (es_encargado_cobranza = true OR rol IN ('administrador', 'jefe_comercial', 'gerencia'))`
  );
}

async function enviarAvisoCuentasPasoSiHay() {
  const cuentas = await cuentasDePaso();
  if (!cuentas.length) return { enviados: 0, cuentas: 0 };

  const usuarios = await destinatarios();
  if (!usuarios.length) {
    console.warn('[cobranzaCuentasPaso] Hay cuentas de paso pero no hay destinatarios configurados; no se envía nada.');
    return { enviados: 0, cuentas: cuentas.length };
  }

  let enviados = 0;
  for (const usuario of usuarios) {
    try {
      const resultado = await email.cuentasPasoCobranza(usuario, cuentas);
      if (resultado.enviado) enviados++;
    } catch (err) {
      console.error(`[cobranzaCuentasPaso] Error enviando a ${usuario.email}:`, err.message);
    }
  }
  console.log(`[cobranzaCuentasPaso] ${cuentas.length} cuenta(s) de paso, aviso enviado a ${enviados}/${usuarios.length} usuarios.`);
  return { enviados, cuentas: cuentas.length };
}

// Llamado desde el chequeo horario de server.js: dispara solo entre las
// 08:45 y las 08:59 hora de Chile (después del aviso de Postventa vencidos,
// para no juntar los dos correos en el mismo minuto), y solo una vez por día.
async function enviarAvisoCuentasPasoSiCorresponde() {
  if (process.env.VITE_AMBIENTE_LABEL) return; // definida solo en staging

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const partes = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  if (partes.hour !== '08' || Number(partes.minute) < 45) return;

  const hoy = fechaChileHoy();
  const yaEnviado = await db.get('SELECT 1 FROM cobranza_cuentas_paso_envios WHERE fecha = $1', [hoy]);
  if (yaEnviado) return;

  const resultado = await enviarAvisoCuentasPasoSiHay();
  await db.run(
    'INSERT INTO cobranza_cuentas_paso_envios (fecha, cantidad) VALUES ($1, $2) ON CONFLICT (fecha) DO NOTHING',
    [hoy, resultado.cuentas]
  );
}

module.exports = { enviarAvisoCuentasPasoSiHay, enviarAvisoCuentasPasoSiCorresponde, cuentasDePaso, fechaChileHoy };
