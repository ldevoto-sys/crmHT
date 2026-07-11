const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const timeline = require('../services/timeline');

router.use(authenticate);

const ETAPAS = ['lead', 'calificado', 'cotizado', 'negociacion', 'ganado', 'perdido'];

function puedeEditar(negocio, user) {
  return user.rol === 'administrador' || negocio.vendedor_id === user.id;
}

// GET /api/negocios?etapa=&vendedor_id=&q=
router.get('/', async (req, res) => {
  try {
    const { etapa, vendedor_id, q } = req.query;
    const clauses = [];
    const params = [];
    let i = 1;
    if (etapa) { clauses.push(`n.etapa = $${i++}`); params.push(etapa); }
    if (vendedor_id) { clauses.push(`n.vendedor_id = $${i++}`); params.push(vendedor_id); }
    if (q) { clauses.push(`(n.titulo ILIKE $${i} OR c.nombre ILIKE $${i} OR e.razon_social ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const negocios = await db.all(
      `SELECT n.id, n.titulo, n.etapa, n.monto_estimado, n.vendedor_id, n.ultima_actividad, n.created_at,
              u.nombre AS vendedor_nombre, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              e.razon_social AS empresa_nombre,
              EXTRACT(DAY FROM now() - n.ultima_actividad)::int AS dias_sin_actividad
       FROM negocios n
       JOIN contactos c ON c.id = n.contacto_id
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
      `SELECT n.*, u.nombre AS vendedor_nombre, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              c.email AS contacto_email, c.telefono_e164 AS contacto_telefono,
              e.razon_social AS empresa_nombre, ca.nombre AS causa_nombre
       FROM negocios n
       JOIN contactos c ON c.id = n.contacto_id
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

    // El dueño es el vendedor indicado (solo admin puede asignar a otro) o el usuario actual.
    const dueno = (req.user.rol === 'administrador' && vendedor_id) ? vendedor_id : req.user.id;
    const emp = empresa_id || contacto.empresa_id || null;

    const r = await db.run(
      `INSERT INTO negocios (contacto_id, empresa_id, vendedor_id, titulo, monto_estimado)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [contacto_id, emp, dueno, titulo, monto_estimado || null]
    );
    const negocio = r.rows[0];
    await timeline.registrar({
      contacto_id, empresa_id: emp, negocio_id: negocio.id, tipo: 'cambio_etapa',
      descripcion: 'Negocio creado en etapa "lead"', usuario_id: req.user.id,
    });
    res.status(201).json(negocio);
  } catch (err) {
    console.error('[negocios/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/negocios/:id — datos básicos
router.put('/:id', async (req, res) => {
  try {
    const negocio = await db.get('SELECT * FROM negocios WHERE id = $1', [req.params.id]);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

    const { titulo, monto_estimado, empresa_id, vendedor_id } = req.body;
    const nuevoVendedor = (req.user.rol === 'administrador' && vendedor_id) ? vendedor_id : negocio.vendedor_id;
    await db.run(
      `UPDATE negocios SET titulo=$1, monto_estimado=$2, empresa_id=$3, vendedor_id=$4, ultima_actividad=now() WHERE id=$5`,
      [titulo || negocio.titulo, monto_estimado ?? negocio.monto_estimado, empresa_id ?? negocio.empresa_id, nuevoVendedor, req.params.id]
    );
    res.json({ message: 'Negocio actualizado' });
  } catch (err) {
    console.error('[negocios/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/negocios/:id/etapa — cambio de etapa (drag & drop del kanban)
router.put('/:id/etapa', async (req, res) => {
  try {
    const { etapa, causa_no_cierre_id, causa_no_cierre_detalle } = req.body;
    if (!ETAPAS.includes(etapa)) return res.status(400).json({ error: 'Etapa inválida' });

    const negocio = await db.get('SELECT * FROM negocios WHERE id = $1', [req.params.id]);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

    if (etapa === 'perdido' && !causa_no_cierre_id) {
      return res.status(400).json({ error: 'La causa de no cierre es obligatoria al marcar perdido' });
    }
    const cierra = etapa === 'ganado' || etapa === 'perdido';
    await db.run(
      `UPDATE negocios SET etapa=$1, causa_no_cierre_id=$2, causa_no_cierre_detalle=$3,
              fecha_cierre=$4, ultima_actividad=now() WHERE id=$5`,
      [etapa, etapa === 'perdido' ? causa_no_cierre_id : null,
       etapa === 'perdido' ? (causa_no_cierre_detalle || null) : null,
       cierra ? new Date().toISOString() : null, req.params.id]
    );
    await timeline.registrar({
      contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id, negocio_id: negocio.id,
      tipo: 'cambio_etapa', descripcion: `Etapa: ${negocio.etapa} → ${etapa}`, usuario_id: req.user.id,
    });
    res.json({ message: 'Etapa actualizada' });
  } catch (err) {
    console.error('[negocios/PUT /:id/etapa]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
