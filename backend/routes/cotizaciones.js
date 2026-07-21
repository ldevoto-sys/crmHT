const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { fetchCompleta, numeroCompleto } = require('../services/cotizacion_data');
const { generarCotizacionPDF, generarCotizacionPDFBuffer } = require('../services/pdf');
const timeline = require('../services/timeline');
const email = require('../services/email');
const whatsapp = require('../services/whatsapp');
const mensajes = require('../services/whatsapp_mensajes');
const { iniciarSecuenciaPostCotizacion } = require('../services/secuencias');
const { mayusculas } = require('../utils/texto');

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

// Al generarse una cotización, el negocio avanza a la etapa "Cotizado" — pero
// solo hacia adelante: si ya está en una etapa posterior (p.ej. Negociación) o
// está cerrado, no se toca. Si la etapa "Cotizado" fue renombrada o eliminada
// de la configuración del pipeline, no se fuerza nada (no hay a qué avanzar).
async function avanzarAEtapaCotizado(client, negocio, usuarioId) {
  const cotizada = (await client.query(
    `SELECT * FROM pipeline_etapas WHERE tipo='abierta' AND activo=true AND nombre ILIKE 'cotizado' LIMIT 1`
  )).rows[0];
  if (!cotizada) return;
  const actual = negocio.etapa_id
    ? (await client.query('SELECT orden, tipo, nombre FROM pipeline_etapas WHERE id=$1', [negocio.etapa_id])).rows[0]
    : null;
  if (actual && actual.tipo === 'abierta' && actual.orden >= cotizada.orden) return;
  if (actual && actual.tipo !== 'abierta') return;

  await client.query(
    'UPDATE negocio_etapa_historial SET salio_en = now() WHERE negocio_id = $1 AND salio_en IS NULL',
    [negocio.id]
  );
  await client.query('INSERT INTO negocio_etapa_historial (negocio_id, etapa_id) VALUES ($1,$2)', [negocio.id, cotizada.id]);
  await client.query(
    'UPDATE negocios SET etapa_id=$1, probabilidad_cierre=$2, ultima_actividad=now() WHERE id=$3',
    [cotizada.id, cotizada.probabilidad_cierre, negocio.id]
  );
  await timeline.registrar({
    negocio_id: negocio.id, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
    tipo: 'cambio_etapa', descripcion: `Etapa: ${actual ? actual.nombre : '—'} → ${cotizada.nombre} (cotización generada)`,
    usuario_id: usuarioId,
  }, client);
}

// Visibilidad (§5 matriz de permisos v1.6): admin/jefe comercial/gerencia ven todas;
// vendedor solo las suyas; call center no tiene acceso a cotizaciones.
const PUEDE_VER_TODAS = ['administrador', 'jefe_comercial', 'gerencia'];
function puedeVer(negocio, user) {
  if (PUEDE_VER_TODAS.includes(user.rol)) return true;
  return user.rol === 'vendedor' && negocio && negocio.vendedor_id === user.id;
}

// Calcula subtotal (neto), y total con descuento e IVA.
function calcular(items, descuento_pct, iva_pct) {
  const subtotal = Math.round(items.reduce((s, it) => s + Number(it.cantidad) * Number(it.precio_unitario), 0));
  const neto = subtotal * (1 - (Number(descuento_pct) || 0) / 100);
  const total = Math.round(neto * (1 + (Number(iva_pct) || 0) / 100));
  return { subtotal, total };
}

// Correlativo global NNNNNN (6 dígitos, sin año ni prefijo), seguro ante
// concurrencia (dentro de la transacción). COTIZACION_CORRELATIVO_INICIAL
// solo se usa al insertar la fila por primera vez.
async function proximoNumero(client) {
  const inicial = parseInt(process.env.COTIZACION_CORRELATIVO_INICIAL || '0', 10) || 0;
  const r = await client.query(
    `INSERT INTO cotizacion_correlativo_global (id, ultimo) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET ultimo = cotizacion_correlativo_global.ultimo + 1
     RETURNING ultimo`,
    [inicial + 1]
  );
  return String(r.rows[0].ultimo).padStart(6, '0');
}

function itemsValidos(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(it => it.cantidad > 0 && it.precio_unitario >= 0);
}

// GET /api/cotizaciones?negocio_id=&q=
router.get('/', async (req, res) => {
  try {
    if (!PUEDE_VER_TODAS.includes(req.user.rol) && req.user.rol !== 'vendedor') {
      return res.status(403).json({ error: 'Sin permiso' });
    }
    const { negocio_id, q, vendedor_id } = req.query;
    const clauses = [];
    const params = [];
    let i = 1;
    // Cada cotización cuenta una sola vez: solo su última versión. Las
    // versiones anteriores de un mismo número no se listan (no son una
    // oportunidad aparte, evita duplicar/triplicar lo que se ve como
    // negocio cotizado).
    clauses.push(`c.version = (SELECT MAX(c2.version) FROM cotizaciones c2 WHERE c2.negocio_id = c.negocio_id AND c2.numero = c.numero)`);
    if (negocio_id) { clauses.push(`c.negocio_id = $${i++}`); params.push(negocio_id); }
    // Un vendedor solo ve las suyas, sin importar qué vendedor_id se pida.
    if (req.user.rol === 'vendedor') { clauses.push(`n.vendedor_id = $${i++}`); params.push(req.user.id); }
    else if (vendedor_id) { clauses.push(`n.vendedor_id = $${i++}`); params.push(vendedor_id); }
    if (q) {
      const condiciones = [
        `c.numero ILIKE $${i}`, `ct.nombre ILIKE $${i}`, `ct.apellido ILIKE $${i}`, `e.razon_social ILIKE $${i}`,
        `EXISTS (
          SELECT 1 FROM cotizacion_items ci LEFT JOIN productos p ON p.id = ci.producto_id
          WHERE ci.cotizacion_id = c.id AND (ci.descripcion ILIKE $${i} OR p.nombre ILIKE $${i} OR p.sku ILIKE $${i})
        )`,
      ];
      params.push(`%${q}%`); i++;
      // Búsqueda exacta por número de cotización NNNNNN o NNNNNN-VV, sin
      // que los ceros a la izquierda importen (p.ej. "501" o "501-02"
      // encuentra la cotización 000501, versión 02 si se indicó).
      const m = q.trim().match(/^0*(\d+)(?:-0*(\d+))?$/);
      if (m) {
        const numero = m[1].padStart(6, '0');
        params.push(numero);
        if (m[2]) {
          params.push(parseInt(m[2], 10));
          condiciones.push(`(c.numero = $${i} AND c.version = $${i + 1})`);
          i += 2;
        } else {
          condiciones.push(`c.numero = $${i}`);
          i += 1;
        }
      }
      clauses.push(`(${condiciones.join(' OR ')})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const cots = await db.all(
      `SELECT c.id, c.numero, c.version, c.estado, c.total, c.descuento_pct, c.negocio_id, c.titulo,
              c.created_at, c.fecha_envio, n.titulo AS negocio_titulo, u.nombre AS creado_por,
              ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido, e.razon_social AS empresa_nombre
       FROM cotizaciones c
       JOIN negocios n ON n.id = c.negocio_id
       JOIN contactos ct ON ct.id = n.contacto_id
       LEFT JOIN empresas e ON e.id = n.empresa_id
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
              n.etapa_id AS negocio_etapa_id, n.probabilidad_cierre AS negocio_probabilidad_cierre,
              pe.nombre AS negocio_etapa_nombre, pe.tipo AS negocio_etapa_tipo,
              ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido, ct.telefono_e164 AS contacto_telefono,
              ct.email AS contacto_email,
              e.razon_social AS empresa_nombre
       FROM cotizaciones c
       JOIN negocios n ON n.id = c.negocio_id
       LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id
       JOIN contactos ct ON ct.id = n.contacto_id
       LEFT JOIN empresas e ON e.id = n.empresa_id
       WHERE c.id = $1`, [req.params.id]);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });
    if (!puedeVer({ vendedor_id: cot.vendedor_id }, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const items = await db.all(
      `SELECT ci.*, p.nombre AS producto_nombre, p.sku, p.marca, p.categoria, p.url_imagen, p.descripcion_completa, p.ficha_tecnica_url
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
    if (!puedeVer({ vendedor_id: data.cot.vendedor_id }, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${numeroCompleto(data.cot.numero, data.cot.version)}.pdf"`);
    await generarCotizacionPDF(data, res);
  } catch (err) {
    console.error('[cotizaciones/:id/pdf]', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

// POST /api/cotizaciones/:id/enviar — envía la cotización al contacto por correo
// (API de Brevo), con el vendedor como "Responder a" y el PDF adjunto.
router.post('/:id/enviar', async (req, res) => {
  try {
    const data = await fetchCompleta({ id: req.params.id });
    if (!data) return res.status(404).json({ error: 'Cotización no encontrada' });
    if (!puedeEditar({ vendedor_id: data.cot.vendedor_id }, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    if (data.cot.estado === 'reemplazada') return res.status(409).json({ error: 'Esta versión fue reemplazada por una más nueva' });
    if (!data.cliente.contacto_email) return res.status(400).json({ error: 'El contacto no tiene email registrado' });

    const pdfBuffer = await generarCotizacionPDFBuffer(data);
    const linkPublico = `${process.env.APP_URL || ''}/c/${data.cot.token_publico}`;
    const resultado = await email.cotizacion(data.cliente.contacto_email, data.vendedor, data.cot, linkPublico, pdfBuffer, data.emisor);
    if (!resultado?.enviado) {
      return res.status(502).json({ error: 'No se pudo enviar el correo. Revisa la configuración de envío de correo.' });
    }

    await db.run(
      `UPDATE cotizaciones SET fecha_envio = now(), estado = CASE WHEN estado = 'borrador' THEN 'enviada' ELSE estado END
       WHERE id = $1`,
      [req.params.id]
    );
    const negocio = await negocioDe(req.params.id);
    if (negocio) await iniciarSecuenciaPostCotizacion(negocio, req.user.id);
    res.json({ message: 'Cotización enviada por correo a ' + data.cliente.contacto_email });
  } catch (err) {
    console.error('[cotizaciones/:id/enviar]', err);
    res.status(500).json({ error: 'Error al enviar el correo' });
  }
});

// POST /api/cotizaciones/:id/enviar-whatsapp — envía el PDF por WhatsApp al contacto
router.post('/:id/enviar-whatsapp', async (req, res) => {
  try {
    const data = await fetchCompleta({ id: req.params.id });
    if (!data) return res.status(404).json({ error: 'Cotización no encontrada' });
    if (!puedeEditar({ vendedor_id: data.cot.vendedor_id }, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    if (data.cot.estado === 'reemplazada') return res.status(409).json({ error: 'Esta versión fue reemplazada por una más nueva' });
    if (!data.cliente.contacto_telefono) return res.status(400).json({ error: 'El contacto no tiene teléfono registrado' });

    const nombreArchivo = `${numeroCompleto(data.cot.numero, data.cot.version)}.pdf`;
    const urlPdf = `${process.env.APP_URL || ''}/api/public/cotizacion/${data.cot.token_publico}/pdf`;
    const emisor = await db.get('SELECT mensaje_cotizacion_whatsapp FROM config_empresa WHERE id = 1');
    const resultado = await whatsapp.enviarDocumento(data.cliente.contacto_telefono, urlPdf, nombreArchivo, emisor?.mensaje_cotizacion_whatsapp);
    if (!resultado.enviado) {
      return res.status(502).json({ error: `No se pudo enviar por WhatsApp: ${resultado.motivo || 'error desconocido'}` });
    }

    const lead = await db.get('SELECT id FROM leads WHERE contacto_id = $1 ORDER BY created_at DESC LIMIT 1', [data.cliente.contacto_id]);
    await mensajes.registrar({
      contacto_id: data.cliente.contacto_id, lead_id: lead?.id ?? null,
      direccion: 'saliente', texto: `📄 Cotización ${numeroCompleto(data.cot.numero, data.cot.version)} enviada`, enviado_por_id: req.user.id,
    });
    await db.run(
      `UPDATE cotizaciones SET fecha_envio = now(), estado = CASE WHEN estado = 'borrador' THEN 'enviada' ELSE estado END
       WHERE id = $1`,
      [req.params.id]
    );
    const negocio = await negocioDe(req.params.id);
    if (negocio) await iniciarSecuenciaPostCotizacion(negocio, req.user.id);
    res.json({ message: 'Cotización enviada por WhatsApp a ' + data.cliente.contacto_telefono });
  } catch (err) {
    console.error('[cotizaciones/:id/enviar-whatsapp]', err);
    res.status(500).json({ error: 'Error al enviar por WhatsApp' });
  }
});

// POST /api/cotizaciones — nueva cotización (versión 1)
router.post('/', authorize('administrador', 'jefe_comercial', 'vendedor'), async (req, res) => {
  const { negocio_id, items, descuento_pct = 0, iva_pct = 19, validez_dias = 15, condiciones } = req.body;
  const titulo = mayusculas(req.body.titulo);
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
      `INSERT INTO cotizaciones (negocio_id, numero, version, estado, subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones, titulo, token_publico, creado_por_id)
       VALUES ($1,$2,1,'borrador',$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [negocio_id, numero, subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones || null, titulo || null, token, req.user.id]
    );
    const cotId = r.rows[0].id;
    for (const it of items) {
      const totalLinea = Math.round(Number(it.cantidad) * Number(it.precio_unitario));
      await client.query(
        `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, total_linea, mostrar_imagen, mostrar_descripcion, mostrar_ficha)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [cotId, it.producto_id || null, it.descripcion || null, it.cantidad, it.precio_unitario, totalLinea, it.mostrar_imagen !== false, it.mostrar_descripcion !== false, it.mostrar_ficha !== false]
      );
    }
    await avanzarAEtapaCotizado(client, negocio, req.user.id);
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

// PUT /api/cotizaciones/:id — edita una cotización en estado 'borrador' (incl. luego de "nueva versión")
router.put('/:id', authorize('administrador', 'jefe_comercial', 'vendedor'), async (req, res) => {
  const { items, descuento_pct = 0, iva_pct = 19, validez_dias = 15, condiciones } = req.body;
  const titulo = mayusculas(req.body.titulo);
  if (!itemsValidos(items)) return res.status(400).json({ error: 'Debe incluir al menos un ítem válido' });
  if (descuento_pct < 0 || descuento_pct > 100) return res.status(400).json({ error: 'Descuento inválido' });
  if (iva_pct < 0 || iva_pct > 100) return res.status(400).json({ error: 'IVA inválido' });

  const negocio = await negocioDe(req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

  const cot = await db.get('SELECT estado FROM cotizaciones WHERE id = $1', [req.params.id]);
  if (cot.estado !== 'borrador') return res.status(409).json({ error: 'Solo se puede editar una cotización en borrador' });

  const { subtotal, total } = calcular(items, descuento_pct, iva_pct);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE cotizaciones SET subtotal=$1, descuento_pct=$2, iva_pct=$3, total=$4, validez_dias=$5, condiciones=$6, titulo=$7,
              descuento_solicitado=false, descuento_aprobado_por_id=NULL
       WHERE id=$8`,
      [subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones || null, titulo || null, req.params.id]
    );
    await client.query('DELETE FROM cotizacion_items WHERE cotizacion_id = $1', [req.params.id]);
    for (const it of items) {
      const totalLinea = Math.round(Number(it.cantidad) * Number(it.precio_unitario));
      await client.query(
        `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, total_linea, mostrar_imagen, mostrar_descripcion, mostrar_ficha)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.params.id, it.producto_id || null, it.descripcion || null, it.cantidad, it.precio_unitario, totalLinea, it.mostrar_imagen !== false, it.mostrar_descripcion !== false, it.mostrar_ficha !== false]
      );
    }
    await client.query('COMMIT');
    res.json({ id: Number(req.params.id) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[cotizaciones/PUT /:id]', err);
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
      `INSERT INTO cotizaciones (negocio_id, numero, version, estado, subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones, titulo, token_publico, creado_por_id)
       VALUES ($1,$2,$3,'borrador',$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [base.negocio_id, base.numero, nuevaV, base.subtotal, base.descuento_pct, base.iva_pct, base.total, base.validez_dias, base.condiciones, base.titulo, token, req.user.id]
    );
    const nuevaId = r.rows[0].id;
    await client.query(
      `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, total_linea, mostrar_imagen, mostrar_descripcion, mostrar_ficha)
       SELECT $1, producto_id, descripcion, cantidad, precio_unitario, total_linea, mostrar_imagen, mostrar_descripcion, mostrar_ficha FROM cotizacion_items WHERE cotizacion_id=$2`,
      [nuevaId, req.params.id]
    );
    await avanzarAEtapaCotizado(client, negocio, req.user.id);
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
