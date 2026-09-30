// Endpoints de solo lectura para análisis (Cowork / agente de informes), montados
// dentro de /api/v1 (ver routes/api_v1.js): heredan su autenticación por token y
// su límite de tasa. Nada de acá escribe en la base.
//
// Pedido de Luis Devoto (30-09-2026), para poder analizar las oportunidades que
// llegan de clientes: CRM desde agosto-2026 + historia de Softland (replicada en
// las tablas reporte_softland_*, desde 2023-01-01), sin depender de que alguien
// corra consultas a mano.
//
// Convención de paginación (todos los listados de este archivo):
//   ?limit=&offset=  ->  { total, limit, offset, siguiente_offset, datos: [...] }
//   siguiente_offset es null cuando ya no quedan más filas.
// Los rangos de fecha son YYYY-MM-DD, ambos extremos incluidos.
const express = require('express');
const router = express.Router();
const { db } = require('../db');

function error(res, status, codigo, mensaje) {
  return res.status(status).json({ codigo, mensaje });
}

const num = v => (v === null || v === undefined ? null : Number(v));

function fechaValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// Devuelve { desde, hasta } validados, o null si respondió con error 400.
function leerRango(req, res, { obligatorio = false } = {}) {
  const { desde, hasta } = req.query;
  if (obligatorio && (!desde || !hasta)) {
    error(res, 400, 'rango_requerido', 'Indica desde y hasta (YYYY-MM-DD)');
    return null;
  }
  for (const [nombre, valor] of [['desde', desde], ['hasta', hasta]]) {
    if (valor && !fechaValida(valor)) {
      error(res, 400, 'fecha_invalida', `${nombre} debe tener formato YYYY-MM-DD válido`);
      return null;
    }
  }
  if (desde && hasta && desde > hasta) {
    error(res, 400, 'rango_invalido', 'desde no puede ser posterior a hasta');
    return null;
  }
  return { desde: desde || null, hasta: hasta || null };
}

function leerPaginacion(req, { porDefecto = 200, maximo = 1000 } = {}) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || porDefecto, 1), maximo);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  return { limit, offset };
}

function responderPaginado(res, datos, total, { limit, offset }, extra = {}) {
  const siguiente = offset + datos.length < total ? offset + datos.length : null;
  res.json({ total, limit, offset, siguiente_offset: siguiente, ...extra, datos });
}

// Acumulador de cláusulas WHERE con parámetros posicionales.
function armarFiltros() {
  const clauses = []; const params = [];
  return {
    agregar(sql, valor) { params.push(valor); clauses.push(sql.replace('?', `$${params.length}`)); },
    fijo(sql) { clauses.push(sql); },
    where() { return clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''; },
    params,
  };
}

// --- GET /cotizaciones -----------------------------------------------------
// Cotizaciones emitidas desde el CRM (desde ago-2026; antes vivían solo en
// Softland, ver /softland/cotizaciones). No expone token_publico ni la ruta del
// PDF. Montos tal como están guardados: total incluye IVA; el monto_estimado del
// negocio (ver /negocios) es el NETO.
router.get('/cotizaciones', async (req, res) => {
  try {
    const rango = leerRango(req, res); if (!rango) return;
    const { estado, origen, negocio_id, vendedor_id, solo_ultima_version } = req.query;
    const ESTADOS = ['borrador', 'enviada', 'vista', 'aceptada', 'rechazada', 'vencida', 'reemplazada'];
    if (estado && !ESTADOS.includes(estado)) return error(res, 400, 'estado_invalido', `estado debe ser uno de: ${ESTADOS.join(', ')}`);
    if (origen && !['venta_directa', 'operaciones'].includes(origen)) return error(res, 400, 'origen_invalido', 'origen debe ser venta_directa u operaciones');
    const pag = leerPaginacion(req);

    const f = armarFiltros();
    if (rango.desde) f.agregar('c.created_at::date >= ?', rango.desde);
    if (rango.hasta) f.agregar('c.created_at::date <= ?', rango.hasta);
    if (estado) f.agregar('c.estado = ?', estado);
    if (origen) f.agregar('c.origen = ?', origen);
    if (negocio_id) f.agregar('c.negocio_id = ?', negocio_id);
    if (vendedor_id) f.agregar('n.vendedor_id = ?', vendedor_id);
    if (solo_ultima_version === 'true') {
      f.fijo(`NOT EXISTS (SELECT 1 FROM cotizaciones c2 WHERE c2.negocio_id = c.negocio_id AND c2.numero = c.numero AND c2.version > c.version)`);
    }

    const desdeSql = `FROM cotizaciones c
       JOIN negocios n ON n.id = c.negocio_id
       LEFT JOIN empresas e ON e.id = n.empresa_id
       LEFT JOIN users uv ON uv.id = n.vendedor_id
       LEFT JOIN users uc ON uc.id = c.creado_por_id
       ${f.where()}`;
    const { total } = await db.get(`SELECT count(*)::int AS total ${desdeSql}`, f.params);
    const filas = await db.all(
      `SELECT c.id, c.negocio_id, c.numero, c.version, c.estado, c.origen, c.moneda,
              c.subtotal, c.descuento_pct, c.iva_pct, c.total, c.subtotal_uf, c.total_uf, c.uf_valor,
              c.validez_dias, c.fecha_envio, c.created_at,
              uc.nombre AS creado_por_nombre,
              n.titulo AS negocio_titulo, n.vendedor_id, uv.nombre AS vendedor_nombre,
              uv.codigo_softland AS vendedor_codigo_softland,
              n.empresa_id AS cliente_id, e.razon_social AS cliente_razon_social
       ${desdeSql}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ${pag.limit} OFFSET ${pag.offset}`,
      f.params
    );
    const datos = filas.map(c => ({
      id: String(c.id), negocio_id: String(c.negocio_id), numero: c.numero, version: c.version,
      estado: c.estado, origen: c.origen, moneda: c.moneda,
      subtotal: num(c.subtotal), descuento_pct: num(c.descuento_pct), iva_pct: num(c.iva_pct), total: num(c.total),
      subtotal_uf: num(c.subtotal_uf), total_uf: num(c.total_uf), uf_valor: num(c.uf_valor),
      validez_dias: c.validez_dias, fecha_envio: c.fecha_envio, fecha_creacion: c.created_at,
      creado_por_nombre: c.creado_por_nombre || null,
      negocio_titulo: c.negocio_titulo,
      vendedor_id: c.vendedor_id ? String(c.vendedor_id) : null,
      vendedor_nombre: c.vendedor_nombre || null,
      vendedor_codigo_softland: c.vendedor_codigo_softland || null,
      cliente_id: c.cliente_id ? String(c.cliente_id) : null,
      cliente_razon_social: c.cliente_razon_social || null,
    }));
    responderPaginado(res, datos, total, pag);
  } catch (err) {
    console.error('[api/v1/cotizaciones GET]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

// --- GET /whatsapp/mensajes ------------------------------------------------
// Mensajes de WhatsApp por rango de fechas (obligatorio), para revisar
// conversaciones en bloque. Incluye conversaciones archivadas (se necesitan para
// evaluar el servicio, decisión de Luis Devoto 30-09-2026). EXCLUYE contactos
// anonimizados (nombre '(Eliminado)' en cualquier capitalización, ver
// services/privacidad.js). No trae los
// archivos adjuntos, solo su nombre/tipo. lead_id/negocio_id salen de la liga
// mensaje → lead → negocio; quedan null si el mensaje no tiene lead.
router.get('/whatsapp/mensajes', async (req, res) => {
  try {
    const rango = leerRango(req, res, { obligatorio: true }); if (!rango) return;
    const { contacto_id, negocio_id, direccion } = req.query;
    if (direccion && !['entrante', 'saliente'].includes(direccion)) return error(res, 400, 'direccion_invalida', 'direccion debe ser entrante o saliente');
    const pag = leerPaginacion(req, { porDefecto: 500, maximo: 1000 });

    const f = armarFiltros();
    f.agregar('wm.created_at::date >= ?', rango.desde);
    f.agregar('wm.created_at::date <= ?', rango.hasta);
    // Comparación sin distinguir mayúsculas: anonimizarContacto() guarda
    // '(Eliminado)', pero initDb() pasa a mayúsculas todos los nombres de
    // contactos en cada arranque (db.js, estandarización de nombres) — tras
    // cualquier reinicio queda '(ELIMINADO)'.
    f.fijo(`UPPER(TRIM(c.nombre)) <> '(ELIMINADO)'`);
    if (contacto_id) f.agregar('wm.contacto_id = ?', contacto_id);
    if (negocio_id) f.agregar('l.negocio_id = ?', negocio_id);
    if (direccion) f.agregar('wm.direccion = ?', direccion);

    const desdeSql = `FROM whatsapp_mensajes wm
       JOIN contactos c ON c.id = wm.contacto_id
       LEFT JOIN empresas em ON em.id = c.empresa_id
       LEFT JOIN leads l ON l.id = wm.lead_id
       LEFT JOIN users u ON u.id = wm.enviado_por_id
       LEFT JOIN whatsapp_conversaciones wc ON wc.contacto_id = wm.contacto_id
       ${f.where()}`;
    const { total } = await db.get(`SELECT count(*)::int AS total ${desdeSql}`, f.params);
    const filas = await db.all(
      `SELECT wm.id, wm.contacto_id, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido,
              c.empresa_id, em.razon_social AS empresa_razon_social,
              wm.lead_id, l.negocio_id, wm.direccion, wm.tipo, wm.texto,
              wm.enviado_por_id, u.nombre AS enviado_por_nombre,
              (wm.direccion = 'saliente' AND wm.enviado_por_id IS NULL) AS es_bot,
              wm.archivo_nombre, wm.archivo_mime, (wm.archivo_key IS NOT NULL) AS tiene_archivo,
              wm.created_at, wm.wa_timestamp,
              COALESCE(wc.archivada, false) AS conversacion_archivada
       ${desdeSql}
       ORDER BY wm.created_at ASC, wm.id ASC
       LIMIT ${pag.limit} OFFSET ${pag.offset}`,
      f.params
    );
    const datos = filas.map(m => ({
      id: String(m.id),
      contacto_id: String(m.contacto_id),
      contacto_nombre: [m.contacto_nombre, m.contacto_apellido].filter(Boolean).join(' ') || null,
      empresa_id: m.empresa_id ? String(m.empresa_id) : null,
      empresa: m.empresa_razon_social || null,
      lead_id: m.lead_id ? String(m.lead_id) : null,
      negocio_id: m.negocio_id ? String(m.negocio_id) : null,
      direccion: m.direccion, tipo: m.tipo, texto: m.texto,
      enviado_por_id: m.enviado_por_id ? String(m.enviado_por_id) : null,
      enviado_por_nombre: m.enviado_por_nombre || null,
      es_bot: m.es_bot,
      archivo_nombre: m.archivo_nombre, archivo_mime: m.archivo_mime, tiene_archivo: m.tiene_archivo,
      fecha: m.created_at, fecha_meta: m.wa_timestamp,
      conversacion_archivada: m.conversacion_archivada,
    }));
    responderPaginado(res, datos, total, pag);
  } catch (err) {
    console.error('[api/v1/whatsapp/mensajes GET]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

// --- GET /softland/:tipo ---------------------------------------------------
// Documentos de Softland replicados en el CRM (tablas reporte_softland_*, se
// recargan cada noche a las 23:00 — ver services/softlandSync.js). Cobertura
// real en `meta`. Las cotizaciones de Softland llegan solo hasta jul-2026: desde
// ago-2026 las cotizaciones están en el CRM (/cotizaciones).
const SOFTLAND = {
  cotizaciones: {
    tabla: 'reporte_softland_cotizaciones', numero: 'cot_num',
    columnas: 'cot_num AS numero, anio, mes, fecha, vencod, nombre_vendedor, cod_cliente, nombre_cliente, monto',
    nota: 'Cotizaciones de Softland hasta jul-2026; desde ago-2026 ver /cotizaciones (CRM).',
  },
  'notas-venta': {
    tabla: 'reporte_softland_notas_venta', numero: 'nv_numero',
    columnas: 'nv_numero AS numero, anio, mes, fecha, vencod, nombre_vendedor, cod_cliente, nombre_cliente, num_oc, monto',
    nota: null,
  },
  facturas: {
    tabla: 'reporte_softland_facturas', numero: 'folio',
    columnas: 'folio AS numero, anio, mes, fecha, vencod, nombre_vendedor, cod_cliente, nombre_cliente, monto, negocio_id',
    nota: null,
  },
};

router.get('/softland/:tipo', async (req, res) => {
  try {
    const def = SOFTLAND[req.params.tipo];
    if (!def) return error(res, 400, 'tipo_invalido', `Tipo inválido. Disponibles: ${Object.keys(SOFTLAND).join(', ')}`);
    const rango = leerRango(req, res); if (!rango) return;
    const { vencod, cod_cliente } = req.query;
    const pag = leerPaginacion(req);

    const f = armarFiltros();
    if (rango.desde) f.agregar('fecha >= ?', rango.desde);
    if (rango.hasta) f.agregar('fecha <= ?', rango.hasta);
    if (vencod) f.agregar('vencod = ?', vencod);
    if (cod_cliente) f.agregar('cod_cliente = ?', cod_cliente);

    const { total } = await db.get(`SELECT count(*)::int AS total FROM ${def.tabla} ${f.where()}`, f.params);
    const filas = await db.all(
      `SELECT ${def.columnas} FROM ${def.tabla} ${f.where()}
       ORDER BY fecha DESC, ${def.numero} DESC
       LIMIT ${pag.limit} OFFSET ${pag.offset}`,
      f.params
    );
    const cobertura = await db.get(`SELECT MIN(fecha) AS desde_disponible, MAX(fecha) AS hasta_disponible FROM ${def.tabla}`);
    const sync = await db.get(`SELECT fecha, ejecutado_en FROM reporte_softland_sync WHERE ok = true ORDER BY fecha DESC LIMIT 1`);
    const datos = filas.map(r => ({
      ...r,
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : r.fecha,
      monto: num(r.monto),
      ...(r.negocio_id !== undefined ? { negocio_id: r.negocio_id ? String(r.negocio_id) : null } : {}),
    }));
    responderPaginado(res, datos, total, pag, {
      meta: {
        tipo: req.params.tipo,
        desde_disponible: cobertura.desde_disponible instanceof Date ? cobertura.desde_disponible.toISOString().slice(0, 10) : cobertura.desde_disponible,
        hasta_disponible: cobertura.hasta_disponible instanceof Date ? cobertura.hasta_disponible.toISOString().slice(0, 10) : cobertura.hasta_disponible,
        ultima_sincronizacion: sync ? sync.ejecutado_en : null,
        nota: def.nota,
      },
    });
  } catch (err) {
    console.error('[api/v1/softland GET]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

// --- GET /seguimientos -----------------------------------------------------
// Registro del seguimiento automático, de dos fuentes:
//   fuente=secuencia          pasos ejecutados por el motor de secuencias
//                             (secuencia_ejecuciones). resultado: enviado_automatico
//                             (correo/WhatsApp que salió solo), tarea_generada
//                             (el envío falló o el canal es llamada/tarea) o
//                             cambio_etapa.
//   fuente=plantilla_whatsapp plantilla "Seguimiento de cotización" y encuesta de
//                             causa de no cierre (whatsapp_correlacion).
// Sobre "si el cliente respondió" — el CRM NO tiene un detector de respuesta
// general (no existe para correo). Se entregan dos datos de distinto valor:
//   pausada_por_respuesta_cliente  dato real: la secuencia se pausó porque el
//                                  cliente respondió (solo fuente=secuencia).
//   respuesta_whatsapp_inferida    INFERIDO: hubo algún mensaje entrante del
//                                  contacto por WhatsApp dentro de ventana_dias
//                                  (default 7) después del envío. No prueba que
//                                  sea respuesta a ese envío.
router.get('/seguimientos', async (req, res) => {
  try {
    const rango = leerRango(req, res); if (!rango) return;
    const { negocio_id, fuente } = req.query;
    if (fuente && !['secuencia', 'plantilla_whatsapp'].includes(fuente)) return error(res, 400, 'fuente_invalida', 'fuente debe ser secuencia o plantilla_whatsapp');
    const ventana = req.query.ventana_dias === undefined ? 7 : parseInt(req.query.ventana_dias, 10);
    if (!Number.isInteger(ventana) || ventana < 1 || ventana > 30) return error(res, 400, 'ventana_invalida', 'ventana_dias debe ser un entero entre 1 y 30');
    const pag = leerPaginacion(req);

    const f = armarFiltros();
    if (rango.desde) f.agregar('ev.fecha::date >= ?', rango.desde);
    if (rango.hasta) f.agregar('ev.fecha::date <= ?', rango.hasta);
    if (negocio_id) f.agregar('ev.negocio_id = ?', negocio_id);
    if (fuente) f.agregar('ev.fuente = ?', fuente);
    f.params.push(ventana);
    const pVentana = `$${f.params.length}`;

    const eventosSql = `WITH ev AS (
        SELECT 'secuencia'::text AS fuente, se.id::text AS referencia_id, se.ejecutado_en AS fecha,
               ns.negocio_id, n.contacto_id, s.nombre AS secuencia, p.orden AS paso_orden, p.canal,
               p.asunto AS detalle,
               CASE WHEN p.canal = 'cambiar_etapa' THEN 'cambio_etapa'
                    WHEN p.canal IN ('correo','whatsapp') AND se.tarea_id IS NULL THEN 'enviado_automatico'
                    WHEN se.tarea_id IS NOT NULL THEN 'tarea_generada'
                    ELSE 'desconocido' END AS resultado,
               se.tarea_id, t.estado AS tarea_estado,
               (ns.estado = 'pausada' AND ns.pausada_motivo = 'Cliente respondió') AS pausada_por_respuesta_cliente
        FROM secuencia_ejecuciones se
        JOIN negocio_secuencias ns ON ns.id = se.negocio_secuencia_id
        JOIN secuencias s ON s.id = ns.secuencia_id
        JOIN negocios n ON n.id = ns.negocio_id
        LEFT JOIN secuencia_pasos p ON p.id = se.paso_id
        LEFT JOIN tareas t ON t.id = se.tarea_id
        UNION ALL
        SELECT 'plantilla_whatsapp'::text, wc.wa_message_id, wc.created_at,
               wc.negocio_id, n.contacto_id, NULL::text, NULL::int, 'whatsapp'::text,
               wc.proposito, 'enviado_automatico'::text, NULL::int, NULL::text, NULL::boolean
        FROM whatsapp_correlacion wc
        JOIN negocios n ON n.id = wc.negocio_id
      )`;
    const desdeSql = `${eventosSql}
      SELECT ev.*, r.primera AS primera_respuesta_whatsapp
      FROM ev
      LEFT JOIN LATERAL (
        SELECT MIN(m.created_at) AS primera FROM whatsapp_mensajes m
        WHERE m.contacto_id = ev.contacto_id AND m.direccion = 'entrante'
          AND m.created_at > ev.fecha AND m.created_at <= ev.fecha + make_interval(days => ${pVentana}::int)
      ) r ON true
      ${f.where()}`;
    const conteoSql = `${eventosSql} SELECT count(*)::int AS total FROM ev ${f.where()}`;
    // El conteo no usa ventana: se le pasa el mismo arreglo de parámetros, pero la
    // ventana solo se referencia en desdeSql (Postgres exige usar todos los $n, así
    // que el conteo toma los parámetros sin la ventana).
    const paramsConteo = f.params.slice(0, -1);
    const { total } = await db.get(conteoSql, paramsConteo);
    const filas = await db.all(`${desdeSql} ORDER BY ev.fecha DESC, ev.referencia_id DESC LIMIT ${pag.limit} OFFSET ${pag.offset}`, f.params);
    const datos = filas.map(e => ({
      fuente: e.fuente, referencia_id: e.referencia_id, fecha: e.fecha,
      negocio_id: String(e.negocio_id), contacto_id: e.contacto_id ? String(e.contacto_id) : null,
      secuencia: e.secuencia, paso_orden: e.paso_orden, canal: e.canal, detalle: e.detalle,
      resultado: e.resultado,
      tarea_id: e.tarea_id ? String(e.tarea_id) : null, tarea_estado: e.tarea_estado,
      pausada_por_respuesta_cliente: e.pausada_por_respuesta_cliente,
      respuesta_whatsapp_inferida: e.primera_respuesta_whatsapp !== null,
      primera_respuesta_whatsapp: e.primera_respuesta_whatsapp,
    }));
    responderPaginado(res, datos, total, pag, { meta: { ventana_dias: ventana } });
  } catch (err) {
    console.error('[api/v1/seguimientos GET]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

module.exports = router;
