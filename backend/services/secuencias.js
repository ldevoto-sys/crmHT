// Motor de secuencias de seguimiento (HT-AP-03 §7.4, nota de cambio v1.7).
//
// Mientras Microsoft Graph (correo) y el canal de WhatsApp (Etapa 4) no estén
// conectados, cada paso que vence genera una TAREA para que el vendedor lo
// ejecute a mano (llamar, escribir el correo, enviar el WhatsApp) en vez de
// enviarlo automáticamente. El "detector de respuesta" tampoco existe todavía
// por canal: la pausa se hace a mano con /marcar-respondido, endpoint que
// también podrá invocarse desde un webhook de Graph/WhatsApp el día que existan.
const { db } = require('../db');
const timeline = require('./timeline');
const { esHorarioHabil } = require('./horario');

async function pasoSiguiente(secuenciaId, orden) {
  return db.get(
    'SELECT * FROM secuencia_pasos WHERE secuencia_id = $1 AND orden = $2',
    [secuenciaId, orden]
  );
}

// Avanza todas las secuencias activas cuya próxima ejecución ya venció.
// Idempotente: cada ejecución queda registrada en secuencia_ejecuciones y
// proxima_ejecucion se recalcula antes de que el próximo tick pueda repetirla.
async function avanzarPasosPendientes() {
  const pendientes = await db.all(
    `SELECT ns.*, n.vendedor_id, n.contacto_id, n.empresa_id, s.nombre AS secuencia_nombre, s.respetar_horario
     FROM negocio_secuencias ns
     JOIN negocios n ON n.id = ns.negocio_id
     JOIN secuencias s ON s.id = ns.secuencia_id
     WHERE ns.estado = 'activa' AND ns.proxima_ejecucion <= now()`
  );

  // Si alguna secuencia pendiente respeta horario, se evalúa una sola vez por tick.
  const dentroDeHorario = pendientes.some(ns => ns.respetar_horario) ? await esHorarioHabil() : null;

  let ejecutados = 0;
  for (const ns of pendientes) {
    if (ns.respetar_horario && !dentroDeHorario) continue; // espera al próximo tick dentro de horario
    const paso = await pasoSiguiente(ns.secuencia_id, ns.paso_actual + 1);
    if (!paso) {
      await db.run(`UPDATE negocio_secuencias SET estado='completada', proxima_ejecucion=NULL, updated_at=now() WHERE id=$1`, [ns.id]);
      continue;
    }

    const totalPasos = await db.get('SELECT count(*)::int AS n FROM secuencia_pasos WHERE secuencia_id=$1', [ns.secuencia_id]);
    const titulo = `Seguimiento "${ns.secuencia_nombre}" — paso ${paso.orden}/${totalPasos.n} (${paso.canal})`;
    const descripcion = paso.asunto ? `Asunto: ${paso.asunto}\n\n${paso.mensaje}` : paso.mensaje;

    const tarea = await db.run(
      `INSERT INTO tareas (titulo, descripcion, fecha_vencimiento, asignado_a_id, creado_por_id, contacto_id, empresa_id, negocio_id)
       VALUES ($1,$2,now(),$3,$3,$4,$5,$6) RETURNING id`,
      [titulo, descripcion, ns.vendedor_id, ns.contacto_id, ns.empresa_id, ns.negocio_id]
    );

    await db.run(
      `INSERT INTO secuencia_ejecuciones (negocio_secuencia_id, paso_id, tarea_id) VALUES ($1,$2,$3)`,
      [ns.id, paso.id, tarea.rows[0].id]
    );

    const siguiente = await pasoSiguiente(ns.secuencia_id, paso.orden + 1);
    const nuevoEstado = siguiente ? 'activa' : 'completada';
    const proxima = siguiente ? new Date(Date.now() + siguiente.dias_espera * 86400000) : null;
    await db.run(
      `UPDATE negocio_secuencias SET paso_actual=$1, estado=$2, proxima_ejecucion=$3, updated_at=now() WHERE id=$4`,
      [paso.orden, nuevoEstado, proxima, ns.id]
    );

    await timeline.registrar({
      negocio_id: ns.negocio_id, contacto_id: ns.contacto_id, empresa_id: ns.empresa_id,
      tipo: 'seguimiento_auto',
      descripcion: `Paso ${paso.orden} de "${ns.secuencia_nombre}" generó tarea de seguimiento (${paso.canal})`,
      referencia_id: tarea.rows[0].id,
    });
    ejecutados++;
  }
  return { procesadas: pendientes.length, ejecutados };
}

module.exports = { avanzarPasosPendientes };
