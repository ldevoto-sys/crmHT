const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { fetchCompleta } = require('../services/cotizacion_data');
const { generarCotizacionPDF } = require('../services/pdf');

router.use(authenticate);

const DESCUENTO_MAX = parseFloat(process.env.DESCUENTO_MAX_SIN_APROBACION || '10');

async function negocioDe(cotId) {
  return db.get(
    `SELECT n.* FROM negocios n JOIN cotizaciones c ON c.negocio_id = n.id WHERE c.id = $1`, [cotId]
  );
}
function puedeEditar(negocio, user) {
  return negocio && (user.rol === 'administrador' || user.rol === 'jefe_comercial' || negocio.vendedor_id === user.id);
}

// Calcula subtotal (neto), y total con descuento e IVA.
function calcular(items, descuento_pct, iva_pct) {
  const subtotal = Math.round(items.reduce((s, it) => s + Number(it.cantidad) * Number(it.precio_unitario), 0));
  const neto = subtotal * (1 - (Number(descuento_pct) || 0) / 100);
  const total = Math.round(neto * (1 + (Number(iva_pct) || 0) / 100));
  return { subtotal, total };
}

// Correlativo COT-AAAA-NNNNN, seguro ante concurrencia (dentro de la transacción).
async function proximoNumero(client) {
  const anio = new Date().getFullYear();
  const r = await client.query(
    `INSERT INTO cotizacion_correlativo (anio, ultimo) VALUES ($1, 1)
     ON CONFLICT (anio) DO UPDATE SET ultimo = cotizacion_correlativo.ultimo + 1
     RETURNING ultimo`, [anio]
  );
  const n = r.rows[0].ultimo;
  return `COT-${anio}-${String(n).padStart(5, '0')}`;
}

function itemsValidos(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(it => it.cantidad > 0 && it.precio_unitario >= 0);
}

// GET /api/cotizaciones?negocio_id=
router.get('/', async (req, res) => {
  try {
    const { negocio_id } = req.query;
    const clauses = [];
    const params = [];
    let i = 1;
    if (negocio_id) { clauses.push(`c.negocio_id = $${i++}`); params.push(negocio_id); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const cots = await db.all(
      `SELECT c.id, c.numero, c.version, c.estado, c.total, c.descuento_pct, c.negocio_id,
              c.created_at, c.fecha_envio, n.titulo AS negocio_titulo, u.nombre AS creado_por
       FROM cotizaciones c
       JOIN negocios n ON n.id = c.negocio_id
       LEFT JOIN users u ON u.id = c.creado_por_id
       ${where} ORDER BY c.created_at DESC LIMIT 500`, params);
    res.json(cots);
  } catch (err) {
    console.error('[cotizaciones/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/cotizaciones/:id — con items
router.get('/:id', async (req, res) => {
  try {
    const cot = await db.get(
      `SELECT c.*, n.titulo AS negocio_titulo, n.vendedor_id,
              ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido,
              e.razon_social AS empresa_nombre
       FROM cotizaciones c
       JOIN negocios n ON n.id = c.negocio_id
       JOIN contactos ct ON ct.id = n.contacto_id
       LEFT JOIN empresas e ON e.id = n.empresa_id
       WHERE c.id = $1`, [req.params.id]);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });
    const items = await db.all(
      `SELECT ci.*, p.nombre AS producto_nombre, p.sku
       FROM cotizacion_items ci LEFT JOIN productos p ON p.id = ci.producto_id
       WHERE ci.cotizacion_id = $1 ORDER BY ci.id`, [req.params.id]);
    const requiere_aprobacion = Number(cot.descuento_pct) > DESCUENTO_MAX && !cot.descuento_aprobado_por_id;
    res.json({ ...cot, items, puede_editar: puedeEditar({ vendedor_id: cot.vendedor_id }, req.user), requiere_aprobacion, descuento_max: DESCUENTO_MAX });
  } catch (err) {
    console.error('[cotizaciones/GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/cotizaciones/:id/pdf — descarga PDF (usuario autenticado)
router.get('/:id/pdf', async (req, res) => {
  try {
    const data = await fetchCompleta({ id: req.params.id });
    if (!data) return res.status(404).json({ error: 'Cotización no encontrada' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${data.cot.numero}-v${data.cot.version}.pdf"`);
    generarCotizacionPDF(data, res);
  } catch (err) {
    console.error('[cotizaciones/:id/pdf]', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

// POST /api/cotizaciones — nueva cotización (versión 1)
router.post('/', authorize('administrador', 'jefe_comercial', 'vendedor'), async (req, res) => {
  const { negocio_id, items, descuento_pct = 0, iva_pct = 19, validez_dias = 15, condiciones } = req.body;
  if (!negocio_id) return res.status(400).json({ error: 'negocio_id requerido' });
  if (!itemsValidos(items)) return res.status(400).json({ error: 'Debe incluir al menos un ítem válido' });
  if (descuento_pct < 0 || descuento_pct > 100) return res.status(400).json({ error: 'Descuento inválido' });
  if (iva_pct < 0 || iva_pct > 100) return res.status(400).json({ error: 'IVA inválido' });

  const negocio = await db.get('SELECT * FROM negocios WHERE id = $1', [negocio_id]);
  if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
  if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede cotizar' });

  const { subtotal, total } = calcular(items, descuento_pct, iva_pct);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const numero = await proximoNumero(client);
    const token = crypto.randomBytes(16).toString('hex');
    const r = await client.query(
      `INSERT INTO cotizaciones (negocio_id, numero, version, estado, subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones, token_publico, creado_por_id)
       VALUES ($1,$2,1,'borrador',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [negocio_id, numero, subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones || null, token, req.user.id]
    );
    const cotId = r.rows[0].id;
    for (const it of items) {
      const totalLinea = Math.round(Number(it.cantidad) * Number(it.precio_unitario));
      await client.query(
        `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, total_linea)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cotId, it.producto_id || null, it.descripcion || null, it.cantidad, it.precio_unitario, totalLinea]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: cotId, numero, version: 1 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[cotizaciones/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// POST /api/cotizaciones/:id/nueva-version — clona ítems en version+1; la anterior queda 'reemplazada'
router.post('/:id/nueva-version', authorize('administrador', 'jefe_comercial', 'vendedor'), async (req, res) => {
  const negocio = await negocioDe(req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede versionar' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const base = (await client.query('SELECT * FROM cotizaciones WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    const maxV = (await client.query('SELECT MAX(version) AS m FROM cotizaciones WHERE negocio_id=$1 AND numero=$2', [base.negocio_id, base.numero])).rows[0].m;
    const nuevaV = (maxV || base.version) + 1;
    await client.query(`UPDATE cotizaciones SET estado='reemplazada' WHERE negocio_id=$1 AND numero=$2 AND estado NOT IN ('aceptada','rechazada')`, [base.negocio_id, base.numero]);
    const token = crypto.randomBytes(16).toString('hex');
    const r = await client.query(
      `INSERT INTO cotizaciones (negocio_id, numero, version, estado, subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones, token_publico, creado_por_id)
       VALUES ($1,$2,$3,'borrador',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [base.negocio_id, base.numero, nuevaV, base.subtotal, base.descuento_pct, base.iva_pct, base.total, base.validez_dias, base.condiciones, token, req.user.id]
    );
    const nuevaId = r.rows[0].id;
    await client.query(
      `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, total_linea)
       SELECT $1, producto_id, descripcion, cantidad, precio_unitario, total_linea FROM cotizacion_items WHERE cotizacion_id=$2`,
      [nuevaId, req.params.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ id: nuevaId, numero: base.numero, version: nuevaV });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[cotizaciones/nueva-version]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// POST /api/cotizaciones/:id/solicitar-aprobacion-descuento
router.post('/:id/solicitar-aprobacion-descuento', async (req, res) => {
  try {
    const negocio = await negocioDe(req.params.id);
    if (!negocio) return res.status(404).json({ error: 'Cotización no encontrada' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    await db.run('UPDATE cotizaciones SET descuento_solicitado = true WHERE id = $1', [req.params.id]);
    res.json({ message: 'Aprobación de descuento solicitada' });
  } catch (err) {
    console.error('[cotizaciones/solicitar-aprobacion]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/cotizaciones/:id/aprobar-descuento (admin)
router.post('/:id/aprobar-descuento', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const cot = await db.get('SELECT id FROM cotizaciones WHERE id = $1', [req.params.id]);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });
    await db.run('UPDATE cotizaciones SET descuento_aprobado_por_id = $1, descuento_solicitado = false WHERE id = $2', [req.user.id, req.params.id]);
    res.json({ message: 'Descuento aprobado' });
  } catch (err) {
    console.error('[cotizaciones/aprobar-descuento]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
