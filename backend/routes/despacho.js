const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const r2 = require('../services/r2');
const googlemaps = require('../services/googlemaps');

router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

// "Gestionar" (agregar/editar paradas, marcarlas completadas, subir fotos,
// ver todos los despachos) es de administrador/jefe comercial, o de
// Minutos desde medianoche -> "HH:MM" (mod 24h; una ruta de un día no
// debería cruzar medianoche, pero se acota igual por si acaso).
function formatoHora(minutos) {
  const m = ((minutos % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// cualquier usuario con el atributo es_encargado_despacho marcado —
// independiente de su rol, mismo patrón que Postventa.
function puedeGestionar(user) {
  return user.rol === 'administrador' || user.rol === 'jefe_comercial' || user.es_encargado_despacho === true;
}

function filtroVisibilidad(user) {
  if (puedeGestionar(user)) return { where: '', params: [] };
  return { where: 'WHERE d.creado_por_id = $1', params: [user.id] };
}

// --- Lugares frecuentes de retiro/entrega (config) ---

// GET /api/despachos/lugares-frecuentes — cualquier usuario autenticado
// puede leerlos (los necesita para autocompletar una nueva parada).
router.get('/lugares-frecuentes', async (req, res) => {
  try {
    const lugares = await db.all(
      'SELECT * FROM despacho_lugares_frecuentes WHERE activo = true ORDER BY nombre'
    );
    res.json(lugares);
  } catch (err) {
    console.error('[despachos/lugares-frecuentes GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/despachos/lugares-frecuentes — solo quien gestiona despacho
router.post('/lugares-frecuentes', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const { nombre, direccion, comuna, contacto_nombre, contacto_telefono } = req.body;
    if (!nombre || !direccion || !comuna) return res.status(400).json({ error: 'Nombre, dirección y comuna son requeridos' });
    const r = await db.run(
      `INSERT INTO despacho_lugares_frecuentes (nombre, direccion, comuna, contacto_nombre, contacto_telefono)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nombre, direccion, comuna, contacto_nombre || null, contacto_telefono || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[despachos/lugares-frecuentes POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/despachos/lugares-frecuentes/:id
router.put('/lugares-frecuentes/:id', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const lugar = await db.get('SELECT * FROM despacho_lugares_frecuentes WHERE id = $1', [req.params.id]);
    if (!lugar) return res.status(404).json({ error: 'Lugar no encontrado' });
    const { nombre, direccion, comuna, contacto_nombre, contacto_telefono, activo } = req.body;
    await db.run(
      `UPDATE despacho_lugares_frecuentes SET nombre=$1, direccion=$2, comuna=$3, contacto_nombre=$4, contacto_telefono=$5, activo=$6
       WHERE id=$7`,
      [nombre || lugar.nombre, direccion || lugar.direccion, comuna || lugar.comuna,
       contacto_nombre !== undefined ? (contacto_nombre || null) : lugar.contacto_nombre,
       contacto_telefono !== undefined ? (contacto_telefono || null) : lugar.contacto_telefono,
       activo !== undefined ? activo === true : lugar.activo, req.params.id]
    );
    res.json({ message: 'Lugar actualizado' });
  } catch (err) {
    console.error('[despachos/lugares-frecuentes PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/despachos/lugares-frecuentes/:id — desactiva (no borra, por si
// alguna parada ya creada lo referencia en su historial de auditoría).
router.delete('/lugares-frecuentes/:id', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const lugar = await db.get('SELECT id FROM despacho_lugares_frecuentes WHERE id = $1', [req.params.id]);
    if (!lugar) return res.status(404).json({ error: 'Lugar no encontrado' });
    await db.run('UPDATE despacho_lugares_frecuentes SET activo = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Lugar desactivado' });
  } catch (err) {
    console.error('[despachos/lugares-frecuentes DELETE]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

async function cargarPuntos(despachoId) {
  return db.all(
    `SELECT id, despacho_id, orden, tipo, direccion, comuna, fecha, contacto_nombre, contacto_telefono,
            documento_tipo, documento_numero, duracion_estimada_min, completado, completado_en,
            (foto_respaldo_key IS NOT NULL) AS tiene_foto
     FROM despacho_puntos WHERE despacho_id = $1 ORDER BY orden`,
    [despachoId]
  );
}

// GET /api/despachos?desde=&hasta=&estado= — filtra por la fecha de
// cualquiera de sus puntos (para la vista de lista/calendario).
router.get('/', async (req, res) => {
  try {
    const { where, params } = filtroVisibilidad(req.user);
    const extra = [];
    let i = params.length + 1;
    if (req.query.estado) { extra.push(`d.estado = $${i++}`); params.push(req.query.estado); }
    let joinFecha = '';
    if (req.query.desde || req.query.hasta) {
      const condFecha = [];
      if (req.query.desde) { condFecha.push(`dp.fecha >= $${i++}`); params.push(req.query.desde); }
      if (req.query.hasta) { condFecha.push(`dp.fecha <= $${i++}`); params.push(req.query.hasta); }
      joinFecha = `AND EXISTS (SELECT 1 FROM despacho_puntos dp WHERE dp.despacho_id = d.id AND ${condFecha.join(' AND ')})`;
    }
    const whereFinal = (where || extra.length)
      ? `${where || 'WHERE 1=1'} ${extra.length ? 'AND ' + extra.join(' AND ') : ''} ${joinFecha}`
      : (joinFecha ? `WHERE 1=1 ${joinFecha}` : '');
    const despachos = await db.all(
      `SELECT d.*, n.titulo AS negocio_titulo, cp.titulo AS caso_postventa_titulo, u.nombre AS creado_por_nombre,
              (SELECT MIN(fecha) FROM despacho_puntos WHERE despacho_id = d.id) AS primera_fecha
       FROM despachos d
       LEFT JOIN negocios n ON n.id = d.negocio_id
       LEFT JOIN casos_postventa cp ON cp.id = d.caso_postventa_id
       LEFT JOIN users u ON u.id = d.creado_por_id
       ${whereFinal}
       ORDER BY primera_fecha NULLS LAST, d.created_at DESC
       LIMIT 300`,
      params
    );
    for (const d of despachos) d.puntos = await cargarPuntos(d.id);
    res.json(despachos);
  } catch (err) {
    console.error('[despachos GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/despachos/:id
router.get('/:id', async (req, res) => {
  try {
    const despacho = await db.get(
      `SELECT d.*, n.titulo AS negocio_titulo, cp.titulo AS caso_postventa_titulo, u.nombre AS creado_por_nombre
       FROM despachos d
       LEFT JOIN negocios n ON n.id = d.negocio_id
       LEFT JOIN casos_postventa cp ON cp.id = d.caso_postventa_id
       LEFT JOIN users u ON u.id = d.creado_por_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!despacho) return res.status(404).json({ error: 'Despacho no encontrado' });
    if (!puedeGestionar(req.user) && despacho.creado_por_id !== req.user.id) return res.status(403).json({ error: 'Sin permiso' });
    despacho.puntos = await cargarPuntos(despacho.id);
    despacho.puede_gestionar = puedeGestionar(req.user);
    res.json(despacho);
  } catch (err) {
    console.error('[despachos GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

function validarPunto(p) {
  if (!p.tipo || !['retiro', 'entrega'].includes(p.tipo)) return 'Tipo de parada inválido (retiro o entrega)';
  if (!p.direccion) return 'Dirección requerida en cada parada';
  if (!p.comuna) return 'Comuna requerida en cada parada';
  if (!p.fecha) return 'Fecha requerida en cada parada';
  if (!p.contacto_nombre) return 'Datos de contacto requeridos en cada parada';
  if (!p.documento_tipo || !['factura', 'guia_despacho', 'orden_compra', 'otro'].includes(p.documento_tipo)) {
    return 'Tipo de documento inválido en cada parada';
  }
  return null;
}

// POST /api/despachos {negocio_id?, caso_postventa_id?, titulo, puntos: [...]}
router.post('/', authorize('administrador', 'jefe_comercial', 'vendedor'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { negocio_id, caso_postventa_id, titulo, puntos } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título requerido' });
    if (!Array.isArray(puntos) || puntos.length === 0) return res.status(400).json({ error: 'Se requiere al menos una parada' });
    for (const p of puntos) {
      const err = validarPunto(p);
      if (err) return res.status(400).json({ error: err });
    }
    if (negocio_id) {
      const negocio = await db.get('SELECT id FROM negocios WHERE id = $1', [negocio_id]);
      if (!negocio) return res.status(400).json({ error: 'Negocio inexistente' });
    }
    if (caso_postventa_id) {
      const caso = await db.get('SELECT id FROM casos_postventa WHERE id = $1', [caso_postventa_id]);
      if (!caso) return res.status(400).json({ error: 'Caso de postventa inexistente' });
    }

    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO despachos (negocio_id, caso_postventa_id, titulo, creado_por_id) VALUES ($1,$2,$3,$4) RETURNING id`,
      [negocio_id || null, caso_postventa_id || null, titulo, req.user.id]
    );
    const despachoId = r.rows[0].id;
    let orden = 1;
    for (const p of puntos) {
      await client.query(
        `INSERT INTO despacho_puntos
           (despacho_id, orden, tipo, direccion, comuna, fecha, contacto_nombre, contacto_telefono, documento_tipo, documento_numero, duracion_estimada_min)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [despachoId, orden++, p.tipo, p.direccion, p.comuna, p.fecha, p.contacto_nombre,
         p.contacto_telefono || null, p.documento_tipo, p.documento_numero || null, p.duracion_estimada_min || null]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: despachoId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[despachos POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// PUT /api/despachos/:id — título/estado (gestor)
router.put('/:id', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const despacho = await db.get('SELECT * FROM despachos WHERE id = $1', [req.params.id]);
    if (!despacho) return res.status(404).json({ error: 'Despacho no encontrado' });
    const { titulo, estado } = req.body;
    if (estado && !['programado', 'en_ruta', 'cancelado'].includes(estado)) {
      // "completado" no se elige a mano: sale solo cuando todas las paradas
      // quedan completadas (ver PUT /puntos/:id/completar).
      return res.status(400).json({ error: 'El estado "Completado" se determina automáticamente cuando todas las paradas están completadas.' });
    }
    await db.run(
      `UPDATE despachos SET titulo=$1, estado=$2, ultima_actividad=now() WHERE id=$3`,
      [titulo || despacho.titulo, estado || despacho.estado, req.params.id]
    );
    res.json({ message: 'Despacho actualizado' });
  } catch (err) {
    console.error('[despachos PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/despachos/:id/puntos — agregar una parada más a un despacho existente (gestor)
router.post('/:id/puntos', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const despacho = await db.get('SELECT id FROM despachos WHERE id = $1', [req.params.id]);
    if (!despacho) return res.status(404).json({ error: 'Despacho no encontrado' });
    const p = req.body;
    const err = validarPunto(p);
    if (err) return res.status(400).json({ error: err });
    const maxOrden = await db.get('SELECT COALESCE(MAX(orden),0) AS m FROM despacho_puntos WHERE despacho_id = $1', [req.params.id]);
    const r = await db.run(
      `INSERT INTO despacho_puntos
         (despacho_id, orden, tipo, direccion, comuna, fecha, contacto_nombre, contacto_telefono, documento_tipo, documento_numero, duracion_estimada_min)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.id, (maxOrden.m || 0) + 1, p.tipo, p.direccion, p.comuna, p.fecha, p.contacto_nombre,
       p.contacto_telefono || null, p.documento_tipo, p.documento_numero || null, p.duracion_estimada_min || null]
    );
    // La parada nueva nace sin completar — si la ruta ya estaba "Completado",
    // deja de estarlo hasta que también se complete esta parada.
    await db.run(`UPDATE despachos SET estado = 'en_ruta' WHERE id = $1 AND estado = 'completado'`, [req.params.id]);
    await db.run('UPDATE despachos SET ultima_actividad = now() WHERE id = $1', [req.params.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[despachos POST /:id/puntos]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/despachos/puntos/:id — editar una parada (gestor)
router.put('/puntos/:id', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const punto = await db.get('SELECT * FROM despacho_puntos WHERE id = $1', [req.params.id]);
    if (!punto) return res.status(404).json({ error: 'Parada no encontrada' });
    const p = req.body;
    const err = validarPunto({ ...punto, ...p });
    if (err) return res.status(400).json({ error: err });
    // Si cambia dirección o comuna, se invalidan las coordenadas cacheadas
    // para que la próxima optimización de ruta las vuelva a geocodificar.
    const direccionCambio = (p.direccion !== undefined && p.direccion !== punto.direccion)
      || (p.comuna !== undefined && p.comuna !== punto.comuna);
    await db.run(
      `UPDATE despacho_puntos SET tipo=$1, direccion=$2, comuna=$3, fecha=$4, contacto_nombre=$5,
              contacto_telefono=$6, documento_tipo=$7, documento_numero=$8, duracion_estimada_min=$9,
              lat=$10, lng=$11
       WHERE id=$12`,
      [p.tipo ?? punto.tipo, p.direccion ?? punto.direccion, p.comuna ?? punto.comuna, p.fecha ?? punto.fecha,
       p.contacto_nombre ?? punto.contacto_nombre, p.contacto_telefono ?? punto.contacto_telefono,
       p.documento_tipo ?? punto.documento_tipo, p.documento_numero ?? punto.documento_numero,
       p.duracion_estimada_min ?? punto.duracion_estimada_min,
       direccionCambio ? null : punto.lat, direccionCambio ? null : punto.lng, req.params.id]
    );
    await db.run('UPDATE despachos SET ultima_actividad = now() WHERE id = $1', [punto.despacho_id]);
    res.json({ message: 'Parada actualizada' });
  } catch (err) {
    console.error('[despachos PUT /puntos/:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/despachos/puntos/:id/completar {completado} (gestor)
router.put('/puntos/:id/completar', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const punto = await db.get('SELECT * FROM despacho_puntos WHERE id = $1', [req.params.id]);
    if (!punto) return res.status(404).json({ error: 'Parada no encontrada' });
    const completado = req.body.completado !== false;
    if (completado && !punto.foto_respaldo_key) {
      return res.status(400).json({ error: 'Sube la foto de respaldo antes de marcar esta parada como completada.' });
    }
    await db.run(
      'UPDATE despacho_puntos SET completado=$1, completado_en=$2 WHERE id=$3',
      [completado, completado ? new Date().toISOString() : null, req.params.id]
    );

    // El estado general de la ruta refleja el avance de sus paradas — no se
    // elige "Completado" a mano (ver PUT /:id). Si una ruta fue cancelada a
    // mano, se respeta esa decisión y no se revierte sola.
    const despacho = await db.get('SELECT estado FROM despachos WHERE id = $1', [punto.despacho_id]);
    if (despacho.estado !== 'cancelado') {
      const resumen = await db.get(
        `SELECT count(*) AS total, count(*) FILTER (WHERE completado) AS completadas
         FROM despacho_puntos WHERE despacho_id = $1`,
        [punto.despacho_id]
      );
      const todasCompletadas = Number(resumen.total) > 0 && Number(resumen.completadas) === Number(resumen.total);
      let nuevoEstado = despacho.estado;
      if (todasCompletadas) nuevoEstado = 'completado';
      else if (despacho.estado === 'completado') nuevoEstado = 'en_ruta';
      if (nuevoEstado !== despacho.estado) {
        await db.run('UPDATE despachos SET estado = $1 WHERE id = $2', [nuevoEstado, punto.despacho_id]);
      }
    }

    await db.run('UPDATE despachos SET ultima_actividad = now() WHERE id = $1', [punto.despacho_id]);
    res.json({ message: 'Parada actualizada' });
  } catch (err) {
    console.error('[despachos PUT /puntos/:id/completar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/despachos/puntos/:id (gestor)
router.delete('/puntos/:id', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const punto = await db.get('SELECT id, despacho_id FROM despacho_puntos WHERE id = $1', [req.params.id]);
    if (!punto) return res.status(404).json({ error: 'Parada no encontrada' });
    await db.run('DELETE FROM despacho_puntos WHERE id = $1', [req.params.id]);
    // Si al eliminar esta parada las que quedan están todas completadas, la
    // ruta pasa a "Completado" sola (mismo criterio que al marcar una parada).
    const despacho = await db.get('SELECT estado FROM despachos WHERE id = $1', [punto.despacho_id]);
    if (despacho && despacho.estado !== 'cancelado') {
      const resumen = await db.get(
        `SELECT count(*) AS total, count(*) FILTER (WHERE completado) AS completadas
         FROM despacho_puntos WHERE despacho_id = $1`,
        [punto.despacho_id]
      );
      if (Number(resumen.total) > 0 && Number(resumen.completadas) === Number(resumen.total) && despacho.estado !== 'completado') {
        await db.run(`UPDATE despachos SET estado = 'completado' WHERE id = $1`, [punto.despacho_id]);
      }
    }
    res.json({ message: 'Parada eliminada' });
  } catch (err) {
    console.error('[despachos DELETE /puntos/:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/despachos/puntos/:id/foto — foto de respaldo (guía/factura/O.C.
// firmada) subida desde el celular al bucket privado de R2 (gestor).
router.post('/puntos/:id/foto', upload.single('archivo'), async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const punto = await db.get('SELECT * FROM despacho_puntos WHERE id = $1', [req.params.id]);
    if (!punto) return res.status(404).json({ error: 'Parada no encontrada' });
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    if (!r2.configuradoDespacho()) {
      return res.status(503).json({ error: 'El almacenamiento de documentos de despacho no está configurado todavía.' });
    }
    const ext = (req.file.originalname.match(/\.[^.]+$/) || ['.jpg'])[0];
    const key = `despacho/${punto.despacho_id}/${punto.id}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const r = await r2.subirDespacho(key, req.file.buffer, req.file.mimetype);
    if (!r.subido) return res.status(502).json({ error: r.motivo || 'No se pudo subir la foto' });
    await db.run('UPDATE despacho_puntos SET foto_respaldo_key = $1 WHERE id = $2', [key, req.params.id]);
    res.json({ message: 'Foto subida' });
  } catch (err) {
    console.error('[despachos POST /puntos/:id/foto]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/despachos/puntos/:id/foto — descarga autenticada (no es un bucket
// público, así que el frontend la trae como blob, igual que los adjuntos de WhatsApp).
router.get('/puntos/:id/foto', async (req, res) => {
  try {
    const punto = await db.get(
      `SELECT dp.*, d.creado_por_id FROM despacho_puntos dp JOIN despachos d ON d.id = dp.despacho_id WHERE dp.id = $1`,
      [req.params.id]
    );
    if (!punto) return res.status(404).json({ error: 'Parada no encontrada' });
    if (!puedeGestionar(req.user) && punto.creado_por_id !== req.user.id) return res.status(403).json({ error: 'Sin permiso' });
    if (!punto.foto_respaldo_key) return res.status(404).json({ error: 'Esta parada no tiene foto de respaldo' });
    const archivo = await r2.descargarDespacho(punto.foto_respaldo_key);
    if (!archivo) return res.status(502).json({ error: 'No se pudo obtener la foto' });
    res.setHeader('Content-Type', archivo.contentType || 'image/jpeg');
    res.send(archivo.buffer);
  } catch (err) {
    console.error('[despachos GET /puntos/:id/foto]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/despachos/:id/optimizar-ruta (gestor) — sugiere el orden más
// eficiente para visitar las paradas pendientes del despacho (ida y vuelta
// desde la dirección de la empresa). No modifica nada: solo propone.
router.post('/:id/optimizar-ruta', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    if (!googlemaps.configurado()) {
      return res.status(400).json({ error: 'La optimización de ruta con Google Maps no está configurada todavía.' });
    }
    const despacho = await db.get('SELECT id FROM despachos WHERE id = $1', [req.params.id]);
    if (!despacho) return res.status(404).json({ error: 'Despacho no encontrado' });

    const paradas = await db.all(
      'SELECT * FROM despacho_puntos WHERE despacho_id = $1 AND completado = false ORDER BY orden',
      [req.params.id]
    );
    if (paradas.length < 2) {
      return res.status(400).json({ error: 'Se necesitan al menos 2 paradas pendientes para optimizar la ruta.' });
    }
    const fechas = new Set(paradas.map(p => new Date(p.fecha).toISOString().slice(0, 10)));
    if (fechas.size > 1) {
      return res.status(400).json({ error: 'Las paradas pendientes tienen fechas distintas — optimizar ruta solo funciona para paradas de un mismo día.' });
    }

    const empresa = await db.get('SELECT direccion, comuna FROM config_empresa WHERE id = 1');
    if (!empresa?.direccion || !empresa?.comuna) {
      return res.status(400).json({ error: 'Falta la dirección de la empresa en Configuración → Datos de empresa.' });
    }
    const origen = await googlemaps.geocodificar(empresa.direccion, empresa.comuna);
    if (!origen.ok) return res.status(400).json({ error: `Dirección de la empresa: ${origen.motivo}` });

    // Geocodifica las paradas que no tengan coordenadas cacheadas todavía.
    for (const p of paradas) {
      if (p.lat != null && p.lng != null) continue;
      const geo = await googlemaps.geocodificar(p.direccion, p.comuna);
      if (!geo.ok) return res.status(400).json({ error: `Parada "${p.direccion}, ${p.comuna}": ${geo.motivo}` });
      await db.run('UPDATE despacho_puntos SET lat=$1, lng=$2 WHERE id=$3', [geo.lat, geo.lng, p.id]);
      p.lat = geo.lat; p.lng = geo.lng;
    }

    const resultado = await googlemaps.optimizarRuta(origen, paradas);
    if (!resultado.ok) return res.status(400).json({ error: resultado.motivo });

    const ordenSugerido = resultado.ordenSugerido.map(i => paradas[i].id);

    // Hora de llegada/salida estimada por parada, si se indicó una hora de
    // salida — se arrastra el tiempo de viaje de cada tramo más el tiempo
    // estimado que la parada anterior toma en sitio (duracion_estimada_min).
    let horasEstimadas = null;
    let horaRegresoEstimada = null;
    if (req.body.hora_salida) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.hora_salida)) {
        return res.status(400).json({ error: 'Hora de salida inválida (formato HH:MM).' });
      }
      const [h, m] = req.body.hora_salida.split(':').map(Number);
      let minutos = h * 60 + m;
      horasEstimadas = resultado.ordenSugerido.map((i, idx) => {
        minutos += resultado.tramos[idx].duracion_min;
        const llegada = formatoHora(minutos);
        minutos += paradas[i].duracion_estimada_min || 0;
        return { parada_id: paradas[i].id, llegada_estimada: llegada, salida_estimada: formatoHora(minutos) };
      });
      minutos += resultado.tramos[resultado.tramos.length - 1].duracion_min;
      horaRegresoEstimada = formatoHora(minutos);
    }

    res.json({
      orden_sugerido: ordenSugerido,
      duracion_total_min: resultado.duracionTotalMin,
      tramos: resultado.tramos,
      horas_estimadas: horasEstimadas,
      hora_regreso_estimada: horaRegresoEstimada,
    });
  } catch (err) {
    console.error('[despachos POST /:id/optimizar-ruta]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/despachos/:id/aplicar-orden {orden: [puntoId, ...]} (gestor) —
// aplica un orden de paradas (típicamente el sugerido por optimizar-ruta).
router.put('/:id/aplicar-orden', async (req, res) => {
  try {
    if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const { orden } = req.body;
    if (!Array.isArray(orden) || orden.length === 0) {
      return res.status(400).json({ error: 'Falta el orden a aplicar.' });
    }
    const paradas = await db.all('SELECT id FROM despacho_puntos WHERE despacho_id = $1', [req.params.id]);
    const idsValidos = new Set(paradas.map(p => p.id));
    if (!orden.every(id => idsValidos.has(id))) {
      return res.status(400).json({ error: 'El orden incluye paradas que no pertenecen a este despacho.' });
    }
    for (let i = 0; i < orden.length; i++) {
      await db.run('UPDATE despacho_puntos SET orden = $1 WHERE id = $2', [i + 1, orden[i]]);
    }
    await db.run('UPDATE despachos SET ultima_actividad = now() WHERE id = $1', [req.params.id]);
    res.json({ message: 'Orden aplicado' });
  } catch (err) {
    console.error('[despachos PUT /:id/aplicar-orden]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
