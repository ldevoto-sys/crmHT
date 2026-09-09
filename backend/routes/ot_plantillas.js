// Configurador de materiales/herramientas estándar para los tipos de
// trabajo que se repiten siempre igual (mantenimiento preventivo, lavado de
// estanque) — se define una vez acá y se copia entera a la Orden de Trabajo
// cada vez que se crea un negocio de ese tipo (ver services/ot.js).
// Impermeabilizado/correctivo/otro no tienen plantilla: se resuelven caso a
// caso, no aplica este configurador.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const PUEDE_CONFIGURAR = ['administrador', 'jefe_comercial'];
const TIPOS_CON_PLANTILLA = ['mantenimiento_preventivo', 'lavado'];

router.use(authenticate);

function itemsValidos(items) {
  if (!Array.isArray(items)) return false;
  return items.every(it =>
    ['material', 'herramienta'].includes(it.tipo) &&
    Number(it.cantidad) > 0 &&
    (it.producto_id || (it.descripcion && it.descripcion.trim()))
  );
}

// GET /api/ot-plantillas/:tipoTrabajo
router.get('/:tipoTrabajo', async (req, res) => {
  if (!TIPOS_CON_PLANTILLA.includes(req.params.tipoTrabajo)) return res.status(400).json({ error: 'Tipo de trabajo sin plantilla' });
  try {
    const items = await db.all(
      `SELECT op.*, p.nombre AS producto_nombre, p.sku FROM ot_plantilla_items op LEFT JOIN productos p ON p.id = op.producto_id
       WHERE op.tipo_trabajo = $1 ORDER BY op.orden`,
      [req.params.tipoTrabajo]
    );
    res.json(items);
  } catch (err) {
    console.error('[ot_plantillas/GET /:tipoTrabajo]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/ot-plantillas/:tipoTrabajo {items:[{tipo,producto_id,descripcion,cantidad}]}
// Reemplaza la lista completa, igual patrón que PUT /secuencias/:id.
router.put('/:tipoTrabajo', authorize(...PUEDE_CONFIGURAR), async (req, res) => {
  if (!TIPOS_CON_PLANTILLA.includes(req.params.tipoTrabajo)) return res.status(400).json({ error: 'Tipo de trabajo sin plantilla' });
  const { items } = req.body;
  if (!itemsValidos(items)) return res.status(400).json({ error: 'Ítems inválidos: cada línea necesita tipo, cantidad > 0 y producto o descripción' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ot_plantilla_items WHERE tipo_trabajo = $1', [req.params.tipoTrabajo]);
    let orden = 1;
    for (const it of items) {
      await client.query(
        `INSERT INTO ot_plantilla_items (tipo_trabajo, orden, tipo, producto_id, descripcion, cantidad) VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.tipoTrabajo, orden++, it.tipo, it.producto_id || null, it.descripcion || null, it.cantidad]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Plantilla actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ot_plantillas/PUT /:tipoTrabajo]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

module.exports = router;
