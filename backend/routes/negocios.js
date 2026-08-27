const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const timeline = require('../services/timeline');
const secuencias = require('../services/secuencias');
const { toCSV, parseCSV, fechaDDMMAAAA } = require('../utils/csv');
const { uploadCSV } = require('../middleware/upload');
const { mapearNegocios, PLANTILLA_HEADERS: PLANTILLA_HEADERS_NEGOCIOS } = require('../services/import_negocios');

const PUEDE_IMPORTAR_NEGOCIOS = ['administrador', 'jefe_comercial'];
const PUEDE_REASIGNAR_VENDEDOR = ['administrador', 'jefe_comercial'];

router.use(authenticate);

function puedeEditar(negocio, user) {
  return user.rol === 'administrador' || user.rol === 'jefe_comercial' || negocio.vendedor_id === user.id;
}

// Visibilidad (matriz de permisos v1.6): admin/jefe comercial ven cualquiera,
// call center y gerencia ven (sin editar), vendedor solo los propios.
const PUEDE_VER_TODOS = ['administrador', 'jefe_comercial', 'callcenter', 'gerencia'];
function puedeVer(negocio, user) {
  if (PUEDE_VER_TODOS.includes(user.rol)) return true;
  return user.rol === 'vendedor' && negocio.vendedor_id === user.id;
}

// Filtros compartidos entre el listado y la exportación.
function filtrosNegocios(query, user) {
  const { etapa_id, vendedor_id, pipeline_id, q, desde, hasta } = query;
  const clauses = [];
  const params = [];
  let i = 1;
  if (etapa_id) { clauses.push(`n.etapa_id = $${i++}`); params.push(etapa_id); }
  if (pipeline_id) { clauses.push(`n.pipeline_id = $${i++}`); params.push(pipeline_id); }
  // Un vendedor solo ve los suyos, sin importar qué vendedor_id se pida.
  if (user.rol === 'vendedor') { clauses.push(`n.vendedor_id = $${i++}`); params.push(user.id); }
  else if (vendedor_id) { clauses.push(`n.vendedor_id = $${i++}`); params.push(vendedor_id); }
  if (q) { clauses.push(`(n.titulo ILIKE $${i} OR c.nombre ILIKE $${i} OR e.razon_social ILIKE $${i})`); params.push(`%${q}%`); i++; }
  if (desde) { clauses.push(`n.fecha_cierre_estimada >= $${i++}`); params.push(desde); }
  if (hasta) { clauses.push(`n.fecha_cierre_estimada <= $${i++}`); params.push(hasta); }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// GET /api/negocios?etapa_id=&vendedor_id=&q=&desde=&hasta= (desde/hasta filtran por fecha_cierre_estimada)
router.get('/', async (req, res) => {
  try {
    const { where, params } = filtrosNegocios(req.query, req.user);
    const negocios = await db.all(
      `SELECT n.id, n.titulo, n.etapa_id, n.pipeline_id, n.probabilidad_cierre, n.monto_estimado, n.vendedor_id,
              n.fecha_cierre_estimada, n.fecha_compromiso, n.ultima_actividad, n.created_at,
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

// GET /api/negocios/exportar — CSV con los mismos filtros que el listado (sin límite de 1000)
router.get('/exportar', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const { where, params } = filtrosNegocios(req.query, req.user);
    const negociosRows = await db.all(
      `SELECT n.id, n.titulo, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              c.email AS contacto_email, c.telefono_e164 AS contacto_telefono,
              e.razon_social AS empresa, u.nombre AS vendedor, pe.nombre AS etapa,
              n.probabilidad_cierre, n.monto_estimado, n.fecha_cierre_estimada, n.fecha_cierre,
              ca.nombre AS causa_no_cierre, n.causa_no_cierre_detalle, n.created_at
       FROM negocios n
       JOIN contactos c ON c.id = n.contacto_id
       LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id
       LEFT JOIN empresas e ON e.id = n.empresa_id
       LEFT JOIN users u ON u.id = n.vendedor_id
       LEFT JOIN causas_no_cierre ca ON ca.id = n.causa_no_cierre_id
       ${where}
       ORDER BY n.created_at DESC`,
      params
    );
    const negocios = negociosRows.map(n => ({
      ...n,
      fecha_cierre_estimada: fechaDDMMAAAA(n.fecha_cierre_estimada),
      fecha_cierre: fechaDDMMAAAA(n.fecha_cierre),
      created_at: fechaDDMMAAAA(n.created_at),
    }));
    const headers = ['id', 'titulo', 'contacto_nombre', 'contacto_apellido', 'contacto_email', 'contacto_telefono',
      'empresa', 'vendedor', 'etapa', 'probabilidad_cierre', 'monto_estimado', 'fecha_cierre_estimada', 'fecha_cierre',
      'causa_no_cierre', 'causa_no_cierre_detalle', 'created_at'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="negocios.csv"');
    res.send('﻿' + toCSV(headers, negocios));
  } catch (err) {
    console.error('[negocios/exportar]', err);
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
    if (!puedeVer(negocio, req.user)) return res.status(403).json({ error: 'Sin permiso' });
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
router.post('/', authorize('administrador', 'jefe_comercial', 'vendedor'), async (req, res) => {
  try {
    const { contacto_id, titulo, empresa_id, monto_estimado, vendedor_id, fecha_cierre_estimada, fecha_compromiso, pipeline_id } = req.body;
    if (!contacto_id || !titulo) return res.status(400).json({ error: 'Contacto y título requeridos' });

    const contacto = await db.get('SELECT id, empresa_id FROM contactos WHERE id = $1', [contacto_id]);
    if (!contacto) return res.status(400).json({ error: 'Contacto inexistente' });

    const dueno = (req.user.rol === 'administrador' && vendedor_id) ? vendedor_id : req.user.id;
    // El negocio nace en el pipeline elegido al crearlo; si no se especifica,
    // en el pipeline por defecto del dueño (no de quien lo crea, si un admin
    // lo está creando para otro vendedor).
    let pipelineId;
    if (pipeline_id) {
      const pipelineElegido = await db.get('SELECT id FROM pipelines WHERE id = $1 AND activo = true', [pipeline_id]);
      if (!pipelineElegido) return res.status(400).json({ error: 'Pipeline inválido' });
      pipelineId = pipelineElegido.id;
    } else {
      const duenoInfo = await db.get('SELECT pipeline_default_id FROM users WHERE id = $1', [dueno]);
      pipelineId = duenoInfo?.pipeline_default_id || 1;
    }

    // Etapa inicial: primera abierta por orden, dentro de ese mismo pipeline.
    const etapaInicial = await db.get(
      `SELECT id, probabilidad_cierre FROM pipeline_etapas WHERE tipo = 'abierta' AND activo = true AND pipeline_id = $1 ORDER BY orden LIMIT 1`,
      [pipelineId]
    );
    const emp = empresa_id || contacto.empresa_id || null;

    const r = await db.run(
      `INSERT INTO negocios (contacto_id, empresa_id, vendedor_id, titulo, monto_estimado, etapa_id, probabilidad_cierre, fecha_cierre_estimada, pipeline_id, fecha_compromiso)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [contacto_id, emp, dueno, titulo, monto_estimado || null,
       etapaInicial ? etapaInicial.id : null, etapaInicial ? etapaInicial.probabilidad_cierre : null,
       fecha_cierre_estimada || null, pipelineId, fecha_compromiso || null]
    );
    const negocio = r.rows[0];
    if (etapaInicial) {
      await db.run('INSERT INTO negocio_etapa_historial (negocio_id, etapa_id) VALUES ($1,$2)', [negocio.id, etapaInicial.id]);
    }
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

    const { titulo, monto_estimado, empresa_id, vendedor_id, probabilidad_cierre, fecha_cierre_estimada, contacto_id, fecha_compromiso } = req.body;
    if (probabilidad_cierre !== undefined && probabilidad_cierre !== null &&
        (probabilidad_cierre < 0 || probabilidad_cierre > 100)) {
      return res.status(400).json({ error: 'La probabilidad debe estar entre 0 y 100' });
    }
    if (contacto_id) {
      const contactoExiste = await db.get('SELECT id FROM contactos WHERE id = $1', [contacto_id]);
      if (!contactoExiste) return res.status(400).json({ error: 'Contacto inexistente' });
    }
    // Reasignar el vendedor dueño del negocio: administrador o jefe comercial
    // (no el propio vendedor dueño, aunque puedeEditar() lo deje llegar hasta
    // aquí para el resto de los campos).
    const nuevoVendedor = (PUEDE_REASIGNAR_VENDEDOR.includes(req.user.rol) && vendedor_id) ? vendedor_id : negocio.vendedor_id;
    await db.run(
      `UPDATE negocios SET titulo=$1, monto_estimado=$2, empresa_id=$3, vendedor_id=$4,
              probabilidad_cierre=$5, fecha_cierre_estimada=$6, contacto_id=$7, fecha_compromiso=$8, ultima_actividad=now() WHERE id=$9`,
      [titulo || negocio.titulo, monto_estimado ?? negocio.monto_estimado, empresa_id ?? negocio.empresa_id,
       nuevoVendedor, probabilidad_cierre ?? negocio.probabilidad_cierre,
       fecha_cierre_estimada !== undefined ? (fecha_cierre_estimada || null) : negocio.fecha_cierre_estimada,
       contacto_id || negocio.contacto_id,
       fecha_compromiso !== undefined ? (fecha_compromiso || null) : negocio.fecha_compromiso,
       req.params.id]
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
      `SELECT n.*, pe.nombre AS etapa_nombre, pe.secuencia_id AS etapa_anterior_secuencia_id
       FROM negocios n LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id WHERE n.id = $1`, [req.params.id]);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });
    if (etapa.pipeline_id !== negocio.pipeline_id) {
      return res.status(400).json({ error: 'Esa etapa pertenece a otro pipeline. Usa "Mover a otro pipeline" primero.' });
    }

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
    if (etapa.id !== negocio.etapa_id) {
      await db.run(
        'UPDATE negocio_etapa_historial SET salio_en = now() WHERE negocio_id = $1 AND salio_en IS NULL',
        [req.params.id]
      );
      await db.run('INSERT INTO negocio_etapa_historial (negocio_id, etapa_id) VALUES ($1,$2)', [req.params.id, etapa.id]);
    }
    await timeline.registrar({
      contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id, negocio_id: negocio.id,
      tipo: 'cambio_etapa', descripcion: `Etapa: ${negocio.etapa_nombre || '—'} → ${etapa.nombre}`, usuario_id: req.user.id,
    });

    await secuencias.alCambiarEtapa({
      negocio,
      etapaAnterior: negocio.etapa_id ? { secuencia_id: negocio.etapa_anterior_secuencia_id } : null,
      etapaNueva: etapa,
      usuarioId: req.user.id,
      origenDescripcion: 'al entrar a la etapa',
    });

    if (etapa.tipo === 'ganada') {
      const token = crypto.randomBytes(16).toString('hex');
      const r = await db.run(
        `INSERT INTO encuestas (negocio_id, token_publico) VALUES ($1,$2)
         ON CONFLICT (negocio_id) DO NOTHING RETURNING id`,
        [req.params.id, token]
      );
      if (r.rows[0]) {
        await db.run(
          `INSERT INTO tareas (titulo, descripcion, fecha_vencimiento, asignado_a_id, creado_por_id, contacto_id, empresa_id, negocio_id)
           VALUES ($1,$2,now(),$3,$3,$4,$5,$6)`,
          [
            'Enviar encuesta de satisfacción al cliente',
            `Comparte este link con el cliente: ${process.env.APP_URL || ''}/encuesta/${token}`,
            negocio.vendedor_id, negocio.contacto_id, negocio.empresa_id, req.params.id,
          ]
        );
      }
    }

    res.json({ message: 'Etapa actualizada' });
  } catch (err) {
    console.error('[negocios/PUT /:id/etapa]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/negocios/:id/pipeline {pipeline_id} — mover un negocio a otro
// pipeline (distinto de "mover de etapa": las etapas del pipeline destino son
// otras, así que la etapa se reasigna sola a la primera "abierta" de ese
// pipeline). Solo administrador/jefe comercial, ya que un vendedor normal
// queda acotado a su propio pipeline.
router.put('/:id/pipeline', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const { pipeline_id } = req.body;
    if (!pipeline_id) return res.status(400).json({ error: 'pipeline_id requerido' });

    const pipeline = await db.get('SELECT id FROM pipelines WHERE id = $1 AND activo = true', [pipeline_id]);
    if (!pipeline) return res.status(400).json({ error: 'Pipeline inválido' });

    const negocio = await db.get('SELECT * FROM negocios WHERE id = $1', [req.params.id]);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (negocio.pipeline_id === Number(pipeline_id)) return res.json({ message: 'El negocio ya está en ese pipeline' });

    const etapaDestino = await db.get(
      `SELECT id, probabilidad_cierre, tipo, secuencia_id FROM pipeline_etapas WHERE pipeline_id = $1 AND tipo = 'abierta' AND activo = true ORDER BY orden LIMIT 1`,
      [pipeline_id]
    );
    if (!etapaDestino) return res.status(400).json({ error: 'Ese pipeline todavía no tiene etapas abiertas configuradas' });
    const etapaAnterior = negocio.etapa_id
      ? await db.get('SELECT secuencia_id FROM pipeline_etapas WHERE id = $1', [negocio.etapa_id])
      : null;

    await db.run(
      `UPDATE negocios SET pipeline_id=$1, etapa_id=$2, probabilidad_cierre=$3, ultima_actividad=now() WHERE id=$4`,
      [pipeline_id, etapaDestino.id, etapaDestino.probabilidad_cierre, req.params.id]
    );
    await db.run(
      'UPDATE negocio_etapa_historial SET salio_en = now() WHERE negocio_id = $1 AND salio_en IS NULL',
      [req.params.id]
    );
    await db.run('INSERT INTO negocio_etapa_historial (negocio_id, etapa_id) VALUES ($1,$2)', [req.params.id, etapaDestino.id]);
    await timeline.registrar({
      contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id, negocio_id: negocio.id,
      tipo: 'cambio_etapa', descripcion: `Movido a otro pipeline (pipeline_id ${pipeline_id})`, usuario_id: req.user.id,
    });
    await secuencias.alCambiarEtapa({
      negocio, etapaAnterior, etapaNueva: etapaDestino, usuarioId: req.user.id,
      origenDescripcion: 'al entrar a la etapa',
    });

    res.json({ message: 'Negocio movido de pipeline' });
  } catch (err) {
    console.error('[negocios/PUT /:id/pipeline]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// === Etapa 3B — Motor de secuencias de seguimiento ===

async function cargarNegocioConSecuencia(id) {
  return db.get(
    `SELECT n.*, pe.tipo AS etapa_tipo FROM negocios n
     LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id WHERE n.id = $1`, [id]);
}

// GET /api/negocios/:id/secuencia — estado actual + pasos + historial
router.get('/:id/secuencia', async (req, res) => {
  try {
    const ns = await db.get(
      `SELECT ns.*, s.nombre AS secuencia_nombre FROM negocio_secuencias ns
       JOIN secuencias s ON s.id = ns.secuencia_id
       WHERE ns.negocio_id = $1 ORDER BY ns.created_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!ns) return res.json(null);
    const pasos = await db.all('SELECT * FROM secuencia_pasos WHERE secuencia_id = $1 ORDER BY orden', [ns.secuencia_id]);
    const ejecuciones = await db.all(
      `SELECT se.*, sp.orden, sp.canal FROM secuencia_ejecuciones se
       JOIN secuencia_pasos sp ON sp.id = se.paso_id
       WHERE se.negocio_secuencia_id = $1 ORDER BY se.ejecutado_en DESC`,
      [ns.id]
    );
    res.json({ ...ns, pasos, ejecuciones });
  } catch (err) {
    console.error('[negocios/GET /:id/secuencia]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/negocios/:id/secuencia {secuencia_id} — inicia una secuencia
router.post('/:id/secuencia', async (req, res) => {
  try {
    const negocio = await cargarNegocioConSecuencia(req.params.id);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });
    if (negocio.etapa_tipo === 'ganada' || negocio.etapa_tipo === 'perdida') {
      return res.status(400).json({ error: 'No se puede iniciar una secuencia en un negocio cerrado' });
    }

    const { secuencia_id } = req.body;
    const secuencia = await db.get('SELECT * FROM secuencias WHERE id = $1 AND activo = true', [secuencia_id]);
    if (!secuencia) return res.status(400).json({ error: 'Secuencia inválida o inactiva' });

    const existente = await db.get(
      `SELECT id FROM negocio_secuencias WHERE negocio_id = $1 AND estado IN ('activa','pausada')`,
      [req.params.id]
    );
    if (existente) return res.status(409).json({ error: 'Este negocio ya tiene una secuencia activa o pausada' });

    const primerPaso = await db.get('SELECT * FROM secuencia_pasos WHERE secuencia_id = $1 AND orden = 1', [secuencia_id]);
    if (!primerPaso) return res.status(400).json({ error: 'La secuencia no tiene pasos configurados' });

    const proxima = new Date(Date.now() + primerPaso.dias_espera * 86400000);
    const r = await db.run(
      `INSERT INTO negocio_secuencias (negocio_id, secuencia_id, proxima_ejecucion, iniciado_por_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [req.params.id, secuencia_id, proxima, req.user.id]
    );
    await timeline.registrar({
      negocio_id: negocio.id, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
      tipo: 'seguimiento_auto', descripcion: `Secuencia "${secuencia.nombre}" iniciada`, usuario_id: req.user.id,
      referencia_id: r.rows[0].id,
    });
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) {
    console.error('[negocios/POST /:id/secuencia]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

async function transicionSecuencia(req, res, { desde, hasta, campos = {}, tipoTimeline, descripcion }) {
  const negocio = await cargarNegocioConSecuencia(req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
  if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

  const ns = await db.get(
    `SELECT * FROM negocio_secuencias WHERE negocio_id = $1 AND estado = ANY($2) ORDER BY created_at DESC LIMIT 1`,
    [req.params.id, desde]
  );
  if (!ns) return res.status(404).json({ error: `No hay una secuencia en estado ${desde.join('/')} para este negocio` });

  const sets = ['estado=$1', 'updated_at=now()'];
  const params = [hasta];
  let i = 2;
  for (const [col, val] of Object.entries(campos)) { sets.push(`${col}=$${i++}`); params.push(val); }
  params.push(ns.id);
  await db.run(`UPDATE negocio_secuencias SET ${sets.join(', ')} WHERE id=$${i}`, params);

  await timeline.registrar({
    negocio_id: negocio.id, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
    tipo: tipoTimeline, descripcion, usuario_id: req.user.id, referencia_id: ns.id,
  });
  return ns;
}

// POST /api/negocios/:id/secuencia/pausar {motivo}
router.post('/:id/secuencia/pausar', async (req, res) => {
  try {
    const ns = await transicionSecuencia(req, res, {
      desde: ['activa'], hasta: 'pausada',
      campos: { pausada_motivo: req.body.motivo || 'Pausada manualmente' },
      tipoTimeline: 'seguimiento_manual', descripcion: `Secuencia pausada: ${req.body.motivo || 'sin motivo indicado'}`,
    });
    if (!ns || res.headersSent) return;
    res.json({ message: 'Secuencia pausada' });
  } catch (err) {
    console.error('[negocios/secuencia/pausar]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/negocios/:id/secuencia/reactivar — recalcula el reloj desde ahora
router.post('/:id/secuencia/reactivar', async (req, res) => {
  try {
    const negocio = await cargarNegocioConSecuencia(req.params.id);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

    const ns = await db.get(`SELECT * FROM negocio_secuencias WHERE negocio_id = $1 AND estado = 'pausada'`, [req.params.id]);
    if (!ns) return res.status(404).json({ error: 'No hay una secuencia pausada para este negocio' });

    const siguiente = await db.get('SELECT * FROM secuencia_pasos WHERE secuencia_id = $1 AND orden = $2', [ns.secuencia_id, ns.paso_actual + 1]);
    const proxima = siguiente ? new Date(Date.now() + siguiente.dias_espera * 86400000) : null;
    await db.run(`UPDATE negocio_secuencias SET estado='activa', proxima_ejecucion=$1, pausada_motivo=NULL, updated_at=now() WHERE id=$2`, [proxima, ns.id]);

    await timeline.registrar({
      negocio_id: negocio.id, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
      tipo: 'seguimiento_manual', descripcion: 'Secuencia reactivada', usuario_id: req.user.id, referencia_id: ns.id,
    });
    res.json({ message: 'Secuencia reactivada' });
  } catch (err) {
    console.error('[negocios/secuencia/reactivar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/negocios/:id/secuencia/marcar-respondido — pausa por respuesta del cliente
// (a mano por ahora; se puede invocar desde un webhook de Graph/WhatsApp cuando existan).
router.post('/:id/secuencia/marcar-respondido', async (req, res) => {
  try {
    const ns = await transicionSecuencia(req, res, {
      desde: ['activa', 'pausada'], hasta: 'pausada',
      campos: { pausada_motivo: 'Cliente respondió' },
      tipoTimeline: 'seguimiento_manual', descripcion: 'Cliente respondió: secuencia pausada',
    });
    if (!ns || res.headersSent) return;
    res.json({ message: 'Secuencia pausada por respuesta del cliente' });
  } catch (err) {
    console.error('[negocios/secuencia/marcar-respondido]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/negocios/:id/secuencia/cancelar
router.post('/:id/secuencia/cancelar', async (req, res) => {
  try {
    const ns = await transicionSecuencia(req, res, {
      desde: ['activa', 'pausada'], hasta: 'cancelada',
      campos: { proxima_ejecucion: null },
      tipoTimeline: 'seguimiento_manual', descripcion: 'Secuencia cancelada',
    });
    if (!ns || res.headersSent) return;
    res.json({ message: 'Secuencia cancelada' });
  } catch (err) {
    console.error('[negocios/secuencia/cancelar]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/negocios/:id/seguimiento-manual {descripcion} — registra seguimiento manual
// y, si hay una secuencia activa, resetea el reloj del próximo paso desde ahora.
router.post('/:id/seguimiento-manual', async (req, res) => {
  try {
    const { descripcion } = req.body;
    if (!descripcion || !descripcion.trim()) return res.status(400).json({ error: 'Descripción requerida' });

    const negocio = await cargarNegocioConSecuencia(req.params.id);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

    await db.run('UPDATE negocios SET ultima_actividad = now() WHERE id = $1', [req.params.id]);

    const ns = await db.get(`SELECT * FROM negocio_secuencias WHERE negocio_id = $1 AND estado = 'activa'`, [req.params.id]);
    if (ns) {
      const actual = await db.get('SELECT * FROM secuencia_pasos WHERE secuencia_id = $1 AND orden = $2', [ns.secuencia_id, ns.paso_actual + 1]);
      if (actual) {
        const proxima = new Date(Date.now() + actual.dias_espera * 86400000);
        await db.run('UPDATE negocio_secuencias SET proxima_ejecucion=$1, updated_at=now() WHERE id=$2', [proxima, ns.id]);
      }
    }

    await timeline.registrar({
      negocio_id: negocio.id, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
      tipo: 'seguimiento_manual', descripcion: descripcion.trim(), usuario_id: req.user.id,
    });
    res.status(201).json({ message: 'Seguimiento registrado' });
  } catch (err) {
    console.error('[negocios/seguimiento-manual]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/negocios/:id/encuesta — estado de la encuesta post-cierre (si existe)
router.get('/:id/encuesta', async (req, res) => {
  try {
    const encuesta = await db.get(
      `SELECT en.*, er.puntaje, er.comentario FROM encuestas en
       LEFT JOIN encuesta_respuestas er ON er.encuesta_id = en.id
       WHERE en.negocio_id = $1`,
      [req.params.id]
    );
    res.json(encuesta || null);
  } catch (err) {
    console.error('[negocios/GET /:id/encuesta]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// === Importador CSV de oportunidades (O/C contra contrato, sin cotización) ===
// Cada fila crea un negocio directo en una etapa del pipeline "Operaciones"
// (columna "estado" del CSV, por nombre; si viene vacía, la etapa "Aceptado"
// por defecto), sin pasar por PUT /:id/etapa — por eso no dispara encuesta
// de satisfacción ni tarea de seguimiento, a diferencia de cerrar un negocio
// manualmente desde el Pipeline.

// GET /api/negocios/importar/plantilla
router.get('/importar/plantilla', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_oportunidades.csv"');
  res.send('﻿' + PLANTILLA_HEADERS_NEGOCIOS.join(',') + '\n');
});

// Resuelve por lote el pipeline "Operaciones" y todas sus etapas activas
// (para matchear la columna "estado" del CSV por nombre). No existe hoy una
// forma de identificar el pipeline por nombre salvo el texto seedado
// ("Operaciones") — si se renombra desde Configuración, el importador deja
// de encontrarlo y conviene que sea un error explícito.
async function resolverPipelineOperaciones(client) {
  const pipeline = await client.query(`SELECT id FROM pipelines WHERE nombre = 'Operaciones' AND activo = true LIMIT 1`);
  if (!pipeline.rows[0]) return { error: 'No se encontró el pipeline "Operaciones" (revisa que no haya sido renombrado).' };
  const pipelineId = pipeline.rows[0].id;

  const etapas = await client.query(
    `SELECT id, nombre, tipo, probabilidad_cierre FROM pipeline_etapas WHERE pipeline_id = $1 AND activo = true`,
    [pipelineId]
  );
  if (!etapas.rows.length) return { error: 'El pipeline "Operaciones" no tiene etapas activas configuradas.' };

  const porNombre = new Map(etapas.rows.map(e => [e.nombre.toLowerCase(), e]));
  const porDefecto = etapas.rows.find(e => e.tipo === 'ganada');
  if (!porDefecto) return { error: 'El pipeline "Operaciones" no tiene una etapa de tipo "ganada" configurada (se usa por defecto cuando la fila no indica estado).' };

  return { pipelineId, porNombre, porDefecto };
}

// Resuelve la etapa de destino de una fila según su columna "estado" (por
// nombre, sin distinguir mayúsculas) — vacía usa la etapa por defecto
// ("Aceptado"). Devuelve null si el estado no matchea ninguna etapa activa.
function resolverEtapaFila(pipelineInfo, estado) {
  if (!estado) return pipelineInfo.porDefecto;
  return pipelineInfo.porNombre.get(estado.toLowerCase()) || null;
}

// Resuelve cada "vendedor" del CSV (email o nombre) contra los usuarios
// activos. No crea usuarios nuevos: si no matchea a nadie, la fila se
// rechaza — el vendedor responsable debe existir de antemano en el sistema.
async function resolverVendedores(client, validos) {
  const valores = [...new Set(validos.map(v => v.negocio.vendedor).filter(Boolean))];
  const porEmail = valores.filter(v => v.includes('@')).map(v => v.toLowerCase());
  const porNombre = valores.filter(v => !v.includes('@')).map(v => v.toLowerCase());

  const mapaEmail = new Map();
  const mapaNombre = new Map();
  if (porEmail.length) {
    const r = await client.query('SELECT id, lower(email) AS e FROM users WHERE activo = true AND lower(email) = ANY($1)', [porEmail]);
    r.rows.forEach(row => mapaEmail.set(row.e, row.id));
  }
  if (porNombre.length) {
    const r = await client.query('SELECT id, lower(nombre) AS n FROM users WHERE activo = true AND lower(nombre) = ANY($1)', [porNombre]);
    r.rows.forEach(row => mapaNombre.set(row.n, row.id));
  }

  const resolver = valor => {
    if (!valor) return null;
    const v = valor.toLowerCase();
    return v.includes('@') ? (mapaEmail.get(v) || null) : (mapaNombre.get(v) || null);
  };
  return resolver;
}

// Resuelve (creando si hace falta) la empresa referenciada por rut/nombre.
// Cachea en memoria dentro de la misma corrida para no duplicar una empresa
// citada en varias filas del mismo archivo (ej: 40 O/C de "CENCOSUD S.A.").
function crearResolverEmpresas(client) {
  const cache = new Map();
  return async ({ empresa_rut, empresa_nombre }) => {
    const clave = empresa_rut || empresa_nombre.toLowerCase();
    if (cache.has(clave)) return cache.get(clave);

    let fila = empresa_rut
      ? (await client.query('SELECT id FROM empresas WHERE rut = $1', [empresa_rut])).rows[0]
      : (await client.query('SELECT id FROM empresas WHERE activo = true AND lower(razon_social) = $1', [empresa_nombre.toLowerCase()])).rows[0];

    if (!fila) {
      fila = (await client.query(
        'INSERT INTO empresas (razon_social, rut) VALUES ($1,$2) RETURNING id',
        [empresa_nombre || empresa_rut, empresa_rut || null]
      )).rows[0];
    }
    cache.set(clave, fila.id);
    return fila.id;
  };
}

// Resuelve (creando si hace falta) el contacto de la fila, dentro de la
// empresa ya resuelta. Prioridad teléfono (UNIQUE) > email > crear nuevo,
// igual que el importador de contactos.
async function resolverOCrearContacto(client, n, empresaId) {
  if (n.contacto_telefono_e164) {
    const existente = (await client.query('SELECT id, empresa_id FROM contactos WHERE telefono_e164 = $1', [n.contacto_telefono_e164])).rows[0];
    if (existente) {
      if (!existente.empresa_id && empresaId) {
        await client.query('UPDATE contactos SET empresa_id = $1 WHERE id = $2', [empresaId, existente.id]);
      }
      return existente.id;
    }
  } else if (n.contacto_email) {
    const matches = (await client.query('SELECT id FROM contactos WHERE lower(email) = lower($1) AND activo = true', [n.contacto_email])).rows;
    if (matches.length === 1) return matches[0].id;
  }
  const r = await client.query(
    `INSERT INTO contactos (nombre, apellido, email, telefono_e164, empresa_id, origen)
     VALUES ($1,$2,$3,$4,$5,'importacion_csv') RETURNING id`,
    [n.contacto_nombre, n.contacto_apellido || null, n.contacto_email || null, n.contacto_telefono_e164 || null, empresaId]
  );
  return r.rows[0].id;
}

// POST /api/negocios/importar/preview
router.post('/importar/preview', authorize(...PUEDE_IMPORTAR_NEGOCIOS), uploadCSV.single('archivo'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
    const { rows } = parseCSV(req.file.buffer.toString('utf8'));
    const { validos, rechazos } = mapearNegocios(rows);

    const pipelineInfo = await resolverPipelineOperaciones(client);
    if (pipelineInfo.error) return res.status(400).json({ error: pipelineInfo.error });

    const resolverVendedor = await resolverVendedores(client, validos);
    const finales = [];
    for (const v of validos) {
      const vendedorId = resolverVendedor(v.negocio.vendedor);
      if (!vendedorId) { rechazos.push({ fila: v.fila, motivo: `vendedor no encontrado: "${v.negocio.vendedor}"` }); continue; }
      const etapa = resolverEtapaFila(pipelineInfo, v.negocio.estado);
      if (!etapa) { rechazos.push({ fila: v.fila, motivo: `estado "${v.negocio.estado}" no es una etapa activa del pipeline Operaciones` }); continue; }
      v.etapaNombre = etapa.nombre;
      finales.push(v);
    }

    const conAdvertencia = finales.filter(v => v.advertencias.length > 0).length;
    res.json({
      resumen: {
        total_filas_validas: finales.length,
        con_advertencia: conAdvertencia,
        rechazos: rechazos.length,
      },
      muestra: finales.slice(0, 20).map(v => ({
        empresa: v.negocio.empresa_nombre || v.negocio.empresa_rut,
        contacto: `${v.negocio.contacto_nombre} ${v.negocio.contacto_apellido || ''}`.trim(),
        titulo: v.negocio.titulo,
        estado: v.etapaNombre,
        n_oc: v.negocio.n_oc || '',
        monto: v.negocio.monto,
        fecha_cierre: v.negocio.fecha_cierre || '',
        vendedor: v.negocio.vendedor,
        advertencias: v.advertencias,
      })),
      rechazos: rechazos.slice(0, 200),
    });
  } catch (err) {
    console.error('[negocios/importar/preview]', err);
    res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/negocios/importar/confirmar
router.post('/importar/confirmar', authorize(...PUEDE_IMPORTAR_NEGOCIOS), uploadCSV.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
  const { rows } = parseCSV(req.file.buffer.toString('utf8'));
  const { validos } = mapearNegocios(rows);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const pipelineInfo = await resolverPipelineOperaciones(client);
    if (pipelineInfo.error) { await client.query('ROLLBACK'); return res.status(400).json({ error: pipelineInfo.error }); }
    const { pipelineId } = pipelineInfo;

    const resolverVendedor = await resolverVendedores(client, validos);
    const resolverEmpresa = crearResolverEmpresas(client);

    let creados = 0;
    const omitidos = [];
    for (const v of validos) {
      const n = v.negocio;
      const vendedorId = resolverVendedor(n.vendedor);
      if (!vendedorId) { omitidos.push({ fila: v.fila, motivo: `vendedor no encontrado: "${n.vendedor}"` }); continue; }
      const etapa = resolverEtapaFila(pipelineInfo, n.estado);
      if (!etapa) { omitidos.push({ fila: v.fila, motivo: `estado "${n.estado}" no es una etapa activa del pipeline Operaciones` }); continue; }

      const empresaId = await resolverEmpresa({ empresa_rut: n.empresa_rut, empresa_nombre: n.empresa_nombre });
      const contactoId = await resolverOCrearContacto(client, n, empresaId);
      // Cerrada (ganada/perdida): la fecha del CSV es la fecha real de cierre
      // (o hoy si no vino). Abierta: es una fecha estimada, no una ya cerrada
      // — no se inventa una si no vino.
      const esCerrada = etapa.tipo === 'ganada' || etapa.tipo === 'perdida';
      const fechaCierre = esCerrada ? (n.fecha_cierre || new Date().toISOString().slice(0, 10)) : null;
      const fechaCierreEstimada = esCerrada ? null : (n.fecha_cierre || null);

      const r = await client.query(
        `INSERT INTO negocios (contacto_id, empresa_id, vendedor_id, titulo, monto_estimado, etapa_id, probabilidad_cierre, fecha_cierre, fecha_cierre_estimada, pipeline_id, n_oc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [contactoId, empresaId, vendedorId, n.titulo, n.monto, etapa.id, etapa.probabilidad_cierre, fechaCierre, fechaCierreEstimada, pipelineId, n.n_oc || null]
      );
      const negocioId = r.rows[0].id;
      await client.query('INSERT INTO negocio_etapa_historial (negocio_id, etapa_id) VALUES ($1,$2)', [negocioId, etapa.id]);
      await timeline.registrar({
        contacto_id: contactoId, empresa_id: empresaId, negocio_id: negocioId, tipo: 'cambio_etapa',
        descripcion: `Negocio creado por importación de oportunidades (O/C directo a "${etapa.nombre}")`, usuario_id: req.user.id,
      }, client);
      creados++;
    }

    await client.query('COMMIT');
    res.json({ message: 'Importación completada', creados, omitidos });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[negocios/importar/confirmar]', err);
    res.status(500).json({ error: 'Error al importar: ' + err.message + (err.detail ? ' — ' + err.detail : '') });
  } finally {
    client.release();
  }
});

// Actualización masiva por id (27-08-2026): a diferencia de /importar, que
// siempre CREA negocios nuevos, esta lee el mismo archivo que ya entrega
// "Exportar" (con la columna id) y actualiza puntualmente cada fila
// existente — pensado para bajar el listado, editar y volver a subirlo, sin
// duplicar nada. No todas las columnas se tratan igual:
// - titulo, monto_estimado, fecha_cierre_estimada, fecha_cierre: editables directo.
// - etapa: si viene distinta a la actual, mueve el negocio de verdad — mismos
//   efectos que moverlo a mano en el Pipeline (secuencias, encuesta de
//   satisfacción, historial de etapas) — ver PUT /:id/etapa, misma lógica.
// - probabilidad_cierre y causa_no_cierre/detalle: no se leen sueltos, van
//   siempre de la mano del cambio de etapa (la probabilidad la fija la etapa
//   destino; la causa solo aplica si esa etapa es "perdida").
// - contacto_email, contacto_telefono, contacto_nombre, contacto_apellido:
//   solo lectura acá (identifican la fila) — son del contacto, no del
//   negocio, y un mismo contacto puede estar en más de un negocio.
// - empresa, vendedor, created_at: protegidos — si la fila trae un valor
//   distinto al que ya tiene el negocio, se rechaza esa fila completa (no se
//   reasigna nada por error de tipeo o de arrastre en Excel).
const FECHA_ACTUALIZAR_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

function parseFechaActualizar(valor) {
  const m = FECHA_ACTUALIZAR_RE.exec((valor || '').trim());
  if (!m) return undefined; // no vino / formato inválido
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

// Carga en 3 consultas TODO lo que puede necesitar cualquier fila del
// archivo, sin importar cuántas filas traiga — antes se hacía una consulta
// (o más) por fila, y con archivos de varios cientos de filas la petición
// se caía por tiempo de espera antes de terminar. Preview y confirmar
// arrancan llamando a esto una sola vez.
async function cargarContextoActualizacion(client, ids) {
  const negociosDb = ids.length ? (await client.query(
    `SELECT n.*, c.email AS contacto_email, e.razon_social AS empresa_nombre, u.nombre AS vendedor_nombre,
            pe.nombre AS etapa_nombre, pe.tipo AS etapa_tipo, pe.pipeline_id AS etapa_pipeline_id,
            pe.secuencia_id AS etapa_anterior_secuencia_id
     FROM negocios n
     JOIN contactos c ON c.id = n.contacto_id
     LEFT JOIN empresas e ON e.id = n.empresa_id
     LEFT JOIN users u ON u.id = n.vendedor_id
     LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id
     WHERE n.id = ANY($1)`, [ids]
  )).rows : [];
  const negociosPorId = new Map(negociosDb.map(n => [n.id, n]));

  const pipelineIds = [...new Set(negociosDb.map(n => n.pipeline_id).filter(Boolean))];
  const etapasDb = pipelineIds.length ? (await client.query(
    `SELECT * FROM pipeline_etapas WHERE pipeline_id = ANY($1) AND activo = true`, [pipelineIds]
  )).rows : [];
  const etapasPorClave = new Map(etapasDb.map(e => [`${e.pipeline_id}:${e.nombre.toLowerCase()}`, e]));

  const causasDb = (await client.query(`SELECT id, nombre FROM causas_no_cierre WHERE activo = true`)).rows;
  const causasPorNombre = new Map(causasDb.map(c => [c.nombre.toLowerCase(), c.id]));

  return { negociosPorId, etapasPorClave, causasPorNombre };
}

// Resuelve y valida una fila contra el contexto ya cargado — sin consultas
// a la BD, solo lectura de los mapas. Devuelve {error} o un "plan" con lo
// que hay que aplicar.
function resolverFilaActualizacion(contexto, row, fila) {
  const idRaw = (row.id || '').trim();
  if (!idRaw || !/^\d+$/.test(idRaw)) return { error: { fila, motivo: 'id inválido o vacío' } };
  const id = Number(idRaw);

  const negocio = contexto.negociosPorId.get(id);
  if (!negocio) return { error: { fila, motivo: `no existe un negocio con id ${id}` } };

  // Campos protegidos: solo se valida si la columna viene con contenido —
  // una fila con esa columna vacía no se interpreta como "vaciar el campo".
  const empresaCsv = (row.empresa || '').trim();
  if (empresaCsv && empresaCsv.toLowerCase() !== (negocio.empresa_nombre || '').toLowerCase()) {
    return { error: { fila, motivo: `la columna empresa no se puede cambiar acá (era "${negocio.empresa_nombre || '—'}", vino "${empresaCsv}")` } };
  }
  const vendedorCsv = (row.vendedor || '').trim();
  if (vendedorCsv && vendedorCsv.toLowerCase() !== (negocio.vendedor_nombre || '').toLowerCase()) {
    return { error: { fila, motivo: `la columna vendedor no se puede cambiar acá (era "${negocio.vendedor_nombre || '—'}", vino "${vendedorCsv}")` } };
  }
  const createdAtCsv = (row.created_at || '').trim();
  if (createdAtCsv && createdAtCsv !== fechaDDMMAAAA(negocio.created_at)) {
    return { error: { fila, motivo: `la columna created_at no se puede cambiar acá (era "${fechaDDMMAAAA(negocio.created_at)}", vino "${createdAtCsv}")` } };
  }

  // Etapa destino: vacía = sin cambio. Se busca por nombre dentro del mismo
  // pipeline del negocio (el mismo criterio que usa el Pipeline/kanban).
  const etapaCsv = (row.etapa || '').trim();
  let etapaNueva = null;
  if (etapaCsv && etapaCsv.toLowerCase() !== (negocio.etapa_nombre || '').toLowerCase()) {
    etapaNueva = contexto.etapasPorClave.get(`${negocio.pipeline_id}:${etapaCsv.toLowerCase()}`);
    if (!etapaNueva) return { error: { fila, motivo: `etapa "${etapaCsv}" no es una etapa activa del pipeline de este negocio` } };
  }

  let causaId = null;
  const causaCsv = (row.causa_no_cierre || '').trim();
  if (etapaNueva && etapaNueva.tipo === 'perdida') {
    if (!causaCsv) return { error: { fila, motivo: 'la etapa destino es "perdida" y falta la columna causa_no_cierre' } };
    causaId = contexto.causasPorNombre.get(causaCsv.toLowerCase());
    if (!causaId) return { error: { fila, motivo: `causa_no_cierre "${causaCsv}" no existe o está inactiva` } };
  }

  // Postgres devuelve las columnas DATE como objeto Date, no como texto —
  // hay que normalizar a ISO (AAAA-MM-DD) antes de comparar con lo que
  // parsea el CSV, si no toda fila sin cambio real de fecha se marca como
  // "distinta" solo por la diferencia de tipos.
  const isoDb = valor => {
    if (!valor) return null;
    return valor instanceof Date ? valor.toISOString().slice(0, 10) : valor;
  };

  const cambios = {};
  if (row.titulo !== undefined && row.titulo.trim() && row.titulo.trim() !== negocio.titulo) cambios.titulo = row.titulo.trim();
  if (row.monto_estimado !== undefined && row.monto_estimado.trim()) {
    const monto = Number(row.monto_estimado.replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(monto)) return { error: { fila, motivo: 'monto_estimado no es un número válido' } };
    if (monto !== Number(negocio.monto_estimado)) cambios.monto_estimado = monto;
  }
  if ((row.fecha_cierre_estimada || '').trim()) {
    const iso = parseFechaActualizar(row.fecha_cierre_estimada);
    if (!iso) return { error: { fila, motivo: 'fecha_cierre_estimada no tiene formato DD-MM-AAAA' } };
    if (iso !== isoDb(negocio.fecha_cierre_estimada)) cambios.fecha_cierre_estimada = iso;
  }
  if ((row.fecha_cierre || '').trim()) {
    const iso = parseFechaActualizar(row.fecha_cierre);
    if (!iso) return { error: { fila, motivo: 'fecha_cierre no tiene formato DD-MM-AAAA' } };
    if (iso !== isoDb(negocio.fecha_cierre)) cambios.fecha_cierre = iso;
  }

  if (!etapaNueva && Object.keys(cambios).length === 0) return { sinCambios: true };

  return { negocio, etapaNueva, causaId, causaDetalle: (row.causa_no_cierre_detalle || '').trim() || null, cambios };
}

async function aplicarFilaActualizacion(client, plan, usuarioId) {
  const { negocio, etapaNueva, causaId, causaDetalle, cambios } = plan;

  if (etapaNueva) {
    const cierra = etapaNueva.tipo === 'ganada' || etapaNueva.tipo === 'perdida';
    await client.query(
      `UPDATE negocios SET etapa_id=$1, probabilidad_cierre=$2, causa_no_cierre_id=$3, causa_no_cierre_detalle=$4,
              fecha_cierre=$5, titulo=COALESCE($6,titulo), monto_estimado=COALESCE($7,monto_estimado),
              fecha_cierre_estimada=$8, ultima_actividad=now()
       WHERE id=$9`,
      [etapaNueva.id, etapaNueva.probabilidad_cierre,
       etapaNueva.tipo === 'perdida' ? causaId : null,
       etapaNueva.tipo === 'perdida' ? causaDetalle : null,
       cierra ? new Date().toISOString() : null,
       cambios.titulo || null, cambios.monto_estimado ?? null,
       cierra ? null : (cambios.fecha_cierre_estimada ?? negocio.fecha_cierre_estimada),
       negocio.id]
    );
    await client.query('UPDATE negocio_etapa_historial SET salio_en = now() WHERE negocio_id = $1 AND salio_en IS NULL', [negocio.id]);
    await client.query('INSERT INTO negocio_etapa_historial (negocio_id, etapa_id) VALUES ($1,$2)', [negocio.id, etapaNueva.id]);
    await timeline.registrar({
      contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id, negocio_id: negocio.id,
      tipo: 'cambio_etapa', descripcion: `Etapa: ${negocio.etapa_nombre || '—'} → ${etapaNueva.nombre} (importación masiva)`, usuario_id: usuarioId,
    }, client);

    await secuencias.alCambiarEtapa({
      negocio, etapaAnterior: negocio.etapa_id ? { secuencia_id: negocio.etapa_anterior_secuencia_id } : null,
      etapaNueva, usuarioId, origenDescripcion: 'por una actualización masiva',
    });

    if (etapaNueva.tipo === 'ganada') {
      const token = crypto.randomBytes(16).toString('hex');
      const r = await client.query(
        `INSERT INTO encuestas (negocio_id, token_publico) VALUES ($1,$2) ON CONFLICT (negocio_id) DO NOTHING RETURNING id`,
        [negocio.id, token]
      );
      if (r.rows[0]) {
        await client.query(
          `INSERT INTO tareas (titulo, descripcion, fecha_vencimiento, asignado_a_id, creado_por_id, contacto_id, empresa_id, negocio_id)
           VALUES ($1,$2,now(),$3,$3,$4,$5,$6)`,
          ['Enviar encuesta de satisfacción al cliente', `Comparte este link con el cliente: ${process.env.APP_URL || ''}/encuesta/${token}`,
           negocio.vendedor_id, negocio.contacto_id, negocio.empresa_id, negocio.id]
        );
      }
    }
  } else if (Object.keys(cambios).length) {
    await client.query(
      `UPDATE negocios SET titulo=COALESCE($1,titulo), monto_estimado=COALESCE($2,monto_estimado),
              fecha_cierre_estimada=COALESCE($3,fecha_cierre_estimada), fecha_cierre=COALESCE($4,fecha_cierre),
              ultima_actividad=now()
       WHERE id=$5`,
      [cambios.titulo || null, cambios.monto_estimado ?? null, cambios.fecha_cierre_estimada ?? null, cambios.fecha_cierre ?? null, negocio.id]
    );
    const descripcion = Object.entries(cambios).map(([k, v]) => `${k} → ${v}`).join(', ');
    await timeline.registrar({
      contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id, negocio_id: negocio.id,
      tipo: 'nota', descripcion: `Actualizado por importación masiva: ${descripcion}`, usuario_id: usuarioId,
    }, client);
  }
}

// POST /api/negocios/actualizar/preview
router.post('/actualizar/preview', authorize(...PUEDE_IMPORTAR_NEGOCIOS), uploadCSV.single('archivo'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
    const { rows } = parseCSV(req.file.buffer.toString('utf8'));

    const ids = [...new Set(rows.map(r => (r.id || '').trim()).filter(v => /^\d+$/.test(v)).map(Number))];
    const contexto = await cargarContextoActualizacion(client, ids);

    const rechazos = [];
    const finales = [];
    let sinCambios = 0;
    const idsVistos = new Set();
    for (let idx = 0; idx < rows.length; idx++) {
      const fila = idx + 2;
      const idRaw = (rows[idx].id || '').trim();
      if (idRaw && idsVistos.has(idRaw)) { rechazos.push({ fila, motivo: `id ${idRaw} repetido en el archivo` }); continue; }
      if (idRaw) idsVistos.add(idRaw);
      const resultado = resolverFilaActualizacion(contexto, rows[idx], fila);
      if (resultado.error) { rechazos.push(resultado.error); continue; }
      if (resultado.sinCambios) { sinCambios++; continue; }
      finales.push({ fila, ...resultado });
    }

    res.json({
      resumen: { total_filas_validas: finales.length, sin_cambios: sinCambios, rechazos: rechazos.length },
      muestra: finales.slice(0, 20).map(v => ({
        id: v.negocio.id, titulo: v.negocio.titulo,
        etapa: v.etapaNueva ? `${v.negocio.etapa_nombre || '—'} → ${v.etapaNueva.nombre}` : (v.negocio.etapa_nombre || '—'),
        cambios: Object.keys(v.cambios).length ? Object.entries(v.cambios).map(([k, val]) => `${k}: ${val}`).join('; ') : '—',
      })),
      rechazos: rechazos.slice(0, 200),
    });
  } catch (err) {
    console.error('[negocios/actualizar/preview]', err);
    res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/negocios/actualizar/confirmar
router.post('/actualizar/confirmar', authorize(...PUEDE_IMPORTAR_NEGOCIOS), uploadCSV.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
  const { rows } = parseCSV(req.file.buffer.toString('utf8'));

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const ids = [...new Set(rows.map(r => (r.id || '').trim()).filter(v => /^\d+$/.test(v)).map(Number))];
    const contexto = await cargarContextoActualizacion(client, ids);

    let actualizados = 0;
    const omitidos = [];
    const idsVistos = new Set();
    for (let idx = 0; idx < rows.length; idx++) {
      const fila = idx + 2;
      const idRaw = (rows[idx].id || '').trim();
      if (idRaw && idsVistos.has(idRaw)) { omitidos.push({ fila, motivo: `id ${idRaw} repetido en el archivo` }); continue; }
      if (idRaw) idsVistos.add(idRaw);
      const resultado = resolverFilaActualizacion(contexto, rows[idx], fila);
      if (resultado.error) { omitidos.push(resultado.error); continue; }
      if (resultado.sinCambios) continue;
      await aplicarFilaActualizacion(client, resultado, req.user.id);
      actualizados++;
    }
    await client.query('COMMIT');
    res.json({ actualizados, omitidos });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[negocios/actualizar/confirmar]', err);
    res.status(500).json({ error: 'Error al aplicar los cambios: ' + err.message + (err.detail ? ' — ' + err.detail : '') });
  } finally {
    client.release();
  }
});

module.exports = router;
