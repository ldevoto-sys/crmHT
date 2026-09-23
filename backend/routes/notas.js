const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const timeline = require('../services/timeline');

const PUEDE_ESCRIBIR = ['administrador', 'jefe_comercial', 'callcenter', 'vendedor'];

router.use(authenticate);

// GET /api/notas?contacto_id=&empresa_id=&negocio_id=
router.get('/', async (req, res) => {
  try {
    const { contacto_id, empresa_id, negocio_id } = req.query;
    if (!contacto_id && !empresa_id && !negocio_id) {
      return res.status(400).json({ error: 'Debes indicar contacto_id, empresa_id o negocio_id' });
    }
    const clauses = [];
    const params = [];
    let i = 1;
    if (contacto_id) { clauses.push(`n.contacto_id = $${i++}`); params.push(contacto_id); }
    if (empresa_id) { clauses.push(`n.empresa_id = $${i++}`); params.push(empresa_id); }
    if (negocio_id) { clauses.push(`n.negocio_id = $${i++}`); params.push(negocio_id); }
    const notas = await db.all(
      `SELECT n.*, u.nombre AS usuario_nombre FROM notas n
       JOIN users u ON u.id = n.usuario_id
       WHERE ${clauses.join(' OR ')} ORDER BY n.created_at DESC LIMIT 200`,
      params
    );
    res.json(notas);
  } catch (err) {
    console.error('[notas/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/notas
router.post('/', authorize(...PUEDE_ESCRIBIR), async (req, res) => {
  try {
    const { texto, contacto_id, empresa_id, negocio_id } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Texto requerido' });
    if (!contacto_id && !empresa_id && !negocio_id) {
      return res.status(400).json({ error: 'Debes indicar contacto_id, empresa_id o negocio_id' });
    }
    const r = await db.run(
      `INSERT INTO notas (contacto_id, empresa_id, negocio_id, texto, usuario_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [contacto_id || null, empresa_id || null, negocio_id || null, texto.trim(), req.user.id]
    );
    await timeline.registrar({
      contacto_id: contacto_id || null, empresa_id: empresa_id || null, negocio_id: negocio_id || null,
      tipo: 'nota', descripcion: texto.trim().slice(0, 200), usuario_id: req.user.id, referencia_id: r.rows[0].id,
    });
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[notas/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
