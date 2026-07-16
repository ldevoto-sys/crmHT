// Horario de atención (usado por el bot de WhatsApp y por secuencias con
// "respetar_horario"). Se evalúa siempre en hora de Chile (America/Santiago),
// sin importar en qué huso horario corra el servidor.
const { db } = require('../db');

const DIA_ISO = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

async function esHorarioHabil(fecha = new Date()) {
  const cfg = await db.get('SELECT * FROM config_horario_atencion WHERE id = 1');
  if (!cfg) return true; // sin configuración, no bloquear nada
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const partes = Object.fromEntries(fmt.formatToParts(fecha).map(p => [p.type, p.value]));
  const diaIso = DIA_ISO[partes.weekday];
  if (!cfg.dias_habiles.includes(diaIso)) return false;
  const hhmm = `${partes.hour}:${partes.minute}`;
  return hhmm >= cfg.hora_inicio.slice(0, 5) && hhmm <= cfg.hora_fin.slice(0, 5);
}

module.exports = { esHorarioHabil };
