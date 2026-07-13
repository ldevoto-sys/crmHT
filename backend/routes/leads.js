const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { normalizarTelefono } = require('../services/dedup');
const { sugerirVendedor } = require('../services/asignacion');

// --- Endpoint público servidor-a-servidor (§9.4): API key, sin JWT ---
function apiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!process.env.LEADS_WEB_API_KEY) return res.status(503).json({ error: 'Canal web no configurado' });
  if (key !== process.env.LEADS_WEB_API_KEY) return res.status(401).json({ error: 'API key inválida' });
  next();
}

// POST /api/leads/web  (header X-API-Key)
router.post('/web', apiKey, async (req, res) => {
  try {
    const { nombre, telefono, email, mensaje, producto_id, sku, pagina_origen } = req.body;
    if (!nombre && !telefono && !email) return res.status(400).json({ error: 'Datos insuficientes' });

    const telefono_e164 = normalizarTelefono(telefono);

    // Buscar/crear contacto (dedup §7.2).
    let contacto = null;
    if (telefono_e164) contacto = await db.get('SELECT * FROM contactos WHERE telefono_e164 = $1', [telefono_e164]);
    if (!contacto && email) {
      const m = await db.all('SELECT * FROM contactos WHERE lower(email) = lower($1) AND activo = true', [email]);
      if (m.length === 1) contacto = m[0];
    }
    if (!contacto) {
      const r = await db.run(
        `INSERT INTO contactos (nombre, email, telefono_e164, origen, revisar_duplicado)
         VALUES ($1,$2,$3,'web',false) RETURNING *`,
        [nombre || '(sin nombre)', email || null, telefono_e164]
      );
      contacto = r.rows[0];
    }

    // Producto de interés + categoría para el motor.
    let producto = null;
    if (producto_id) producto = await db.get('SELECT id, categoria FROM productos WHERE id = $1', [producto_id]);
    else if (sku) producto = await db.get('SELECT id, categoria FROM productos WHERE sku = $1', [sku]);

    const sug = await sugerirVendedor({ contacto_id: contacto.id, categoria: producto ? producto.categoria : null });

    const r = await db.run(
      `INSERT INTO leads (contacto_id, origen, creado_por, estado, vendedor_sugerido_id, producto_interes_id, pagina_origen, mensaje_formulario)
       VALUES ($1,'web','web','nuevo',$2,$3,$4,$5) RETURNING id`,
      [contacto.id, sug.vendedor_id, producto ? producto.id : null, pagina_origen || null, mensaje || null]
    );
    res.status(201).json({ lead_id: r.rows[0].id, ok: true });
  } catch (err) {
    console.error('[leads/web]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Resto: autenticado ---
router.use(authenticate);

// GET /api/leads?estado=
router.get('/', async (req, res) => {
  try {
    const { estado } = req.query;
    const clauses = [];
    const params = [];
    let i = 1;
    if (estado) { clauses.push(`l.estado = $${i++}`); params.push(estado); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const leads = await db.all(
      `SELECT l.id, l.origen, l.estado, l.mensaje_formulario, l.pagina_origen, l.created_at,
              l.vendedor_id, l.vendedor_sugerido_id,
              c.nombre AS contacto_nombre, c.apellido AS contacto_apellido, c.email AS contacto_email, c.telefono_e164 AS contacto_telefono,
              e.razon_social AS empresa_nombre,
              p.nombre AS producto_nombre,
              vs.nombre AS sugerido_nombre, va.nombre AS asignado_nombre,
              l.negocio_id
       FROM leads l
       JOIN contactos c ON c.id = l.contacto_id
       LEFT JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN productos p ON p.id = l.producto_interes_id
       LEFT JOIN users vs ON vs.id = l.vendedor_sugerido_id
       LEFT JOIN users va ON va.id = l.vendedor_id
       ${where} ORDER BY l.created_at DESC LIMIT 500`, params);
    res.json(leads);
  } catch (err) {
    console.error('[leads/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/leads/:id/asignar {vendedor_id} — confirma/cambia sugerencia (call center/admin)
router.post('/:id/asignar', authorize('administrador', 'callcenter'), async (req, res) => {
  try {
    const { vendedor_id } = req.body;
    if (!vendedor_id) return res.status(400).json({ error: 'vendedor_id requerido' });
    const lead = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    const v = await db.get(`SELECT id FROM users WHERE id=$1 AND activo=true AND rol='vendedor'`, [vendedor_id]);
    if (!v) return res.status(400).json({ error: 'Vendedor inválido' });
    const modo = Number(vendedor_id) === lead.vendedor_sugerido_id ? 'sugerida_confirmada' : 'sugerida_cambiada';
    await db.run('UPDATE leads SET vendedor_id=$1, estado=\'asignado\', asignacion_modo=$2 WHERE id=$3', [vendedor_id, modo, req.params.id]);
    res.json({ message: 'Lead asignado', modo });
  } catch (err) {
    console.error('[leads/asignar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/leads/:id/convertir {titulo} — crea negocio
router.post('/:id/convertir', authorize('administrador', 'vendedor', 'callcenter'), async (req, res) => {
  try {
    const lead = await db.get('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    if (lead.negocio_id) return res.status(409).json({ error: 'El lead ya fue convertido' });
    const vendedorId = lead.vendedor_id || req.user.id;
    const contacto = await db.get('SELECT empresa_id FROM contactos WHERE id = $1', [lead.contacto_id]);
    const etapaInicial = await db.get(`SELECT id, probabilidad_cierre FROM pipeline_etapas WHERE tipo='abierta' AND activo=true ORDER BY orden LIMIT 1`);
    const titulo = req.body.titulo || lead.mensaje_formulario?.slice(0, 80) || 'Lead web';
    const r = await db.run(
      `INSERT INTO negocios (contacto_id, empresa_id, vendedor_id, titulo, etapa_id, probabilidad_cierre)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [lead.contacto_id, contacto ? contacto.empresa_id : null, vendedorId, titulo,
       etapaInicial ? etapaInicial.id : null, etapaInicial ? etapaInicial.probabilidad_cierre : null]
    );
    await db.run('UPDATE leads SET estado=\'convertido\', negocio_id=$1, vendedor_id=COALESCE(vendedor_id,$2) WHERE id=$3', [r.rows[0].id, vendedorId, req.params.id]);
    res.status(201).json({ negocio_id: r.rows[0].id });
  } catch (err) {
    console.error('[leads/convertir]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/leads/:id/descartar
router.post('/:id/descartar', authorize('administrador', 'callcenter', 'vendedor'), async (req, res) => {
  try {
    const lead = await db.get('SELECT id FROM leads WHERE id = $1', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    await db.run('UPDATE leads SET estado=\'descartado\' WHERE id=$1', [req.params.id]);
    res.json({ message: 'Lead descartado' });
  } catch (err) {
    console.error('[leads/descartar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
