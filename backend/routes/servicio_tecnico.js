const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const r2 = require('../services/r2');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

router.use(authenticate);

// Calcado de Postventa, pero sin el concepto de "vendedor dueño del caso": no
// hay pipeline de ventas detrás, así que cualquier usuario con acceso al
// módulo (todos los roles, más el rol dedicado "tecnico") puede ver y
// gestionar cualquier caso. Solo la estructura del tablero (las etapas)
// queda restringida a administrador/jefe_comercial, igual que el resto de
// las pantallas de Configuración.

// --- Etapas de Servicio Técnico ---

// GET /api/servicio-tecnico/etapas
router.get('/etapas', async (req, res) => {
  try {
    const etapas = await db.all('SELECT id, nombre, orden, tipo, activo FROM servicio_tecnico_etapas ORDER BY orden');
    res.json(etapas);
  } catch (err) {
    console.error('[servicio-tecnico/etapas GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/servicio-tecnico/etapas {nombre} — nueva etapa intermedia (abierta)
router.post('/etapas', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const maxAbierta = await db.get(`SELECT COALESCE(MAX(orden),0) AS m FROM servicio_tecnico_etapas WHERE tipo='abierta'`);
    const orden = (maxAbierta.m || 0) + 1;
    await db.run(`UPDATE servicio_tecnico_etapas SET orden = orden + 1 WHERE tipo IN ('resuelto','rechazado') AND orden >= $1`, [orden]);
    const r = await db.run(
      'INSERT INTO servicio_tecnico_etapas (nombre, orden, tipo) VALUES ($1,$2,$3) RETURNING *',
      [nombre, orden, 'abierta']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[servicio-tecnico/etapas POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/servicio-tecnico/etapas/:id — renombrar, orden, activar/desactivar
router.put('/etapas/:id', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const etapa = await db.get('SELECT * FROM servicio_tecnico_etapas WHERE id=$1', [req.params.id]);
    if (!etapa) return res.status(404).json({ error: 'Etapa no encontrada' });
    const { nombre, orden, activo } = req.body;
    const nuevoActivo = etapa.tipo === 'abierta' ? (activo !== undefined ? activo : etapa.activo) : true;
    await db.run(
      'UPDATE servicio_tecnico_etapas SET nombre=$1, orden=$2, activo=$3 WHERE id=$4',
      [nombre || etapa.nombre, orden ?? etapa.orden, nuevoActivo, req.params.id]
    );
    res.json({ message: 'Etapa actualizada' });
  } catch (err) {
    console.error('[servicio-tecnico/etapas PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/servicio-tecnico/etapas/:id — solo intermedias sin casos
router.delete('/etapas/:id', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const etapa = await db.get('SELECT * FROM servicio_tecnico_etapas WHERE id=$1', [req.params.id]);
    if (!etapa) return res.status(404).json({ error: 'Etapa no encontrada' });
    if (etapa.tipo !== 'abierta') return res.status(400).json({ error: 'Las etapas Resuelto y Rechazado no se pueden eliminar' });
    const enUso = await db.get('SELECT id FROM casos_servicio_tecnico WHERE etapa_id=$1 LIMIT 1', [req.params.id]);
    if (enUso) return res.status(409).json({ error: 'Hay casos en esta etapa. Muévelos antes de eliminarla (o desactívala).' });
    await db.run('DELETE FROM servicio_tecnico_etapas WHERE id=$1', [req.params.id]);
    res.json({ message: 'Etapa eliminada' });
  } catch (err) {
    console.error('[servicio-tecnico/etapas DELETE]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Casos ---

// GET /api/servicio-tecnico?etapa_id=&prioridad=
router.get('/', async (req, res) => {
  try {
    const params = [];
    const extra = [];
    let i = 1;
    if (req.query.etapa_id) { extra.push(`ct.etapa_id = $${i++}`); params.push(req.query.etapa_id); }
    if (req.query.prioridad) { extra.push(`ct.prioridad = $${i++}`); params.push(req.query.prioridad); }
    const where = extra.length ? `WHERE ${extra.join(' AND ')}` : '';
    const casos = await db.all(
      `SELECT ct.*, se.nombre AS etapa_nombre, se.tipo AS etapa_tipo,
              c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              e.razon_social AS empresa_nombre, p.nombre AS producto_nombre,
              t.nombre AS tecnico_nombre, u.nombre AS creado_por_nombre,
              n.titulo AS negocio_titulo
       FROM casos_servicio_tecnico ct
       LEFT JOIN servicio_tecnico_etapas se ON se.id = ct.etapa_id
       JOIN contactos c ON c.id = ct.contacto_id
       LEFT JOIN empresas e ON e.id = ct.empresa_id
       LEFT JOIN productos p ON p.id = ct.producto_id
       LEFT JOIN users t ON t.id = ct.tecnico_asignado_id
       LEFT JOIN users u ON u.id = ct.creado_por_id
       LEFT JOIN negocios n ON n.id = ct.negocio_id
       ${where}
       ORDER BY ct.ultima_actividad DESC LIMIT 500`,
      params
    );
    res.json(casos);
  } catch (err) {
    console.error('[servicio-tecnico GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/servicio-tecnico/:id
router.get('/:id', async (req, res) => {
  try {
    const caso = await db.get(
      `SELECT ct.*, se.nombre AS etapa_nombre, se.tipo AS etapa_tipo,
              c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              c.email AS contacto_email, c.telefono_e164 AS contacto_telefono,
              e.razon_social AS empresa_nombre, p.nombre AS producto_nombre,
              t.nombre AS tecnico_nombre, u.nombre AS creado_por_nombre,
              n.titulo AS negocio_titulo
       FROM casos_servicio_tecnico ct
       LEFT JOIN servicio_tecnico_etapas se ON se.id = ct.etapa_id
       JOIN contactos c ON c.id = ct.contacto_id
       LEFT JOIN empresas e ON e.id = ct.empresa_id
       LEFT JOIN productos p ON p.id = ct.producto_id
       LEFT JOIN users t ON t.id = ct.tecnico_asignado_id
       LEFT JOIN users u ON u.id = ct.creado_por_id
       LEFT JOIN negocios n ON n.id = ct.negocio_id
       WHERE ct.id = $1`,
      [req.params.id]
    );
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    res.json(caso);
  } catch (err) {
    console.error('[servicio-tecnico GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/servicio-tecnico — crea un caso. Requiere negocio_id (venta de
// origen) O contacto_id (caso sin venta previa) — no ambos, negocio_id
// tiene prioridad si llegan los dos.
router.post('/', async (req, res) => {
  try {
    const { negocio_id, contacto_id, titulo, descripcion, producto_id, detalle_equipo, prioridad, fecha_compromiso } = req.body;
    if (!negocio_id && !contacto_id) return res.status(400).json({ error: 'Selecciona el negocio de origen o el contacto del caso' });
    if (!titulo) return res.status(400).json({ error: 'El título es requerido' });

    let contactoFinal, empresaFinal, negocioFinal = null;
    if (negocio_id) {
      const negocio = await db.get('SELECT id, contacto_id, empresa_id FROM negocios WHERE id = $1', [negocio_id]);
      if (!negocio) return res.status(400).json({ error: 'Negocio inexistente' });
      negocioFinal = negocio.id; contactoFinal = negocio.contacto_id; empresaFinal = negocio.empresa_id;
    } else {
      const contacto = await db.get('SELECT id, empresa_id FROM contactos WHERE id = $1', [contacto_id]);
      if (!contacto) return res.status(400).json({ error: 'Contacto inexistente' });
      contactoFinal = contacto.id; empresaFinal = contacto.empresa_id;
    }

    const primeraEtapa = await db.get(`SELECT id FROM servicio_tecnico_etapas WHERE tipo = 'abierta' AND activo = true ORDER BY orden LIMIT 1`);

    const r = await db.run(
      `INSERT INTO casos_servicio_tecnico
         (negocio_id, contacto_id, empresa_id, producto_id, detalle_equipo, titulo, descripcion, prioridad, fecha_compromiso, creado_por_id, etapa_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [negocioFinal, contactoFinal, empresaFinal, producto_id || null, detalle_equipo || null,
       titulo, descripcion || null, prioridad || 'media', fecha_compromiso || null,
       req.user.id, primeraEtapa ? primeraEtapa.id : null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[servicio-tecnico POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/servicio-tecnico/:id — editar datos del caso
router.put('/:id', async (req, res) => {
  try {
    const caso = await db.get('SELECT * FROM casos_servicio_tecnico WHERE id = $1', [req.params.id]);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const { titulo, descripcion, producto_id, detalle_equipo, prioridad, fecha_compromiso, tecnico_asignado_id } = req.body;
    await db.run(
      `UPDATE casos_servicio_tecnico SET titulo=$1, descripcion=$2, producto_id=$3, detalle_equipo=$4,
              prioridad=$5, fecha_compromiso=$6, tecnico_asignado_id=$7, ultima_actividad=now()
       WHERE id=$8`,
      [titulo || caso.titulo, descripcion ?? caso.descripcion, producto_id ?? caso.producto_id,
       detalle_equipo ?? caso.detalle_equipo, prioridad || caso.prioridad,
       fecha_compromiso !== undefined ? (fecha_compromiso || null) : caso.fecha_compromiso,
       tecnico_asignado_id !== undefined ? (tecnico_asignado_id || null) : caso.tecnico_asignado_id,
       req.params.id]
    );
    res.json({ message: 'Caso actualizado' });
  } catch (err) {
    console.error('[servicio-tecnico PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/servicio-tecnico/:id/etapa — mover de etapa
router.put('/:id/etapa', async (req, res) => {
  try {
    const { etapa_id } = req.body;
    const etapa = await db.get('SELECT * FROM servicio_tecnico_etapas WHERE id = $1', [etapa_id]);
    if (!etapa) return res.status(400).json({ error: 'Etapa inválida' });

    const caso = await db.get('SELECT * FROM casos_servicio_tecnico WHERE id = $1', [req.params.id]);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const cierra = etapa.tipo === 'resuelto' || etapa.tipo === 'rechazado';
    await db.run(
      `UPDATE casos_servicio_tecnico SET etapa_id=$1, fecha_cierre=$2, ultima_actividad=now() WHERE id=$3`,
      [etapa.id, cierra ? new Date().toISOString() : null, req.params.id]
    );
    res.json({ message: 'Etapa actualizada' });
  } catch (err) {
    console.error('[servicio-tecnico PUT /:id/etapa]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// === Adjuntos de un caso (fotos/videos del cliente, informes técnicos, otros) ===

// GET /api/servicio-tecnico/:id/adjuntos
router.get('/:id/adjuntos', async (req, res) => {
  try {
    const caso = await db.get('SELECT id FROM casos_servicio_tecnico WHERE id = $1', [req.params.id]);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const adjuntos = await db.all(
      `SELECT sa.id, sa.tipo, sa.descripcion, sa.archivo_nombre, sa.archivo_mime, sa.created_at,
              sa.subido_por_id, u.nombre AS subido_por_nombre
       FROM servicio_tecnico_adjuntos sa
       LEFT JOIN users u ON u.id = sa.subido_por_id
       WHERE sa.caso_id = $1 ORDER BY sa.created_at DESC`,
      [req.params.id]
    );
    res.json(adjuntos);
  } catch (err) {
    console.error('[servicio-tecnico GET /:id/adjuntos]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/servicio-tecnico/:id/adjuntos — multipart, campo "archivo" + {tipo, descripcion}
router.post('/:id/adjuntos', upload.single('archivo'), async (req, res) => {
  try {
    const caso = await db.get('SELECT id FROM casos_servicio_tecnico WHERE id = $1', [req.params.id]);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    if (!r2.configuradoDespacho()) {
      return res.status(503).json({ error: 'El almacenamiento de adjuntos no está configurado todavía.' });
    }

    const { tipo, descripcion } = req.body;
    const tipoFinal = ['foto_cliente', 'video_cliente', 'informe_tecnico', 'otro'].includes(tipo) ? tipo : 'otro';
    const ext = (req.file.originalname.match(/\.[^.]+$/) || [''])[0];
    const key = `servicio-tecnico/${req.params.id}/${crypto.randomBytes(8).toString('hex')}${ext}`;
    const r = await r2.subirDespacho(key, req.file.buffer, req.file.mimetype);
    if (!r.subido) return res.status(502).json({ error: r.motivo || 'No se pudo subir el archivo' });

    const insertado = await db.run(
      `INSERT INTO servicio_tecnico_adjuntos (caso_id, tipo, descripcion, archivo_key, archivo_nombre, archivo_mime, subido_por_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.params.id, tipoFinal, descripcion || null, key, req.file.originalname, req.file.mimetype, req.user.id]
    );
    await db.run('UPDATE casos_servicio_tecnico SET ultima_actividad = now() WHERE id = $1', [req.params.id]);
    res.status(201).json({ id: insertado.rows[0].id, message: 'Adjunto subido' });
  } catch (err) {
    console.error('[servicio-tecnico POST /:id/adjuntos]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/servicio-tecnico/adjuntos/:adjuntoId/archivo — descarga autenticada
router.get('/adjuntos/:adjuntoId/archivo', async (req, res) => {
  try {
    const adjunto = await db.get('SELECT * FROM servicio_tecnico_adjuntos WHERE id = $1', [req.params.adjuntoId]);
    if (!adjunto) return res.status(404).json({ error: 'Adjunto no encontrado' });
    const archivo = await r2.descargarDespacho(adjunto.archivo_key);
    if (!archivo) return res.status(502).json({ error: 'No se pudo obtener el archivo' });
    res.setHeader('Content-Type', archivo.contentType || adjunto.archivo_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${adjunto.archivo_nombre || 'adjunto'}"`);
    res.send(archivo.buffer);
  } catch (err) {
    console.error('[servicio-tecnico GET /adjuntos/:adjuntoId/archivo]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/servicio-tecnico/adjuntos/:adjuntoId — quien lo subió, o administrador/jefe_comercial
router.delete('/adjuntos/:adjuntoId', async (req, res) => {
  try {
    const adjunto = await db.get('SELECT * FROM servicio_tecnico_adjuntos WHERE id = $1', [req.params.adjuntoId]);
    if (!adjunto) return res.status(404).json({ error: 'Adjunto no encontrado' });
    const puedeEliminar = adjunto.subido_por_id === req.user.id || ['administrador', 'jefe_comercial'].includes(req.user.rol);
    if (!puedeEliminar) return res.status(403).json({ error: 'Solo quien lo subió, o administrador/jefe comercial, puede eliminarlo' });
    await db.run('DELETE FROM servicio_tecnico_adjuntos WHERE id = $1', [req.params.adjuntoId]);
    res.json({ message: 'Adjunto eliminado' });
  } catch (err) {
    console.error('[servicio-tecnico DELETE /adjuntos/:adjuntoId]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
