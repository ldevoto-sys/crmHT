const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { enviarNovedades } = require('../services/novedades');

router.use(authenticate);

// POST /api/novedades/enviar {titulo, cambios: string[]} — envía el aviso a
// todos los usuarios activos con correo. Solo administrador/jefe_comercial.
router.post('/enviar', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const { titulo, cambios } = req.body;
    if (!titulo || !Array.isArray(cambios) || cambios.filter(c => c && c.trim()).length === 0) {
      return res.status(400).json({ error: 'Título y al menos un cambio son requeridos' });
    }
    const resultado = await enviarNovedades(titulo, cambios.map(c => c.trim()).filter(Boolean));
    res.json(resultado);
  } catch (err) {
    console.error('[novedades/enviar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
