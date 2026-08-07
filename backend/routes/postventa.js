const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const r2 = require('../services/r2');
const { enviarPostventaVencidosSiHay } = require('../services/postventaVencidos');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

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

// Mismo criterio que ver el detalle del caso (GET /:id): quien gestiona
// Postventa, o el vendedor que creó ese caso en particular.
function puedeAccederCaso(caso, user) {
  return puedeGestionar(user) || caso.creado_por_id === user.id;
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

// POST /api/postventa — crea un caso (vendedor, admin, jefe comercial).
// Requiere venta de origen (negocio_id) O un contacto directo (contacto_id)
// para casos sin venta previa — no ambos, negocio_id tiene prioridad si
// llegan los dos.
router.post('/', authorize('administrador', 'jefe_comercial', 'vendedor'), async (req, res) => {
  try {
    const { negocio_id, contacto_id, titulo, descripcion, producto_id, detalle_equipo, prioridad, fecha_limite_respuesta } = req.body;
    if (!negocio_id && !contacto_id) return res.status(400).json({ error: 'Selecciona el negocio de origen o el contacto del caso' });
    if (!titulo) return res.status(400).json({ error: 'El título es requerido' });
    if (!fecha_limite_respuesta) return res.status(400).json({ error: 'La fecha límite de respuesta es requerida' });

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

    const primeraEtapa = await db.get(`SELECT id FROM postventa_etapas WHERE tipo = 'abierta' AND activo = true ORDER BY orden LIMIT 1`);

    const r = await db.run(
      `INSERT INTO casos_postventa
         (negocio_id, contacto_id, empresa_id, producto_id, detalle_equipo, titulo, descripcion, prioridad, fecha_limite_respuesta, creado_por_id, etapa_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [negocioFinal, contactoFinal, empresaFinal, producto_id || null, detalle_equipo || null,
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

// === Adjuntos de un caso (fotos/videos del cliente, informes técnicos, otros) ===

// GET /api/postventa/:id/adjuntos
router.get('/:id/adjuntos', async (req, res) => {
  try {
    const caso = await db.get('SELECT id, creado_por_id FROM casos_postventa WHERE id = $1', [req.params.id]);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (!puedeAccederCaso(caso, req.user)) return res.status(403).json({ error: 'Sin permiso' });

    const adjuntos = await db.all(
      `SELECT pa.id, pa.tipo, pa.descripcion, pa.archivo_nombre, pa.archivo_mime, pa.created_at,
              pa.subido_por_id, u.nombre AS subido_por_nombre
       FROM postventa_adjuntos pa
       LEFT JOIN users u ON u.id = pa.subido_por_id
       WHERE pa.caso_id = $1 ORDER BY pa.created_at DESC`,
      [req.params.id]
    );
    res.json(adjuntos);
  } catch (err) {
    console.error('[postventa GET /:id/adjuntos]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/postventa/:id/adjuntos — multipart, campo "archivo" + {tipo, descripcion}
router.post('/:id/adjuntos', upload.single('archivo'), async (req, res) => {
  try {
    const caso = await db.get('SELECT id, creado_por_id FROM casos_postventa WHERE id = $1', [req.params.id]);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (!puedeAccederCaso(caso, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    if (!r2.configuradoDespacho()) {
      return res.status(503).json({ error: 'El almacenamiento de adjuntos no está configurado todavía.' });
    }

    const { tipo, descripcion } = req.body;
    const tipoFinal = ['foto_cliente', 'video_cliente', 'informe_tecnico', 'otro'].includes(tipo) ? tipo : 'otro';
    const ext = (req.file.originalname.match(/\.[^.]+$/) || [''])[0];
    const key = `postventa/${req.params.id}/${crypto.randomBytes(8).toString('hex')}${ext}`;
    const r = await r2.subirDespacho(key, req.file.buffer, req.file.mimetype);
    if (!r.subido) return res.status(502).json({ error: r.motivo || 'No se pudo subir el archivo' });

    const insertado = await db.run(
      `INSERT INTO postventa_adjuntos (caso_id, tipo, descripcion, archivo_key, archivo_nombre, archivo_mime, subido_por_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.params.id, tipoFinal, descripcion || null, key, req.file.originalname, req.file.mimetype, req.user.id]
    );
    await db.run('UPDATE casos_postventa SET ultima_actividad = now() WHERE id = $1', [req.params.id]);
    res.status(201).json({ id: insertado.rows[0].id, message: 'Adjunto subido' });
  } catch (err) {
    console.error('[postventa POST /:id/adjuntos]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/postventa/adjuntos/:adjuntoId/archivo — descarga autenticada
router.get('/adjuntos/:adjuntoId/archivo', async (req, res) => {
  try {
    const adjunto = await db.get(
      `SELECT pa.*, cp.creado_por_id FROM postventa_adjuntos pa
       JOIN casos_postventa cp ON cp.id = pa.caso_id WHERE pa.id = $1`,
      [req.params.adjuntoId]
    );
    if (!adjunto) return res.status(404).json({ error: 'Adjunto no encontrado' });
    if (!puedeAccederCaso({ creado_por_id: adjunto.creado_por_id }, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const archivo = await r2.descargarDespacho(adjunto.archivo_key);
    if (!archivo) return res.status(502).json({ error: 'No se pudo obtener el archivo' });
    res.setHeader('Content-Type', archivo.contentType || adjunto.archivo_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${adjunto.archivo_nombre || 'adjunto'}"`);
    res.send(archivo.buffer);
  } catch (err) {
    console.error('[postventa GET /adjuntos/:adjuntoId/archivo]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/postventa/adjuntos/:adjuntoId — quien gestiona, o quien lo subió
router.delete('/adjuntos/:adjuntoId', async (req, res) => {
  try {
    const adjunto = await db.get('SELECT * FROM postventa_adjuntos WHERE id = $1', [req.params.adjuntoId]);
    if (!adjunto) return res.status(404).json({ error: 'Adjunto no encontrado' });
    if (!puedeGestionar(req.user) && adjunto.subido_por_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo quien lo subió o el encargado de postventa puede eliminarlo' });
    }
    await db.run('DELETE FROM postventa_adjuntos WHERE id = $1', [req.params.adjuntoId]);
    res.json({ message: 'Adjunto eliminado' });
  } catch (err) {
    console.error('[postventa DELETE /adjuntos/:adjuntoId]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/postventa/vencidos/enviar-ahora — dispara el aviso de casos
// vencidos fuera de su horario programado (8:30am), para probarlo o
// reenviarlo tras una falla. Reenvía aunque ya se haya enviado hoy.
router.post('/vencidos/enviar-ahora', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const resultado = await enviarPostventaVencidosSiHay();
    res.json(resultado);
  } catch (err) {
    console.error('[postventa/vencidos/enviar-ahora]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
