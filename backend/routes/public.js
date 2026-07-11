const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { fetchCompleta } = require('../services/cotizacion_data');
const { generarCotizacionPDF } = require('../services/pdf');

// Rutas SIN autenticación (link enviado al cliente). HT-AP-03 §7.5.

async function registrarVista(cot, req) {
  await db.run('INSERT INTO cotizacion_vistas (cotizacion_id, ip, user_agent) VALUES ($1,$2,$3)',
    [cot.id, req.ip || null, (req.headers['user-agent'] || '').slice(0, 300)]);
  // enviada → vista (no revierte estados posteriores).
  if (cot.estado === 'enviada') {
    await db.run(`UPDATE cotizaciones SET estado='vista' WHERE id=$1 AND estado='enviada'`, [cot.id]);
  }
}

// GET /api/public/cotizacion/:token — datos para la vista pública (registra la visita)
router.get('/cotizacion/:token', async (req, res) => {
  try {
    const data = await fetchCompleta({ token: req.params.token });
    if (!data) return res.status(404).json({ error: 'Cotización no encontrada' });
    await registrarVista(data.cot, req);
    const { cot, items, cliente, vendedor } = data;
    res.json({
      numero: cot.numero, version: cot.version, created_at: cot.created_at,
      validez_dias: cot.validez_dias, condiciones: cot.condiciones,
      subtotal: cot.subtotal, descuento_pct: cot.descuento_pct, total: cot.total,
      estado: cot.estado, cliente, vendedor,
      items: items.map(it => ({
        descripcion: it.descripcion || it.producto_nombre, cantidad: it.cantidad,
        precio_unitario: it.precio_unitario, total_linea: it.total_linea,
      })),
    });
  } catch (err) {
    console.error('[public/cotizacion]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/public/cotizacion/:token/pdf — PDF público
router.get('/cotizacion/:token/pdf', async (req, res) => {
  try {
    const data = await fetchCompleta({ token: req.params.token });
    if (!data) return res.status(404).json({ error: 'Cotización no encontrada' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${data.cot.numero}.pdf"`);
    generarCotizacionPDF(data, res);
  } catch (err) {
    console.error('[public/cotizacion/pdf]', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

module.exports = router;
