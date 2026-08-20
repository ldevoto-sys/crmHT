// Reportería Comercial + Softland — utilidades de administración.
// Por ahora solo el chequeo de conexión (punto 2); el disparador manual de
// la sincronización nocturna se agrega en el punto 3.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const softland = require('../services/softland');

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

module.exports = router;
