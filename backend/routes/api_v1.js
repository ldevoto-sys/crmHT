// API REST de integración para Cowork (HT-DO-XX, Especificación API CRM v0.1).
//
// Primera vuelta, acordada con Gerencia (12-08-2026): cubre lo necesario para
// que Cowork registre clientes y negocios, y genere cotizaciones rápido desde
// afuera. Fuera de esta vuelta (no rompen nada si se agregan después):
// - cuadrante / tipo de cliente, tipo_documento (HT-CO-01..06): se aceptan en
//   el body si vienen, pero no se guardan todavía.
// - Estado fijo del negocio (recibido→...→traspasado_operaciones) tal como lo
//   describe el documento: el CRM no tiene esa máquina de estados, tiene un
//   pipeline configurable por etapas. Esta API expone la etapa real (nombre +
//   historial), no una traducción inventada al vocabulario del documento —
//   evita numerar en el ambiente cliente algo que no calza con lo que ve un
//   vendedor en el Pipeline.
// - Auth: un token estático por variable de entorno (COWORK_API_KEY), mismo
//   patrón que /api/leads/web — un solo integrador hoy, no se justifica una
//   tabla de tokens múltiples revocables individualmente.
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db');
const { sugerirVendedor } = require('../services/asignacion');
const timeline = require('../services/timeline');
const cot = require('./cotizaciones'); // expone proximoNumero, avanzarAEtapaCotizado, sincronizarMontoEstimado, redondearMonto

const APP_URL = process.env.APP_URL || '';

function error(res, status, codigo, mensaje) {
  return res.status(status).json({ codigo, mensaje });
}

// --- Auth: Bearer token estático (§5) ---
function requireToken(req, res, next) {
  if (!process.env.COWORK_API_KEY) return error(res, 503, 'no_configurado', 'Integración no configurada');
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token || token !== process.env.COWORK_API_KEY) return error(res, 401, 'no_autorizado', 'Token inválido o revocado');
  next();
}

// --- Límite de tasa: 60 solicitudes/minuto (§5), en memoria del proceso ---
const ventanaPeticiones = [];
function rateLimit(req, res, next) {
  const ahora = Date.now();
  while (ventanaPeticiones.length && ahora - ventanaPeticiones[0] > 60000) ventanaPeticiones.shift();
  if (ventanaPeticiones.length >= 60) return error(res, 429, 'limite_excedido', 'Máximo 60 solicitudes por minuto');
  ventanaPeticiones.push(ahora);
  next();
}

router.use(requireToken, rateLimit);

// El actor "Cowork" (seed en db.js) — se usa como autor en auditoría/timeline
// de todo lo que escribe esta API. Se cachea tras la primera consulta.
let coworkUserId = null;
async function idCowork() {
  if (coworkUserId) return coworkUserId;
  const u = await db.get(`SELECT id FROM users WHERE email = 'cowork@integracion.hidrotecnica.cl'`);
  coworkUserId = u ? u.id : null;
  return coworkUserId;
}

function clienteOut(empresa, contactos) {
  return {
    id: String(empresa.id),
    rut: empresa.rut,
    razon_social: empresa.razon_social,
    contactos: contactos.map(c => ({ id: String(c.id), nombre: [c.nombre, c.apellido].filter(Boolean).join(' '), email: c.email, telefono: c.telefono_e164 })),
    instalaciones: (empresa.direccion || empresa.comuna) ? [{ direccion: empresa.direccion, comuna: empresa.comuna }] : [],
  };
}

// GET /api/v1/clientes?rut=&nombre=
router.get('/clientes', async (req, res) => {
  try {
    const { rut, nombre } = req.query;
    if (!rut && !nombre) return error(res, 400, 'parametros_insuficientes', 'Indica rut o nombre para buscar');
    const clauses = []; const params = []; let i = 1;
    if (rut) { clauses.push(`rut = $${i++}`); params.push(rut); }
    if (nombre) { clauses.push(`razon_social ILIKE $${i++}`); params.push(`%${nombre}%`); }
    const empresas = await db.all(`SELECT * FROM empresas WHERE ${clauses.join(' OR ')} AND activo = true ORDER BY razon_social LIMIT 50`, params);
    const out = [];
    for (const e of empresas) {
      const contactos = await db.all('SELECT id, nombre, apellido, email, telefono_e164 FROM contactos WHERE empresa_id = $1 AND activo = true ORDER BY id', [e.id]);
      out.push(clienteOut(e, contactos));
    }
    res.json(out);
  } catch (err) {
    console.error('[api/v1/clientes GET]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

// POST /api/v1/clientes — alta de cliente potencial (idempotente por rut)
router.post('/clientes', async (req, res) => {
  try {
    const { rut, razon_social, contactos, instalaciones } = req.body;
    if (!razon_social) return error(res, 400, 'campos_requeridos', 'razon_social es obligatorio');

    let empresa = rut ? await db.get('SELECT * FROM empresas WHERE rut = $1', [rut]) : null;
    let creada = false;
    if (!empresa) {
      const instalacion = Array.isArray(instalaciones) && instalaciones[0] ? instalaciones[0] : {};
      const r = await db.run(
        `INSERT INTO empresas (razon_social, rut, direccion, comuna) VALUES ($1,$2,$3,$4) RETURNING *`,
        [razon_social, rut || null, instalacion.direccion || null, instalacion.comuna || null]
      );
      empresa = r.rows[0];
      creada = true;
    }

    const contactosCreados = [];
    for (const c of (Array.isArray(contactos) ? contactos : [])) {
      if (!c.nombre) continue;
      let existente = null;
      if (c.email) existente = await db.get('SELECT * FROM contactos WHERE empresa_id = $1 AND lower(email) = lower($2)', [empresa.id, c.email]);
      if (!existente) {
        const r = await db.run(
          `INSERT INTO contactos (nombre, email, telefono_e164, empresa_id, origen) VALUES ($1,$2,$3,$4,'api') RETURNING *`,
          [c.nombre, c.email || null, c.telefono || null, empresa.id]
        );
        existente = r.rows[0];
      }
      contactosCreados.push(existente);
    }

    const todosContactos = contactosCreados.length
      ? contactosCreados
      : await db.all('SELECT id, nombre, apellido, email, telefono_e164 FROM contactos WHERE empresa_id = $1 AND activo = true ORDER BY id', [empresa.id]);

    res.status(creada ? 201 : 200).json(clienteOut(empresa, todosContactos));
  } catch (err) {
    console.error('[api/v1/clientes POST]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

async function negocioConEtapa(id) {
  return db.get(
    `SELECT n.*, pe.nombre AS etapa_nombre, pe.tipo AS etapa_tipo, e.razon_social AS cliente_razon_social, e.rut AS cliente_rut
     FROM negocios n LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id LEFT JOIN empresas e ON e.id = n.empresa_id
     WHERE n.id = $1`, [id]
  );
}

function negocioOut(n) {
  return {
    id: String(n.id),
    cliente_id: n.empresa_id ? String(n.empresa_id) : null,
    origen: n.origen,
    referencia_externa: n.referencia_externa,
    fecha_ingreso: n.created_at,
    descripcion: n.titulo,
    urgencia: n.urgencia,
    etapa: n.etapa_id ? { id: n.etapa_id, nombre: n.etapa_nombre, tipo: n.etapa_tipo } : null,
    vendedor_id: n.vendedor_id ? String(n.vendedor_id) : null,
  };
}

// POST /api/v1/negocios — idempotente por (origen, referencia_externa)
router.post('/negocios', async (req, res) => {
  try {
    const { cliente_id, origen = 'otro', referencia_externa, descripcion, urgencia } = req.body;
    if (!cliente_id || !descripcion) return error(res, 400, 'campos_requeridos', 'cliente_id y descripcion son obligatorios');
    if (!['fracttal', 'correo', 'whatsapp', 'otro'].includes(origen)) return error(res, 400, 'origen_invalido', 'origen debe ser fracttal, correo, whatsapp u otro');

    if (referencia_externa) {
      const encontrado = await db.get('SELECT id FROM negocios WHERE origen = $1 AND referencia_externa = $2', [origen, referencia_externa]);
      if (encontrado) return res.status(200).json(negocioOut(await negocioConEtapa(encontrado.id)));
    }

    const empresa = await db.get('SELECT id FROM empresas WHERE id = $1 AND activo = true', [cliente_id]);
    if (!empresa) return error(res, 404, 'cliente_no_encontrado', 'cliente_id no existe o está inactivo');

    const contacto = await db.get('SELECT id FROM contactos WHERE empresa_id = $1 AND activo = true ORDER BY id LIMIT 1', [cliente_id]);
    if (!contacto) return error(res, 422, 'cliente_sin_contacto', 'El cliente no tiene un contacto registrado — usa POST /clientes primero');

    const sug = await sugerirVendedor({ contacto_id: contacto.id });
    if (!sug.vendedor_id) return error(res, 422, 'sin_vendedor_disponible', 'No hay vendedores activos para asignar el negocio');

    const etapaInicial = await db.get(
      `SELECT id, probabilidad_cierre FROM pipeline_etapas WHERE tipo = 'abierta' AND activo = true AND pipeline_id = 1 ORDER BY orden LIMIT 1`
    );

    const r = await db.run(
      `INSERT INTO negocios (contacto_id, empresa_id, vendedor_id, titulo, etapa_id, probabilidad_cierre, pipeline_id, origen, referencia_externa, urgencia)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9) RETURNING id`,
      [contacto.id, cliente_id, sug.vendedor_id, descripcion,
       etapaInicial ? etapaInicial.id : null, etapaInicial ? etapaInicial.probabilidad_cierre : null,
       origen, referencia_externa || null, urgencia === true]
    );
    const negocioId = r.rows[0].id;
    if (etapaInicial) {
      await db.run('INSERT INTO negocio_etapa_historial (negocio_id, etapa_id) VALUES ($1,$2)', [negocioId, etapaInicial.id]);
    }
    await timeline.registrar({
      negocio_id: negocioId, contacto_id: contacto.id, empresa_id: cliente_id,
      tipo: 'nota', usuario_id: await idCowork(),
      descripcion: `Negocio creado vía API (Cowork) — origen ${origen}${referencia_externa ? `, ref. ${referencia_externa}` : ''}`,
    });

    res.status(201).json(negocioOut(await negocioConEtapa(negocioId)));
  } catch (err) {
    console.error('[api/v1/negocios POST]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

// GET /api/v1/negocios/:id
router.get('/negocios/:id', async (req, res) => {
  try {
    const n = await negocioConEtapa(req.params.id);
    if (!n) return error(res, 404, 'no_encontrado', 'Negocio no encontrado');
    const historial = await db.all(
      `SELECT pe.nombre AS etapa, h.entro_en, h.salio_en FROM negocio_etapa_historial h
       JOIN pipeline_etapas pe ON pe.id = h.etapa_id WHERE h.negocio_id = $1 ORDER BY h.entro_en`, [n.id]
    );
    const cotizaciones = await db.all(
      `SELECT id, numero, version, estado, subtotal, total, moneda, subtotal_uf, total_uf, documento_final_url, fecha_envio, created_at
       FROM cotizaciones WHERE negocio_id = $1 ORDER BY created_at DESC`, [n.id]
    );
    res.json({ ...negocioOut(n), historial, cotizaciones });
  } catch (err) {
    console.error('[api/v1/negocios/:id GET]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

// POST /api/v1/negocios/:id/cotizaciones — registra una cotización emitida
router.post('/negocios/:id/cotizaciones', async (req, res) => {
  try {
    const { monto_neto, moneda = 'CLP', valor_uf, vigencia_dias = 15, condiciones, archivo_url, fecha_emision, fecha_envio, titulo } = req.body;
    if (!(monto_neto > 0)) return error(res, 400, 'campos_requeridos', 'monto_neto debe ser un número mayor a 0');
    if (!['CLP', 'UF'].includes(moneda)) return error(res, 400, 'moneda_invalida', 'moneda debe ser CLP o UF');
    if (moneda === 'UF' && !(valor_uf > 0)) return error(res, 400, 'campos_requeridos', 'valor_uf es obligatorio cuando moneda es UF');

    const negocio = await db.get('SELECT * FROM negocios WHERE id = $1', [req.params.id]);
    if (!negocio) return error(res, 404, 'no_encontrado', 'Negocio no encontrado');

    const subtotalUf = moneda === 'UF' ? monto_neto : null;
    const totalUf = moneda === 'UF' ? cot.redondearMonto(monto_neto * 1.19, 'UF') : null;
    const subtotal = moneda === 'UF' ? Math.round(subtotalUf * valor_uf) : monto_neto;
    const total = moneda === 'UF' ? Math.round(totalUf * valor_uf) : cot.redondearMonto(monto_neto * 1.19, 'CLP');
    const origenCot = negocio.origen === 'fracttal' ? 'operaciones' : 'venta_directa';
    const actorId = await idCowork();

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const numero = await cot.proximoNumero(client);
      const token = crypto.randomBytes(16).toString('hex');
      const estado = fecha_envio ? 'enviada' : 'borrador';
      const r = await client.query(
        `INSERT INTO cotizaciones (
           negocio_id, numero, version, estado, subtotal, descuento_pct, iva_pct, total, validez_dias, condiciones, titulo,
           token_publico, creado_por_id, origen, moneda, subtotal_uf, total_uf, uf_valor, uf_fecha,
           documento_final_url, documento_final_subido_en, fecha_envio
         ) VALUES ($1,$2,1,$3,$4,0,19,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id`,
        [req.params.id, numero, estado, subtotal, total, vigencia_dias, condiciones || null, titulo || null,
         token, actorId, origenCot, moneda, subtotalUf, totalUf, valor_uf || null, fecha_emision || null,
         archivo_url || null, archivo_url ? new Date() : null, fecha_envio || null]
      );
      const cotId = r.rows[0].id;
      await cot.sincronizarMontoEstimado(client, req.params.id, subtotal);
      await cot.avanzarAEtapaCotizado(client, negocio, actorId);
      await client.query('COMMIT');

      await timeline.registrar({
        negocio_id: req.params.id, contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id,
        tipo: 'nota', usuario_id: actorId, referencia_id: cotId,
        descripcion: `Cotización ${numero} registrada vía API (Cowork)${archivo_url ? ' — documento adjunto' : ''}`,
      });

      res.status(201).json({
        id: String(cotId), numero, version: 1, estado, monto_neto, moneda,
        vigencia_dias, token_publico: token, link_publico: `${APP_URL}/c/${token}`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[api/v1/negocios/:id/cotizaciones POST]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

module.exports = router;
