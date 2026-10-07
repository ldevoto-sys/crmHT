// Integración con la app de Mantenimiento (06-10-2026, segunda versión — ver
// docs/HT-DO-XX-Especificacion-Integracion-Mantenimiento-v2.md). Reemplaza el
// diseño anterior (campo `estado_mantenimiento` aparte, nunca mergeado): ahora
// reusa las columnas reales de `ordenes_trabajo` (fecha_programada,
// fecha_ejecucion, horas_*) y mueve la etapa real del pipeline Operaciones
// (Aceptado → Programado → Ejecutado) a través de `cambiarEtapaNegocio()`, el
// mismo camino que usa el kanban manual.
const crypto = require('crypto');
const { db } = require('../db');
// Nombre distinto de "ot" a propósito: varias funciones de este archivo usan
// esa variable local para la fila de ordenes_trabajo (ver
// registrarEtapaDesdeMantenimiento) — otService evita que se tapen.
const otService = require('./ot');
const { claveEtapa } = otService;
const { normalizarTipoTrabajo } = require('./import_negocios');
// require perezoso (dentro de la función, no acá arriba): routes/negocios.js
// ya requiere este archivo para disparar el webhook al crear una OT —
// requerir `cambiarEtapaNegocio` a nivel de módulo crearía una dependencia
// circular que deja esa función `undefined` según el orden de carga.
function cambiarEtapaNegocio(...args) {
  return require('../routes/negocios').cambiarEtapaNegocio(...args);
}

// Actor de auditoría para lo que escribe esta integración (igual patrón que
// el usuario "Cowork" de api_v1.js).
let mantenimientoUserId = null;
async function idMantenimiento() {
  if (mantenimientoUserId) return mantenimientoUserId;
  const u = await db.get(`SELECT id FROM users WHERE email = 'mantenimiento@integracion.hidrotecnica.cl'`);
  mantenimientoUserId = u ? u.id : null;
  return mantenimientoUserId;
}

async function resolverEtapaPorNombre(pipelineId, nombre) {
  const etapas = await db.all('SELECT * FROM pipeline_etapas WHERE pipeline_id = $1 AND activo = true', [pipelineId]);
  return etapas.find(e => claveEtapa(e.nombre) === claveEtapa(nombre)) || null;
}

async function obtenerOTParaMantenimiento(negocioId) {
  const ot = await db.get(
    `SELECT o.*, o.fecha_programada::text AS fecha_programada, o.fecha_ejecucion::text AS fecha_ejecucion,
            n.titulo AS negocio_titulo, n.tipo_trabajo, n.monto_estimado, n.sucursal_nombre, n.mantenimiento_sucursal_id,
            pe.nombre AS etapa_nombre,
            ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido, ct.email AS contacto_email, ct.telefono_e164 AS contacto_telefono,
            e.razon_social AS empresa_nombre, e.rut AS empresa_rut, e.direccion AS empresa_direccion, e.comuna AS empresa_comuna
     FROM ordenes_trabajo o
     JOIN negocios n ON n.id = o.negocio_id
     LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id
     JOIN contactos ct ON ct.id = n.contacto_id
     LEFT JOIN empresas e ON e.id = n.empresa_id
     WHERE o.negocio_id = $1`,
    [negocioId]
  );
  if (!ot) return null;

  const items = await db.all(
    `SELECT oi.tipo, oi.descripcion, oi.cantidad, COALESCE(p.sku, oi.codigo) AS codigo
     FROM ot_items oi LEFT JOIN productos p ON p.id = oi.producto_id
     WHERE oi.ot_id = $1 ORDER BY oi.id`,
    [ot.id]
  );

  return {
    numero: `OT-${ot.negocio_id}`,
    negocio_id: String(ot.negocio_id),
    negocio_titulo: ot.negocio_titulo,
    tipo_trabajo: ot.tipo_trabajo,
    monto_estimado: ot.monto_estimado,
    etapa: ot.etapa_nombre,
    cliente: {
      empresa: ot.empresa_nombre || null,
      rut: ot.empresa_rut || null,
      direccion: ot.empresa_direccion || null,
      comuna: ot.empresa_comuna || null,
      contacto: [ot.contacto_nombre, ot.contacto_apellido].filter(Boolean).join(' '),
      email: ot.contacto_email || null,
      telefono: ot.contacto_telefono || null,
    },
    sucursal_nombre: ot.sucursal_nombre,
    mantenimiento_sucursal_id: ot.mantenimiento_sucursal_id,
    observaciones: ot.observaciones,
    fecha_programada: ot.fecha_programada,
    fecha_ejecucion: ot.fecha_ejecucion,
    horas_programadas: ot.horas_programadas,
    horas_ejecutadas: ot.horas_ejecutadas,
    mantenimiento_gestiona: ot.mantenimiento_gestiona,
    items,
  };
}

// Consulta en vivo a Mantenimiento: sucursales existentes para un cliente por
// RUT, para que el vendedor elija una al crear/editar el negocio (en vez de
// que el CRM mantenga su propia lista — ver próximos-pasos-integración-crm).
async function buscarSucursalesEnMantenimiento(rut) {
  const url = process.env.MANTENIMIENTO_API_URL;
  const key = process.env.MANTENIMIENTO_API_KEY_SALIENTE;
  if (!url || !key || !rut) return [];
  try {
    const resp = await fetch(`${url}/integraciones/crm/sucursales?rut=${encodeURIComponent(rut)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) { console.error(`[mantenimientoOT] GET sucursales respondió HTTP ${resp.status}`); return []; }
    return await resp.json();
  } catch (err) {
    console.error('[mantenimientoOT] Error al consultar sucursales en Mantenimiento', err);
    return [];
  }
}

// PATCH .../programacion y .../ejecucion (llamados por Mantenimiento). Mueve
// la etapa real del negocio — mismo camino que el kanban manual — y de paso
// marca la OT como gestionada por Mantenimiento la primera vez (ver
// services/ot.js: eso le saca el gate de técnico/horas que no aplica acá).
async function registrarEtapaDesdeMantenimiento(negocioId, nombreEtapa, datos) {
  const negocio = await db.get('SELECT id, pipeline_id, etapa_id FROM negocios WHERE id = $1', [negocioId]);
  if (!negocio) return { error: 'no_encontrado' };
  const ot = await db.get('SELECT id FROM ordenes_trabajo WHERE negocio_id = $1', [negocioId]);
  if (!ot) return { error: 'no_encontrado' };

  const etapa = await resolverEtapaPorNombre(negocio.pipeline_id, nombreEtapa);
  if (!etapa) return { error: 'etapa_no_configurada' };

  await db.run('UPDATE ordenes_trabajo SET mantenimiento_gestiona = true WHERE id = $1', [ot.id]);
  const usuarioId = await idMantenimiento();
  try {
    await cambiarEtapaNegocio(negocioId, etapa.id, datos, usuarioId);
  } catch (err) {
    return { error: err.status === 400 ? 'datos_invalidos' : 'error_interno', mensaje: err.message };
  }
  return { ok: true };
}

// POST .../negocios (llamado por Mantenimiento cuando la OT nace allá, no en
// el CRM — decisión de Luis Devoto 07-10-2026: no puede haber dos
// numeraciones de OT independientes, así que toda OT, nazca donde nazca,
// termina con un negocio en el CRM y se identifica por su negocio_id en los
// dos ambientes). Crea el negocio directo en "Aceptado" y su OT, marcada
// como gestionada por Mantenimiento desde el día uno (nunca le va a exigir
// técnico/horas propios del CRM). Idempotente por (origen, referencia_externa)
// — mismo mecanismo que ya usa la API de Cowork para no duplicar en un
// reintento.
async function crearNegocioDesdeMantenimiento({ referencia_externa, titulo, tipo_tarea, cliente, sucursal_nombre }) {
  if (!referencia_externa) { const e = new Error('referencia_externa es obligatoria'); e.status = 400; throw e; }
  const rut = (cliente && cliente.rut ? cliente.rut : '').trim();
  if (!rut) { const e = new Error('El RUT del cliente es obligatorio'); e.status = 400; throw e; }

  const existente = await db.get(
    `SELECT id FROM negocios WHERE origen = 'mantenimiento' AND referencia_externa = $1`,
    [referencia_externa]
  );
  if (existente) return { negocio_id: existente.id };

  const pipeline = await db.get(`SELECT id FROM pipelines WHERE nombre = 'Operaciones' AND activo = true`);
  if (!pipeline) { const e = new Error('No existe el pipeline "Operaciones"'); e.status = 503; throw e; }
  const etapaAceptado = await db.get(
    `SELECT id, probabilidad_cierre FROM pipeline_etapas WHERE pipeline_id = $1 AND activo = true AND lower(nombre) = 'aceptado'`,
    [pipeline.id]
  );
  if (!etapaAceptado) { const e = new Error('No existe la etapa "Aceptado" en el pipeline Operaciones'); e.status = 503; throw e; }

  let empresa = await db.get('SELECT id FROM empresas WHERE rut = $1', [rut]);
  if (!empresa) {
    empresa = (await db.run(
      `INSERT INTO empresas (razon_social, rut) VALUES ($1,$2) RETURNING id`,
      [(cliente && cliente.empresa) || rut, rut]
    )).rows[0];
  }

  const email = cliente && cliente.email ? cliente.email : null;
  let contacto = email
    ? await db.get('SELECT id FROM contactos WHERE lower(email) = lower($1) AND activo = true', [email])
    : null;
  if (!contacto) {
    contacto = (await db.run(
      `INSERT INTO contactos (nombre, email, empresa_id, origen) VALUES ($1,$2,$3,'api') RETURNING id`,
      [(cliente && cliente.empresa) || rut, email, empresa.id]
    )).rows[0];
  }

  const tipoTrabajo = normalizarTipoTrabajo(tipo_tarea) || 'otro';
  const usuarioId = await idMantenimiento();

  const negocio = (await db.run(
    `INSERT INTO negocios (contacto_id, empresa_id, vendedor_id, titulo, etapa_id, probabilidad_cierre, pipeline_id, tipo_trabajo, origen, referencia_externa, sucursal_nombre)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mantenimiento',$9,$10) RETURNING id`,
    [contacto.id, empresa.id, usuarioId, titulo || tipo_tarea || 'Orden de trabajo', etapaAceptado.id,
     etapaAceptado.probabilidad_cierre, pipeline.id, tipoTrabajo, referencia_externa, sucursal_nombre || null]
  )).rows[0];
  await db.run('INSERT INTO negocio_etapa_historial (negocio_id, etapa_id) VALUES ($1,$2)', [negocio.id, etapaAceptado.id]);
  await otService.crearOTSiNoExiste({ id: negocio.id, tipo_trabajo: tipoTrabajo }, db, usuarioId);
  await db.run('UPDATE ordenes_trabajo SET mantenimiento_gestiona = true WHERE negocio_id = $1', [negocio.id]);

  return { negocio_id: negocio.id };
}

// Webhook saliente al crearse una OT nueva (ver services/ot.js). Variable de
// URL vacía = desactivado, mismo criterio que el reenvío de WhatsApp.
async function notificarOTCreada(negocioId) {
  const url = process.env.MANTENIMIENTO_WEBHOOK_URL;
  if (!url) return;
  try {
    const payload = await obtenerOTParaMantenimiento(negocioId);
    if (!payload) return;
    const body = JSON.stringify({ evento: 'ot_creada', ot: payload });
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.MANTENIMIENTO_WEBHOOK_SECRET) {
      headers['X-Hidrotecnica-Signature'] = 'sha256=' + crypto
        .createHmac('sha256', process.env.MANTENIMIENTO_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
    }
    const resp = await fetch(url, { method: 'POST', headers, body });
    if (!resp.ok) console.error(`[mantenimientoOT] Webhook a ${url} respondió HTTP ${resp.status}`);
  } catch (err) {
    console.error('[mantenimientoOT] Error al notificar OT creada', err);
  }
}

module.exports = {
  obtenerOTParaMantenimiento,
  buscarSucursalesEnMantenimiento,
  registrarEtapaDesdeMantenimiento,
  crearNegocioDesdeMantenimiento,
  notificarOTCreada,
};
