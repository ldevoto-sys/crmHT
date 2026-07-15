const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const timeline = require('../services/timeline');
const { toCSV } = require('../utils/csv');

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
  const { etapa_id, vendedor_id, q, desde, hasta } = query;
  const clauses = [];
  const params = [];
  let i = 1;
  if (etapa_id) { clauses.push(`n.etapa_id = $${i++}`); params.push(etapa_id); }
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
      `SELECT n.id, n.titulo, n.etapa_id, n.probabilidad_cierre, n.monto_estimado, n.vendedor_id,
              n.fecha_cierre_estimada, n.ultima_actividad, n.created_at,
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
    const negocios = await db.all(
      `SELECT n.titulo, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
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
    const headers = ['titulo', 'contacto_nombre', 'contacto_apellido', 'empresa', 'vendedor', 'etapa',
      'probabilidad_cierre', 'monto_estimado', 'fecha_cierre_estimada', 'fecha_cierre',
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
    const { contacto_id, titulo, empresa_id, monto_estimado, vendedor_id, fecha_cierre_estimada } = req.body;
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
      `INSERT INTO negocios (contacto_id, empresa_id, vendedor_id, titulo, monto_estimado, etapa_id, probabilidad_cierre, fecha_cierre_estimada)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [contacto_id, emp, dueno, titulo, monto_estimado || null,
       etapaInicial ? etapaInicial.id : null, etapaInicial ? etapaInicial.probabilidad_cierre : null,
       fecha_cierre_estimada || null]
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

    const { titulo, monto_estimado, empresa_id, vendedor_id, probabilidad_cierre, fecha_cierre_estimada } = req.body;
    if (probabilidad_cierre !== undefined && probabilidad_cierre !== null &&
        (probabilidad_cierre < 0 || probabilidad_cierre > 100)) {
      return res.status(400).json({ error: 'La probabilidad debe estar entre 0 y 100' });
    }
    const nuevoVendedor = (req.user.rol === 'administrador' && vendedor_id) ? vendedor_id : negocio.vendedor_id;
    await db.run(
      `UPDATE negocios SET titulo=$1, monto_estimado=$2, empresa_id=$3, vendedor_id=$4,
              probabilidad_cierre=$5, fecha_cierre_estimada=$6, ultima_actividad=now() WHERE id=$7`,
      [titulo || negocio.titulo, monto_estimado ?? negocio.monto_estimado, empresa_id ?? negocio.empresa_id,
       nuevoVendedor, probabilidad_cierre ?? negocio.probabilidad_cierre,
       fecha_cierre_estimada !== undefined ? (fecha_cierre_estimada || null) : negocio.fecha_cierre_estimada,
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

    if (cierra) {
      // Un negocio cerrado no sigue en seguimiento automático.
      await db.run(
        `UPDATE negocio_secuencias SET estado='cancelada', proxima_ejecucion=NULL, updated_at=now()
         WHERE negocio_id = $1 AND estado IN ('activa','pausada')`,
        [req.params.id]
      );
    }

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

module.exports = router;
