const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const NAVY = '#112548';
const ACCENT = '#E8833A';
const GRAY = '#555555';

const LOGO = path.join(__dirname, '../../frontend/public/Hidrotecnica.jpg');
const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const fechaCorta = d => new Date(d).toLocaleDateString('es-CL');

// Genera el PDF de la cotización y lo escribe en el stream (res o archivo).
function generarCotizacionPDF(data, stream) {
  const { cot, items, cliente, vendedor } = data;
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(stream);

  // Encabezado: logo + datos empresa.
  if (fs.existsSync(LOGO)) {
    try { doc.image(LOGO, 40, 36, { height: 34 }); } catch { /* logo opcional */ }
  }
  doc.fillColor(NAVY).fontSize(9).font('Helvetica')
    .text('HidroTecnica SpA', 340, 40, { align: 'right' })
    .text('www.hidrotecnica.cl', { align: 'right' })
    .fillColor(GRAY).text('Cotización comercial', { align: 'right' });

  // Barra de título.
  doc.moveTo(40, 84).lineTo(555, 84).lineWidth(2).strokeColor(ACCENT).stroke();

  doc.fillColor(NAVY).fontSize(18).font('Helvetica-Bold')
    .text(`Cotización ${cot.numero}`, 40, 96);
  doc.fontSize(9).font('Helvetica').fillColor(GRAY)
    .text(`Versión ${cot.version}  ·  Fecha: ${fechaCorta(cot.created_at)}  ·  Validez: ${cot.validez_dias} días`, 40, 118);

  // Datos del cliente.
  let y = 148;
  doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('Cliente', 40, y);
  y += 16;
  doc.fontSize(9).font('Helvetica').fillColor('#000');
  if (cliente.empresa_nombre) doc.text(cliente.empresa_nombre, 40, y), y += 13;
  if (cliente.empresa_rut) doc.fillColor(GRAY).text(`RUT: ${cliente.empresa_rut}`, 40, y), y += 13;
  doc.fillColor('#000').text(`${cliente.contacto_nombre || ''} ${cliente.contacto_apellido || ''}`.trim(), 40, y); y += 13;
  if (cliente.contacto_email) doc.fillColor(GRAY).text(cliente.contacto_email, 40, y), y += 13;

  // Tabla de ítems.
  y += 12;
  const cols = { desc: 40, cant: 330, precio: 390, total: 480 };
  doc.rect(40, y, 515, 20).fill(NAVY);
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
    .text('Descripción', cols.desc + 5, y + 6)
    .text('Cant.', cols.cant, y + 6, { width: 50, align: 'right' })
    .text('P. unitario', cols.precio, y + 6, { width: 80, align: 'right' })
    .text('Total', cols.total, y + 6, { width: 70, align: 'right' });
  y += 20;

  doc.font('Helvetica').fontSize(9).fillColor('#000');
  items.forEach((it, idx) => {
    const desc = it.descripcion || it.producto_nombre || '—';
    const h = Math.max(18, doc.heightOfString(desc, { width: 280 }) + 8);
    if (idx % 2 === 1) doc.rect(40, y, 515, h).fill('#f7f8fa').fillColor('#000');
    doc.fillColor('#000')
      .text(desc, cols.desc + 5, y + 5, { width: 280 })
      .text(String(Number(it.cantidad)), cols.cant, y + 5, { width: 50, align: 'right' })
      .text(money(it.precio_unitario), cols.precio, y + 5, { width: 80, align: 'right' })
      .text(money(it.total_linea), cols.total, y + 5, { width: 70, align: 'right' });
    y += h;
    if (y > 720) { doc.addPage(); y = 60; }
  });

  // Totales.
  doc.moveTo(330, y + 4).lineTo(555, y + 4).lineWidth(1).strokeColor('#ccc').stroke();
  y += 12;
  const linea = (label, val, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9)
      .fillColor(bold ? NAVY : GRAY)
      .text(label, cols.precio - 60, y, { width: 130, align: 'right' })
      .fillColor(bold ? NAVY : '#000')
      .text(money(val), cols.total, y, { width: 70, align: 'right' });
    y += bold ? 18 : 14;
  };
  linea('Subtotal', cot.subtotal);
  if (Number(cot.descuento_pct) > 0) linea(`Descuento (${Number(cot.descuento_pct)}%)`, -(cot.subtotal - cot.total));
  linea('TOTAL', cot.total, true);

  // Condiciones + vendedor.
  y += 16;
  if (cot.condiciones) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Condiciones comerciales', 40, y); y += 13;
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(cot.condiciones, 40, y, { width: 515 });
    y = doc.y + 10;
  }
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Ejecutivo comercial', 40, y); y += 13;
  doc.font('Helvetica').fontSize(8).fillColor('#000').text(vendedor.nombre || '', 40, y); y += 12;
  if (vendedor.email) doc.fillColor(GRAY).text(vendedor.email, 40, y);

  doc.end();
}

module.exports = { generarCotizacionPDF };
