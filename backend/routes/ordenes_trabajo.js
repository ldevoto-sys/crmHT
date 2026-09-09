// Orden de Trabajo (Arranque de Trabajos, Ventas → Operaciones, HT-AP-03
// pendiente 06-09-2026). Se crea sola al entrar a "Aceptado" (ver
// services/ot.js, routes/negocios.js) — acá solo se lee/edita/exporta.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { generarOTPDF } = require('../services/pdf');

router.use(authenticate);

const PUEDE_VER_TODAS = ['administrador', 'jefe_comercial', 'gerencia', 'callcenter'];
function puedeVer(negocio, user) {
  return PUEDE_VER_TODAS.includes(user.rol) || (user.rol === 'vendedor' && negocio && negocio.vendedor_id === user.id);
}
function puedeEditar(negocio, user) {
  return negocio && (user.rol === 'administrador' || user.rol === 'jefe_comercial' || negocio.vendedor_id === user.id);
}

// Cada línea necesita tipo válido, cantidad > 0, precio (si viene) >= 0, y
// un producto del catálogo o una descripción libre — igual criterio que
// itemsValidos() en routes/cotizaciones.js, salvo que el precio es opcional
// (la OT nace "sin precios").
function itemsValidos(items) {
  if (!Array.isArray(items)) return false;
  return items.every(it =>
    ['material', 'herramienta'].includes(it.tipo) &&
    Number(it.cantidad) > 0 &&
    (it.precio_unitario === undefined || it.precio_unitario === null || it.precio_unitario === '' || Number(it.precio_unitario) >= 0) &&
    (it.producto_id || (it.descripcion && it.descripcion.trim()))
  );
}

async function negocioDeOT(otId) {
  return db.get(
    `SELECT n.* FROM negocios n JOIN ordenes_trabajo o ON o.negocio_id = n.id WHERE o.id = $1`, [otId]
  );
}

async function cargarOTCompleta(where, param) {
  const ot = await db.get(
    `SELECT o.*, n.titulo AS negocio_titulo, n.tipo_trabajo, n.vendedor_id,
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
  return { ot, items };
}

// GET /api/ordenes-trabajo/negocio/:negocioId — la vista de detalle de
// negocio no conoce el id de la OT de antemano, solo el del negocio.
router.get('/negocio/:negocioId', async (req, res) => {
  try {
    const negocio = await db.get('SELECT id, vendedor_id FROM negocios WHERE id = $1', [req.params.negocioId]);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!puedeVer(negocio, req.user)) return res.status(403).json({ error: 'Sin permiso' });

    const completa = await cargarOTCompleta('o.negocio_id', req.params.negocioId);
    if (!completa) return res.status(404).json({ error: 'Este negocio todavía no tiene Orden de Trabajo (se genera al entrar a "Aceptado")' });
    res.json({
      ...completa.ot, numero: `OT-${completa.ot.negocio_id}`, items: completa.items,
      puede_editar: puedeEditar(negocio, req.user),
    });
  } catch (err) {
    console.error('[ordenes_trabajo/GET /negocio/:negocioId]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/ordenes-trabajo/:id/items — reemplaza la lista completa de
// materiales/herramientas, igual patrón que PUT /cotizaciones/:id.
router.put('/:id/items', async (req, res) => {
  const { items, observaciones } = req.body;
  if (!itemsValidos(items)) return res.status(400).json({ error: 'Ítems inválidos: cada línea necesita tipo, cantidad > 0 y producto o descripción' });

  const negocio = await negocioDeOT(req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Orden de Trabajo no encontrada' });
  if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (observaciones !== undefined) {
      await client.query('UPDATE ordenes_trabajo SET observaciones = $1 WHERE id = $2', [observaciones || null, req.params.id]);
    }
    await client.query('DELETE FROM ot_items WHERE ot_id = $1', [req.params.id]);
    for (const it of items) {
      const precio = it.precio_unitario === undefined || it.precio_unitario === null || it.precio_unitario === '' ? null : Number(it.precio_unitario);
      const total = precio !== null ? Math.round(Number(it.cantidad) * precio) : null;
      // Código manual solo aplica a ítems sin producto_id — con producto del
      // catálogo, el código a mostrar es el SKU de `productos` (join en
      // cargarOTCompleta), no se guarda uno propio para no duplicar fuente.
      const codigo = it.producto_id ? null : (it.codigo || null);
      await client.query(
        `INSERT INTO ot_items (ot_id, tipo, producto_id, descripcion, cantidad, precio_unitario, total_linea, codigo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [req.params.id, it.tipo, it.producto_id || null, it.descripcion || null, it.cantidad, precio, total, codigo]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Orden de Trabajo actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ordenes_trabajo/PUT /:id/items]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// GET /api/ordenes-trabajo/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  try {
    const negocio = await negocioDeOT(req.params.id);
    if (!negocio) return res.status(404).json({ error: 'Orden de Trabajo no encontrada' });
    if (!puedeVer(negocio, req.user)) return res.status(403).json({ error: 'Sin permiso' });

    const completa = await cargarOTCompleta('o.id', req.params.id);
    const emisor = await db.get('SELECT * FROM config_empresa WHERE id = 1') || {};
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="OT-${completa.ot.negocio_id}.pdf"`);
    await generarOTPDF({
      ot: completa.ot,
      items: completa.items,
      cliente: {
        contacto_nombre: completa.ot.contacto_nombre, contacto_apellido: completa.ot.contacto_apellido,
        contacto_email: completa.ot.contacto_email, empresa_nombre: completa.ot.empresa_nombre,
        empresa_direccion: completa.ot.empresa_direccion, empresa_comuna: completa.ot.empresa_comuna,
      },
      emisor,
    }, res);
  } catch (err) {
    console.error('[ordenes_trabajo/:id/pdf]', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

module.exports = router;
