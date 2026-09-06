// Ley 21.719 — administración de solicitudes de eliminación de datos.
// Acceso: administrador y gerencia (rol DPO). Ver services/privacidad.js
// para la lógica de detección/anonimización.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const privacidad = require('../services/privacidad');

router.use(authenticate);
router.use(authorize('administrador', 'gerencia'));

// GET /api/privacidad/solicitudes?estado=pendiente (default: todas)
router.get('/solicitudes', async (req, res) => {
  try {
    const { estado } = req.query;
    const clausulas = [];
    const params = [];
    if (estado) { clausulas.push(`s.estado = $${params.length + 1}`); params.push(estado); }
    const where = clausulas.length ? `WHERE ${clausulas.join(' AND ')}` : '';
    const solicitudes = await db.all(
      `SELECT s.*, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido, c.telefono_e164, c.email AS contacto_email,
              u.nombre AS resuelta_por_nombre
       FROM solicitudes_eliminacion_datos s
       JOIN contactos c ON c.id = s.contacto_id
       LEFT JOIN users u ON u.id = s.resuelta_por_id
       ${where}
       ORDER BY s.created_at DESC`,
      params
    );
    res.json(solicitudes);
  } catch (err) {
    console.error('[privacidad/solicitudes GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/privacidad/solicitudes (carga manual — ej. una solicitud que llegó a info@hidrotecnica.cl)
router.post('/solicitudes', async (req, res) => {
  try {
    const { contacto_id, texto_solicitud } = req.body;
    if (!contacto_id) return res.status(400).json({ error: 'contacto_id es requerido' });
    const contacto = await db.get('SELECT id FROM contactos WHERE id = $1', [contacto_id]);
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });
    const solicitud = await privacidad.registrarSolicitudEliminacion({ contacto_id, origen: 'manual', texto_solicitud });
    res.status(201).json(solicitud);
  } catch (err) {
    console.error('[privacidad/solicitudes POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/privacidad/solicitudes/:id/resolver {estado, tiene_facturas, notas_resolucion}
router.put('/solicitudes/:id/resolver', async (req, res) => {
  try {
    const { estado, tiene_facturas, notas_resolucion } = req.body;
    if (!['anonimizado', 'rechazada'].includes(estado)) {
      return res.status(400).json({ error: 'estado debe ser "anonimizado" o "rechazada"' });
    }
    const resultado = await privacidad.resolverSolicitudEliminacion(req.params.id, {
      estado, tiene_facturas, notas_resolucion, usuario_id: req.user.id,
    });
    if (!resultado) return res.status(404).json({ error: 'Solicitud no encontrada o ya resuelta' });
    res.json(resultado);
  } catch (err) {
    console.error('[privacidad/solicitudes resolver]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
