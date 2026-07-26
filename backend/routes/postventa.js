const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// "Gestionar" (mover etapa, asignar técnico, prioridad, SLA, ver todos los
// casos) es de administrador/jefe comercial, o de cualquier usuario con el
// atributo es_encargado_postventa marcado (independiente de su rol — permite
// que, por ejemplo, un jefe comercial cubra Postventa sin cambiar de rol).
function puedeGestionar(user) {
  return user.rol === 'administrador' || user.rol === 'jefe_comercial' || user.es_encargado_postventa === true;
}

// --- Etapas de Postventa ---

// GET /api/postventa/etapas
router.get('/etapas', async (req, res) => {
  try {
    const etapas = await db.all('SELECT id, nombre, orden, tipo, activo FROM postventa_etapas ORDER BY orden');
    res.json(etapas);
  } catch (err) {
    console.error('[postventa/etapas GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/postventa/etapas {nombre} — nueva etapa intermedia (abierta)
router.post('/etapas', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const maxAbierta = await db.get(`SELECT COALESCE(MAX(orden),0) AS m FROM postventa_etapas WHERE tipo='abierta'`);
    const orden = (maxAbierta.m || 0) + 1;
    // Empujar las terminales (resuelto/rechazado) hacia el final.
    await db.run(`UPDATE postventa_etapas SET orden = orden + 1 WHERE tipo IN ('resuelto','rechazado') AND orden >= $1`, [orden]);
    const r = await db.run(
      'INSERT INTO postventa_etapas (nombre, orden, tipo) VALUES ($1,$2,$3) RETURNING *',
      [nombre, orden, 'abierta']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[postventa/etapas POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/postventa/etapas/:id — renombrar, orden, activar/desactivar
router.put('/etapas/:id', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const etapa = await db.get('SELECT * FROM postventa_etapas WHERE id=$1', [req.params.id]);
    if (!etapa) return res.status(404).json({ error: 'Etapa no encontrada' });
    const { nombre, orden, activo } = req.body;
    const nuevoActivo = etapa.tipo === 'abierta' ? (activo !== undefined ? activo : etapa.activo) : true;
    await db.run(
      'UPDATE postventa_etapas SET nombre=$1, orden=$2, activo=$3 WHERE id=$4',
      [nombre || etapa.nombre, orden ?? etapa.orden, nuevoActivo, req.params.id]
    );
    res.json({ message: 'Etapa actualizada' });
  } catch (err) {
    console.error('[postventa/etapas PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/postventa/etapas/:id — solo intermedias sin casos
router.delete('/etapas/:id', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const etapa = await db.get('SELECT * FROM postventa_etapas WHERE id=$1', [req.params.id]);
    if (!etapa) return res.status(404).json({ error: 'Etapa no encontrada' });
    if (etapa.tipo !== 'abierta') return res.status(400).json({ error: 'Las etapas Resuelto y Rechazado no se pueden eliminar' });
    const enUso = await db.get('SELECT id FROM casos_postventa WHERE etapa_id=$1 LIMIT 1', [req.params.id]);
    if (enUso) return res.status(409).json({ error: 'Hay casos en esta etapa. Muévelos antes de eliminarla (o desactívala).' });
    await db.run('DELETE FROM postventa_etapas WHERE id=$1', [req.params.id]);
    res.json({ message: 'Etapa eliminada' });
  } catch (err) {
    console.error('[postventa/etapas DELETE]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Casos ---

// Visibilidad: administrador/jefe comercial y encargados ven todos los
// casos; un vendedor ve solo los que él creó (puede crear, pero no gestiona
// el tablero completo).
function filtroVisibilidad(user) {
  if (puedeGestionar(user)) return { where: '', params: [] };
  return { where: 'WHERE cp.creado_por_id = $1', params: [user.id] };
}

// GET /api/postventa?etapa_id=&prioridad=
router.get('/', async (req, res) => {
  try {
    const { where, params } = filtroVisibilidad(req.user);
    const extra = [];
    let i = params.length + 1;
    if (req.query.etapa_id) { extra.push(`cp.etapa_id = $${i++}`); params.push(req.query.etapa_id); }
    if (req.query.prioridad) { extra.push(`cp.prioridad = $${i++}`); params.push(req.query.prioridad); }
    const whereFinal = extra.length
      ? (where ? `${where} AND ${extra.join(' AND ')}` : `WHERE ${extra.join(' AND ')}`)
      : where;
    const casos = await db.all(
      `SELECT cp.*, pe.nombre AS etapa_nombre, pe.tipo AS etapa_tipo,
              c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              e.razon_social AS empresa_nombre, p.nombre AS producto_nombre,
              t.nombre AS tecnico_nombre, u.nombre AS creado_por_nombre,
              n.titulo AS negocio_titulo
       FROM casos_postventa cp
       LEFT JOIN postventa_etapas pe ON pe.id = cp.etapa_id
       JOIN contactos c ON c.id = cp.contacto_id
       LEFT JOIN empresas e ON e.id = cp.empresa_id
       LEFT JOIN productos p ON p.id = cp.producto_id
       LEFT JOIN users t ON t.id = cp.tecnico_asignado_id
       LEFT JOIN users u ON u.id = cp.creado_por_id
       LEFT JOIN negocios n ON n.id = cp.negocio_id
       ${whereFinal}
       ORDER BY cp.ultima_actividad DESC LIMIT 500`,
      params
    );
    res.json(casos);
  } catch (err) {
    console.error('[postventa GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/postventa/:id
router.get('/:id', async (req, res) => {
  try {
    const caso = await db.get(
      `SELECT cp.*, pe.nombre AS etapa_nombre, pe.tipo AS etapa_tipo,
              c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              c.email AS contacto_email, c.telefono_e164 AS contacto_telefono,
              e.razon_social AS empresa_nombre, p.nombre AS producto_nombre,
              t.nombre AS tecnico_nombre, u.nombre AS creado_por_nombre,
              n.titulo AS negocio_titulo
       FROM casos_postventa cp
       LEFT JOIN postventa_etapas pe ON pe.id = cp.etapa_id
       JOIN contactos c ON c.id = cp.contacto_id
       LEFT JOIN empresas e ON e.id = cp.empresa_id
       LEFT JOIN productos p ON p.id = cp.producto_id
       LEFT JOIN users t ON t.id = cp.tecnico_asignado_id
       LEFT JOIN users u ON u.id = cp.creado_por_id
       LEFT JOIN negocios n ON n.id = cp.negocio_id
       WHERE cp.id = $1`,
      [req.params.id]
    );
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (!puedeGestionar(req.user) && caso.creado_por_id !== req.user.id) return res.status(403).json({ error: 'Sin permiso' });
    res.json({ ...caso, puede_gestionar: puedeGestionar(req.user) });
  } catch (err) {
    console.error('[postventa GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/postventa — crea un caso (vendedor, admin, jefe comercial)
router.post('/', authorize('administrador', 'jefe_comercial', 'vendedor'), async (req, res) => {
  try {
    const { negocio_id, titulo, descripcion, producto_id, detalle_equipo, prioridad, fecha_limite_respuesta } = req.body;
    if (!negocio_id || !titulo) return res.status(400).json({ error: 'Negocio de origen y título son requeridos' });

    const negocio = await db.get('SELECT id, contacto_id, empresa_id FROM negocios WHERE id = $1', [negocio_id]);
    if (!negocio) return res.status(400).json({ error: 'Negocio inexistente' });

    const primeraEtapa = await db.get(`SELECT id FROM postventa_etapas WHERE tipo = 'abierta' AND activo = true ORDER BY orden LIMIT 1`);

    const r = await db.run(
      `INSERT INTO casos_postventa
         (negocio_id, contacto_id, empresa_id, producto_id, detalle_equipo, titulo, descripcion, prioridad, fecha_limite_respuesta, creado_por_id, etapa_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [negocio_id, negocio.contacto_id, negocio.empresa_id, producto_id || null, detalle_equipo || null,
       titulo, descripcion || null, prioridad || 'media', fecha_limite_respuesta || null,
       req.user.id, primeraEtapa ? primeraEtapa.id : null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[postventa POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/postventa/:id — editar datos del caso (solo quien gestiona)
router.put('/:id', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const caso = await db.get('SELECT * FROM casos_postventa WHERE id = $1', [req.params.id]);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const { titulo, descripcion, producto_id, detalle_equipo, prioridad, fecha_limite_respuesta, tecnico_asignado_id } = req.body;
    await db.run(
      `UPDATE casos_postventa SET titulo=$1, descripcion=$2, producto_id=$3, detalle_equipo=$4,
              prioridad=$5, fecha_limite_respuesta=$6, tecnico_asignado_id=$7, ultima_actividad=now()
       WHERE id=$8`,
      [titulo || caso.titulo, descripcion ?? caso.descripcion, producto_id ?? caso.producto_id,
       detalle_equipo ?? caso.detalle_equipo, prioridad || caso.prioridad,
       fecha_limite_respuesta !== undefined ? (fecha_limite_respuesta || null) : caso.fecha_limite_respuesta,
       tecnico_asignado_id !== undefined ? (tecnico_asignado_id || null) : caso.tecnico_asignado_id,
       req.params.id]
    );
    res.json({ message: 'Caso actualizado' });
  } catch (err) {
    console.error('[postventa PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/postventa/:id/etapa — mover de etapa (solo quien gestiona)
router.put('/:id/etapa', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const { etapa_id } = req.body;
    const etapa = await db.get('SELECT * FROM postventa_etapas WHERE id = $1', [etapa_id]);
    if (!etapa) return res.status(400).json({ error: 'Etapa inválida' });

    const caso = await db.get('SELECT * FROM casos_postventa WHERE id = $1', [req.params.id]);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const cierra = etapa.tipo === 'resuelto' || etapa.tipo === 'rechazado';
    await db.run(
      `UPDATE casos_postventa SET etapa_id=$1, fecha_cierre=$2, ultima_actividad=now() WHERE id=$3`,
      [etapa.id, cierra ? new Date().toISOString() : null, req.params.id]
    );
    res.json({ message: 'Etapa actualizada' });
  } catch (err) {
    console.error('[postventa PUT /:id/etapa]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
