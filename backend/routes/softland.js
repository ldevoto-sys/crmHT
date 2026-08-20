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

module.exports = router;
