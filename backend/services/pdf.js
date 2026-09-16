const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { esImagenPublica, numeroCompleto } = require('./cotizacion_data');

// Documento al cliente: paleta corporativa (navy + celeste), no el acento de app.
const NAVY = '#112548';
const CYAN = '#34B3DE';
const GRAY = '#555555';

const LOGO = path.join(__dirname, '../../frontend/public/Hidrotecnica.jpg');
const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
// Cotizaciones en UF (nota v1.27 §1): el cliente solo ve UF, sin
// equivalencia en pesos — moneyEn() elige el formato según cot.moneda.
const moneyUF = v => 'UF ' + Number(v || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyEn = (v, moneda) => (moneda === 'UF' ? moneyUF(v) : money(v));
const redondear = (v, moneda) => (moneda === 'UF' ? Math.round(v * 100) / 100 : Math.round(v));
const fechaCorta = d => new Date(d).toLocaleDateString('es-CL');

// Descarga una imagen para incrustarla en el PDF. Solo se intenta con URLs
// públicas (esImagenPublica): las de SharePoint no cargarían igual para el
// cliente, así que ni se intentan. Cualquier falla (timeout, no es imagen,
// red caída) se ignora y la línea queda sin imagen, sin romper el PDF.
async function descargarImagen(url) {
  if (!esImagenPublica(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

async function generarCotizacionPDF(data, stream) {
  const { cot, items, cliente, vendedor, emisor = {} } = data;
  const imagenes = await Promise.all(items.map(it => it.mostrar_imagen !== false ? descargarImagen(it.url_imagen) : null));
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(stream);
  const M = 40;

  // Encabezado navy con datos del emisor.
  doc.rect(0, 0, 595, 96).fill(NAVY);
  if (fs.existsSync(LOGO)) { try { doc.image(LOGO, M, 20, { height: 30 }); } catch { /* opcional */ } }
  doc.fillColor(CYAN).fontSize(20).font('Helvetica-Bold').text('COTIZACIÓN', 355, 22, { width: 200, align: 'right' });
  doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold').text(`N° ${numeroCompleto(cot.numero, cot.version)}`, 355, 46, { width: 200, align: 'right' });
  const emLinea = [emisor.direccion && `${emisor.direccion}, ${emisor.comuna || ''}`, emisor.rut && `RUT ${emisor.rut}`,
                   emisor.telefono && `T ${emisor.telefono}`, emisor.whatsapp && `WhatsApp ${emisor.whatsapp}`, emisor.email_ventas]
                   .filter(Boolean).join('   ·   ');
  doc.fontSize(8).font('Helvetica').fillColor('rgba(255,255,255,0.8)').text(emLinea, M, 74, { width: 515 });
  doc.rect(0, 96, 595, 4).fill(CYAN);

  let y = 104;
  if (cot.titulo) {
    doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold');
    // Mismo problema que el nombre del cliente más abajo: un título largo
    // envuelve a 2+ líneas, y un avance fijo (18pt, una sola línea) deja
    // "CLIENTE"/"INFORMACIÓN" pisando la segunda línea.
    const tituloAltura = doc.heightOfString(cot.titulo, { width: 515 });
    doc.text(cot.titulo, M, y, { width: 515 });
    y += Math.max(18, tituloAltura + 6);
  }
  y = Math.max(y, 120);
  // Cliente + info (dos columnas).
  doc.fillColor(CYAN).fontSize(9).font('Helvetica-Bold').text('CLIENTE', M, y);
  doc.fillColor(CYAN).text('INFORMACIÓN', 320, y);
  y += 14;
  const nombreCliente = cliente.empresa_nombre || `${cliente.contacto_nombre || ''} ${cliente.contacto_apellido || ''}`.trim();
  doc.fillColor(NAVY).fontSize(12).font('Helvetica-Bold');
  // Con nombres/razones sociales largas, el texto envuelve a 2+ líneas — si
  // el siguiente bloque arranca a una distancia fija (16pt, la de una sola
  // línea) queda pisado por la segunda línea del nombre.
  const nombreClienteAltura = doc.heightOfString(nombreCliente, { width: 260 });
  doc.text(nombreCliente, M, y, { width: 260 });
  doc.fontSize(9).font('Helvetica').fillColor(GRAY);
  let yc = y + Math.max(16, nombreClienteAltura + 4);
  // Cualquiera de estas líneas puede envolver a 2+ líneas (dirección larga,
  // email largo, nombre+apellido largo) — se mide cada una antes de avanzar,
  // en vez de un salto fijo de 12pt que solo sirve para una línea.
  const lineaCliente = (texto) => {
    const altura = doc.heightOfString(texto, { width: 260 });
    doc.text(texto, M, yc, { width: 260 });
    yc += Math.max(12, altura + 2);
  };
  if (cliente.empresa_direccion) lineaCliente(`${cliente.empresa_direccion}${cliente.empresa_comuna ? ', ' + cliente.empresa_comuna : ''}`);
  if (cliente.empresa_rut) lineaCliente(`RUT: ${cliente.empresa_rut}`);
  lineaCliente(`Contacto: ${cliente.contacto_nombre || ''} ${cliente.contacto_apellido || ''}`.trim());
  if (cliente.contacto_email) lineaCliente(cliente.contacto_email);

  // Info (col derecha).
  const info = [['Vendedor', vendedor.nombre], ['Email', vendedor.email],
                ['Fecha', fechaCorta(cot.created_at)], ['Validez', `${cot.validez_dias} días`]];
  let yi = y + 16;
  info.forEach(([k, v]) => {
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(k, 320, yi, { width: 80 });
    doc.font('Helvetica-Bold').fillColor(NAVY).text(v || '—', 400, yi, { width: 155 });
    yi += 14;
  });

  y = Math.max(yc, yi) + 16;

  // Tabla de ítems. Columnas de la derecha (desde x=330 hasta el borde de la
  // tabla en 555): Cant. / P. unitario / Desc. % / Total, con 6pt de aire
  // entre cada una — quedan apretadas (sobre todo en UF, con más dígitos),
  // pero es lo que entra sin invadir el ancho de Descripción.
  const X_CANT = 330, W_CANT = 32;
  const X_PU = X_CANT + W_CANT + 6, W_PU = 68;
  const X_DESC = X_PU + W_PU + 6, W_DESC = 38;
  const X_TOTAL = X_DESC + W_DESC + 6, W_TOTAL = 69; // termina en 555 = M+515

  doc.rect(M, y, 515, 22).fill(NAVY);
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
    .text('Descripción', M + 8, y + 7)
    .text('Cant.', X_CANT, y + 7, { width: W_CANT, align: 'right' })
    .text('P. Unit.', X_PU, y + 7, { width: W_PU, align: 'right' })
    .text('Desc. %', X_DESC, y + 7, { width: W_DESC, align: 'right' })
    .text('Total', X_TOTAL, y + 7, { width: W_TOTAL, align: 'right' });
  y += 22;
  doc.font('Helvetica').fontSize(9);
  items.forEach((it, idx) => {
    const nombre = it.descripcion || it.producto_nombre || '—';
    const sub = [it.marca, it.sku].filter(Boolean).join(' · ');
    const imagenBuf = imagenes[idx];
    const fichaPublica = (it.mostrar_ficha !== false && esImagenPublica(it.ficha_tecnica_url)) ? it.ficha_tecnica_url : null;
    const descripcionCompleta = (it.mostrar_descripcion !== false && it.descripcion_completa) ? it.descripcion_completa : null;
    const descuentoLinea = Number(it.descuento_pct) || 0;
    const textoX = imagenBuf ? M + 34 : M + 8;
    const textoAncho = imagenBuf ? 274 : 300;

    const nombreAltura = doc.font('Helvetica-Bold').fontSize(9).heightOfString(nombre, { width: textoAncho });
    let contenidoH = nombreAltura + 7;
    if (sub) contenidoH += 11;
    let descAltura = 0;
    if (descripcionCompleta) {
      descAltura = doc.font('Helvetica').fontSize(7.5).heightOfString(descripcionCompleta, { width: textoAncho });
      contenidoH += descAltura + 4;
    }
    if (fichaPublica) contenidoH += 11;
    const h = Math.max(contenidoH + 8, imagenBuf ? 34 : 26);

    if (y + h > 780) { doc.addPage(); y = 40; }
    if (idx % 2 === 1) doc.rect(M, y, 515, h).fill('#f7f9fc');
    if (imagenBuf) { try { doc.image(imagenBuf, M + 6, y + 5, { fit: [24, 24] }); } catch { /* imagen inválida, se omite */ } }
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text(nombre, textoX, y + 6, { width: textoAncho });
    let subY = y + 6 + nombreAltura + 1;
    if (sub) { doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(sub, textoX, subY, { width: textoAncho }); subY += 11; }
    if (descripcionCompleta) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text(descripcionCompleta, textoX, subY, { width: textoAncho });
      subY += descAltura + 4;
    }
    if (fichaPublica) {
      doc.fillColor(CYAN).font('Helvetica').fontSize(8)
        .text('Ficha técnica (PDF) »', textoX, subY, { width: textoAncho, underline: true, link: fichaPublica });
    }
    doc.fontSize(9);
    doc.fillColor('#000').font('Helvetica')
      .text(String(Number(it.cantidad)), X_CANT, y + 6, { width: W_CANT, align: 'right' })
      .text(moneyEn(it.precio_unitario, cot.moneda), X_PU, y + 6, { width: W_PU, align: 'right' });
    doc.fillColor(descuentoLinea > 0 ? CYAN : '#bbb').font(descuentoLinea > 0 ? 'Helvetica-Bold' : 'Helvetica')
      .text(descuentoLinea > 0 ? `${descuentoLinea}%` : '—', X_DESC, y + 6, { width: W_DESC, align: 'right' });
    doc.fillColor(NAVY).font('Helvetica-Bold').text(moneyEn(it.total_linea, cot.moneda), X_TOTAL, y + 6, { width: W_TOTAL, align: 'right' });
    y += h;
    if (y > 700) { doc.addPage(); y = 40; }
  });

  // Totales con IVA. En una cotización UF, todo (subtotal/descuento/IVA/
  // total) se calcula sobre subtotal_uf/total_uf — nunca sobre las columnas
  // en CLP, que son solo para Pipeline/Reportes y no se muestran al cliente.
  y += 10;
  const desc = Number(cot.descuento_pct) || 0;
  const iva = Number(cot.iva_pct) || 0;
  const subtotalMostrado = cot.moneda === 'UF' ? Number(cot.subtotal_uf) : Number(cot.subtotal);
  const totalMostrado = cot.moneda === 'UF' ? Number(cot.total_uf) : Number(cot.total);
  const descMonto = redondear(subtotalMostrado * desc / 100, cot.moneda);
  const netoConDesc = subtotalMostrado - descMonto;
  const ivaMonto = redondear(netoConDesc * iva / 100, cot.moneda);
  const linea = (label, val, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 9).fillColor(bold ? NAVY : GRAY)
      .text(label, 330, y, { width: 130, align: 'right' })
      .fillColor(bold ? CYAN : '#000').text(moneyEn(val, cot.moneda), 470, y, { width: 77, align: 'right' });
    y += bold ? 20 : 15;
  };
  linea('Subtotal neto', subtotalMostrado);
  if (desc > 0) linea(`Descuento (${desc}%)`, -descMonto);
  if (iva > 0) linea(`IVA (${iva}%)`, ivaMonto);
  doc.moveTo(330, y).lineTo(547, y).lineWidth(1.5).strokeColor(NAVY).stroke(); y += 6;
  linea('TOTAL', totalMostrado, true);

  // Condiciones + banco.
  y += 14;
  const yBloque = y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(CYAN).text('CONDICIONES COMERCIALES', M, y);
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text(cot.condiciones || (cot.moneda === 'UF'
      ? 'Precios en Unidades de Fomento (UF). Validez según lo indicado. Garantía según fabricante.'
      : 'Precios en pesos chilenos (CLP). Validez según lo indicado. Garantía según fabricante.'), M, y + 14, { width: 250 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(CYAN).text('DATOS BANCARIOS', 320, yBloque);
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text([emisor.banco, emisor.cuenta_tipo && `${emisor.cuenta_tipo} N° ${emisor.cuenta_numero}`,
           emisor.razon_social && `${emisor.razon_social} · RUT ${emisor.rut}`, emisor.email_cobranzas].filter(Boolean).join('\n'),
      320, yBloque + 14, { width: 235 });

  doc.end();
}

// Igual que generarCotizacionPDF, pero devuelve el PDF completo como Buffer
// (para adjuntarlo a un correo) en vez de escribirlo a una respuesta HTTP.
const { PassThrough } = require('stream');
async function generarCotizacionPDFBuffer(data) {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', chunk => chunks.push(chunk));
  const listo = new Promise((resolve, reject) => {
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
  await generarCotizacionPDF(data, stream);
  return listo;
}

const TIPO_ADJUNTO_LABEL = {
  foto_cliente: 'Foto cliente', video_cliente: 'Video cliente', informe_tecnico: 'Informe técnico', otro: 'Otro',
};

// Portada + datos del caso + adjuntos del informe de Postventa (15-09-2026).
// La cotización y los adjuntos que sean PDF NO se dibujan acá — se fusionan
// aparte como páginas completas con pdf-lib (ver routes/postventa.js, PDFKit
// no puede importar páginas de un PDF ya existente). Esta función solo
// genera la parte "propia" del informe: portada + fotos incrustadas + tabla
// de los demás adjuntos (los que no se pueden ni incrustar como imagen ni
// fusionar como PDF, ej. video — el formato PDF no lo admite de ninguna
// forma, quedan solo listados para bajarlos aparte desde el caso).
async function generarInformePostventaPDF(data, stream) {
  const { caso, fotos = [], otrosAdjuntos = [] } = data;
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(stream);
  const M = 40;

  doc.rect(0, 0, 595, 96).fill(NAVY);
  if (fs.existsSync(LOGO)) { try { doc.image(LOGO, M, 20, { height: 30 }); } catch { /* opcional */ } }
  doc.fillColor(CYAN).fontSize(18).font('Helvetica-Bold').text('INFORME DE POSTVENTA', 200, 22, { width: 355, align: 'right' });
  doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold').text(caso.folio || `Caso #${caso.id}`, 200, 46, { width: 355, align: 'right' });
  doc.rect(0, 96, 595, 4).fill(CYAN);

  let y = 116;
  doc.fillColor(NAVY).fontSize(13).font('Helvetica-Bold').text(caso.titulo, M, y, { width: 515 });
  y += doc.heightOfString(caso.titulo, { width: 515 }) + 12;

  const nombreCliente = caso.empresa_nombre || `${caso.contacto_nombre || ''} ${caso.contacto_apellido || ''}`.trim();
  const campo = (label, valor) => {
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(label, M, y, { width: 150 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(valor || '—', M + 150, y, { width: 365 });
    y += Math.max(14, doc.heightOfString(valor || '—', { width: 365 }) + 4);
  };
  campo('Cliente', nombreCliente);
  campo('Producto / equipo', caso.producto_nombre);
  campo('Detalle equipo', caso.detalle_equipo);
  campo('Prioridad', caso.prioridad);
  campo('Etapa', caso.etapa_nombre);
  campo('Creado por', caso.creado_por_nombre);
  campo('Técnico asignado', caso.tecnico_nombre);
  campo('Fecha límite de respuesta', caso.fecha_limite_respuesta ? fechaCorta(caso.fecha_limite_respuesta) : null);
  campo('Fecha de cierre', caso.fecha_cierre ? fechaCorta(caso.fecha_cierre) : null);
  campo('Venta de origen', caso.negocio_titulo);
  campo('N° cotización o venta (referencia)', caso.referencia_cotizacion_venta);

  if (caso.descripcion) {
    y += 8;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(CYAN).text('DESCRIPCIÓN', M, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(caso.descripcion, M, y, { width: 515 });
    y += doc.heightOfString(caso.descripcion, { width: 515 }) + 12;
  }
  if (caso.comentario_cierre) {
    y += 8;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(CYAN).text('COMENTARIO DE CIERRE', M, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(caso.comentario_cierre, M, y, { width: 515 });
    y += doc.heightOfString(caso.comentario_cierre, { width: 515 }) + 12;
  }

  if (otrosAdjuntos.length) {
    if (y > 680) { doc.addPage(); y = 40; }
    y += 8;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(CYAN).text('OTROS ADJUNTOS (descárgalos desde el caso en el CRM)', M, y, { width: 515 });
    y += 16;
    otrosAdjuntos.forEach(a => {
      if (y > 780) { doc.addPage(); y = 40; }
      const linea = `${TIPO_ADJUNTO_LABEL[a.tipo] || 'Otro'} — ${a.archivo_nombre || 'archivo'} · subido por ${a.subido_por_nombre || 'sistema'} · ${fechaCorta(a.created_at)}`;
      doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(linea, M, y, { width: 515 });
      y += doc.heightOfString(linea, { width: 515 }) + 6;
    });
  }

  // Cada foto en su propia página, a tamaño legible, con pie de foto.
  for (const foto of fotos) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(foto.archivo_nombre || 'Foto', M, 40, { width: 515 });
    try {
      doc.image(foto.buffer, M, 64, { fit: [515, 650], align: 'center' });
    } catch {
      doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('No se pudo incrustar esta imagen.', M, 64);
    }
    doc.font('Helvetica').fontSize(8).fillColor(GRAY)
      .text(`Subido por ${foto.subido_por_nombre || 'sistema'} · ${fechaCorta(foto.created_at)}`, M, 730, { width: 515 });
  }

  doc.end();
}

// Como Buffer — el informe de Postventa siempre se arma completo en memoria
// antes de responder (routes/postventa.js necesita fusionarlo con pdf-lib
// junto a la cotización/adjuntos PDF, no puede pipear directo a la
// respuesta como sí hace generarCotizacionPDF).
async function generarInformePostventaPDFBuffer(data) {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', chunk => chunks.push(chunk));
  const listo = new Promise((resolve, reject) => {
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
  await generarInformePostventaPDF(data, stream);
  return listo;
}

module.exports = {
  generarCotizacionPDF, generarCotizacionPDFBuffer,
  generarInformePostventaPDF, generarInformePostventaPDFBuffer,
};
