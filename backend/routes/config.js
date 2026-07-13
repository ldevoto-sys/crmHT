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
router.post('/causas-no-cierre', authorize('administrador', 'jefe_comercial'), async (req, res) => {
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
router.put('/causas-no-cierre/:id', authorize('administrador', 'jefe_comercial'), async (req, res) => {
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
router.post('/pipeline-etapas', authorize('administrador', 'jefe_comercial'), async (req, res) => {
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
router.put('/pipeline-etapas/:id', authorize('administrador', 'jefe_comercial'), async (req, res) => {
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
router.delete('/pipeline-etapas/:id', authorize('administrador', 'jefe_comercial'), async (req, res) => {
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

// --- Reglas de asignación por categoría (§7.1). El orden cuenta→categoría→RR
//     es fijo; aquí se configuran solo los mapeos categoría → vendedor. ---
router.get('/reglas-asignacion', async (req, res) => {
  try {
    const reglas = await db.all(
      `SELECT ra.id, ra.tipo, ra.parametro, ra.vendedor_id, ra.activo, ra.prioridad, u.nombre AS vendedor_nombre
       FROM reglas_asignacion ra LEFT JOIN users u ON u.id = ra.vendedor_id
       ORDER BY ra.prioridad, ra.id`);
    res.json(reglas);
  } catch (err) {
    console.error('[config/reglas GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/reglas-asignacion', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const { parametro, vendedor_id, prioridad } = req.body;
    if (!parametro || !vendedor_id) return res.status(400).json({ error: 'Categoría y vendedor requeridos' });
    const r = await db.run(
      `INSERT INTO reglas_asignacion (tipo, parametro, vendedor_id, prioridad) VALUES ('por_categoria',$1,$2,$3) RETURNING *`,
      [parametro, vendedor_id, prioridad || 100]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[config/reglas POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.delete('/reglas-asignacion/:id', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    await db.run('DELETE FROM reglas_asignacion WHERE id = $1', [req.params.id]);
    res.json({ message: 'Regla eliminada' });
  } catch (err) {
    console.error('[config/reglas DELETE]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Datos de empresa (emisor de cotizaciones) ---
router.get('/empresa', async (req, res) => {
  try {
    const cfg = await db.get('SELECT * FROM config_empresa WHERE id = 1');
    res.json(cfg || {});
  } catch (err) {
    console.error('[config/empresa GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.put('/empresa', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const campos = ['razon_social', 'rut', 'direccion', 'comuna', 'ciudad', 'telefono', 'whatsapp',
                    'email_ventas', 'email_cobranzas', 'sitio_web', 'banco', 'cuenta_tipo', 'cuenta_numero'];
    const sets = campos.map((c, i) => `${c}=$${i + 1}`).join(', ');
    const vals = campos.map(c => req.body[c] ?? null);
    await db.run(
      `INSERT INTO config_empresa (id, ${campos.join(', ')}) VALUES (1, ${campos.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (id) DO UPDATE SET ${sets}`, vals);
    res.json({ message: 'Datos de empresa actualizados' });
  } catch (err) {
    console.error('[config/empresa PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Pregunta de la encuesta post-cierre ---
router.get('/encuesta', async (req, res) => {
  try {
    const cfg = await db.get('SELECT * FROM encuesta_config WHERE id = 1');
    res.json(cfg || {});
  } catch (err) {
    console.error('[config/encuesta GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.put('/encuesta', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    if (!pregunta || !pregunta.trim()) return res.status(400).json({ error: 'La pregunta es requerida' });
    await db.run(
      `INSERT INTO encuesta_config (id, pregunta) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET pregunta = $1`,
      [pregunta.trim()]
    );
    res.json({ message: 'Pregunta de la encuesta actualizada' });
  } catch (err) {
    console.error('[config/encuesta PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
