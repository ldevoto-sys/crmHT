// Reportería Comercial + Softland — utilidades de administración.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const softland = require('../services/softland');
const { sincronizar } = require('../services/softlandSync');

router.use(authenticate);

// GET /api/softland/test — prueba la conexión a la réplica de Softland.
// No se puede probar en este entorno de desarrollo (sin salida de red hacia
// Softland) — este endpoint es la forma de verificarlo una vez desplegado.
router.get('/test', authorize('administrador'), async (req, res) => {
  try {
    const filas = await softland.query('SELECT GETDATE() AS fecha_servidor, DB_NAME() AS base_datos');
    res.json({ ok: true, ...filas[0] });
  } catch (err) {
    console.error('[softland/test]', err);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// GET /api/softland/sync/estado — última corrida de la rutina nocturna (o
// de un disparo manual), para mostrar en el botón "Actualizar" del reporte
// ("Última actualización: 19-08-2026 23:00" o el error si falló).
router.get('/sync/estado', authorize('administrador', 'jefe_comercial', 'gerencia'), async (req, res) => {
  try {
    const ultima = await db.get('SELECT * FROM reporte_softland_sync ORDER BY ejecutado_en DESC LIMIT 1');
    res.json(ultima || null);
  } catch (err) {
    console.error('[softland/sync/estado]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/softland/sync — dispara la sincronización a mano (botón
// "Actualizar" del reporte). Misma rutina que corre sola a las 23:00;
// acá se puede repetir cuantas veces haga falta, no hay control de "una
// vez por día" como en la automática.
router.post('/sync', authorize('administrador', 'jefe_comercial', 'gerencia'), async (req, res) => {
  const resultado = await sincronizar();
  if (!resultado.ok) return res.status(502).json(resultado);
  res.json(resultado);
});

const AREA_LABEL = { meson: 'Ventas Mesón', operaciones: 'Operaciones', vregion: 'V Región', otros: 'Otros' };

// Código de vencod para vendedores del CRM sin codigo_softland cargado
// (mismo criterio ya usado y validado en generar_dashboard.py).
const VENCOD_SIN_CODIGO = 'OTRO';

// Mapa oficial vendedor/código → área (HT-IN-01 §4.6, skill de dashboards
// Softland — responsable Luis Devoto), el mismo ya validado y usado en
// generar_dashboard.py. Es la fuente de verdad: cubre tanto vendedores
// reales como códigos de contrato/grupo (M10, U12, etc.) que no tienen
// cotización ni NV propia y nunca van a tener usuario en el CRM. Reemplaza
// la corrección puntual del 21-08-2026 (que solo cubría 6 de los 10
// códigos de Operaciones documentados acá).
const AREA_MAP = {
  V02: 'meson', V03: 'meson', V04: 'meson', V05: 'meson', V06: 'meson', V07: 'meson',
  V09: 'meson', V16: 'meson', V17: 'meson', VI2: 'meson', VI3: 'meson', VI5: 'meson', C10: 'meson',
  C20: 'operaciones', U12: 'operaciones', U13: 'operaciones', L14: 'operaciones',
  M10: 'operaciones', M16: 'operaciones', M20: 'operaciones', M30: 'operaciones', M40: 'operaciones', M50: 'operaciones',
  V10: 'vregion',
  V01: 'otros', U14: 'otros', ESP: 'otros',
};

// Mismo fallback documentado en HT-IN-01 §4.6 para códigos no listados
// arriba (ej. un vendedor nuevo con código todavía no agregado al mapa).
function areaPorFallback(codigo) {
  if (codigo.startsWith('VT')) return 'operaciones';
  if (codigo.startsWith('M')) return 'operaciones';
  if (codigo.startsWith('V')) return 'meson';
  return null;
}

// Área cargada a mano en Usuarios queda como último recurso — solo aplica
// a códigos que ni el mapa oficial ni el fallback por prefijo reconocen
// (ej. códigos numéricos como vendedores cargados con un VenCod atípico).
const resolverArea = (vencod, areaDeUsuario) => {
  const codigo = String(vencod || '').toUpperCase();
  return AREA_MAP[codigo] || areaPorFallback(codigo) || areaDeUsuario || null;
};

// GET /api/softland/reporte — dataset completo para la Reportería Comercial
// + Softland. Sin filtros por query string a propósito: el volumen es bajo
// (unos cientos de filas mensuales) y la maqueta ya resolvió filtrar/agregar
// del lado del navegador — repetir esa lógica acá sería duplicarla sin
// necesidad.
router.get('/reporte', authorize('administrador', 'jefe_comercial', 'vendedor', 'gerencia'), async (req, res) => {
  try {
    // Base: caché de Softland (cotizado hasta jul-2026, cerrado/facturado
    // siempre), con el área resuelta por el código de vendedor.
    const base = await db.all(`
      SELECT m.anio, m.mes, m.vencod, m.nombre_vendedor,
             u.area,
             m.cotizado_monto, m.cotizado_cant,
             m.cerrado_monto, m.cerrado_cant,
             m.facturado_monto, m.facturado_cant
      FROM reporte_softland_mensual m
      LEFT JOIN users u ON u.codigo_softland = m.vencod
      ORDER BY m.anio, m.mes, m.vencod
    `);

    // Cotizado en vivo desde el CRM (ago-2026 en adelante) — la consulta a
    // Softland que llena la caché ya corta en 2026-08-01, así que acá no hay
    // riesgo de duplicar montos.
    const cotizadoCrm = await db.all(`
      SELECT date_part('year', c.created_at)::int AS anio,
             date_part('month', c.created_at)::int AS mes,
             COALESCE(u.codigo_softland, $1) AS vencod,
             u.nombre AS nombre_vendedor,
             u.area AS area,
             COUNT(*)::int AS cotizado_cant,
             COALESCE(SUM(c.subtotal), 0) AS cotizado_monto
      FROM cotizaciones c
      JOIN negocios n ON n.id = c.negocio_id
      LEFT JOIN users u ON u.id = n.vendedor_id
      WHERE c.estado <> 'reemplazada' AND c.created_at >= '2026-08-01'
      GROUP BY 1, 2, 3, 4, 5
    `, [VENCOD_SIN_CODIGO]);

    const filas = new Map();
    const clave = r => `${r.anio}-${r.mes}-${r.vencod}`;
    for (const r of base) {
      filas.set(clave(r), {
        anio: r.anio, mes: r.mes, vencod: r.vencod, nombre_vendedor: r.nombre_vendedor, area: resolverArea(r.vencod, r.area),
        cotizado_monto: Number(r.cotizado_monto), cotizado_cant: Number(r.cotizado_cant),
        cerrado_monto: Number(r.cerrado_monto), cerrado_cant: Number(r.cerrado_cant),
        facturado_monto: Number(r.facturado_monto), facturado_cant: Number(r.facturado_cant),
      });
    }
    for (const r of cotizadoCrm) {
      const k = clave(r);
      const existente = filas.get(k);
      if (existente) {
        existente.cotizado_monto = Number(r.cotizado_monto);
        existente.cotizado_cant = Number(r.cotizado_cant);
        if (!existente.nombre_vendedor) existente.nombre_vendedor = r.nombre_vendedor;
        if (!existente.area) existente.area = r.area;
      } else {
        filas.set(k, {
          anio: r.anio, mes: r.mes, vencod: r.vencod, nombre_vendedor: r.nombre_vendedor, area: r.area,
          cotizado_monto: Number(r.cotizado_monto), cotizado_cant: Number(r.cotizado_cant),
          cerrado_monto: 0, cerrado_cant: 0, facturado_monto: 0, facturado_cant: 0,
        });
      }
    }

    const nvPendientesRaw = await db.all(`
      SELECT nv_numero, fecha_nv, vencod, nombre_vendedor, cod_cliente, nombre_cliente, num_oc, monto_pendiente
      FROM reporte_softland_nv_pendientes ORDER BY fecha_nv ASC
    `);
    const nv_pendientes = nvPendientesRaw.map(r => ({ ...r, monto_pendiente: Number(r.monto_pendiente) }));

    res.json({
      mensual: Array.from(filas.values()),
      nv_pendientes,
      areas: Object.entries(AREA_LABEL).map(([value, label]) => ({ value, label })),
    });
  } catch (err) {
    console.error('[softland/reporte]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ===== Listados de documentos (Cotizaciones / Notas de Venta / Facturas) =====
// A diferencia de /reporte (agregado mensual, unos cientos de filas, se
// manda todo y se filtra en el navegador), acá el histórico completo
// 2023-hoy puede ser varios miles de documentos — se filtra y pagina en el
// servidor (nota de cambio v1.31).

const TABLA_DOC = {
  cotizaciones: { tabla: 'reporte_softland_cotizaciones', numero: 'cot_num', columnasBusqueda: ['nombre_cliente', 'cod_cliente', 'nombre_vendedor', 'cot_num'] },
  'notas-venta': { tabla: 'reporte_softland_notas_venta', numero: 'nv_numero', columnasBusqueda: ['nombre_cliente', 'cod_cliente', 'nombre_vendedor', 'nv_numero', 'num_oc'] },
  facturas: { tabla: 'reporte_softland_facturas', numero: 'folio', columnasBusqueda: ['nombre_cliente', 'cod_cliente', 'nombre_vendedor', 'folio'] },
};

// vencods agrupados por área, con el mismo resolverArea que usa /reporte —
// se calcula sobre el universo chico de códigos conocidos (no sobre los
// documentos), y de ahí se arma el WHERE vencod = ANY(...) de la consulta.
async function vencodsPorArea() {
  const filas = await db.all(`
    SELECT DISTINCT t.vencod, u.area AS area_usuario
    FROM (
      SELECT vencod FROM reporte_softland_mensual
      UNION SELECT vencod FROM reporte_softland_cotizaciones
      UNION SELECT vencod FROM reporte_softland_notas_venta
      UNION SELECT vencod FROM reporte_softland_facturas
    ) t
    LEFT JOIN users u ON u.codigo_softland = t.vencod
  `);
  const mapa = {};
  for (const f of filas) {
    const a = resolverArea(f.vencod, f.area_usuario);
    if (a) (mapa[a] = mapa[a] || []).push(f.vencod);
  }
  return mapa;
}

// WHERE + params compartidos por el listado paginado y el export CSV.
async function filtroDocumentos(cfg, query) {
  const { anio, mes, dia, vendedor, area, q } = query;
  const cond = [], params = [];
  if (anio) { params.push(Number(anio)); cond.push(`anio = $${params.length}`); }
  if (mes) { params.push(Number(mes)); cond.push(`mes = $${params.length}`); }
  if (dia) { params.push(dia); cond.push(`fecha = $${params.length}`); }
  if (vendedor) { params.push(vendedor); cond.push(`vencod = $${params.length}`); }
  if (area) {
    const mapa = await vencodsPorArea();
    params.push(mapa[area] || []);
    cond.push(`vencod = ANY($${params.length})`);
  }
  if (q) {
    params.push(`%${String(q).toLowerCase()}%`);
    cond.push('(' + cfg.columnasBusqueda.map(c => `LOWER(${c}::text) LIKE $${params.length}`).join(' OR ') + ')');
  }
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
}

// GET /api/softland/documentos/:tipo — listado paginado de cotizaciones,
// notas de venta o facturas, filtrable por año/mes/día/vendedor/área/texto.
router.get('/documentos/:tipo', authorize('administrador', 'jefe_comercial', 'vendedor', 'gerencia'), async (req, res) => {
  const cfg = TABLA_DOC[req.params.tipo];
  if (!cfg) return res.status(400).json({ error: 'Tipo de documento no reconocido.' });
  try {
    const { where, params } = await filtroDocumentos(cfg, req.query);
    const total = await db.get(`SELECT COUNT(*) AS n FROM ${cfg.tabla} ${where}`, params);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const paramsPagina = [...params, pageSize, (page - 1) * pageSize];
    const rows = await db.all(
      `SELECT * FROM ${cfg.tabla} ${where} ORDER BY fecha DESC, ${cfg.numero} DESC LIMIT $${paramsPagina.length - 1} OFFSET $${paramsPagina.length}`,
      paramsPagina
    );
    res.json({
      rows: rows.map(r => ({ ...r, monto: Number(r.monto), area: resolverArea(r.vencod, null) })),
      total: Number(total.n),
      page, pageSize,
    });
  } catch (err) {
    console.error('[softland/documentos]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/softland/documentos/:tipo/exportar — mismo filtro, sin paginar
// (tope de 20.000 filas), como CSV descargable.
router.get('/documentos/:tipo/exportar', authorize('administrador', 'jefe_comercial', 'vendedor', 'gerencia'), async (req, res) => {
  const cfg = TABLA_DOC[req.params.tipo];
  if (!cfg) return res.status(400).json({ error: 'Tipo de documento no reconocido.' });
  try {
    const { where, params } = await filtroDocumentos(cfg, req.query);
    const rows = await db.all(`SELECT * FROM ${cfg.tabla} ${where} ORDER BY fecha DESC LIMIT 20000`, params);
    const encabezados = ['fecha', cfg.numero, 'vencod', 'nombre_vendedor', 'cod_cliente', 'nombre_cliente', ...(cfg.numero === 'nv_numero' ? ['num_oc'] : []), 'monto'];
    const csvEscape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [encabezados.join(';')];
    for (const r of rows) {
      lineas.push(encabezados.map(c => csvEscape(c === 'fecha' ? new Date(r.fecha).toLocaleDateString('es-CL') : r[c])).join(';'));
    }
    const csv = '﻿' + lineas.join('\r\n'); // BOM para que Excel abra bien los acentos
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.tipo}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[softland/documentos/exportar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
