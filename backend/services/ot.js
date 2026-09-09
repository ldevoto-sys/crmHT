// Orden de Trabajo (Arranque de Trabajos, Ventas → Operaciones, HT-AP-03
// pendiente 06-09-2026): se crea sola al mover un negocio a "Aceptado" en
// el pipeline Operaciones — hay dos puntos de entrada que llaman a esto,
// PUT /negocios/:id/etapa (kanban manual) e importador CSV masivo
// (routes/negocios.js), por eso vive en un servicio aparte en vez de
// quedar solo en una ruta.
//
// Cómo se prellenan los ítems, según negocio.tipo_trabajo:
// - mantenimiento_preventivo / lavado: desde ot_plantilla_items, la lista
//   estándar configurada una sola vez en Config → Plantillas OT — estos
//   trabajos no varían de un negocio a otro.
// - impermeabilizado / mantenimiento_correctivo / otro: caso a caso, se
//   copian desde la última versión de la cotización vigente del negocio
//   (si existe); si no hay cotización, la OT nace sin ítems y se cargan a
//   mano.
const { db } = require('../db');

const CON_PLANTILLA = ['mantenimiento_preventivo', 'lavado'];

// Mismo truco que services/secuencias.js: las funciones reciben un `client`
// opcional (transacción pg) para poder llamarse tanto desde rutas sueltas
// (db.run/db.get, ej. PUT /negocios/:id/etapa) como desde dentro de una
// transacción ya abierta (ej. el importador CSV masivo).
async function fila(client, text, params) {
  if (client === db) return db.get(text, params);
  return (await client.query(text, params)).rows[0] || null;
}
async function filas(client, text, params) {
  if (client === db) return db.all(text, params);
  return (await client.query(text, params)).rows;
}
async function ejecutar(client, text, params) {
  return client === db ? db.run(text, params) : client.query(text, params);
}

async function crearOTSiNoExiste(negocio, client = db, creadoPorId = null) {
  const existente = await fila(client, 'SELECT id FROM ordenes_trabajo WHERE negocio_id = $1', [negocio.id]);
  if (existente) return existente.id;

  let itemsFuente = [];
  let origenItems = 'manual';

  if (CON_PLANTILLA.includes(negocio.tipo_trabajo)) {
    itemsFuente = await filas(
      client,
      'SELECT tipo, producto_id, descripcion, cantidad, codigo FROM ot_plantilla_items WHERE tipo_trabajo = $1 ORDER BY orden',
      [negocio.tipo_trabajo]
    );
    origenItems = 'plantilla';
  } else {
    const cot = await fila(
      client,
      `SELECT id FROM cotizaciones WHERE negocio_id = $1
       AND version = (SELECT MAX(version) FROM cotizaciones WHERE negocio_id = $1)`,
      [negocio.id]
    );
    if (cot) {
      const items = await filas(
        client,
        'SELECT producto_id, descripcion, cantidad FROM cotizacion_items WHERE cotizacion_id = $1',
        [cot.id]
      );
      itemsFuente = items.map(it => ({ ...it, tipo: 'material' }));
      origenItems = 'cotizacion';
    }
  }

  const ot = await ejecutar(
    client,
    'INSERT INTO ordenes_trabajo (negocio_id, origen_items, creado_por_id) VALUES ($1,$2,$3) RETURNING id',
    [negocio.id, origenItems, creadoPorId]
  );
  const otId = ot.rows[0].id;

  for (const it of itemsFuente) {
    await ejecutar(
      client,
      'INSERT INTO ot_items (ot_id, tipo, producto_id, descripcion, cantidad, codigo) VALUES ($1,$2,$3,$4,$5,$6)',
      [otId, it.tipo || 'material', it.producto_id || null, it.descripcion || null, it.cantidad, it.producto_id ? null : (it.codigo || null)]
    );
  }

  return otId;
}

module.exports = { crearOTSiNoExiste };
