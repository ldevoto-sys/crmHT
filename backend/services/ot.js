// Orden de Trabajo (Arranque de Trabajos, Ventas → Operaciones, HT-AP-03
// pendiente 06-09-2026): se crea sola al mover un negocio a "Aceptado" en
// el pipeline Operaciones — hay dos puntos de entrada que llaman a esto,
// PUT /negocios/:id/etapa (kanban manual) e importador CSV masivo
// (routes/negocios.js), por eso vive en un servicio aparte en vez de
// quedar solo en una ruta.
//
// Cómo se prellenan los ítems, según negocio.tipo_trabajo:
// - mantenimiento_preventivo / lavado: desde ot_plantilla_items, la lista
//   estándar configurada una sola vez en Config → Plantillas OT — estos
//   trabajos no varían de un negocio a otro.
// - impermeabilizado / mantenimiento_correctivo / otro: caso a caso, se
//   copian desde la última versión de la cotización vigente del negocio
//   (si existe); si no hay cotización, la OT nace sin ítems y se cargan a
//   mano.
const { db } = require('../db');

const CON_PLANTILLA = ['mantenimiento_preventivo', 'lavado'];

// Mismo truco que services/secuencias.js: las funciones reciben un `client`
// opcional (transacción pg) para poder llamarse tanto desde rutas sueltas
// (db.run/db.get, ej. PUT /negocios/:id/etapa) como desde dentro de una
// transacción ya abierta (ej. el importador CSV masivo).
async function fila(client, text, params) {
  if (client === db) return db.get(text, params);
  return (await client.query(text, params)).rows[0] || null;
}
async function filas(client, text, params) {
  if (client === db) return db.all(text, params);
  return (await client.query(text, params)).rows;
}
async function ejecutar(client, text, params) {
  return client === db ? db.run(text, params) : client.query(text, params);
}

async function crearOTSiNoExiste(negocio, client = db, creadoPorId = null) {
  const existente = await fila(client, 'SELECT id FROM ordenes_trabajo WHERE negocio_id = $1', [negocio.id]);
  if (existente) return existente.id;

  let itemsFuente = [];
  let origenItems = 'manual';

  if (CON_PLANTILLA.includes(negocio.tipo_trabajo)) {
    itemsFuente = await filas(
      client,
      'SELECT tipo, producto_id, descripcion, cantidad, codigo FROM ot_plantilla_items WHERE tipo_trabajo = $1 ORDER BY orden',
      [negocio.tipo_trabajo]
    );
    origenItems = 'plantilla';
  } else {
    const cot = await fila(
      client,
      `SELECT id FROM cotizaciones WHERE negocio_id = $1
       AND version = (SELECT MAX(version) FROM cotizaciones WHERE negocio_id = $1)`,
      [negocio.id]
    );
    if (cot) {
      const items = await filas(
        client,
        'SELECT producto_id, descripcion, cantidad FROM cotizacion_items WHERE cotizacion_id = $1',
        [cot.id]
      );
      itemsFuente = items.map(it => ({ ...it, tipo: 'material' }));
      origenItems = 'cotizacion';
    }
  }

  const ot = await ejecutar(
    client,
    'INSERT INTO ordenes_trabajo (negocio_id, origen_items, creado_por_id) VALUES ($1,$2,$3) RETURNING id',
    [negocio.id, origenItems, creadoPorId]
  );
  const otId = ot.rows[0].id;

  for (const it of itemsFuente) {
    await ejecutar(
      client,
      'INSERT INTO ot_items (ot_id, tipo, producto_id, descripcion, cantidad, codigo) VALUES ($1,$2,$3,$4,$5,$6)',
      [otId, it.tipo || 'material', it.producto_id || null, it.descripcion || null, it.cantidad, it.producto_id ? null : (it.codigo || null)]
    );
  }

  return otId;
}

// Trae la OT completa (cabecera + cliente + ítems) por id de OT o por
// negocio_id — antes vivía como función interna de routes/ordenes_trabajo.js;
// se movió acá para poder reusarla también desde routes/postventa.js (informe
// de Postventa) sin cambiar la forma en que ese router se exporta (server.js
// lo consume directo como middleware de Express).
async function cargarOTCompleta(where, param) {
  const ot = await db.get(
    `SELECT o.*, o.fecha_ejecucion::text AS fecha_ejecucion, o.fecha_programada::text AS fecha_programada, n.titulo AS negocio_titulo, n.tipo_trabajo, n.vendedor_id,
            ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido, ct.email AS contacto_email, ct.telefono_e164 AS contacto_telefono,
            e.razon_social AS empresa_nombre, e.rut AS empresa_rut, e.direccion AS empresa_direccion, e.comuna AS empresa_comuna
     FROM ordenes_trabajo o
     JOIN negocios n ON n.id = o.negocio_id
     JOIN contactos ct ON ct.id = n.contacto_id
     LEFT JOIN empresas e ON e.id = n.empresa_id
     WHERE ${where} = $1`,
    [param]
  );
  if (!ot) return null;
  const items = await db.all(
    `SELECT oi.*, p.nombre AS producto_nombre, p.sku FROM ot_items oi LEFT JOIN productos p ON p.id = oi.producto_id
     WHERE oi.ot_id = $1 ORDER BY oi.id`,
    [ot.id]
  );
  const tecnicos = await db.all(
    `SELECT u.id, u.nombre FROM ot_tecnicos t JOIN users u ON u.id = t.user_id WHERE t.ot_id = $1 ORDER BY u.nombre`,
    [ot.id]
  );
  return { ot, items, tecnicos };
}

// === Programación y ejecución (v1.40, 01-10-2026) ===
// Reglas por etapa del pipeline "Operaciones" (se identifican por nombre,
// igual que "Aceptado"; Config → Pipeline avisa si alguna deja de existir):
// - "Programado": fecha programada para ejecutar, horas de trabajo
//   programadas (> 0) y al menos un técnico.
// - "Ejecutado": lo anterior más la fecha de ejecución (la real; la brecha
//   contra la programada es lo que mide el reporte OT's) y las horas
//   ejecutadas (por técnico, en blanco por defecto).
// Solo rigen para OT nuevas (ordenes_trabajo.exige_programacion). Los datos
// pueden venir en la misma petición que mueve la etapa o ya estar guardados
// en la OT. Los técnicos se pueden editar después (PUT /ordenes-trabajo/:id/programacion).
const ETAPAS_OT = ['programado', 'ejecutado'];
const ETAPAS_FLUJO_OT = ['aceptado', ...ETAPAS_OT];
const claveEtapa = nombre => (nombre || '').trim().toLowerCase();
const requiereDatosOT = nombreEtapa => ETAPAS_OT.includes(claveEtapa(nombreEtapa));

function errorValidacion(mensaje) {
  const e = new Error(mensaje); e.status = 400; return e;
}

async function esPipelineOperaciones(pipelineId, client = db) {
  const p = await fila(client, `SELECT 1 AS ok FROM pipelines WHERE id = $1 AND nombre = 'Operaciones'`, [pipelineId]);
  return !!p;
}

// Valida y normaliza solo las claves que vienen definidas en `datos`
// (undefined = no tocar). Devuelve { datos } o lanza error 400.
function normalizarDatosProgramacion(datos = {}) {
  const out = {};
  for (const [campo, nombre] of [['horas_programadas', 'de trabajo programadas'], ['horas_ejecutadas', 'ejecutadas']]) {
    if (datos[campo] === undefined) continue;
    if (datos[campo] === null || datos[campo] === '') { out[campo] = null; continue; }
    const h = Number(datos[campo]);
    if (!Number.isFinite(h) || h <= 0 || h > 9999) throw errorValidacion(`Las horas ${nombre} deben ser un número mayor a 0`);
    out[campo] = Math.round(h * 100) / 100;
  }
  for (const [campo, nombre] of [['fecha_ejecucion', 'de ejecución'], ['fecha_programada', 'programada']]) {
    if (datos[campo] === undefined) continue;
    if (datos[campo] === null || datos[campo] === '') { out[campo] = null; continue; }
    const f = String(datos[campo]).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(f))) throw errorValidacion(`La fecha ${nombre} no es válida (AAAA-MM-DD)`);
    out[campo] = f;
  }
  if (datos.id_fracttal !== undefined) {
    const v = datos.id_fracttal === null ? '' : String(datos.id_fracttal).trim();
    if (v.length > 100) throw errorValidacion('El ID de Fracttal es demasiado largo');
    out.id_fracttal = v || null;
  }
  if (datos.tecnico_ids !== undefined) {
    if (!Array.isArray(datos.tecnico_ids)) throw errorValidacion('Los técnicos deben enviarse como lista');
    const ids = datos.tecnico_ids.map(Number);
    if (ids.some(n => !Number.isInteger(n) || n <= 0)) throw errorValidacion('Técnico inválido');
    out.tecnico_ids = [...new Set(ids)];
  }
  return out;
}

// Todos los ids deben ser usuarios activos con rol técnico.
async function validarTecnicos(ids, client = db) {
  if (!ids.length) return;
  const ok = await filas(client, `SELECT id FROM users WHERE id = ANY($1) AND activo = true AND rol = 'tecnico'`, [ids]);
  if (ok.length !== ids.length) throw errorValidacion('Solo se pueden asignar usuarios activos con perfil de técnico');
}

// Mensajes de lo que falta para estar en la etapa `nombreEtapa`, dado el
// estado resultante (datos nuevos encima de lo ya guardado). Vacío = cumple.
function faltantesParaEtapa(nombreEtapa, { horas, tecnicoIds, fechaEjecucion, fechaProgramada, horasEjecutadas }) {
  const clave = claveEtapa(nombreEtapa);
  const faltan = [];
  if (clave === 'programado' || clave === 'ejecutado') {
    if (!fechaProgramada) faltan.push('fecha programada para ejecutar');
    if (!(Number(horas) > 0)) faltan.push('horas de trabajo programadas');
    if (!tecnicoIds.length) faltan.push('al menos un técnico');
  }
  if (clave === 'ejecutado' && !fechaEjecucion) faltan.push('fecha de ejecución');
  if (clave === 'ejecutado' && !(Number(horasEjecutadas) > 0)) faltan.push('horas ejecutadas');
  return faltan;
}

// Alertas de una OT (v1.44): qué le falta a un negocio que está en
// Programado/Ejecutado. Se calculan cada vez que se piden (Pipeline, correo
// diario) a partir de la etapa y los datos actuales — no se guardan, así que
// desaparecen solas cuando alguien completa el dato.
// datos: { horas, tecnicoIds | nTecnicos, fechaProgramada, fechaEjecucion, horasEjecutadas }
function alertasOT(nombreEtapa, { horas, tecnicoIds, nTecnicos, fechaProgramada, fechaEjecucion, horasEjecutadas }) {
  const clave = claveEtapa(nombreEtapa);
  const out = [];
  if (!ETAPAS_OT.includes(clave)) return out;
  const tecnicos = nTecnicos !== undefined ? nTecnicos : (tecnicoIds || []).length;
  if (!fechaProgramada) out.push('Sin fecha programada');
  if (!(Number(horas) > 0)) out.push('Sin horas programadas');
  if (!tecnicos) out.push('Sin técnicos');
  if (clave === 'ejecutado' && !fechaEjecucion) out.push('Sin fecha de ejecución');
  if (clave === 'ejecutado' && !(Number(horasEjecutadas) > 0)) out.push('Sin horas ejecutadas');
  return out;
}

// Negocios de Operaciones en Programado/Ejecutado con datos pendientes.
// Devuelve [{ negocio_id, titulo, vendedor_id, vendedor_nombre, vendedor_email,
// etapa_nombre, cliente_nombre, fecha_programada, alertas: [...] }]. Las OT
// anteriores a v1.40 (exige_programacion = false) y las que gestiona
// Mantenimiento no se alertan, igual que no se bloqueaban. `ids` opcional
// acota a esos negocios (para pintar el Pipeline).
async function negociosConAlertas(ids = null, client = db) {
  const rows = await filas(client,
    `SELECT n.id AS negocio_id, n.titulo, n.vendedor_id, u.nombre AS vendedor_nombre, u.email AS vendedor_email,
            pe.nombre AS etapa_nombre,
            COALESCE(e.razon_social, trim(c.nombre || ' ' || COALESCE(c.apellido, ''))) AS cliente_nombre,
            o.horas_programadas, o.horas_ejecutadas, o.fecha_programada, o.fecha_ejecucion,
            (SELECT count(*) FROM ot_tecnicos t WHERE t.ot_id = o.id)::int AS n_tecnicos
     FROM negocios n
     JOIN pipelines p ON p.id = n.pipeline_id AND p.nombre = 'Operaciones'
     JOIN pipeline_etapas pe ON pe.id = n.etapa_id
     JOIN contactos c ON c.id = n.contacto_id
     LEFT JOIN empresas e ON e.id = n.empresa_id
     LEFT JOIN users u ON u.id = n.vendedor_id
     LEFT JOIN ordenes_trabajo o ON o.negocio_id = n.id
     WHERE lower(trim(pe.nombre)) IN ('programado', 'ejecutado')
       AND ($1::int[] IS NULL OR n.id = ANY($1))
       AND (o.id IS NULL OR (o.exige_programacion AND NOT o.mantenimiento_gestiona))
     ORDER BY n.id`,
    [ids]
  );
  const out = [];
  for (const r of rows) {
    const alertas = alertasOT(r.etapa_nombre, {
      horas: r.horas_programadas, nTecnicos: r.n_tecnicos || 0, fechaProgramada: r.fecha_programada,
      fechaEjecucion: r.fecha_ejecucion, horasEjecutadas: r.horas_ejecutadas,
    });
    if (alertas.length) out.push({ ...r, alertas });
  }
  return out;
}

async function tecnicoIdsDe(otId, client = db) {
  return (await filas(client, 'SELECT user_id FROM ot_tecnicos WHERE ot_id = $1', [otId])).map(r => r.user_id);
}

// Se llama ANTES de mover el negocio a `etapa`. Si la etapa es de OT, valida
// el formato de los datos recibidos y devuelve lo que hay que persistir
// después con aplicarEntradaAEtapa(); si no aplica, devuelve null.
async function validarEntradaAEtapa({ negocio, etapa, datos = {}, tipoTrabajo }, client = db) {
  if (!requiereDatosOT(etapa.nombre)) return null;
  if (!(await esPipelineOperaciones(etapa.pipeline_id, client))) return null;

  const normalizados = normalizarDatosProgramacion(datos);
  if (normalizados.tecnico_ids) await validarTecnicos(normalizados.tecnico_ids, client);

  const existente = await fila(client, 'SELECT * FROM ordenes_trabajo WHERE negocio_id = $1', [negocio.id]);
  if (!existente) {
    // Negocio que llega a Programado/Ejecutado sin haber pasado por
    // "Aceptado": la OT se crea acá, así que hace falta el tipo de trabajo.
    if (!tipoTrabajo) throw errorValidacion(`El tipo de trabajo es obligatorio para pasar a "${etapa.nombre}"`);
  }
  // Desde v1.44 los datos de programación/ejecución ya no bloquean el paso de
  // etapa: lo que falte se ve como alerta (alertasOT) y llega por correo.
  // Solo se rechaza un dato mal escrito (horas <= 0, fecha inválida, técnico
  // que no es técnico) o la falta de tipo de trabajo (sin él no se arma la OT).
  return { normalizados, tipoTrabajo };
}

// Persiste en la OT lo validado por validarEntradaAEtapa() (creándola si no
// existía). `client` puede ser db o una transacción pg.
async function aplicarEntradaAEtapa(negocioId, pre, client = db, usuarioId = null) {
  if (!pre) return;
  const otId = await crearOTSiNoExiste({ id: negocioId, tipo_trabajo: pre.tipoTrabajo }, client, usuarioId);
  await guardarProgramacion(otId, pre.normalizados, client);
}

async function guardarProgramacion(otId, normalizados, client = db) {
  const sets = []; const params = [];
  for (const campo of ['horas_programadas', 'horas_ejecutadas', 'fecha_programada', 'fecha_ejecucion', 'id_fracttal']) {
    if (normalizados[campo] !== undefined) { params.push(normalizados[campo]); sets.push(`${campo} = $${params.length}`); }
  }
  if (sets.length) {
    params.push(otId);
    await ejecutar(client, `UPDATE ordenes_trabajo SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  }
  if (normalizados.tecnico_ids) {
    await ejecutar(client, 'DELETE FROM ot_tecnicos WHERE ot_id = $1', [otId]);
    for (const uid of normalizados.tecnico_ids) {
      await ejecutar(client, 'INSERT INTO ot_tecnicos (ot_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [otId, uid]);
    }
  }
}

// Alertas de configuración: etapas del flujo OT que no existen (o están
// inactivas) en el pipeline "Operaciones" — sin ellas, las reglas de arriba
// no se aplican. Usado por Config → Pipeline y por la pestaña OT's de Reportes.
async function etapasFlujoFaltantes(client = db) {
  const p = await fila(client, `SELECT id FROM pipelines WHERE nombre = 'Operaciones' AND activo = true LIMIT 1`, []);
  if (!p) return { pipeline_encontrado: false, faltantes: ETAPAS_FLUJO_OT };
  const etapas = await filas(client, 'SELECT nombre FROM pipeline_etapas WHERE pipeline_id = $1 AND activo = true', [p.id]);
  const presentes = new Set(etapas.map(e => claveEtapa(e.nombre)));
  return { pipeline_encontrado: true, faltantes: ETAPAS_FLUJO_OT.filter(n => !presentes.has(n)) };
}

module.exports = {
  crearOTSiNoExiste, cargarOTCompleta,
  ETAPAS_OT, ETAPAS_FLUJO_OT, claveEtapa, requiereDatosOT,
  normalizarDatosProgramacion, validarTecnicos, faltantesParaEtapa, alertasOT, negociosConAlertas, tecnicoIdsDe,
  validarEntradaAEtapa, aplicarEntradaAEtapa, guardarProgramacion, etapasFlujoFaltantes, esPipelineOperaciones,
};
