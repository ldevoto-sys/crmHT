const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const timeline = require('../services/timeline');

router.use(authenticate);

function puedeEditar(negocio, user) {
  return user.rol === 'administrador' || negocio.vendedor_id === user.id;
}

// GET /api/negocios?etapa_id=&vendedor_id=&q=
router.get('/', async (req, res) => {
  try {
    const { etapa_id, vendedor_id, q } = req.query;
    const clauses = [];
    const params = [];
    let i = 1;
    if (etapa_id) { clauses.push(`n.etapa_id = $${i++}`); params.push(etapa_id); }
    if (vendedor_id) { clauses.push(`n.vendedor_id = $${i++}`); params.push(vendedor_id); }
    if (q) { clauses.push(`(n.titulo ILIKE $${i} OR c.nombre ILIKE $${i} OR e.razon_social ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const negocios = await db.all(
      `SELECT n.id, n.titulo, n.etapa_id, n.probabilidad_cierre, n.monto_estimado, n.vendedor_id,
              n.ultima_actividad, n.created_at,
              pe.nombre AS etapa_nombre, pe.tipo AS etapa_tipo, pe.orden AS etapa_orden,
              u.nombre AS vendedor_nombre, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              e.razon_social AS empresa_nombre,
              EXTRACT(DAY FROM now() - n.ultima_actividad)::int AS dias_sin_actividad
       FROM negocios n
       JOIN contactos c ON c.id = n.contacto_id
       LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id
       LEFT JOIN empresas e ON e.id = n.empresa_id
       LEFT JOIN users u ON u.id = n.vendedor_id
       ${where}
       ORDER BY n.ultima_actividad DESC LIMIT 1000`,
      params
    );
    res.json(negocios);
  } catch (err) {
    console.error('[negocios/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/negocios/:id — ficha con timeline
router.get('/:id', async (req, res) => {
  try {
    const negocio = await db.get(
      `SELECT n.*, pe.nombre AS etapa_nombre, pe.tipo AS etapa_tipo,
              u.nombre AS vendedor_nombre, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              c.email AS contacto_email, c.telefono_e164 AS contacto_telefono,
              e.razon_social AS empresa_nombre, ca.nombre AS causa_nombre
       FROM negocios n
       JOIN contactos c ON c.id = n.contacto_id
       LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id
       LEFT JOIN empresas e ON e.id = n.empresa_id
       LEFT JOIN users u ON u.id = n.vendedor_id
       LEFT JOIN causas_no_cierre ca ON ca.id = n.causa_no_cierre_id
       WHERE n.id = $1`,
      [req.params.id]
    );
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    const eventos = await db.all(
      `SELECT t.*, u.nombre AS usuario_nombre FROM timeline t
       LEFT JOIN users u ON u.id = t.usuario_id
       WHERE t.negocio_id = $1 ORDER BY t.created_at DESC LIMIT 200`,
      [req.params.id]
    );
    res.json({ ...negocio, puede_editar: puedeEditar(negocio, req.user), timeline: eventos });
  } catch (err) {
    console.error('[negocios/GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/negocios
router.post('/', authorize('administrador', 'vendedor'), async (req, res) => {
  try {
    const { contacto_id, titulo, empresa_id, monto_estimado, vendedor_id } = req.body;
    if (!contacto_id || !titulo) return res.status(400).json({ error: 'Contacto y título requeridos' });

    const contacto = await db.get('SELECT id, empresa_id FROM contactos WHERE id = $1', [contacto_id]);
    if (!contacto) return res.status(400).json({ error: 'Contacto inexistente' });

    // Etapa inicial: primera abierta por orden.
    const etapaInicial = await db.get(
      `SELECT id, probabilidad_cierre FROM pipeline_etapas WHERE tipo = 'abierta' AND activo = true ORDER BY orden LIMIT 1`
    );
    const dueno = (req.user.rol === 'administrador' && vendedor_id) ? vendedor_id : req.user.id;
    const emp = empresa_id || contacto.empresa_id || null;

    const r = await db.run(
      `INSERT INTO negocios (contacto_id, empresa_id, vendedor_id, titulo, monto_estimado, etapa_id, probabilidad_cierre)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [contacto_id, emp, dueno, titulo, monto_estimado || null,
       etapaInicial ? etapaInicial.id : null, etapaInicial ? etapaInicial.probabilidad_cierre : null]
    );
    const negocio = r.rows[0];
    await timeline.registrar({
      contacto_id, empresa_id: emp, negocio_id: negocio.id, tipo: 'cambio_etapa',
      descripcion: 'Negocio creado', usuario_id: req.user.id,
    });
    res.status(201).json(negocio);
  } catch (err) {
    console.error('[negocios/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/negocios/:id — datos básicos (incluye probabilidad por oportunidad)
router.put('/:id', async (req, res) => {
  try {
    const negocio = await db.get('SELECT * FROM negocios WHERE id = $1', [req.params.id]);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

    const { titulo, monto_estimado, empresa_id, vendedor_id, probabilidad_cierre } = req.body;
    if (probabilidad_cierre !== undefined && probabilidad_cierre !== null &&
        (probabilidad_cierre < 0 || probabilidad_cierre > 100)) {
      return res.status(400).json({ error: 'La probabilidad debe estar entre 0 y 100' });
    }
    const nuevoVendedor = (req.user.rol === 'administrador' && vendedor_id) ? vendedor_id : negocio.vendedor_id;
    await db.run(
      `UPDATE negocios SET titulo=$1, monto_estimado=$2, empresa_id=$3, vendedor_id=$4,
              probabilidad_cierre=$5, ultima_actividad=now() WHERE id=$6`,
      [titulo || negocio.titulo, monto_estimado ?? negocio.monto_estimado, empresa_id ?? negocio.empresa_id,
       nuevoVendedor, probabilidad_cierre ?? negocio.probabilidad_cierre, req.params.id]
    );
    res.json({ message: 'Negocio actualizado' });
  } catch (err) {
    console.error('[negocios/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/negocios/:id/etapa — mover de etapa (kanban)
router.put('/:id/etapa', async (req, res) => {
  try {
    const { etapa_id, causa_no_cierre_id, causa_no_cierre_detalle } = req.body;
    const etapa = await db.get('SELECT * FROM pipeline_etapas WHERE id = $1', [etapa_id]);
    if (!etapa) return res.status(400).json({ error: 'Etapa inválida' });

    const negocio = await db.get(
      `SELECT n.*, pe.nombre AS etapa_nombre FROM negocios n
       LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id WHERE n.id = $1`, [req.params.id]);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

    if (etapa.tipo === 'perdida' && !causa_no_cierre_id) {
      return res.status(400).json({ error: 'La causa de no cierre es obligatoria al marcar perdido' });
    }
    const cierra = etapa.tipo === 'ganada' || etapa.tipo === 'perdida';
    await db.run(
      `UPDATE negocios SET etapa_id=$1, probabilidad_cierre=$2,
              causa_no_cierre_id=$3, causa_no_cierre_detalle=$4, fecha_cierre=$5, ultima_actividad=now()
       WHERE id=$6`,
      [etapa.id, etapa.probabilidad_cierre,
       etapa.tipo === 'perdida' ? causa_no_cierre_id : null,
       etapa.tipo === 'perdida' ? (causa_no_cierre_detalle || null) : null,
       cierra ? new Date().toISOString() : null, req.params.id]
    );
    await timeline.registrar({
      contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id, negocio_id: negocio.id,
      tipo: 'cambio_etapa', descripcion: `Etapa: ${negocio.etapa_nombre || '—'} → ${etapa.nombre}`, usuario_id: req.user.id,
    });
    res.json({ message: 'Etapa actualizada' });
  } catch (err) {
    console.error('[negocios/PUT /:id/etapa]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
