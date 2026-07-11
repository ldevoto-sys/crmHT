const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/config/causas-no-cierre — activas (para el modal de cierre)
router.get('/causas-no-cierre', async (req, res) => {
  try {
    const causas = await db.all('SELECT id, nombre, activo FROM causas_no_cierre ORDER BY nombre');
    res.json(causas);
  } catch (err) {
    console.error('[config/causas GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/config/causas-no-cierre (admin)
router.post('/causas-no-cierre', authorize('administrador'), async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const existe = await db.get('SELECT id FROM causas_no_cierre WHERE lower(nombre)=lower($1)', [nombre]);
    if (existe) return res.status(409).json({ error: 'Ya existe esa causa' });
    const r = await db.run('INSERT INTO causas_no_cierre (nombre) VALUES ($1) RETURNING *', [nombre]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[config/causas POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/config/causas-no-cierre/:id (admin) — renombrar / activar-desactivar
router.put('/causas-no-cierre/:id', authorize('administrador'), async (req, res) => {
  try {
    const { nombre, activo } = req.body;
    const causa = await db.get('SELECT * FROM causas_no_cierre WHERE id=$1', [req.params.id]);
    if (!causa) return res.status(404).json({ error: 'Causa no encontrada' });
    await db.run('UPDATE causas_no_cierre SET nombre=$1, activo=$2 WHERE id=$3',
      [nombre || causa.nombre, activo !== undefined ? activo : causa.activo, req.params.id]);
    res.json({ message: 'Causa actualizada' });
  } catch (err) {
    console.error('[config/causas PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
