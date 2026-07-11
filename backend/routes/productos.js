const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadCSV } = require('../middleware/upload');
const { parseCSV } = require('../utils/csv');
const { mapearProductos } = require('../services/import_productos');

router.use(authenticate);

const SELECT_CON_STOCK = `
  SELECT p.id, p.sku, p.nombre, p.marca, p.categoria, p.precio_lista,
         p.stock_gestionado_por_proveedor, p.url_imagen, p.activo,
         sp.stock AS stock_prov, sp.precio AS precio_prov, sp.fecha_carga AS stock_fecha
  FROM productos p
  LEFT JOIN LATERAL (
    SELECT stock, precio, fecha_carga FROM stock_proveedor s
    WHERE s.producto_id = p.id ORDER BY fecha_carga DESC LIMIT 1
  ) sp ON true
`;

// GET /api/productos?q=&categoria=&marca=
router.get('/', async (req, res) => {
  try {
    const { q, categoria, marca } = req.query;
    const clauses = ['p.activo = true'];
    const params = [];
    let i = 1;
    if (q) { clauses.push(`(p.nombre ILIKE $${i} OR p.sku ILIKE $${i})`); params.push(`%${q}%`); i++; }
    if (categoria) { clauses.push(`p.categoria = $${i++}`); params.push(categoria); }
    if (marca) { clauses.push(`p.marca = $${i++}`); params.push(marca); }
    const productos = await db.all(
      `${SELECT_CON_STOCK} WHERE ${clauses.join(' AND ')} ORDER BY p.nombre LIMIT 500`,
      params
    );
    res.json(productos);
  } catch (err) {
    console.error('[productos/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/productos/facetas — marcas y categorías para filtros
router.get('/facetas', async (req, res) => {
  try {
    const marcas = await db.all(`SELECT DISTINCT marca FROM productos WHERE activo=true AND marca IS NOT NULL ORDER BY marca`);
    const categorias = await db.all(`SELECT DISTINCT categoria FROM productos WHERE activo=true AND categoria IS NOT NULL ORDER BY categoria`);
    res.json({ marcas: marcas.map(m => m.marca), categorias: categorias.map(c => c.categoria) });
  } catch (err) {
    console.error('[productos/GET /facetas]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/productos/:id
router.get('/:id', async (req, res) => {
  try {
    const producto = await db.get(`${SELECT_CON_STOCK} WHERE p.id = $1`, [req.params.id]);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    const full = await db.get(`SELECT descripcion, ficha_tecnica_url, atributos, proveedor FROM productos WHERE id=$1`, [req.params.id]);
    res.json({ ...producto, ...full });
  } catch (err) {
    console.error('[productos/GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/productos
router.post('/', authorize('administrador'), async (req, res) => {
  try {
    const { sku, nombre, marca, categoria, precio_lista, url_imagen, ficha_tecnica_url, descripcion, proveedor, stock_gestionado_por_proveedor, atributos } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    if (sku) {
      const existe = await db.get('SELECT id FROM productos WHERE sku = $1', [sku]);
      if (existe) return res.status(409).json({ error: 'Ya existe un producto con ese código/SKU' });
    }
    const result = await db.run(
      `INSERT INTO productos (sku, nombre, marca, categoria, precio_lista, url_imagen, ficha_tecnica_url, descripcion, proveedor, stock_gestionado_por_proveedor, atributos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [sku || null, nombre, marca || null, categoria || null, precio_lista || null, url_imagen || null,
       ficha_tecnica_url || null, descripcion || null, proveedor || null,
       stock_gestionado_por_proveedor === true, atributos || {}]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[productos/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/productos/:id
router.put('/:id', authorize('administrador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { sku, nombre, marca, categoria, precio_lista, url_imagen, ficha_tecnica_url, descripcion, proveedor, stock_gestionado_por_proveedor, atributos, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const prod = await db.get('SELECT id FROM productos WHERE id=$1', [id]);
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });
    if (sku) {
      const existe = await db.get('SELECT id FROM productos WHERE sku=$1 AND id!=$2', [sku, id]);
      if (existe) return res.status(409).json({ error: 'Otro producto usa ese código/SKU' });
    }
    await db.run(
      `UPDATE productos SET sku=$1, nombre=$2, marca=$3, categoria=$4, precio_lista=$5, url_imagen=$6,
              ficha_tecnica_url=$7, descripcion=$8, proveedor=$9, stock_gestionado_por_proveedor=$10,
              atributos=$11, activo=$12 WHERE id=$13`,
      [sku || null, nombre, marca || null, categoria || null, precio_lista || null, url_imagen || null,
       ficha_tecnica_url || null, descripcion || null, proveedor || null,
       stock_gestionado_por_proveedor === true, atributos || {}, activo !== undefined ? activo : true, id]
    );
    res.json({ message: 'Producto actualizado' });
  } catch (err) {
    console.error('[productos/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Importador CSV ---

async function analizar(buffer) {
  const texto = buffer.toString('utf8');
  const { headers, rows } = parseCSV(texto);
  const { validos, rechazos } = mapearProductos(rows);
  // Determinar nuevos vs actualizar según SKUs existentes.
  const skus = validos.map(v => v.producto.sku);
  let existentes = new Set();
  if (skus.length) {
    const rows2 = await db.all('SELECT sku FROM productos WHERE sku = ANY($1)', [skus]);
    existentes = new Set(rows2.map(r => r.sku));
  }
  const conStock = validos.filter(v => v.stockProveedor !== null && v.stockProveedor !== undefined).length;
  return { headers, validos, rechazos, existentes, conStock };
}

// POST /api/productos/importar/preview
router.post('/importar/preview', authorize('administrador'), uploadCSV.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
    const { headers, validos, rechazos, existentes, conStock } = await analizar(req.file.buffer);
    const nuevos = validos.filter(v => !existentes.has(v.producto.sku)).length;
    res.json({
      headers,
      resumen: {
        total_filas_validas: validos.length,
        nuevos,
        actualizar: validos.length - nuevos,
        rechazos: rechazos.length,
        con_stock_proveedor: conStock,
      },
      muestra: validos.slice(0, 20).map(v => ({
        sku: v.producto.sku, nombre: v.producto.nombre, marca: v.producto.marca,
        categoria: v.producto.categoria, precio_lista: v.producto.precio_lista,
        existe: existentes.has(v.producto.sku), stock_proveedor: v.stockProveedor,
      })),
      rechazos: rechazos.slice(0, 200),
    });
  } catch (err) {
    console.error('[productos/importar/preview]', err);
    res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
  }
});

// POST /api/productos/importar/confirmar
router.post('/importar/confirmar', authorize('administrador'), uploadCSV.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
  const client = await db.pool.connect();
  try {
    const { validos } = await analizar(req.file.buffer);
    await client.query('BEGIN');
    let insertados = 0, actualizados = 0, stockCargado = 0;
    const archivoOrigen = req.file.originalname;
    const usuarioId = req.user.id;

    for (const { producto, stockProveedor } of validos) {
      const gestionadoProveedor = stockProveedor !== null && stockProveedor !== undefined;
      const r = await client.query(
        `INSERT INTO productos (sku, nombre, marca, categoria, precio_lista, url_imagen, ficha_tecnica_url, atributos, stock_gestionado_por_proveedor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (sku) DO UPDATE SET
           nombre=EXCLUDED.nombre, marca=EXCLUDED.marca, categoria=EXCLUDED.categoria,
           precio_lista=EXCLUDED.precio_lista, url_imagen=EXCLUDED.url_imagen,
           ficha_tecnica_url=EXCLUDED.ficha_tecnica_url, atributos=EXCLUDED.atributos,
           stock_gestionado_por_proveedor=(productos.stock_gestionado_por_proveedor OR EXCLUDED.stock_gestionado_por_proveedor)
         RETURNING id, (xmax = 0) AS insertado`,
        [producto.sku, producto.nombre, producto.marca || null, producto.categoria || null,
         producto.precio_lista || null, producto.url_imagen || null, producto.ficha_tecnica_url || null,
         producto.atributos || {}, gestionadoProveedor]
      );
      const row = r.rows[0];
      if (row.insertado) insertados++; else actualizados++;
      if (gestionadoProveedor) {
        await client.query(
          `INSERT INTO stock_proveedor (producto_id, stock, precio, archivo_origen, cargado_por_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [row.id, stockProveedor, producto.precio_lista || null, archivoOrigen, usuarioId]
        );
        stockCargado++;
      }
    }
    await client.query('COMMIT');
    res.json({ message: 'Importación completada', insertados, actualizados, stock_cargado: stockCargado });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[productos/importar/confirmar]', err);
    res.status(500).json({ error: 'Error al importar: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
