const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const timeline = require('../services/timeline');

const PUEDE_ESCRIBIR = ['administrador', 'jefe_comercial', 'callcenter', 'vendedor'];
const PUEDE_ASIGNAR_A_OTROS = ['administrador', 'jefe_comercial'];

router.use(authenticate);

function puedeGestionar(tarea, user) {
  return user.rol === 'administrador' || user.rol === 'jefe_comercial' || tarea.asignado_a_id === user.id;
}

// GET /api/tareas?asignado_a_id=&estado=&contacto_id=&empresa_id=&negocio_id=&vencidas=true
router.get('/', async (req, res) => {
  try {
    const { asignado_a_id, estado, contacto_id, empresa_id, negocio_id, vencidas } = req.query;
    const clauses = [];
    const params = [];
    let i = 1;

    let asignado = asignado_a_id;
    if (!asignado && !PUEDE_ASIGNAR_A_OTROS.includes(req.user.rol)) asignado = req.user.id;
    if (asignado) { clauses.push(`t.asignado_a_id = $${i++}`); params.push(asignado); }

    if (estado) { clauses.push(`t.estado = $${i++}`); params.push(estado); }
    if (contacto_id) { clauses.push(`t.contacto_id = $${i++}`); params.push(contacto_id); }
    if (empresa_id) { clauses.push(`t.empresa_id = $${i++}`); params.push(empresa_id); }
    if (negocio_id) { clauses.push(`t.negocio_id = $${i++}`); params.push(negocio_id); }
    if (vencidas === 'true') { clauses.push(`t.estado = 'pendiente' AND t.fecha_vencimiento < now()`); }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const tareas = await db.all(
      `SELECT t.*, u.nombre AS asignado_nombre, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              e.razon_social AS empresa_nombre, n.titulo AS negocio_titulo
       FROM tareas t
       JOIN users u ON u.id = t.asignado_a_id
       LEFT JOIN contactos c ON c.id = t.contacto_id
       LEFT JOIN empresas e ON e.id = t.empresa_id
       LEFT JOIN negocios n ON n.id = t.negocio_id
       ${where} ORDER BY (t.estado = 'pendiente') DESC, t.fecha_vencimiento ASC NULLS LAST LIMIT 500`,
      params
    );
    res.json(tareas);
  } catch (err) {
    console.error('[tareas/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/tareas
router.post('/', authorize(...PUEDE_ESCRIBIR), async (req, res) => {
  try {
    const { titulo, descripcion, fecha_vencimiento, asignado_a_id, contacto_id, empresa_id, negocio_id } = req.body;
    if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'Título requerido' });

    let asignado = req.user.id;
    if (asignado_a_id && Number(asignado_a_id) !== req.user.id) {
      if (!PUEDE_ASIGNAR_A_OTROS.includes(req.user.rol)) {
        return res.status(403).json({ error: 'Solo administrador o jefe comercial pueden asignar tareas a otro usuario' });
      }
      const u = await db.get('SELECT id FROM users WHERE id = $1 AND activo = true', [asignado_a_id]);
      if (!u) return res.status(400).json({ error: 'Usuario asignado inválido' });
      asignado = asignado_a_id;
    }

    const r = await db.run(
      `INSERT INTO tareas (titulo, descripcion, fecha_vencimiento, asignado_a_id, creado_por_id, contacto_id, empresa_id, negocio_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [titulo.trim(), descripcion || null, fecha_vencimiento || null, asignado, req.user.id,
       contacto_id || null, empresa_id || null, negocio_id || null]
    );
    if (contacto_id || empresa_id || negocio_id) {
      await timeline.registrar({
        contacto_id: contacto_id || null, empresa_id: empresa_id || null, negocio_id: negocio_id || null,
        tipo: 'tarea', descripcion: `Tarea creada: ${titulo.trim().slice(0, 150)}`,
        usuario_id: req.user.id, referencia_id: r.rows[0].id,
      });
    }
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[tareas/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/tareas/:id
router.put('/:id', async (req, res) => {
  try {
    const tarea = await db.get('SELECT * FROM tareas WHERE id = $1', [req.params.id]);
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (!puedeGestionar(tarea, req.user)) return res.status(403).json({ error: 'Sin permiso' });

    const { titulo, descripcion, fecha_vencimiento, asignado_a_id } = req.body;
    let asignado = tarea.asignado_a_id;
    if (asignado_a_id && Number(asignado_a_id) !== tarea.asignado_a_id) {
      if (!PUEDE_ASIGNAR_A_OTROS.includes(req.user.rol)) {
        return res.status(403).json({ error: 'Solo administrador o jefe comercial pueden reasignar' });
      }
      const u = await db.get('SELECT id FROM users WHERE id = $1 AND activo = true', [asignado_a_id]);
      if (!u) return res.status(400).json({ error: 'Usuario asignado inválido' });
      asignado = asignado_a_id;
    }

    await db.run(
      `UPDATE tareas SET titulo=$1, descripcion=$2, fecha_vencimiento=$3, asignado_a_id=$4 WHERE id=$5`,
      [titulo || tarea.titulo, descripcion ?? tarea.descripcion, fecha_vencimiento ?? tarea.fecha_vencimiento, asignado, req.params.id]
    );
    res.json({ message: 'Tarea actualizada' });
  } catch (err) {
    console.error('[tareas/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/tareas/:id/cumplir
router.post('/:id/cumplir', async (req, res) => {
  try {
    const tarea = await db.get('SELECT * FROM tareas WHERE id = $1', [req.params.id]);
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (!puedeGestionar(tarea, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    await db.run(`UPDATE tareas SET estado='cumplida', cumplida_en=now() WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Tarea cumplida' });
  } catch (err) {
    console.error('[tareas/cumplir]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/tareas/:id/cancelar
router.post('/:id/cancelar', async (req, res) => {
  try {
    const tarea = await db.get('SELECT * FROM tareas WHERE id = $1', [req.params.id]);
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (!puedeGestionar(tarea, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    await db.run(`UPDATE tareas SET estado='cancelada' WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Tarea cancelada' });
  } catch (err) {
    console.error('[tareas/cancelar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
