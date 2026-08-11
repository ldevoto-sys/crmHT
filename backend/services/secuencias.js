// Motor de secuencias de seguimiento (HT-AP-03 §7.4, nota de cambio v1.7;
// envío automático por correo agregado después — ver nota de cambio
// pendiente de redactar).
//
// Canal 'correo': se envía solo (Brevo, mismo servicio que la cotización
// inicial), sin que nadie lo redacte a mano — usa el asunto/mensaje tal
// cual se definieron al configurar la secuencia. Si el contacto no tiene
// correo o el envío falla, cae a una tarea manual (nunca se pierde el
// paso en silencio).
// Canales 'whatsapp'/'llamada'/'tarea': siguen generando una TAREA para que
// el vendedor lo ejecute a mano — pendiente conectar WhatsApp más adelante.
// El "detector de respuesta" tampoco existe todavía por canal: la pausa se
// hace a mano con /marcar-respondido, endpoint que también podrá invocarse
// desde un webhook de Graph/WhatsApp el día que existan.
const { db } = require('../db');
const timeline = require('./timeline');
const email = require('./email');
const { esHorarioHabil } = require('./horario');

async function pasoSiguiente(secuenciaId, orden) {
  return db.get(
    'SELECT * FROM secuencia_pasos WHERE secuencia_id = $1 AND orden = $2',
    [secuenciaId, orden]
  );
}

// Intenta enviar el paso 'correo' solo, por Brevo — el mismo servicio que ya
// usa la cotización inicial. Adjunta el link a la última cotización del
// negocio (si existe) como "Ver cotización online". Nunca lanza: devuelve
// {enviado, motivo} para que el llamador decida si cae a tarea manual.
async function intentarEnviarCorreo(ns, paso) {
  if (!ns.contacto_id) return { enviado: false, motivo: 'el negocio no tiene contacto asociado' };
  const contacto = await db.get('SELECT nombre, apellido, email FROM contactos WHERE id = $1', [ns.contacto_id]);
  if (!contacto?.email) return { enviado: false, motivo: 'el contacto no tiene correo registrado' };
  const vendedor = ns.vendedor_id ? await db.get('SELECT nombre, email, telefono FROM users WHERE id = $1', [ns.vendedor_id]) : null;
  const ultimaCot = await db.get(
    'SELECT token_publico, numero, version FROM cotizaciones WHERE negocio_id = $1 ORDER BY created_at DESC LIMIT 1', [ns.negocio_id]
  );
  const linkPublico = ultimaCot ? `${process.env.APP_URL || ''}/c/${ultimaCot.token_publico}` : null;
  const nombreContacto = [contacto.nombre, contacto.apellido].filter(Boolean).join(' ');
  const resultado = await email.seguimiento(
    contacto.email, vendedor, { nombre: nombreContacto }, { titulo: ns.negocio_titulo }, ultimaCot, paso, linkPublico
  );
  if (!resultado?.enviado) return { enviado: false, motivo: resultado?.motivo || 'error al enviar el correo' };
  return { enviado: true, destinatario: contacto.email };
}

async function crearTareaSeguimiento(ns, paso, totalPasos, motivoSinCorreo) {
  const tituloBase = `Seguimiento "${ns.secuencia_nombre}" — paso ${paso.orden}/${totalPasos} (${paso.canal})`;
  const titulo = motivoSinCorreo ? `${tituloBase} — no se pudo enviar el correo (${motivoSinCorreo})` : tituloBase;
  const descripcion = paso.asunto ? `Asunto: ${paso.asunto}\n\n${paso.mensaje}` : paso.mensaje;
  const tarea = await db.run(
    `INSERT INTO tareas (titulo, descripcion, fecha_vencimiento, asignado_a_id, creado_por_id, contacto_id, empresa_id, negocio_id)
     VALUES ($1,$2,now(),$3,$3,$4,$5,$6) RETURNING id`,
    [titulo, descripcion, ns.vendedor_id, ns.contacto_id, ns.empresa_id, ns.negocio_id]
  );
  return tarea.rows[0].id;
}

// Avanza todas las secuencias activas cuya próxima ejecución ya venció.
// Idempotente: cada ejecución queda registrada en secuencia_ejecuciones y
// proxima_ejecucion se recalcula antes de que el próximo tick pueda repetirla.
async function avanzarPasosPendientes() {
  const pendientes = await db.all(
    `SELECT ns.*, n.vendedor_id, n.contacto_id, n.empresa_id, n.titulo AS negocio_titulo,
            s.nombre AS secuencia_nombre, s.respetar_horario
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
    let tareaId = null;
    let descripcionTimeline;

    if (paso.canal === 'correo') {
      const resultado = await intentarEnviarCorreo(ns, paso);
      if (resultado.enviado) {
        descripcionTimeline = `Paso ${paso.orden} de "${ns.secuencia_nombre}" enviado por correo automáticamente a ${resultado.destinatario}`;
      } else {
        tareaId = await crearTareaSeguimiento(ns, paso, totalPasos.n, resultado.motivo);
        descripcionTimeline = `Paso ${paso.orden} de "${ns.secuencia_nombre}" generó tarea de seguimiento (correo — no se pudo enviar: ${resultado.motivo})`;
      }
    } else {
      tareaId = await crearTareaSeguimiento(ns, paso, totalPasos.n);
      descripcionTimeline = `Paso ${paso.orden} de "${ns.secuencia_nombre}" generó tarea de seguimiento (${paso.canal})`;
    }

    await db.run(
      `INSERT INTO secuencia_ejecuciones (negocio_secuencia_id, paso_id, tarea_id) VALUES ($1,$2,$3)`,
      [ns.id, paso.id, tareaId]
    );

    const siguiente = await pasoSiguiente(ns.secuencia_id, paso.orden + 1);
    const nuevoEstado = siguiente ? 'activa' : 'completada';
    const proxima = siguiente ? new Date(Date.now() + siguiente.dias_espera * 86400000 + siguiente.horas_espera * 3600000) : null;
    await db.run(
      `UPDATE negocio_secuencias SET paso_actual=$1, estado=$2, proxima_ejecucion=$3, updated_at=now() WHERE id=$4`,
      [paso.orden, nuevoEstado, proxima, ns.id]
    );

    await timeline.registrar({
      negocio_id: ns.negocio_id, contacto_id: ns.contacto_id, empresa_id: ns.empresa_id,
      tipo: 'seguimiento_auto',
      descripcion: descripcionTimeline,
      referencia_id: tareaId,
    });
    ejecutados++;
  }
  return { procesadas: pendientes.length, ejecutados };
}

// --- Secuencias disparadas por etapa del pipeline ---
// Cada pipeline_etapas puede tener una secuencia_id asociada. Al entrar a esa
// etapa se activa (reemplaza cualquier otra activa/pausada del negocio, ya
// que el motor solo permite una a la vez). Al salir hacia una etapa sin
// secuencia asociada, la secuencia de la etapa anterior se detiene. Un
// negocio que cierra (ganada/perdida) siempre cancela cualquiera en curso,
// sin importar el origen.
//
// Las funciones reciben un `client` opcional (transacción pg) para poder
// llamarse tanto desde rutas sueltas (db.run/db.get) como desde dentro de una
// transacción ya abierta (ver avanzarAEtapaCotizado en routes/cotizaciones.js),
// igual que hace services/timeline.js.
async function fila(client, text, params) {
  if (client === db) return db.get(text, params);
  return (await client.query(text, params)).rows[0] || null;
}
async function ejecutar(client, text, params) {
  return client === db ? db.run(text, params) : client.query(text, params);
}

async function activarSecuencia(negocio, secuenciaId, usuarioId, client, origenDescripcion) {
  const secuencia = await fila(client, 'SELECT * FROM secuencias WHERE id = $1 AND activo = true', [secuenciaId]);
  if (!secuencia) return; // la secuencia asociada fue desactivada: no se dispara nada

  const existente = await fila(
    client,
    `SELECT id, secuencia_id FROM negocio_secuencias WHERE negocio_id = $1 AND estado IN ('activa','pausada')`,
    [negocio.id]
  );
  if (existente) {
    if (existente.secuencia_id === secuencia.id) return; // ya es esta misma, no reiniciar
    await ejecutar(client, `UPDATE negocio_secuencias SET estado='cancelada', proxima_ejecucion=NULL, updated_at=now() WHERE id=$1`, [existente.id]);
  }

  const primerPaso = await fila(client, 'SELECT * FROM secuencia_pasos WHERE secuencia_id = $1 AND orden = 1', [secuencia.id]);
  if (!primerPaso) return; // secuencia sin pasos configurados

  const proxima = new Date(Date.now() + primerPaso.dias_espera * 86400000 + primerPaso.horas_espera * 3600000);
  const r = await ejecutar(
    client,
    `INSERT INTO negocio_secuencias (negocio_id, secuencia_id, proxima_ejecucion, iniciado_por_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [negocio.id, secuencia.id, proxima, usuarioId]
  );
  await timeline.registrar({
    negocio_id: negocio.id, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
    tipo: 'seguimiento_auto',
    descripcion: `Secuencia "${secuencia.nombre}" iniciada automáticamente ${origenDescripcion}`,
    referencia_id: r.rows[0].id,
  }, client);
}

async function cancelarSiCoincide(negocioId, secuenciaId, client) {
  await ejecutar(
    client,
    `UPDATE negocio_secuencias SET estado='cancelada', proxima_ejecucion=NULL, updated_at=now()
     WHERE negocio_id = $1 AND secuencia_id = $2 AND estado IN ('activa','pausada')`,
    [negocioId, secuenciaId]
  );
}

async function cancelarTodas(negocioId, client) {
  await ejecutar(
    client,
    `UPDATE negocio_secuencias SET estado='cancelada', proxima_ejecucion=NULL, updated_at=now()
     WHERE negocio_id = $1 AND estado IN ('activa','pausada')`,
    [negocioId]
  );
}

// Punto único a invocar en cualquier cambio de etapa de un negocio (kanban,
// cambio de pipeline, o avance automático al generar una cotización).
// etapaAnterior/etapaNueva son filas de pipeline_etapas (o null si no había
// etapa previa); solo se usan sus campos `tipo` y `secuencia_id`.
async function alCambiarEtapa({ negocio, etapaAnterior, etapaNueva, usuarioId, client = db, origenDescripcion = 'al entrar a la etapa' }) {
  if (etapaNueva.tipo === 'ganada' || etapaNueva.tipo === 'perdida') {
    // Un negocio cerrado no sigue en seguimiento automático, sin importar el origen.
    await cancelarTodas(negocio.id, client);
    return;
  }
  if (etapaNueva.secuencia_id) {
    await activarSecuencia(negocio, etapaNueva.secuencia_id, usuarioId, client, origenDescripcion);
    return;
  }
  if (etapaAnterior && etapaAnterior.secuencia_id) {
    await cancelarSiCoincide(negocio.id, etapaAnterior.secuencia_id, client);
  }
}

module.exports = { avanzarPasosPendientes, alCambiarEtapa };
