const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadCSV } = require('../middleware/upload');
const { parseCSV } = require('../utils/csv');
const {
  mapearProductos, PLANTILLA_HEADERS, PLANTILLA_HEADERS_HIDRONEUMATICO, PLANTILLA_HEADERS_FILTRO_ARENA,
} = require('../services/import_productos');

router.use(authenticate);

const SELECT_CON_STOCK = `
  SELECT p.id, p.sku, p.nombre, p.marca, p.categoria, p.precio_lista, p.descripcion, p.ficha_tecnica_url,
         p.descripcion_completa, p.stock_gestionado_por_proveedor, p.url_imagen, p.activo,
         sp.stock AS stock_prov, sp.precio AS precio_prov, sp.fecha_carga AS stock_fecha
  FROM productos p
  LEFT JOIN LATERAL (
    SELECT stock, precio, fecha_carga FROM stock_proveedor s
    WHERE s.producto_id = p.id ORDER BY fecha_carga DESC LIMIT 1
  ) sp ON true
`;

// GET /api/productos?q=&categoria=&marca=  ó  ?ids=1,2,3 (lote, para prellenar cotización)
router.get('/', async (req, res) => {
  try {
    const { q, categoria, marca, ids } = req.query;
    if (ids) {
      const idArr = String(ids).split(',').map(Number).filter(n => Number.isInteger(n));
      if (!idArr.length) return res.json([]);
      const productos = await db.all(`${SELECT_CON_STOCK} WHERE p.id = ANY($1) ORDER BY p.nombre`, [idArr]);
      return res.json(productos);
    }
    const clauses = ['p.activo = true'];
    const params = [];
    let i = 1;
    if (q) { clauses.push(`(p.nombre ILIKE $${i} OR p.sku ILIKE $${i} OR p.categoria ILIKE $${i} OR p.marca ILIKE $${i})`); params.push(`%${q}%`); i++; }
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

// GET /api/productos/equivalencias — catálogo activo completo (bombas, hidroneumáticos,
// filtros de piscina) con sus atributos técnicos, para el buscador de equivalencias.
router.get('/equivalencias', authorize('administrador', 'jefe_comercial', 'vendedor'), async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT id, sku AS codigo, nombre, marca, categoria AS tipo, precio_lista AS precio,
              url_imagen, ficha_tecnica_url, atributos
       FROM productos WHERE activo = true ORDER BY nombre`
    );
    const productos = rows.map(p => {
      const a = p.atributos || {};
      const curva = (Array.isArray(a.curva) ? a.curva : [])
        .filter(pt => pt && pt.q != null && pt.h != null)
        .map(pt => [Number(pt.q), Number(pt.h)]);
      const sustitutos = String(a.sustitutos || '').split(',').map(s => s.trim()).filter(Boolean);
      const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
      return {
        id: p.id, codigo: p.codigo, nombre: p.nombre, marca: p.marca, tipo: p.tipo,
        precio: p.precio != null ? Number(p.precio) : null,
        url_imagen: p.url_imagen, ficha_tecnica_url: p.ficha_tecnica_url,
        hp: num(a.hp), voltaje: a.voltaje || null,
        caudal_max: num(a.caudal_max_lmin), altura_max: num(a.altura_max_m),
        conexion: a.conexion || null, diametro_pozo_pulg: a.diametro_pozo_pulg || null,
        curva_completa: curva, tiene_curva: curva.length > 0, sustitutos,
        litros: num(a.litros), bar_max: num(a.bar_max), orientacion: a.orientacion || null,
        m3h_max: num(a.m3h_max), volumen_piscina_m3: num(a.volumen_piscina_m3), diametro_mm: num(a.diametro_mm),
      };
    });
    res.json(productos);
  } catch (err) {
    console.error('[productos/equivalencias]', err);
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
router.post('/', authorize('administrador', 'jefe_comercial'), async (req, res) => {
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
router.put('/:id', authorize('administrador', 'jefe_comercial'), async (req, res) => {
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

// Imágenes y fichas técnicas se suben directo a Cloudflare R2 por fuera del
// CRM (bucket público crm-ht-productos), en carpetas separadas "img/" y
// "pdf/", con el código/SKU como parte del nombre de archivo según la
// convención real usada al subirlas: "img/imagen1_{sku}.jpg" (prefijo fijo
// "imagen1_") y "pdf/{sku}FT.pdf" (sufijo "FT" antes de la extensión).
// Esta acción no sube nada: solo completa url_imagen/ficha_tecnica_url
// calculando la URL esperada según esa convención, para los productos que
// tengan código.
// POST /api/productos/aplicar-r2 {sobrescribir}
router.post('/aplicar-r2', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const base = (process.env.R2_PRODUCTOS_PUBLIC_URL || '').replace(/\/$/, '');
    if (!base) return res.status(503).json({ error: 'Falta configurar R2_PRODUCTOS_PUBLIC_URL' });
    const sobrescribir = req.body.sobrescribir === true;

    const condicionImagen = sobrescribir ? '' : `AND (url_imagen IS NULL OR url_imagen = '')`;
    const condicionFicha = sobrescribir ? '' : `AND (ficha_tecnica_url IS NULL OR ficha_tecnica_url = '')`;

    const imagenes = await db.run(
      `UPDATE productos SET url_imagen = $1 || '/img/imagen1_' || sku || '.jpg' WHERE sku IS NOT NULL AND sku != '' ${condicionImagen}`,
      [base]
    );
    const fichas = await db.run(
      `UPDATE productos SET ficha_tecnica_url = $1 || '/pdf/' || sku || 'FT.pdf' WHERE sku IS NOT NULL AND sku != '' ${condicionFicha}`,
      [base]
    );
    const sinCodigo = await db.get(`SELECT count(*)::int AS n FROM productos WHERE sku IS NULL OR sku = ''`);

    res.json({
      imagenes_actualizadas: imagenes.rowCount,
      fichas_actualizadas: fichas.rowCount,
      productos_sin_codigo: sinCodigo.n,
    });
  } catch (err) {
    console.error('[productos/POST /aplicar-r2]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Importador CSV ---

// GET /api/productos/importar/plantilla?tipo=bombas|hidroneumatico|filtro_arena
const PLANTILLAS = {
  bombas: { headers: PLANTILLA_HEADERS, archivo: 'plantilla_bombas.csv' },
  hidroneumatico: { headers: PLANTILLA_HEADERS_HIDRONEUMATICO, archivo: 'plantilla_hidroneumaticos.csv' },
  filtro_arena: { headers: PLANTILLA_HEADERS_FILTRO_ARENA, archivo: 'plantilla_filtros_piscina.csv' },
};
router.get('/importar/plantilla', (req, res) => {
  const plantilla = PLANTILLAS[req.query.tipo] || PLANTILLAS.bombas;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${plantilla.archivo}"`);
  res.send('﻿' + plantilla.headers.join(',') + '\n');
});

async function analizar(buffer) {
  const texto = buffer.toString('utf8');
  const { headers, rows } = parseCSV(texto);
  const { validos, rechazos } = mapearProductos(rows, headers);
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

// Categorías presentes en el archivo (p.ej. solo "hidroneumatico", o todas las
// de la hoja "Catálogo"). El "catálogo completo" se sincroniza por categoría:
// subir solo bombas no debe desactivar hidroneumáticos ni filtros de piscina,
// que se cargan en archivos separados.
function categoriasDelArchivo(validos) {
  return [...new Set(validos.map(v => v.producto.categoria).filter(Boolean))];
}

// Productos activos de esas categorías que no vienen en este archivo (modo "catálogo completo").
async function calcularADesactivar(validos) {
  const skus = validos.map(v => v.producto.sku);
  const categorias = categoriasDelArchivo(validos);
  if (!skus.length || !categorias.length) return [];
  return db.all(
    `SELECT sku, nombre FROM productos WHERE activo = true AND categoria = ANY($1) AND NOT (sku = ANY($2)) ORDER BY nombre`,
    [categorias, skus]
  );
}

// POST /api/productos/importar/preview
router.post('/importar/preview', authorize('administrador', 'jefe_comercial'), uploadCSV.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
    const { headers, validos, rechazos, existentes, conStock } = await analizar(req.file.buffer);
    const nuevos = validos.filter(v => !existentes.has(v.producto.sku)).length;
    const sincronizar = req.body.sincronizar === 'true' || req.body.sincronizar === '1';
    const aDesactivar = sincronizar ? await calcularADesactivar(validos) : [];
    res.json({
      headers,
      resumen: {
        total_filas_validas: validos.length,
        nuevos,
        actualizar: validos.length - nuevos,
        rechazos: rechazos.length,
        con_stock_proveedor: conStock,
        a_desactivar: aDesactivar.length,
      },
      muestra: validos.slice(0, 20).map(v => ({
        sku: v.producto.sku, nombre: v.producto.nombre, marca: v.producto.marca,
        categoria: v.producto.categoria, precio_lista: v.producto.precio_lista,
        existe: existentes.has(v.producto.sku), stock_proveedor: v.stockProveedor,
      })),
      rechazos: rechazos.slice(0, 200),
      a_desactivar: aDesactivar.slice(0, 200),
    });
  } catch (err) {
    console.error('[productos/importar/preview]', err);
    res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
  }
});

// POST /api/productos/importar/confirmar
router.post('/importar/confirmar', authorize('administrador', 'jefe_comercial'), uploadCSV.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
  const sincronizar = req.body.sincronizar === 'true' || req.body.sincronizar === '1';
  const client = await db.pool.connect();
  try {
    const { validos } = await analizar(req.file.buffer);
    await client.query('BEGIN');
    let insertados = 0, actualizados = 0, stockCargado = 0, desactivados = 0;
    const archivoOrigen = req.file.originalname;
    const usuarioId = req.user.id;

    for (const { producto, stockProveedor } of validos) {
      const gestionadoProveedor = stockProveedor !== null && stockProveedor !== undefined;
      // Al actualizar un producto existente, si la URL nueva (imagen o ficha)
      // es de SharePoint y la que ya estaba cargada es pública (Cloudflare
      // R2 u otro host), no se pisa: el catálogo técnico en Excel todavía
      // trae enlaces de SharePoint para muchos productos cuya URL real ya
      // se corrigió a R2 mediante "Aplicar URLs de Cloudflare por código".
      const r = await client.query(
        `INSERT INTO productos (sku, nombre, marca, categoria, precio_lista, url_imagen, ficha_tecnica_url, descripcion_completa, atributos, stock_gestionado_por_proveedor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (sku) DO UPDATE SET
           nombre=EXCLUDED.nombre, marca=EXCLUDED.marca, categoria=EXCLUDED.categoria,
           precio_lista=EXCLUDED.precio_lista,
           url_imagen=CASE
             WHEN EXCLUDED.url_imagen ILIKE '%sharepoint.com%'
               AND productos.url_imagen IS NOT NULL AND productos.url_imagen != ''
               AND productos.url_imagen NOT ILIKE '%sharepoint.com%'
             THEN productos.url_imagen ELSE EXCLUDED.url_imagen END,
           ficha_tecnica_url=CASE
             WHEN EXCLUDED.ficha_tecnica_url ILIKE '%sharepoint.com%'
               AND productos.ficha_tecnica_url IS NOT NULL AND productos.ficha_tecnica_url != ''
               AND productos.ficha_tecnica_url NOT ILIKE '%sharepoint.com%'
             THEN productos.ficha_tecnica_url ELSE EXCLUDED.ficha_tecnica_url END,
           descripcion_completa=EXCLUDED.descripcion_completa,
           atributos=EXCLUDED.atributos,
           stock_gestionado_por_proveedor=(productos.stock_gestionado_por_proveedor OR EXCLUDED.stock_gestionado_por_proveedor),
           activo=true
         RETURNING id, (xmax = 0) AS insertado`,
        [producto.sku, producto.nombre, producto.marca || null, producto.categoria || null,
         producto.precio_lista || null, producto.url_imagen || null, producto.ficha_tecnica_url || null,
         producto.descripcion_completa || null, producto.atributos || {}, gestionadoProveedor]
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

    if (sincronizar) {
      const skus = validos.map(v => v.producto.sku);
      const categorias = categoriasDelArchivo(validos);
      const r = (skus.length && categorias.length)
        ? await client.query(
            'UPDATE productos SET activo = false WHERE activo = true AND categoria = ANY($1) AND NOT (sku = ANY($2))',
            [categorias, skus]
          )
        : { rowCount: 0 };
      desactivados = r.rowCount;
    }

    await client.query('COMMIT');
    res.json({ message: 'Importación completada', insertados, actualizados, stock_cargado: stockCargado, desactivados });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[productos/importar/confirmar]', err);
    res.status(500).json({ error: 'Error al importar: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
