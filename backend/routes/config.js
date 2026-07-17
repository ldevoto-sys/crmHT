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

// --- Horario de atención (usado por el bot de WhatsApp y por secuencias con "respetar_horario") ---
router.get('/horario-atencion', async (req, res) => {
  try {
    const cfg = await db.get('SELECT * FROM config_horario_atencion WHERE id = 1');
    res.json(cfg);
  } catch (err) {
    console.error('[config/horario-atencion GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.put('/horario-atencion', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const { dias_habiles, hora_inicio, hora_fin } = req.body;
    if (!Array.isArray(dias_habiles) || dias_habiles.length === 0 || dias_habiles.some(d => !Number.isInteger(d) || d < 1 || d > 7)) {
      return res.status(400).json({ error: 'dias_habiles debe ser un arreglo de números 1 (lunes) a 7 (domingo)' });
    }
    if (!hora_inicio || !hora_fin) return res.status(400).json({ error: 'hora_inicio y hora_fin son requeridas' });
    await db.run(
      `UPDATE config_horario_atencion SET dias_habiles=$1, hora_inicio=$2, hora_fin=$3 WHERE id=1`,
      [dias_habiles, hora_inicio, hora_fin]
    );
    res.json({ message: 'Horario de atención actualizado' });
  } catch (err) {
    console.error('[config/horario-atencion PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Bot de WhatsApp: mensajes, opciones de categorización y pasos de recontacto ---
router.get('/whatsapp-bot', async (req, res) => {
  try {
    const cfg = await db.get('SELECT * FROM whatsapp_bot_config WHERE id = 1');
    const pasos = await db.all('SELECT * FROM whatsapp_recontacto_pasos ORDER BY orden');
    res.json({ ...cfg, pasos_recontacto: pasos });
  } catch (err) {
    console.error('[config/whatsapp-bot GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.put('/whatsapp-bot', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  const {
    mensaje_fuera_horario, mensaje_categorizacion, opciones_categorizacion, recontacto_respeta_horario,
    mensaje_confirmacion, bandeja_acceso, pasos_recontacto,
  } = req.body;
  if (!mensaje_fuera_horario || !mensaje_fuera_horario.trim()) return res.status(400).json({ error: 'El mensaje fuera de horario es requerido' });
  if (!mensaje_categorizacion || !mensaje_categorizacion.trim()) return res.status(400).json({ error: 'El mensaje de categorización es requerido' });
  if (!mensaje_confirmacion || !mensaje_confirmacion.trim()) return res.status(400).json({ error: 'El mensaje de confirmación es requerido' });
  if (!['todos', 'asignado'].includes(bandeja_acceso)) return res.status(400).json({ error: 'bandeja_acceso inválido' });
  if (!Array.isArray(opciones_categorizacion) || opciones_categorizacion.length === 0) {
    return res.status(400).json({ error: 'Debes definir al menos una opción de categorización' });
  }
  for (const o of opciones_categorizacion) {
    if (!o.label || !o.label.trim() || !o.categoria || !o.categoria.trim()) return res.status(400).json({ error: 'Cada opción requiere texto y categoría' });
  }
  if (!Array.isArray(pasos_recontacto) || pasos_recontacto.length === 0) {
    return res.status(400).json({ error: 'Debes definir al menos un paso de recontacto' });
  }
  for (const p of pasos_recontacto) {
    if (!p.tiempo_espera_horas || Number(p.tiempo_espera_horas) <= 0) return res.status(400).json({ error: 'tiempo_espera_horas inválido en un paso de recontacto' });
    if (!p.mensaje || !p.mensaje.trim()) return res.status(400).json({ error: 'Cada paso de recontacto requiere un mensaje' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE whatsapp_bot_config SET mensaje_fuera_horario=$1, mensaje_categorizacion=$2, opciones_categorizacion=$3,
              recontacto_respeta_horario=$4, mensaje_confirmacion=$5, bandeja_acceso=$6 WHERE id=1`,
      [mensaje_fuera_horario.trim(), mensaje_categorizacion.trim(), JSON.stringify(opciones_categorizacion),
       recontacto_respeta_horario !== false, mensaje_confirmacion.trim(), bandeja_acceso]
    );
    await client.query('DELETE FROM whatsapp_recontacto_pasos');
    let orden = 1;
    for (const p of pasos_recontacto) {
      await client.query(
        'INSERT INTO whatsapp_recontacto_pasos (orden, tiempo_espera_horas, mensaje) VALUES ($1,$2,$3)',
        [orden++, p.tiempo_espera_horas, p.mensaje.trim()]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Configuración del bot de WhatsApp actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[config/whatsapp-bot PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

module.exports = router;
