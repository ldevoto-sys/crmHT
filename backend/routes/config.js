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

// --- Etapas del pipeline (configurables por administrador) ---

// GET /api/config/pipeline-etapas — todas, ordenadas (para kanban y config)
router.get('/pipeline-etapas', async (req, res) => {
  try {
    const etapas = await db.all('SELECT id, nombre, orden, probabilidad_cierre, tipo, activo FROM pipeline_etapas ORDER BY orden');
    res.json(etapas);
  } catch (err) {
    console.error('[config/pipeline-etapas GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/config/pipeline-etapas (admin) — nueva etapa intermedia (abierta)
router.post('/pipeline-etapas', authorize('administrador'), async (req, res) => {
  try {
    const { nombre, probabilidad_cierre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const prob = Number(probabilidad_cierre) || 0;
    if (prob < 0 || prob > 100) return res.status(400).json({ error: 'La probabilidad debe estar entre 0 y 100' });
    // Insertar antes de las etapas terminales (ganada/perdida).
    const maxAbierta = await db.get(`SELECT COALESCE(MAX(orden),0) AS m FROM pipeline_etapas WHERE tipo='abierta'`);
    const orden = (maxAbierta.m || 0) + 1;
    // Empujar las terminales hacia el final.
    await db.run(`UPDATE pipeline_etapas SET orden = orden + 1 WHERE tipo IN ('ganada','perdida') AND orden >= $1`, [orden]);
    const r = await db.run(
      'INSERT INTO pipeline_etapas (nombre, orden, probabilidad_cierre, tipo) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombre, orden, prob, 'abierta']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[config/pipeline-etapas POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/config/pipeline-etapas/:id (admin) — renombrar, % , orden, activar/desactivar
router.put('/pipeline-etapas/:id', authorize('administrador'), async (req, res) => {
  try {
    const etapa = await db.get('SELECT * FROM pipeline_etapas WHERE id=$1', [req.params.id]);
    if (!etapa) return res.status(404).json({ error: 'Etapa no encontrada' });
    const { nombre, probabilidad_cierre, orden, activo } = req.body;
    const prob = probabilidad_cierre !== undefined ? Number(probabilidad_cierre) : etapa.probabilidad_cierre;
    if (prob < 0 || prob > 100) return res.status(400).json({ error: 'La probabilidad debe estar entre 0 y 100' });
    // Las terminales no se pueden desactivar (romperían el cierre).
    const nuevoActivo = etapa.tipo === 'abierta' ? (activo !== undefined ? activo : etapa.activo) : true;
    await db.run(
      'UPDATE pipeline_etapas SET nombre=$1, probabilidad_cierre=$2, orden=$3, activo=$4 WHERE id=$5',
      [nombre || etapa.nombre, prob, orden ?? etapa.orden, nuevoActivo, req.params.id]
    );
    res.json({ message: 'Etapa actualizada' });
  } catch (err) {
    console.error('[config/pipeline-etapas PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/config/pipeline-etapas/:id (admin) — solo intermedias sin negocios
router.delete('/pipeline-etapas/:id', authorize('administrador'), async (req, res) => {
  try {
    const etapa = await db.get('SELECT * FROM pipeline_etapas WHERE id=$1', [req.params.id]);
    if (!etapa) return res.status(404).json({ error: 'Etapa no encontrada' });
    if (etapa.tipo !== 'abierta') return res.status(400).json({ error: 'Las etapas Ganado y Perdido no se pueden eliminar' });
    const enUso = await db.get('SELECT id FROM negocios WHERE etapa_id=$1 LIMIT 1', [req.params.id]);
    if (enUso) return res.status(409).json({ error: 'Hay negocios en esta etapa. Muévelos antes de eliminarla (o desactívala).' });
    await db.run('DELETE FROM pipeline_etapas WHERE id=$1', [req.params.id]);
    res.json({ message: 'Etapa eliminada' });
  } catch (err) {
    console.error('[config/pipeline-etapas DELETE]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
