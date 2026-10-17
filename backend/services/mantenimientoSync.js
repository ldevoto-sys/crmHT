// Sincronización de la OT con la app de Mantenimiento (v1.48). Contrato en
// docs/HT-DO-XX-Sincronizacion-OT-v3.md.
//
// La OT es la misma en las dos aplicaciones: cada vez que cambia acá se arma
// una "foto" y se manda a Mantenimiento (webhook firmado, evento
// `ot_actualizada`); cada vez que cambia allá, Mantenimiento manda su foto a
// PUT /api/v1/mantenimiento/ordenes-trabajo/:negocioId. Gana siempre el
// cambio más nuevo (`sync_actualizado_en` / `actualizado_en`, decisión de
// Luis Devoto) y lo que se aplica desde una foto recibida no se reenvía.
//
// El CRM no entiende cada dato de Mantenimiento (sala, equipo, técnico...):
// lo guarda en `ordenes_trabajo.mant_datos` (JSON) y lo devuelve tal cual.
// Lo que el CRM ya modelaba (fechas, horas, observaciones, etapa) sigue en
// sus columnas de siempre.
const crypto = require('crypto');
const { db } = require('../db');
const otService = require('./ot');
const { claveEtapa } = otService;

// El mismo fetch que usa mantenimientoOT.js, parametrizable para las pruebas.
let hacerFetch = (...args) => fetch(...args);
function usarFetch(fn) { hacerFetch = fn; }

const ESTADOS = ['aceptado', 'programado', 'ejecutado'];
const NOMBRE_ETAPA = { aceptado: 'Aceptado', programado: 'Programado', ejecutado: 'Ejecutado' };
const ESPERAS_SEGUNDOS = [15, 30, 60, 120, 300, 600, 900];
const TIMEOUT_MS = 8000;

const habilitado = () => !!process.env.MANTENIMIENTO_WEBHOOK_URL;

// Fecha y hora en UTC con microsegundos, el formato de la foto
// ("2026-10-15T14:03:22.123456Z"). Se genera en SQL para no perder precisión.
const SQL_ISO = col => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

class ErrorFoto extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

// ---- Estado ↔ etapa -------------------------------------------------------

// Una etapa posterior a "Ejecutado" (p. ej. "Facturado") cuenta como ejecutada.
async function estadoDeNegocio(negocioId) {
  const r = await db.get(
    `SELECT pe.nombre, pe.orden,
            (SELECT x.orden FROM pipeline_etapas x WHERE x.pipeline_id = pe.pipeline_id
              AND lower(trim(x.nombre)) = 'ejecutado' AND x.activo LIMIT 1) AS orden_ejecutado
     FROM negocios n JOIN pipeline_etapas pe ON pe.id = n.etapa_id WHERE n.id = $1`,
    [negocioId]
  );
  if (!r) return 'aceptado';
  const clave = claveEtapa(r.nombre);
  if (ESTADOS.includes(clave)) return clave;
  if (r.orden_ejecutado !== null && r.orden > r.orden_ejecutado) return 'ejecutado';
  return 'aceptado';
}

async function etapaPorEstado(pipelineId, estado) {
  const etapas = await db.all('SELECT * FROM pipeline_etapas WHERE pipeline_id = $1 AND activo = true', [pipelineId]);
  return etapas.find(e => claveEtapa(e.nombre) === NOMBRE_ETAPA[estado].toLowerCase()) || null;
}

// ---- La foto --------------------------------------------------------------

async function construirFoto(negocioId, origen = 'crm') {
  const mantenimientoOT = require('./mantenimientoOT');
  const base = await mantenimientoOT.obtenerOTParaMantenimiento(negocioId);
  if (!base) return null;
  const fila = await db.get(
    `SELECT mant_datos, horas_programadas::float8 AS horas, ${SQL_ISO('COALESCE(sync_actualizado_en, created_at)')} AS actualizado_en
     FROM ordenes_trabajo WHERE negocio_id = $1`,
    [negocioId]
  );
  const datos = fila.mant_datos || {};
  const mantenimiento = { ...datos, estado: await estadoDeNegocio(negocioId) };
  // La duración solo viaja junto con la hora de inicio (Mantenimiento no admite una sin la otra).
  if (datos.hora_inicio) mantenimiento.duracion_horas = fila.horas ? Math.round(fila.horas) : null;
  else delete mantenimiento.duracion_horas;
  return { ...base, actualizado_en: fila.actualizado_en, origen_cambio: origen, mantenimiento };
}

// ---- Cola de salida -------------------------------------------------------

// Marca que la OT cambió acá: le pone la hora de cambio y la anota en la cola.
// Toda ruta que modifica una OT lo llama al terminar. Si no hay OT, no hace nada.
async function marcarCambio(negocioId) {
  // Nunca debe romper la operación que la llama (mover una tarjeta, guardar la OT): si falla, se registra y listo.
  try {
    await marcarCambioSinProteccion(negocioId);
  } catch (err) {
    console.error(`[mantenimientoSync] No se pudo marcar el cambio de OT-${negocioId}`, err);
  }
}

async function marcarCambioSinProteccion(negocioId) {
  const r = await db.run(
    'UPDATE ordenes_trabajo SET sync_actualizado_en = clock_timestamp() WHERE negocio_id = $1 RETURNING id',
    [negocioId]
  );
  if (!r.rowCount || !habilitado()) return;
  await db.run(
    `INSERT INTO mantenimiento_outbox (negocio_id, intentos, proximo_intento) VALUES ($1, 0, now())
     ON CONFLICT (negocio_id) DO UPDATE SET intentos = 0, proximo_intento = now()`,
    [negocioId]
  );
  despertar();
}

function firmar(cuerpo) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.MANTENIMIENTO_WEBHOOK_SECRET) {
    headers['X-Hidrotecnica-Signature'] = 'sha256=' + crypto
      .createHmac('sha256', process.env.MANTENIMIENTO_WEBHOOK_SECRET).update(cuerpo).digest('hex');
  }
  return headers;
}

// Manda un evento a Mantenimiento. Devuelve { status, cuerpo }; lanza si no hay respuesta.
async function enviarEvento(evento, foto) {
  const cuerpo = JSON.stringify({ evento, ot: foto });
  const resp = await hacerFetch(process.env.MANTENIMIENTO_WEBHOOK_URL, {
    method: 'POST', headers: firmar(cuerpo), body: cuerpo, signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let json = {};
  try { json = await resp.json(); } catch { /* sin cuerpo */ }
  return { status: resp.status, cuerpo: json };
}

// Resuelve cuándo reintentar según el resultado. null = enviado bien.
function esperaTrasFallo(status) {
  if (status === 429) return 70;
  if (status >= 400 && status < 500) return 3600; // dato inválido: no sirve reintentar seguido
  return null; // 5xx / sin respuesta: espera creciente
}

async function enviarUna(fila) {
  const antes = await db.get(`SELECT ${SQL_ISO('sync_actualizado_en')} AS marca FROM ordenes_trabajo WHERE negocio_id = $1`, [fila.negocio_id]);
  if (!antes) return { ok: true }; // la OT ya no existe
  const foto = await construirFoto(fila.negocio_id);
  let resp;
  try {
    resp = await enviarEvento('ot_actualizada', foto);
  } catch (err) {
    return { ok: false, error: `Sin respuesta de Mantenimiento (${err.name})`, espera: null };
  }
  if (resp.status >= 400) {
    const detalle = typeof resp.cuerpo.detail === 'string' ? resp.cuerpo.detail : JSON.stringify(resp.cuerpo).slice(0, 200);
    return { ok: false, error: `Mantenimiento respondió ${resp.status}: ${detalle}`, espera: esperaTrasFallo(resp.status), status: resp.status };
  }
  // Mantenimiento tiene un cambio más nuevo: se adopta.
  if (resp.cuerpo.aplicado === false && resp.cuerpo.ot) {
    try { await aplicarFoto(resp.cuerpo.ot); } catch (err) {
      return { ok: false, error: `No se pudo aplicar la OT más nueva de Mantenimiento: ${err.message}`, espera: 3600 };
    }
    return { ok: true };
  }
  const despues = await db.get(`SELECT ${SQL_ISO('sync_actualizado_en')} AS marca FROM ordenes_trabajo WHERE negocio_id = $1`, [fila.negocio_id]);
  if (despues && despues.marca !== antes.marca) return { ok: false, error: null, espera: 0 }; // cambió mientras se enviaba
  await db.run('UPDATE ordenes_trabajo SET mantenimiento_sincronizado_en = now() WHERE negocio_id = $1', [fila.negocio_id]);
  return { ok: true };
}

async function procesarCola(limite = 25) {
  if (!habilitado()) return 0;
  let enviadas = 0;
  for (let i = 0; i < limite; i++) {
    const fila = await db.get('SELECT * FROM mantenimiento_outbox WHERE proximo_intento <= now() ORDER BY proximo_intento LIMIT 1');
    if (!fila) break;
    const r = await enviarUna(fila);
    if (r.ok) {
      await db.run('DELETE FROM mantenimiento_outbox WHERE negocio_id = $1', [fila.negocio_id]);
      enviadas++;
      continue;
    }
    const intentos = r.error ? fila.intentos + 1 : 0;
    const espera = r.espera !== null && r.espera !== undefined
      ? r.espera
      : ESPERAS_SEGUNDOS[Math.min(intentos - 1, ESPERAS_SEGUNDOS.length - 1)];
    if (r.error) console.warn(`[mantenimientoSync] OT-${fila.negocio_id}: ${r.error}`);
    await db.run(
      `UPDATE mantenimiento_outbox SET intentos = $2, proximo_intento = now() + ($3 || ' seconds')::interval, ultimo_error = $4
       WHERE negocio_id = $1`,
      [fila.negocio_id, intentos, String(espera), r.error ? r.error.slice(0, 500) : null]
    );
  }
  return enviadas;
}

// Una pasada del hilo: OT que nunca se han sincronizado (las que ya existían) y la cola.
async function sembrarPendientes() {
  if (!habilitado()) return 0;
  const r = await db.run(
    `INSERT INTO mantenimiento_outbox (negocio_id, intentos, proximo_intento)
     SELECT o.negocio_id, 0, now() FROM ordenes_trabajo o
     WHERE o.mantenimiento_sincronizado_en IS NULL AND o.mantenimiento_gestiona
     ON CONFLICT (negocio_id) DO NOTHING`
  );
  return r.rowCount;
}

let temporizador = null; let corriendo = false; let pendiente = false;
function despertar() {
  if (!temporizador) return;
  setImmediate(pasada);
}
async function pasada() {
  if (corriendo) { pendiente = true; return; }
  corriendo = true;
  try {
    do {
      pendiente = false;
      await procesarCola();
    } while (pendiente);
  } catch (err) {
    console.error('[mantenimientoSync] Error al procesar la cola', err);
  } finally { corriendo = false; }
}
function iniciarWorker() {
  if (temporizador || !habilitado()) return;
  sembrarPendientes().catch(err => console.error('[mantenimientoSync] sembrarPendientes', err));
  temporizador = setInterval(pasada, 5000);
  temporizador.unref();
}
function detenerWorker() { if (temporizador) { clearInterval(temporizador); temporizador = null; } }

// ---- Aplicar una foto recibida --------------------------------------------

const TEXTOS_MANT = ['tipo_tarea', 'descripcion', 'prioridad', 'clasificacion_1', 'clasificacion_2', 'sala', 'equipo', 'componente', 'referencia_externa'];
const tiene = (obj, campo) => obj && Object.prototype.hasOwnProperty.call(obj, campo);

function fechaOpcional(valor, nombre) {
  if (valor === null || valor === '' || valor === undefined) return null;
  const f = String(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(f))) throw new ErrorFoto(400, `${nombre} inválida`);
  return f;
}

function normalizarHoraInicio(valor) {
  if (valor === null || valor === '' || valor === undefined) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(valor));
  if (!m) throw new ErrorFoto(400, 'hora_inicio inválida');
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// Aplica en el CRM los datos de una foto (sin comparar horas ni avisar a nadie).
// `hora` es el `actualizado_en` que queda como hora de cambio.
async function escribirFoto(negocioId, foto, hora, usuarioId) {
  const ot = await db.get('SELECT id, mant_datos FROM ordenes_trabajo WHERE negocio_id = $1', [negocioId]);
  const sets = ['mantenimiento_gestiona = true', 'mantenimiento_sincronizado_en = now()'];
  const params = [];
  const poner = (col, valor) => { params.push(valor); sets.push(`${col} = $${params.length}`); };

  if (tiene(foto, 'fecha_programada')) poner('fecha_programada', fechaOpcional(foto.fecha_programada, 'fecha_programada'));
  if (tiene(foto, 'fecha_ejecucion')) poner('fecha_ejecucion', fechaOpcional(foto.fecha_ejecucion, 'fecha_ejecucion'));
  if (tiene(foto, 'observaciones')) poner('observaciones', foto.observaciones || null);

  const mant = foto.mantenimiento;
  let datos = { ...(ot.mant_datos || {}) };
  if (mant) {
    for (const campo of TEXTOS_MANT) if (tiene(mant, campo)) datos[campo] = mant[campo] ?? null;
    if (tiene(mant, 'avance')) datos.avance = mant.avance;
    if (tiene(mant, 'tecnico')) datos.tecnico = mant.tecnico || null;
    if (tiene(mant, 'hora_inicio')) datos.hora_inicio = normalizarHoraInicio(mant.hora_inicio);
    // Las horas del CRM son las de Mantenimiento: solo se tocan si hay una duración que copiar.
    if (tiene(mant, 'duracion_horas') && mant.duracion_horas) poner('horas_programadas', mant.duracion_horas);
    if (tiene(mant, 'duracion_horas') && !mant.duracion_horas && tiene(mant, 'hora_inicio') && !mant.hora_inicio) {
      // sin hora ni duración: las horas del CRM se conservan
    }
    poner('mant_datos', JSON.stringify(datos));
  }
  if (tiene(foto, 'sucursal_nombre') && foto.sucursal_nombre) {
    // Nombre e id viajan juntos: si el id quedara de la sucursal anterior, la próxima foto del CRM devolvería la OT a ella.
    // Una foto sin id (Mantenimiento antiguo) lo deja vacío y Mantenimiento resuelve por nombre.
    const id = Number.isInteger(foto.mantenimiento_sucursal_id) ? foto.mantenimiento_sucursal_id : null;
    await db.run('UPDATE negocios SET sucursal_nombre = $1, mantenimiento_sucursal_id = $2 WHERE id = $3', [foto.sucursal_nombre, id, negocioId]);
  }

  params.push(hora);
  sets.push(`sync_actualizado_en = $${params.length}::timestamptz`);
  params.push(ot.id);
  await db.run(`UPDATE ordenes_trabajo SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

  // La etapa sigue al estado de Mantenimiento (o, si el aviso no trae el bloque, a su etapa).
  const estado = mant && mant.estado ? mant.estado : claveEtapa(foto.etapa);
  if (ESTADOS.includes(estado)) await moverEtapa(negocioId, estado, usuarioId);
}

async function moverEtapa(negocioId, estado, usuarioId) {
  const actual = await estadoDeNegocio(negocioId);
  if (actual === estado) return; // incluye "Facturado" cuando Mantenimiento dice ejecutado
  const negocio = await db.get('SELECT pipeline_id FROM negocios WHERE id = $1', [negocioId]);
  const etapa = await etapaPorEstado(negocio.pipeline_id, estado);
  if (!etapa) throw new ErrorFoto(409, `La etapa "${NOMBRE_ETAPA[estado]}" no existe o está inactiva en el pipeline Operaciones`);
  const { cambiarEtapaNegocio } = require('../routes/negocios');
  await cambiarEtapaNegocio(negocioId, etapa.id, {}, usuarioId, { sinSync: true });
}

async function usuarioMantenimiento() {
  const u = await db.get(`SELECT id FROM users WHERE email = 'mantenimiento@integracion.hidrotecnica.cl'`);
  return u ? u.id : null;
}

// Aplica una foto que mandó Mantenimiento. { aplicado, ot } — `ot` es la foto
// del CRM cuando la de Mantenimiento era más vieja (para que la adopte).
async function aplicarFoto(foto) {
  const negocioId = Number(foto && foto.negocio_id);
  if (!Number.isInteger(negocioId) || negocioId <= 0) throw new ErrorFoto(400, 'negocio_id inválido');
  const local = await db.get(
    `SELECT sync_actualizado_en IS NOT NULL AS tiene, sync_actualizado_en < $2::timestamptz AS es_mas_vieja
     FROM ordenes_trabajo WHERE negocio_id = $1`,
    [negocioId, foto.actualizado_en || null]
  );
  if (!local) throw new ErrorFoto(404, 'No existe una OT para ese negocio');
  if (!foto.actualizado_en || Number.isNaN(Date.parse(foto.actualizado_en))) throw new ErrorFoto(400, 'actualizado_en inválido');
  if (local.tiene && !local.es_mas_vieja) return { aplicado: false, ot: await construirFoto(negocioId) };

  await escribirFoto(negocioId, foto, foto.actualizado_en, await usuarioMantenimiento());
  return { aplicado: true };
}

// Lista las OT cambiadas desde `desde` (ISO), de la más vieja a la más nueva.
async function fotosActualizadasDesde(desde, limite = 200) {
  const filas = await db.all(
    `SELECT negocio_id FROM ordenes_trabajo
     WHERE mantenimiento_gestiona AND COALESCE(sync_actualizado_en, created_at) > COALESCE($1::timestamptz, 'epoch'::timestamptz)
     ORDER BY COALESCE(sync_actualizado_en, created_at), negocio_id LIMIT $2`,
    [desde || null, limite + 1]
  );
  const hayMas = filas.length > limite;
  const fotos = [];
  for (const f of filas.slice(0, limite)) fotos.push(await construirFoto(f.negocio_id));
  const ultima = fotos[fotos.length - 1];
  return { ordenes: fotos, siguiente: ultima ? ultima.actualizado_en : null, hay_mas: hayMas };
}

// Cambios hechos desde la pantalla de la OT del CRM: se mandan primero a
// Mantenimiento y, si los rechaza (422), no se guardan. Si no responde, se
// guardan y quedan en la cola.
async function editarDesdeCrm(negocioId, cambios, usuarioId) {
  const actual = await construirFoto(negocioId);
  if (!actual) throw new ErrorFoto(404, 'No existe una OT para ese negocio');
  const hora = (await db.get(`SELECT ${SQL_ISO('clock_timestamp()')} AS ahora`)).ahora;
  const mantenimiento = { ...actual.mantenimiento };
  const foto = { negocio_id: String(negocioId), actualizado_en: hora, origen_cambio: 'crm', mantenimiento };
  for (const campo of ['fecha_programada', 'fecha_ejecucion', 'observaciones']) {
    if (tiene(cambios, campo)) foto[campo] = cambios[campo] || null;
  }
  for (const campo of [...TEXTOS_MANT, 'avance', 'hora_inicio', 'duracion_horas', 'estado']) {
    if (tiene(cambios, campo)) mantenimiento[campo] = cambios[campo] === '' ? null : cambios[campo];
  }
  const completa = { ...actual, ...foto, mantenimiento };

  let pendienteEnvio = false;
  if (habilitado()) {
    try {
      const resp = await enviarEvento('ot_actualizada', completa);
      if (resp.status === 422 || resp.status === 409) {
        throw new ErrorFoto(422, typeof resp.cuerpo.detail === 'string' ? resp.cuerpo.detail : 'Mantenimiento rechazó el cambio');
      }
      if (resp.status >= 400) pendienteEnvio = true;
    } catch (err) {
      if (err instanceof ErrorFoto) throw err;
      pendienteEnvio = true;
    }
  }
  await escribirFoto(negocioId, completa, hora, usuarioId);
  if (pendienteEnvio) {
    await db.run(
      `INSERT INTO mantenimiento_outbox (negocio_id, intentos, proximo_intento) VALUES ($1, 0, now() + interval '15 seconds')
       ON CONFLICT (negocio_id) DO NOTHING`,
      [negocioId]
    );
  }
  return { pendiente_envio: pendienteEnvio };
}

module.exports = {
  ErrorFoto, habilitado, estadoDeNegocio, construirFoto, marcarCambio, procesarCola, sembrarPendientes,
  iniciarWorker, detenerWorker, aplicarFoto, fotosActualizadasDesde, editarDesdeCrm, enviarEvento, usarFetch,
};
