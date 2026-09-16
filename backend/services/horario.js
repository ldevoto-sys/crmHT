// Horario de atención (usado por el bot de WhatsApp, por secuencias con
// "respetar_horario", y por las alertas de respuesta de WhatsApp). Se evalúa
// siempre en hora de Chile (America/Santiago), sin importar en qué huso
// horario corra el servidor.
const { db } = require('../db');

const DIA_ISO = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Fecha (AAAA-MM-DD) y hora:minuto de un instante, en huso de Chile.
function partesChile(fecha) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const partes = Object.fromEntries(fmt.formatToParts(fecha).map(p => [p.type, p.value]));
  return {
    fechaStr: `${partes.year}-${partes.month}-${partes.day}`,
    diaIso: DIA_ISO[partes.weekday],
    hhmm: `${partes.hour}:${partes.minute}`,
  };
}

// Día de la semana (ISO 1=lunes..7=domingo) de una fecha calendario pura
// ("AAAA-MM-DD"), sin pasar por ningún huso horario — el día de la semana de
// un 15 de septiembre no depende de en qué zona horaria se mire.
function diaIsoDeFecha(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo..6=sábado
  return dow === 0 ? 7 : dow;
}

function fechaSumarDias(fechaStr, n) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function minutosDeHHMM(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Horario laboral de una fecha concreta ("AAAA-MM-DD"), resuelto contra las
// excepciones (config_horario_excepciones) si hay alguna cargada; si no, el
// horario semanal fijo (config_horario_atencion). null = no laborable.
async function horarioDelDia(fechaStr, cfg) {
  const excepcion = await db.get('SELECT * FROM config_horario_excepciones WHERE fecha = $1', [fechaStr]);
  if (excepcion) {
    if (excepcion.tipo === 'feriado') return null;
    return {
      inicio: (excepcion.hora_inicio || cfg.hora_inicio).slice(0, 5),
      fin: (excepcion.hora_fin || cfg.hora_fin).slice(0, 5),
    };
  }
  if (!cfg.dias_habiles.includes(diaIsoDeFecha(fechaStr))) return null;
  return { inicio: cfg.hora_inicio.slice(0, 5), fin: cfg.hora_fin.slice(0, 5) };
}

async function esHorarioHabil(fecha = new Date()) {
  const cfg = await db.get('SELECT * FROM config_horario_atencion WHERE id = 1');
  if (!cfg) return true; // sin configuración, no bloquear nada
  const partes = partesChile(fecha);
  const horario = await horarioDelDia(partes.fechaStr, cfg);
  if (!horario) return false;
  return partes.hhmm >= horario.inicio && partes.hhmm <= horario.fin;
}

// Minutos de horario hábil transcurridos entre dos instantes (para las
// alertas de respuesta de WhatsApp — "cuántos minutos hábiles lleva el
// cliente sin respuesta"). Recorre día calendario por día calendario (en
// aritmética de fecha pura, inmune a horario de verano), y para cada uno
// suma el tramo de su horario laboral que cae dentro de [desde, hasta] —
// solo el primer y el último día necesitan recortarse contra esos límites,
// los días intermedios entran completos. Tope de 60 días de iteración para
// no colgarse ante un dato corrupto (una alerta real nunca se acerca a eso).
async function minutosHabilesEntre(desde, hasta) {
  if (!(hasta > desde)) return 0;
  const cfg = await db.get('SELECT * FROM config_horario_atencion WHERE id = 1');
  if (!cfg) return Math.round((hasta - desde) / 60000);

  const pDesde = partesChile(desde);
  const pHasta = partesChile(hasta);

  let total = 0;
  let fechaStr = pDesde.fechaStr;
  for (let i = 0; i < 60 && fechaStr <= pHasta.fechaStr; i++) {
    const horario = await horarioDelDia(fechaStr, cfg);
    if (horario) {
      let inicioMin = minutosDeHHMM(horario.inicio);
      let finMin = minutosDeHHMM(horario.fin);
      if (fechaStr === pDesde.fechaStr) inicioMin = Math.max(inicioMin, minutosDeHHMM(pDesde.hhmm));
      if (fechaStr === pHasta.fechaStr) finMin = Math.min(finMin, minutosDeHHMM(pHasta.hhmm));
      if (finMin > inicioMin) total += finMin - inicioMin;
    }
    fechaStr = fechaSumarDias(fechaStr, 1);
  }
  return total;
}

module.exports = { esHorarioHabil, minutosHabilesEntre };
