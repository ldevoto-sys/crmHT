const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });
const { db } = require('../db');
const r2 = require('../services/r2');
const { authenticate, authorize } = require('../middleware/auth');
const { fetchCompleta, numeroCompleto } = require('../services/cotizacion_data');
const { generarCotizacionPDF, generarCotizacionPDFBuffer } = require('../services/pdf');
const timeline = require('../services/timeline');
const email = require('../services/email');
const whatsapp = require('../services/whatsapp');
const mensajes = require('../services/whatsapp_mensajes');
const secuencias = require('../services/secuencias');
const { obtenerUFDelDia } = require('../services/uf');
const { parseFracttal, fuzzyMatchProducto } = require('../services/parserFracttal');
const { calcularTotales } = require('../services/operacionesCalculo');
const { generarWordPropuesta } = require('../services/wordPropuesta');
const { DEFAULTS: PLANTILLAS_DEFAULTS, TIPOS_VALIDOS: TIPOS_PLANTILLA } = require('../services/plantillasTexto');
const { mayusculas } = require('../utils/texto');

router.use(authenticate);

// GET /api/cotizaciones/uf-del-dia — para precargar el valor de UF al
// calcular una cotización de Operaciones (siempre editable a mano).
router.get('/uf-del-dia', async (req, res) => {
  const resultado = await obtenerUFDelDia();
  if (!resultado.ok) return res.status(502).json(resultado);
  res.json(resultado);
});

// POST /api/cotizaciones/parse-fracttal {texto} — extrae los datos de una
// solicitud Fracttal pegada como texto y matchea sus ítems contra el maestro
// de productos (HT-AP-03 nota de cambio v1.18 §1). No guarda nada: el
// operador revisa/ajusta antes de aplicar al formulario.
router.post('/parse-fracttal', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Pega el correo de Fracttal primero' });

    const datos = parseFracttal(texto);
    const [productos, sinonimos] = await Promise.all([
      db.all(`SELECT id, nombre, descripcion, precio_lista FROM productos WHERE activo = true`),
      db.all(`SELECT termino_fracttal, termino_bbdd FROM cotizacion_sinonimos_operaciones WHERE activo = true`),
    ]);

    const items = datos.matItems.map((it) => {
      const match = fuzzyMatchProducto(it.desc, productos, sinonimos);
      return {
        cantidad: parseInt(it.qty, 10) || 1,
        descripcion: it.desc,
        producto_id: match ? match.producto_id : null,
        producto_nombre: match ? match.nombre : null,
        precio_unitario: match ? Number(match.precio_lista) || 0 : 0,
      };
    });

    res.json({ ...datos, items });
  } catch (err) {
    console.error('[cotizaciones/parse-fracttal]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

const DESCUENTO_MAX = parseFloat(process.env.DESCUENTO_MAX_SIN_APROBACION || '10');

async function negocioDe(cotId) {
  return db.get(
    `SELECT n.* FROM negocios n JOIN cotizaciones c ON c.negocio_id = n.id WHERE c.id = $1`, [cotId]
  );
}
function puedeEditar(negocio, user) {
  return negocio && (user.rol === 'administrador' || user.rol === 'jefe_comercial' || negocio.vendedor_id === user.id);
}

// Al generarse una cotización, el negocio avanza a la etapa "Cotizado" de su
// propio pipeline — pero solo hacia adelante: si ya está en una etapa
// posterior (p.ej. Negociación) o está cerrado, no se toca. Si esa etapa no
// existe en su pipeline (fue renombrada o eliminada), no se fuerza nada.
async function avanzarAEtapaCotizado(client, negocio, usuarioId) {
  const cotizada = (await client.query(
    `SELECT * FROM pipeline_etapas WHERE pipeline_id=$1 AND tipo='abierta' AND activo=true AND nombre ILIKE 'cotizado' LIMIT 1`,
    [negocio.pipeline_id]
  )).rows[0];
  if (!cotizada) return;
  const actual = negocio.etapa_id
    ? (await client.query('SELECT orden, tipo, nombre, secuencia_id FROM pipeline_etapas WHERE id=$1', [negocio.etapa_id])).rows[0]
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
  await secuencias.alCambiarEtapa({
    negocio, etapaAnterior: actual, etapaNueva: cotizada, usuarioId, client,
    origenDescripcion: 'al generar la cotización',
  });
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

// Cálculo de subtotal/total según origen (HT-AP-03 nota v1.18): Ventas Directas
// sigue con calcular() sin cambios; Operaciones usa el motor de MO/materiales
// y toma un snapshot de la UF del día (no cambia si se reabre la cotización
// más tarde). Lanza un error con `.status` en caso de UF no disponible.
async function calcularParaGuardar({ origen, items, descuento_pct, iva_pct, comuna_id, horas_normales, horas_extra }) {
  if (origen !== 'operaciones') {
    const { subtotal, total } = calcular(items, descuento_pct, iva_pct);
    return { subtotal, total, uf_valor: null, uf_fecha: null };
  }
  const config = await db.get('SELECT * FROM config_operaciones_mo WHERE id = 1');
  const comuna = comuna_id ? await db.get('SELECT * FROM comunas_operaciones WHERE id = $1', [comuna_id]) : null;
  const ufInfo = await obtenerUFDelDia();
  if (!ufInfo.ok) {
    const err = new Error('No se pudo obtener el valor de la UF del día. Reintenta o ingrésalo manualmente.');
    err.status = 502;
    throw err;
  }
  const r = calcularTotales({
    items, horasNormales: horas_normales || 0, horasExtra: horas_extra || 0,
    comuna, config, ufValor: ufInfo.valor, ivaPct: iva_pct,
  });
  return { subtotal: Math.round(r.totalNetoCLP), total: Math.round(r.totalConIva), uf_valor: ufInfo.valor, uf_fecha: ufInfo.fecha };
}

// GET /api/cotizaciones/plantillas-defaults — texto por defecto de cada
// plantilla de propuesta, para precargar los textareas al elegir tipo_plantilla.
router.get('/plantillas-defaults', (req, res) => res.json(PLANTILLAS_DEFAULTS));

// Campos comunes a POST / y PUT /:id introducidos por el Cotizador
// Operaciones y las plantillas de propuesta (nota v1.18). Devuelve
// {error} si algo es inválido, o el objeto ya validado/normalizado.
function validarCamposOperaciones(body, origenActual) {
  // origenActual: el valor ya guardado, para no resetearlo a 'venta_directa'
  // en un PUT que no lo reenvía explícitamente (solo aplica en creación).
  const origen = body.origen !== undefined ? body.origen : (origenActual || 'venta_directa');
  if (!['venta_directa', 'operaciones'].includes(origen)) return { error: 'Origen inválido' };
  const tipo_plantilla = body.tipo_plantilla || 'ninguna';
  if (!TIPOS_PLANTILLA.includes(tipo_plantilla)) return { error: 'Tipo de plantilla inválido' };
  const modalidad_precio = body.modalidad_precio || 'desglosado';
  if (!['desglosado', 'alzada'].includes(modalidad_precio)) return { error: 'Modalidad de precio inválida' };
  return {
    origen, tipo_plantilla, modalidad_precio,
    fracttal_numero: body.fracttal_numero || null,
    fracttal_fecha_solicitud: body.fracttal_fecha_solicitud || null,
    fracttal_solicitante: body.fracttal_solicitante || null,
    hallazgo: body.hallazgo || null,
    justificacion_tecnica: body.justificacion_tecnica || null,
    comuna_id: body.comuna_id || null,
    horas_normales: Number(body.horas_normales) || 0,
    horas_extra: Number(body.horas_extra) || 0,
    objeto_propuesta: body.objeto_propuesta || null,
    alcances_texto: body.alcances_texto || null,
    exclusiones_texto: body.exclusiones_texto || null,
    condiciones_ejecucion_texto: body.condiciones_ejecucion_texto || null,
    otras_consideraciones_texto: body.otras_consideraciones_texto || null,
  };
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
              ct.id AS contacto_id, ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido,
              ct.telefono_e164 AS contacto_telefono, ct.email AS contacto_email,
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
    const consideraciones = await db.all(
      `SELECT * FROM cotizacion_consideraciones WHERE cotizacion_id = $1 ORDER BY orden, id`, [req.params.id]);
    const requiere_aprobacion = Number(cot.descuento_pct) > DESCUENTO_MAX && !cot.descuento_aprobado_por_id;
    res.json({ ...cot, items, consideraciones, puede_editar: puedeEditar({ vendedor_id: cot.vendedor_id }, req.user), requiere_aprobacion, descuento_max: DESCUENTO_MAX });
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

// GET /api/cotizaciones/:id/word — descarga la plantilla de propuesta
// (HTCO01-04) rellena con los datos de la cotización, para retocar (fotos,
// ajustes) antes de convertirla a PDF y subirla como documento final.
router.get('/:id/word', async (req, res) => {
  try {
    const data = await fetchCompleta({ id: req.params.id });
    if (!data) return res.status(404).json({ error: 'Cotización no encontrada' });
    if (!puedeVer({ vendedor_id: data.cot.vendedor_id }, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const consideraciones = await db.all(
      `SELECT * FROM cotizacion_consideraciones WHERE cotizacion_id = $1 ORDER BY orden, id`, [req.params.id]);
    const { buffer, nombreArchivo } = generarWordPropuesta(data, consideraciones);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(buffer);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[cotizaciones/:id/word]', err);
    res.status(500).json({ error: 'Error al generar el Word' });
  }
});

// POST /api/cotizaciones/:id/documento-final (multipart, campo "archivo") —
// sube el PDF ya retocado (a partir del Word descargado) a un bucket privado.
// Requerido antes de poder "Enviar cotización" cuando hay tipo_plantilla.
router.post('/:id/documento-final', upload.single('archivo'), async (req, res) => {
  try {
    const negocio = await negocioDe(req.params.id);
    if (!negocio) return res.status(404).json({ error: 'Cotización no encontrada' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });
    const cot = await db.get('SELECT tipo_plantilla FROM cotizaciones WHERE id = $1', [req.params.id]);
    if (cot.tipo_plantilla === 'ninguna') return res.status(400).json({ error: 'Esta cotización no usa plantilla de propuesta' });
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'El documento final debe ser un PDF' });
    if (!r2.configuradoDespacho()) {
      return res.status(503).json({ error: 'El almacenamiento de documentos no está configurado todavía.' });
    }
    const key = `cotizaciones/${req.params.id}/final_${crypto.randomBytes(6).toString('hex')}.pdf`;
    const r = await r2.subirDespacho(key, req.file.buffer, req.file.mimetype);
    if (!r.subido) return res.status(502).json({ error: r.motivo || 'No se pudo subir el documento' });
    await db.run('UPDATE cotizaciones SET documento_final_url = $1, documento_final_subido_en = now() WHERE id = $2', [key, req.params.id]);
    res.json({ message: 'Documento final subido' });
  } catch (err) {
    console.error('[cotizaciones/:id/documento-final POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/cotizaciones/:id/documento-final — descarga autenticada (bucket privado)
router.get('/:id/documento-final', async (req, res) => {
  try {
    const cot = await db.get(
      `SELECT c.documento_final_url, n.vendedor_id
       FROM cotizaciones c JOIN negocios n ON n.id = c.negocio_id WHERE c.id = $1`, [req.params.id]);
    if (!cot || !cot.documento_final_url) return res.status(404).json({ error: 'Documento no encontrado' });
    if (!puedeVer({ vendedor_id: cot.vendedor_id }, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    const archivo = await r2.descargarDespacho(cot.documento_final_url);
    if (!archivo) return res.status(404).json({ error: 'Documento no encontrado en el almacenamiento' });
    res.setHeader('Content-Type', archivo.contentType || 'application/pdf');
    res.send(archivo.buffer);
  } catch (err) {
    console.error('[cotizaciones/:id/documento-final GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/cotizaciones/:id/enviar — envía la cotización al contacto por correo
// (API de Brevo), con el vendedor como "Responder a" y el PDF adjunto. Si la
// cotización usa una plantilla de propuesta (tipo_plantilla), se adjunta el
// documento final ya subido en vez del PDF de tabla de ítems generado por el
// sistema — y se exige que ya se haya subido.
router.post('/:id/enviar', async (req, res) => {
  try {
    const data = await fetchCompleta({ id: req.params.id });
    if (!data) return res.status(404).json({ error: 'Cotización no encontrada' });
    if (!puedeEditar({ vendedor_id: data.cot.vendedor_id }, req.user)) return res.status(403).json({ error: 'Sin permiso' });
    if (data.cot.estado === 'reemplazada') return res.status(409).json({ error: 'Esta versión fue reemplazada por una más nueva' });
    if (!data.cliente.contacto_email) return res.status(400).json({ error: 'El contacto no tiene email registrado' });

    let pdfBuffer;
    if (data.cot.tipo_plantilla !== 'ninguna') {
      if (!data.cot.documento_final_url) return res.status(400).json({ error: 'Sube el documento final (PDF) antes de enviar esta cotización.' });
      const archivo = await r2.descargarDespacho(data.cot.documento_final_url);
      if (!archivo) return res.status(502).json({ error: 'No se pudo leer el documento final subido' });
      pdfBuffer = archivo.buffer;
    } else {
      pdfBuffer = await generarCotizacionPDFBuffer(data);
    }
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
    if (data.cot.tipo_plantilla !== 'ninguna' && !data.cot.documento_final_url) {
      return res.status(400).json({ error: 'Sube el documento final (PDF) antes de enviar esta cotización.' });
    }

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

  const campos = validarCamposOperaciones(req.body);
  if (campos.error) return res.status(400).json({ error: campos.error });

  let calc;
  try {
    calc = await calcularParaGuardar({
      origen: campos.origen, items, descuento_pct, iva_pct,
      comuna_id: campos.comuna_id, horas_normales: campos.horas_normales, horas_extra: campos.horas_extra,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const { subtotal, total, uf_valor, uf_fecha } = calc;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const numero = await proximoNumero(client);
    const token = crypto.randomBytes(16).toString('hex');
    const r = await client.query(
      `INSERT INTO cotizaciones (
         negocio_id, numero, version, estado, subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones, titulo, token_publico, creado_por_id,
         origen, fracttal_numero, fracttal_fecha_solicitud, fracttal_solicitante, hallazgo, justificacion_tecnica, modalidad_precio,
         comuna_id, horas_normales, horas_extra, uf_valor, uf_fecha,
         tipo_plantilla, objeto_propuesta, alcances_texto, exclusiones_texto, condiciones_ejecucion_texto, otras_consideraciones_texto
       )
       VALUES ($1,$2,1,'borrador',$3,$4,$5,$6,$7,$8,$9,$10,$11,
               $12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,$22,$23,
               $24,$25,$26,$27,$28,$29)
       RETURNING id`,
      [negocio_id, numero, subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones || null, titulo || null, token, req.user.id,
       campos.origen, campos.fracttal_numero, campos.fracttal_fecha_solicitud, campos.fracttal_solicitante, campos.hallazgo, campos.justificacion_tecnica, campos.modalidad_precio,
       campos.comuna_id, campos.horas_normales, campos.horas_extra, uf_valor, uf_fecha,
       campos.tipo_plantilla, campos.objeto_propuesta, campos.alcances_texto, campos.exclusiones_texto, campos.condiciones_ejecucion_texto, campos.otras_consideraciones_texto]
    );
    const cotId = r.rows[0].id;
    for (const it of items) {
      const factor = it.factor === undefined || it.factor === null ? 1 : Number(it.factor);
      const totalLinea = Math.round(Number(it.cantidad) * Number(it.precio_unitario) * factor);
      await client.query(
        `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, factor, total_linea, mostrar_imagen, mostrar_descripcion, mostrar_ficha)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [cotId, it.producto_id || null, it.descripcion || null, it.cantidad, it.precio_unitario, factor, totalLinea, it.mostrar_imagen !== false, it.mostrar_descripcion !== false, it.mostrar_ficha !== false]
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

  const cot = await db.get('SELECT estado, origen FROM cotizaciones WHERE id = $1', [req.params.id]);
  if (cot.estado !== 'borrador') return res.status(409).json({ error: 'Solo se puede editar una cotización en borrador' });

  const campos = validarCamposOperaciones(req.body, cot.origen);
  if (campos.error) return res.status(400).json({ error: campos.error });

  let calc;
  try {
    calc = await calcularParaGuardar({
      origen: campos.origen, items, descuento_pct, iva_pct,
      comuna_id: campos.comuna_id, horas_normales: campos.horas_normales, horas_extra: campos.horas_extra,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const { subtotal, total, uf_valor, uf_fecha } = calc;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE cotizaciones SET subtotal=$1, descuento_pct=$2, iva_pct=$3, total=$4, validez_dias=$5, condiciones=$6, titulo=$7,
              descuento_solicitado=false, descuento_aprobado_por_id=NULL,
              origen=$8, fracttal_numero=$9, fracttal_fecha_solicitud=$10, fracttal_solicitante=$11, hallazgo=$12, justificacion_tecnica=$13, modalidad_precio=$14,
              comuna_id=$15, horas_normales=$16, horas_extra=$17, uf_valor=$18, uf_fecha=$19,
              tipo_plantilla=$20, objeto_propuesta=$21, alcances_texto=$22, exclusiones_texto=$23, condiciones_ejecucion_texto=$24, otras_consideraciones_texto=$25
       WHERE id=$26`,
      [subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones || null, titulo || null,
       campos.origen, campos.fracttal_numero, campos.fracttal_fecha_solicitud, campos.fracttal_solicitante, campos.hallazgo, campos.justificacion_tecnica, campos.modalidad_precio,
       campos.comuna_id, campos.horas_normales, campos.horas_extra, uf_valor, uf_fecha,
       campos.tipo_plantilla, campos.objeto_propuesta, campos.alcances_texto, campos.exclusiones_texto, campos.condiciones_ejecucion_texto, campos.otras_consideraciones_texto,
       req.params.id]
    );
    await client.query('DELETE FROM cotizacion_items WHERE cotizacion_id = $1', [req.params.id]);
    for (const it of items) {
      const factor = it.factor === undefined || it.factor === null ? 1 : Number(it.factor);
      const totalLinea = Math.round(Number(it.cantidad) * Number(it.precio_unitario) * factor);
      await client.query(
        `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, factor, total_linea, mostrar_imagen, mostrar_descripcion, mostrar_ficha)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.params.id, it.producto_id || null, it.descripcion || null, it.cantidad, it.precio_unitario, factor, totalLinea, it.mostrar_imagen !== false, it.mostrar_descripcion !== false, it.mostrar_ficha !== false]
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

const TAGS_CONSIDERACION = ['info', 'atencion', 'corte_agua', 'horario_no_habil', 'acceso', 'otro'];

async function puedeEditarConsideraciones(cotId, user) {
  const negocio = await negocioDe(cotId);
  if (!negocio || !puedeEditar(negocio, user)) return { ok: false, status: negocio ? 403 : 404 };
  const cot = await db.get('SELECT estado FROM cotizaciones WHERE id = $1', [cotId]);
  if (!cot) return { ok: false, status: 404 };
  if (cot.estado !== 'borrador') return { ok: false, status: 409, error: 'Solo se puede editar una cotización en borrador' };
  return { ok: true };
}

// POST /api/cotizaciones/:id/consideraciones {tag, texto} — agrega al final
router.post('/:id/consideraciones', async (req, res) => {
  try {
    const chk = await puedeEditarConsideraciones(req.params.id, req.user);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error || 'Sin permiso' });
    const { tag, texto } = req.body;
    if (!TAGS_CONSIDERACION.includes(tag)) return res.status(400).json({ error: 'Tag inválido' });
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Texto requerido' });
    const max = await db.get('SELECT COALESCE(MAX(orden), -1) AS m FROM cotizacion_consideraciones WHERE cotizacion_id = $1', [req.params.id]);
    const r = await db.run(
      `INSERT INTO cotizacion_consideraciones (cotizacion_id, tag, texto, orden) VALUES ($1,$2,$3,$4) RETURNING id`,
      [req.params.id, tag, texto.trim(), Number(max.m) + 1]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) {
    console.error('[cotizaciones/:id/consideraciones POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/cotizaciones/:id/consideraciones/:considId {tag, texto, orden}
router.put('/:id/consideraciones/:considId', async (req, res) => {
  try {
    const chk = await puedeEditarConsideraciones(req.params.id, req.user);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error || 'Sin permiso' });
    const existente = await db.get('SELECT id FROM cotizacion_consideraciones WHERE id = $1 AND cotizacion_id = $2', [req.params.considId, req.params.id]);
    if (!existente) return res.status(404).json({ error: 'Consideración no encontrada' });
    const { tag, texto, orden } = req.body;
    if (tag !== undefined && !TAGS_CONSIDERACION.includes(tag)) return res.status(400).json({ error: 'Tag inválido' });
    if (texto !== undefined && !texto.trim()) return res.status(400).json({ error: 'Texto requerido' });
    await db.run(
      `UPDATE cotizacion_consideraciones SET tag = COALESCE($1, tag), texto = COALESCE($2, texto), orden = COALESCE($3, orden) WHERE id = $4`,
      [tag || null, texto ? texto.trim() : null, orden ?? null, req.params.considId]
    );
    res.json({ message: 'Consideración actualizada' });
  } catch (err) {
    console.error('[cotizaciones/:id/consideraciones PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/cotizaciones/:id/consideraciones/:considId
router.delete('/:id/consideraciones/:considId', async (req, res) => {
  try {
    const chk = await puedeEditarConsideraciones(req.params.id, req.user);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error || 'Sin permiso' });
    const r = await db.run('DELETE FROM cotizacion_consideraciones WHERE id = $1 AND cotizacion_id = $2', [req.params.considId, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Consideración no encontrada' });
    res.json({ message: 'Consideración eliminada' });
  } catch (err) {
    console.error('[cotizaciones/:id/consideraciones DELETE]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
