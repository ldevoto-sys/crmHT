// Informe de tiempo de respuesta de WhatsApp (23-09-2026, pedido de Luis
// Devoto). Corre una vez por noche (23:50, ver el chequeo horario de
// server.js) y calcula, para cada conversación, los tramos que quedaron
// resueltos desde la última corrida: el cliente escribió (una o varias
// veces seguidas) y alguien de acá respondió. Se guarda en
// whatsapp_tiempos_respuesta para que el reporte se consulte rápido,
// sin recalcular nada al vuelo.
//
// Solo mira mensajes desde CUTOFF (cuándo se activó esto) — no hay
// backfill del historial completo, según lo pedido.
//
// "Pendiente desde" = el primer mensaje del cliente de esa racha (si
// mandó 3 seguidos antes de que le contestaran, se cuenta desde el
// primero, no el último ni un promedio — pedido explícito).
const { db } = require('../db');
const { minutosHabilesEntre } = require('./horario');

const CUTOFF = '2026-09-23T00:00:00-03:00';

// Todos los tramos "cliente escribió → alguien respondió" que ya se
// cerraron desde CUTOFF y todavía no están guardados. Uso de LAG() para
// encontrar dónde arranca cada racha de mensajes entrantes (el anterior
// no es entrante, o no hay anterior), y una subconsulta correlacionada
// para el primer saliente después de cada racha — el volumen esperado es
// bajo (conversaciones de WhatsApp de la semana, no todo el historial),
// así que no hace falta optimizar más que esto.
async function tramosResueltosSinGuardar() {
  return db.all(
    `WITH ordenados AS (
       SELECT id, contacto_id, direccion, enviado_por_id,
              COALESCE(wa_timestamp, created_at) AS hora,
              LAG(direccion) OVER (PARTITION BY contacto_id ORDER BY COALESCE(wa_timestamp, created_at), id) AS direccion_anterior
       FROM whatsapp_mensajes
       WHERE COALESCE(wa_timestamp, created_at) >= $1
     ),
     inicios AS (
       SELECT contacto_id, hora AS pendiente_desde
       FROM ordenados
       WHERE direccion = 'entrante' AND direccion_anterior IS DISTINCT FROM 'entrante'
     )
     SELECT i.contacto_id, i.pendiente_desde,
            resp.hora AS respondido_en, resp.enviado_por_id AS respondido_por_id,
            l.vendedor_id
     FROM inicios i
     JOIN LATERAL (
       SELECT hora, enviado_por_id FROM ordenados o
       WHERE o.contacto_id = i.contacto_id AND o.direccion = 'saliente' AND o.hora > i.pendiente_desde
       ORDER BY o.hora LIMIT 1
     ) resp ON true
     LEFT JOIN LATERAL (
       SELECT vendedor_id FROM leads WHERE contacto_id = i.contacto_id ORDER BY created_at DESC LIMIT 1
     ) l ON true
     WHERE NOT EXISTS (
       SELECT 1 FROM whatsapp_tiempos_respuesta t
       WHERE t.contacto_id = i.contacto_id AND t.pendiente_desde = i.pendiente_desde
     )`,
    [CUTOFF]
  );
}

// Calcula y guarda los tramos nuevos. Devuelve cuántos se guardaron.
// Expuesta aparte de "SiCorresponde" para el botón manual de Config.
async function calcularTiemposRespuesta() {
  const tramos = await tramosResueltosSinGuardar();
  let guardados = 0;
  for (const t of tramos) {
    const desde = new Date(t.pendiente_desde);
    const hasta = new Date(t.respondido_en);
    const minutosHabiles = await minutosHabilesEntre(desde, hasta);
    const minutosCorridos = Math.round((hasta - desde) / 60000);
    await db.run(
      `INSERT INTO whatsapp_tiempos_respuesta
         (contacto_id, vendedor_id, respondido_por_id, pendiente_desde, respondido_en, minutos_habiles, minutos_corridos)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (contacto_id, pendiente_desde) DO NOTHING`,
      [t.contacto_id, t.vendedor_id, t.respondido_por_id, t.pendiente_desde, t.respondido_en, minutosHabiles, minutosCorridos]
    );
    guardados++;
  }
  return guardados;
}

// Llamado desde el chequeo horario de server.js: dispara entre las 23:45 y
// las 23:59 (mismo margen que usa cobranzaSoftland para su franja horaria,
// dado que el chequeo general es cada 15 minutos), una sola vez por día.
// A diferencia de la sincronización con Softland, esto no toca ningún
// sistema externo — corre igual en producción y en staging, cada uno sobre
// sus propios mensajes (mismo criterio que las alertas de respuesta).
async function calcularTiemposRespuestaSiCorresponde() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map(p => [p.type, p.value])
  );
  if (partes.hour !== '23' || Number(partes.minute) < 45) return;

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const yaCorrido = await db.get('SELECT 1 FROM whatsapp_tiempos_respuesta_ejecuciones WHERE fecha = $1 AND ok = true', [hoy]);
  if (yaCorrido) return;

  try {
    const guardados = await calcularTiemposRespuesta();
    await db.run(
      `INSERT INTO whatsapp_tiempos_respuesta_ejecuciones (fecha, ok, tramos_nuevos) VALUES ($1, true, $2)
       ON CONFLICT (fecha) DO UPDATE SET ejecutado_en = now(), ok = true, tramos_nuevos = $2, error = NULL`,
      [hoy, guardados]
    );
    console.log(`[tiemposRespuestaWhatsapp] ${guardados} tramo(s) nuevo(s) calculado(s) para ${hoy}.`);
  } catch (err) {
    console.error('[tiemposRespuestaWhatsapp] Error calculando tiempos de respuesta:', err);
    await db.run(
      `INSERT INTO whatsapp_tiempos_respuesta_ejecuciones (fecha, ok, error) VALUES ($1, false, $2)
       ON CONFLICT (fecha) DO UPDATE SET ejecutado_en = now(), ok = false, error = $2`,
      [hoy, err.message]
    );
  }
}

module.exports = { calcularTiemposRespuesta, calcularTiemposRespuestaSiCorresponde, CUTOFF };
