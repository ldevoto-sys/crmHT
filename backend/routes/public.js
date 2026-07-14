const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { fetchCompleta, esImagenPublica } = require('../services/cotizacion_data');
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
    const { cot, items, cliente, vendedor, emisor } = data;
    res.json({
      numero: cot.numero, version: cot.version, created_at: cot.created_at, titulo: cot.titulo,
      validez_dias: cot.validez_dias, condiciones: cot.condiciones,
      subtotal: cot.subtotal, descuento_pct: cot.descuento_pct, iva_pct: cot.iva_pct, total: cot.total,
      estado: cot.estado, cliente, vendedor, emisor,
      items: items.map(it => ({
        descripcion: it.descripcion || it.producto_nombre, marca: it.marca,
        cantidad: it.cantidad, precio_unitario: it.precio_unitario, total_linea: it.total_linea,
        imagen: esImagenPublica(it.url_imagen) ? it.url_imagen : null,
        ficha: esImagenPublica(it.ficha_tecnica_url) ? it.ficha_tecnica_url : null,
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
    await generarCotizacionPDF(data, res);
  } catch (err) {
    console.error('[public/cotizacion/pdf]', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

// === Etapa 3C — Encuesta post-cierre ===
const timeline = require('../services/timeline');

// GET /api/public/encuesta/:token
router.get('/encuesta/:token', async (req, res) => {
  try {
    const encuesta = await db.get(
      `SELECT en.id, en.respondida_en, n.titulo AS negocio_titulo, e.razon_social AS empresa_nombre
       FROM encuestas en JOIN negocios n ON n.id = en.negocio_id
       LEFT JOIN empresas e ON e.id = n.empresa_id
       WHERE en.token_publico = $1`,
      [req.params.token]
    );
    if (!encuesta) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const cfg = await db.get('SELECT pregunta FROM encuesta_config WHERE id = 1');
    res.json({
      negocio_titulo: encuesta.negocio_titulo, empresa_nombre: encuesta.empresa_nombre,
      ya_respondida: !!encuesta.respondida_en,
      pregunta: cfg ? cfg.pregunta : '¿Qué tan probable es que nos recomiendes? (0 a 10)',
    });
  } catch (err) {
    console.error('[public/encuesta GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/public/encuesta/:token {puntaje, comentario}
router.post('/encuesta/:token', async (req, res) => {
  try {
    const { puntaje, comentario } = req.body;
    if (puntaje === undefined || puntaje === null || puntaje < 0 || puntaje > 10) {
      return res.status(400).json({ error: 'El puntaje debe ser un número entre 0 y 10' });
    }
    const encuesta = await db.get(
      `SELECT en.*, n.contacto_id, n.empresa_id FROM encuestas en JOIN negocios n ON n.id = en.negocio_id
       WHERE en.token_publico = $1`,
      [req.params.token]
    );
    if (!encuesta) return res.status(404).json({ error: 'Encuesta no encontrada' });
    if (encuesta.respondida_en) return res.status(409).json({ error: 'Esta encuesta ya fue respondida' });

    await db.run('INSERT INTO encuesta_respuestas (encuesta_id, puntaje, comentario) VALUES ($1,$2,$3)',
      [encuesta.id, puntaje, comentario || null]);
    await db.run('UPDATE encuestas SET respondida_en = now() WHERE id = $1', [encuesta.id]);
    await timeline.registrar({
      negocio_id: encuesta.negocio_id, contacto_id: encuesta.contacto_id, empresa_id: encuesta.empresa_id,
      tipo: 'encuesta_respondida', descripcion: `Encuesta respondida: puntaje ${puntaje}/10`,
      referencia_id: encuesta.id,
    });
    res.status(201).json({ message: 'Gracias por tu respuesta' });
  } catch (err) {
    console.error('[public/encuesta POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
