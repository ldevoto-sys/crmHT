// Aviso diario por correo de OT con datos pendientes (nota de cambio v1.44).
// A las 8am hora de Chile, en día hábil, si hay al menos una OT en Programado
// o Ejecutado (pipeline Operaciones) sin lo que le toca (ver
// services/ot.js#alertasOT): cada vendedor recibe las suyas, y la línea de
// mando (jefe comercial) recibe todas, porque cargan las horas. Mismo patrón
// que el informe diario: chequeo cada 15 min desde server.js + una tabla de
// control (ot_alertas_envios) para no reenviar el mismo día.
const { db } = require('../db');
const email = require('./email');
const ot = require('./ot');
const { esDiaHabil } = require('./horario');

function fechaChileHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

// Reparte las OT pendientes entre destinatarios. `jefes`: usuarios que ven
// todo. Un vendedor que también es jefe recibe solo la lista completa.
// Devuelve [{ usuario, pendientes, conVendedor }]. Pura: no toca la BD.
function armarAvisos(pendientes, jefes, vendedores) {
  const avisos = [];
  const idsJefes = new Set(jefes.map(j => j.id));
  for (const j of jefes) avisos.push({ usuario: j, pendientes, conVendedor: true });
  for (const v of vendedores) {
    if (idsJefes.has(v.id)) continue;
    const propias = pendientes.filter(p => p.vendedor_id === v.id);
    if (propias.length) avisos.push({ usuario: v, pendientes: propias, conVendedor: false });
  }
  return avisos;
}

async function enviarAvisoOTPendientes() {
  const pendientes = await ot.negociosConAlertas();
  if (!pendientes.length) return { enviados: 0, pendientes: 0 };

  const usuarios = await db.all(
    `SELECT id, nombre, email, rol FROM users
     WHERE activo = true AND email IS NOT NULL AND email <> '' AND rol <> 'integrador'
       AND lower(email) <> 'admin@hidrotecnica.cl'
       AND (rol = 'jefe_comercial' OR id = ANY($1))`,
    [[...new Set(pendientes.map(p => p.vendedor_id).filter(Boolean))]]
  );
  const jefes = usuarios.filter(u => u.rol === 'jefe_comercial');
  const avisos = armarAvisos(pendientes, jefes, usuarios.filter(u => u.rol !== 'jefe_comercial'));

  let enviados = 0;
  for (const a of avisos) {
    try {
      const r = await email.otPendientes(a.usuario, a.pendientes, { conVendedor: a.conVendedor });
      if (r.enviado) enviados++;
    } catch (err) {
      console.error(`[alertasOT] Error enviando a ${a.usuario.email}:`, err.message);
    }
  }
  console.log(`[alertasOT] ${pendientes.length} OT con datos pendientes, aviso enviado a ${enviados}/${avisos.length} destinatarios.`);
  return { enviados, destinatarios: avisos.length, pendientes: pendientes.length };
}

// Llamado desde el chequeo cada 15 min de server.js: solo dispara en la hora
// 08 de Chile, en día hábil, y una vez por día. Solo desde producción
// (VITE_AMBIENTE_LABEL solo está definida en staging); en staging se prueba
// con POST /api/reportes/ot-pendientes/enviar-ahora.
async function enviarAvisoOTPendientesSiCorresponde() {
  if (process.env.VITE_AMBIENTE_LABEL) return;
  const hora = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (hora !== '08') return;

  const hoy = fechaChileHoy();
  if (!(await esDiaHabil(hoy))) return;
  if (await db.get('SELECT 1 FROM ot_alertas_envios WHERE fecha = $1', [hoy])) return;

  await enviarAvisoOTPendientes();
  await db.run('INSERT INTO ot_alertas_envios (fecha) VALUES ($1) ON CONFLICT (fecha) DO NOTHING', [hoy]);
}

module.exports = { enviarAvisoOTPendientes, enviarAvisoOTPendientesSiCorresponde, armarAvisos };
