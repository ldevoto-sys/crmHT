// Integración con la app de Mantenimiento (15-09-2026, HT-DO-XX — ver
// docs/HT-DO-XX-Especificacion-Integracion-Mantenimiento-v1.0.md). Centraliza
// acá la consulta de la OT para un integrador externo (sin precios, a
// diferencia de routes/ordenes_trabajo.js que sí los expone al vendedor) y
// la actualización del estado que reporta Mantenimiento, para que tanto la
// ruta (routes/api_mantenimiento.js) como el webhook saliente usen la misma
// función y no diverjan en el formato.
const { db } = require('../db');
const crypto = require('crypto');
const timeline = require('./timeline');

const ESTADOS_VALIDOS = ['pendiente', 'en_progreso', 'cerrado'];

async function obtenerOTParaMantenimiento(negocioId) {
  const ot = await db.get(
    `SELECT o.*, n.titulo AS negocio_titulo, n.tipo_trabajo,
            ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido, ct.email AS contacto_email, ct.telefono_e164 AS contacto_telefono,
            e.razon_social AS empresa_nombre, e.rut AS empresa_rut, e.direccion AS empresa_direccion, e.comuna AS empresa_comuna
     FROM ordenes_trabajo o
     JOIN negocios n ON n.id = o.negocio_id
     JOIN contactos ct ON ct.id = n.contacto_id
     LEFT JOIN empresas e ON e.id = n.empresa_id
     WHERE o.negocio_id = $1`,
    [negocioId]
  );
  if (!ot) return null;

  // Sin precio_unitario ni total_linea: Mantenimiento ejecuta el trabajo, no
  // lo factura — se expone solo lo necesario para llevar los materiales y
  // herramientas a terreno.
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
    cliente: {
      empresa: ot.empresa_nombre || null,
      rut: ot.empresa_rut || null,
      direccion: ot.empresa_direccion || null,
      comuna: ot.empresa_comuna || null,
      contacto: [ot.contacto_nombre, ot.contacto_apellido].filter(Boolean).join(' '),
      email: ot.contacto_email || null,
      telefono: ot.contacto_telefono || null,
    },
    observaciones: ot.observaciones,
    estado_mantenimiento: ot.estado_mantenimiento,
    fecha_estado_mantenimiento: ot.fecha_estado_mantenimiento,
    observaciones_mantenimiento: ot.observaciones_mantenimiento,
    items,
  };
}

// Actualiza el estado que reporta Mantenimiento. No toca la etapa del
// negocio en el pipeline Operaciones del CRM — eso sigue siendo decisión de
// un vendedor/admin en el kanban, esto es solo lo que la app externa informa
// que pasó en terreno.
async function actualizarEstadoMantenimiento(negocioId, { estado, observaciones }) {
  if (!ESTADOS_VALIDOS.includes(estado)) return { error: 'estado_invalido' };
  const ot = await db.get('SELECT id FROM ordenes_trabajo WHERE negocio_id = $1', [negocioId]);
  if (!ot) return { error: 'no_encontrado' };

  await db.run(
    `UPDATE ordenes_trabajo SET estado_mantenimiento = $1, fecha_estado_mantenimiento = now(), observaciones_mantenimiento = $2 WHERE id = $3`,
    [estado, observaciones || null, ot.id]
  );
  await timeline.registrar({
    negocio_id: negocioId,
    tipo: 'ot_mantenimiento',
    descripcion: `Mantenimiento reportó la OT-${negocioId} como "${estado}"${observaciones ? `: ${observaciones}` : ''}`,
  });
  return { ok: true };
}

// Webhook saliente al crearse una OT nueva (ver services/ot.js). Mismo
// criterio que el reenvío de WhatsApp entre entornos (routes/public.js):
// variable de URL vacía = desactivado, no rompe nada si Mantenimiento
// todavía no tiene un endpoint receptor desplegado.
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

module.exports = { obtenerOTParaMantenimiento, actualizarEstadoMantenimiento, notificarOTCreada, ESTADOS_VALIDOS };
