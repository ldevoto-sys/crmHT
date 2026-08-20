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
        anio: r.anio, mes: r.mes, vencod: r.vencod, nombre_vendedor: r.nombre_vendedor, area: r.area,
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

module.exports = router;
