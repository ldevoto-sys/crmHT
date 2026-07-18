// Mapea filas del Catálogo Técnico (CSV con cabeceras en minúsculas, ya parseado)
// a productos normalizados. Núcleo + atributos JSONB (HT-AP-03 v1.3).
// Cabecera (lowercase) → campo núcleo. Se aceptan alias.
const MAPA_NUCLEO = {
  'código': 'sku', 'codigo': 'sku', 'sku': 'sku',
  'nombre producto': 'nombre', 'nombre': 'nombre',
  'marca': 'marca',
  'tipo': 'categoria', 'categoría': 'categoria', 'categoria': 'categoria',
  'precio neto ($)': 'precio_lista', 'precio neto': 'precio_lista', 'precio': 'precio_lista',
  'url imagen': 'url_imagen', 'imagen': 'url_imagen',
  'url ficha pdf': 'ficha_tecnica_url', 'url ficha': 'ficha_tecnica_url', 'ficha': 'ficha_tecnica_url',
  'descripción': 'descripcion_completa', 'descripcion': 'descripcion_completa',
  'descripción completa': 'descripcion_completa', 'descripcion completa': 'descripcion_completa',
};

// Cabeceras que van a atributos con una clave "limpia".
const MAPA_ATRIBUTOS = {
  'hp': 'hp', 'voltaje': 'voltaje',
  'caudal máx (l/min)': 'caudal_max_lmin', 'caudal máx': 'caudal_max_lmin', 'caudal': 'caudal_max_lmin',
  'altura máx (m)': 'altura_max_m', 'altura máx': 'altura_max_m', 'altura': 'altura_max_m',
  'conexión': 'conexion', 'conexion': 'conexion',
  'diámetro pozo (pulg)': 'diametro_pozo_pulg', 'diámetro pozo': 'diametro_pozo_pulg',
  'fuente curva': 'fuente_curva', 'verificado': 'verificado',
  'sustitutos': 'sustitutos', 'notas': 'notas',
  'en sitio web': 'en_sitio_web', 'stock (sitio)': 'stock_sitio',
  'serie': 'serie', 'modelo': 'modelo',
  // Hoja "Hidroneumáticos" del Excel (sin columna Tipo propia).
  'litros': 'litros', 'bar máx': 'bar_max', 'orientación': 'orientacion', 'orientacion': 'orientacion',
  // Hoja "Filtros Piscina" del Excel (sin columna Tipo propia).
  'm³/h máx': 'm3h_max', 'm3/h máx': 'm3h_max',
  'diámetro mm': 'diametro_mm', 'diametro mm': 'diametro_mm',
  'volumen piscina (m³)': 'volumen_piscina_m3', 'volumen piscina (m3)': 'volumen_piscina_m3', 'volumen piscina': 'volumen_piscina_m3',
};

// Cabeceras de stock del proveedor (futuras en el mismo Excel).
const HEADERS_STOCK = new Set(['stock proveedor', 'stock (proveedor)', 'stock prov', 'stock_proveedor']);

const NUCLEO_CONOCIDO = new Set(Object.keys(MAPA_NUCLEO));
const ATRIB_CONOCIDO = new Set(Object.keys(MAPA_ATRIBUTOS));

// Las hojas "Hidroneumáticos" y "Filtros Piscina" del Excel no traen columna
// Tipo propia (a diferencia de "Catálogo"). Se detecta por sus cabeceras
// distintivas y se fuerza la categoría en todas las filas del archivo.
function detectarCategoriaPorCabeceras(headersNormalizados) {
  const set = new Set(headersNormalizados);
  if (set.has('litros') || set.has('bar máx')) return 'hidroneumatico';
  if (set.has('m³/h máx') || set.has('m3/h máx') || set.has('volumen piscina (m³)') || set.has('volumen piscina (m3)')) return 'filtro_arena';
  return null;
}

// Precio chileno: "314.071" o "$314071" → 314071. Sin decimales (CLP).
function parsePrecio(v) {
  if (v === null || v === undefined || v === '') return null;
  const limpio = String(v).replace(/[^\d]/g, '');
  if (!limpio) return null;
  return parseInt(limpio, 10);
}

function parseIntSafe(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

// Convierte una fila (objeto {header: valor}) en {producto, stock, errores}.
function mapearFila(row) {
  const producto = { atributos: {} };
  const curva = [];
  let stockProveedor = null;

  for (const [header, valorRaw] of Object.entries(row)) {
    const h = header.trim().toLowerCase();
    const valor = (valorRaw ?? '').toString().trim();

    if (NUCLEO_CONOCIDO.has(h)) {
      const campo = MAPA_NUCLEO[h];
      if (campo === 'precio_lista') producto.precio_lista = parsePrecio(valor);
      else producto[campo] = valor || null;
    } else if (ATRIB_CONOCIDO.has(h)) {
      if (valor) producto.atributos[MAPA_ATRIBUTOS[h]] = valor;
    } else if (/^q[1-6]$/.test(h) || /^h[1-6]$/.test(h)) {
      // Puntos de curva Q/H: se agrupan aparte.
      // (se procesan luego con los pares q/h)
    } else if (HEADERS_STOCK.has(h)) {
      stockProveedor = parseIntSafe(valor);
    } else if (valor) {
      // Columna desconocida: se conserva en atributos por su nombre.
      producto.atributos[h] = valor;
    }
  }

  // Armar curva Q/H a partir de q1..q6 / h1..h6.
  for (let n = 1; n <= 6; n++) {
    const q = row[`q${n}`];
    const hh = row[`h${n}`];
    if ((q ?? '') !== '' || (hh ?? '') !== '') {
      const qn = q === '' || q === undefined ? null : Number(String(q).replace(',', '.'));
      const hn = hh === '' || hh === undefined ? null : Number(String(hh).replace(',', '.'));
      if (qn !== null || hn !== null) curva.push({ q: qn, h: hn });
    }
  }
  if (curva.length) producto.atributos.curva = curva;

  // Validación.
  const errores = [];
  if (!producto.sku) errores.push('falta Código/SKU');
  if (!producto.nombre) errores.push('falta Nombre');

  return { producto, stockProveedor, errores };
}

// Procesa todas las filas → {validos:[{producto,stockProveedor}], rechazos:[{fila,sku,motivo}]}
// headers: cabeceras originales del archivo (para detectar hojas sin columna Tipo).
function mapearProductos(rows, headers = []) {
  const categoriaForzada = detectarCategoriaPorCabeceras(headers.map(h => h.trim().toLowerCase()));
  const validos = [];
  const rechazos = [];
  const skusVistos = new Set();

  rows.forEach((row, idx) => {
    const { producto, stockProveedor, errores } = mapearFila(row);
    if (categoriaForzada && !producto.categoria) producto.categoria = categoriaForzada;
    if (errores.length) {
      rechazos.push({ fila: idx + 2, sku: producto.sku || '', motivo: errores.join('; ') });
      return;
    }
    if (skusVistos.has(producto.sku)) {
      rechazos.push({ fila: idx + 2, sku: producto.sku, motivo: 'Código duplicado dentro del archivo' });
      return;
    }
    skusVistos.add(producto.sku);
    validos.push({ producto, stockProveedor });
  });

  return { validos, rechazos };
}

// Cabeceras de la plantilla de descarga: TODAS las columnas que el importador
// reconoce (núcleo + atributos técnicos + curva Q/H + sustitutos). Antes solo
// traía un subconjunto básico; eso hacía que, si alguien armaba el archivo a
// partir de la plantilla en lugar de exportar la hoja "Catálogo" completa,
// se perdieran silenciosamente los sustitutos declarados y la curva Q/H.
const PLANTILLA_HEADERS = [
  'Código', 'Nombre Producto', 'Marca', 'Tipo', 'HP', 'Voltaje',
  'Caudal Máx (L/min)', 'Altura Máx (m)', 'Conexión', 'Precio Neto ($)',
  'URL Imagen', 'URL Ficha PDF',
  'Q1', 'H1', 'Q2', 'H2', 'Q3', 'H3', 'Q4', 'H4', 'Q5', 'H5', 'Q6', 'H6',
  'Fuente curva', 'Verificado', 'Sustitutos', 'Notas',
  'Stock (sitio)', 'Diámetro pozo (pulg)', 'Descripción',
];

// Plantillas de las otras dos hojas del Excel, que no traen columna Tipo
// propia (se detecta por estas mismas cabeceras, ver detectarCategoriaPorCabeceras).
const PLANTILLA_HEADERS_HIDRONEUMATICO = [
  'Código', 'Nombre', 'Marca', 'Litros', 'Bar máx', 'Orientación', 'Conexión', 'Precio Neto ($)',
];
const PLANTILLA_HEADERS_FILTRO_ARENA = [
  'Código', 'Nombre', 'Marca', 'm³/h máx', 'Diámetro mm', 'Conexión', 'Precio Neto ($)', 'Volumen piscina (m³)',
];

module.exports = {
  mapearProductos, mapearFila, parsePrecio,
  PLANTILLA_HEADERS, PLANTILLA_HEADERS_HIDRONEUMATICO, PLANTILLA_HEADERS_FILTRO_ARENA,
};
