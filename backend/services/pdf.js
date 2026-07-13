const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Documento al cliente: paleta corporativa (navy + celeste), no el acento de app.
const NAVY = '#112548';
const CYAN = '#34B3DE';
const GRAY = '#555555';

const LOGO = path.join(__dirname, '../../frontend/public/Hidrotecnica.jpg');
const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const fechaCorta = d => new Date(d).toLocaleDateString('es-CL');

function generarCotizacionPDF(data, stream) {
  const { cot, items, cliente, vendedor, emisor = {} } = data;
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(stream);
  const M = 40;

  // Encabezado navy con datos del emisor.
  doc.rect(0, 0, 595, 96).fill(NAVY);
  if (fs.existsSync(LOGO)) { try { doc.image(LOGO, M, 20, { height: 30 }); } catch { /* opcional */ } }
  doc.fillColor(CYAN).fontSize(20).font('Helvetica-Bold').text('COTIZACIÓN', 355, 22, { width: 200, align: 'right' });
  doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold').text(`N° ${cot.numero}  ·  v${cot.version}`, 355, 46, { width: 200, align: 'right' });
  const emLinea = [emisor.direccion && `${emisor.direccion}, ${emisor.comuna || ''}`, emisor.rut && `RUT ${emisor.rut}`,
                   emisor.telefono && `T ${emisor.telefono}`, emisor.whatsapp && `WhatsApp ${emisor.whatsapp}`, emisor.email_ventas]
                   .filter(Boolean).join('   ·   ');
  doc.fontSize(8).font('Helvetica').fillColor('rgba(255,255,255,0.8)').text(emLinea, M, 74, { width: 515 });
  doc.rect(0, 96, 595, 4).fill(CYAN);

  let y = 104;
  if (cot.titulo) {
    doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text(cot.titulo, M, y, { width: 515 });
    y += 18;
  }
  y = Math.max(y, 120);
  // Cliente + info (dos columnas).
  doc.fillColor(CYAN).fontSize(9).font('Helvetica-Bold').text('CLIENTE', M, y);
  doc.fillColor(CYAN).text('INFORMACIÓN', 320, y);
  y += 14;
  doc.fillColor(NAVY).fontSize(12).font('Helvetica-Bold').text(cliente.empresa_nombre || `${cliente.contacto_nombre || ''} ${cliente.contacto_apellido || ''}`.trim(), M, y, { width: 260 });
  doc.fontSize(9).font('Helvetica').fillColor(GRAY);
  let yc = y + 16;
  if (cliente.empresa_direccion) { doc.text(`${cliente.empresa_direccion}${cliente.empresa_comuna ? ', ' + cliente.empresa_comuna : ''}`, M, yc, { width: 260 }); yc += 12; }
  if (cliente.empresa_rut) { doc.text(`RUT: ${cliente.empresa_rut}`, M, yc); yc += 12; }
  doc.text(`Contacto: ${cliente.contacto_nombre || ''} ${cliente.contacto_apellido || ''}`.trim(), M, yc); yc += 12;
  if (cliente.contacto_email) { doc.text(cliente.contacto_email, M, yc); yc += 12; }

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

  // Tabla de ítems.
  doc.rect(M, y, 515, 22).fill(NAVY);
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
    .text('Descripción', M + 8, y + 7)
    .text('Cant.', 330, y + 7, { width: 45, align: 'right' })
    .text('P. unitario', 385, y + 7, { width: 80, align: 'right' })
    .text('Total', 475, y + 7, { width: 72, align: 'right' });
  y += 22;
  doc.font('Helvetica').fontSize(9);
  items.forEach((it, idx) => {
    const nombre = it.descripcion || it.producto_nombre || '—';
    const sub = [it.marca, it.sku].filter(Boolean).join(' · ');
    const h = 30;
    if (idx % 2 === 1) doc.rect(M, y, 515, h).fill('#f7f9fc');
    doc.fillColor(NAVY).font('Helvetica-Bold').text(nombre, M + 8, y + 6, { width: 300 });
    if (sub) doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(sub, M + 8, y + 18, { width: 300 }), doc.fontSize(9);
    doc.fillColor('#000').font('Helvetica')
      .text(String(Number(it.cantidad)), 330, y + 6, { width: 45, align: 'right' })
      .text(money(it.precio_unitario), 385, y + 6, { width: 80, align: 'right' })
      .fillColor(NAVY).font('Helvetica-Bold').text(money(it.total_linea), 475, y + 6, { width: 72, align: 'right' });
    y += h;
    if (y > 720) { doc.addPage(); y = 40; }
  });

  // Totales con IVA.
  y += 10;
  const desc = Number(cot.descuento_pct) || 0;
  const iva = Number(cot.iva_pct) || 0;
  const descMonto = Math.round(Number(cot.subtotal) * desc / 100);
  const netoConDesc = Number(cot.subtotal) - descMonto;
  const ivaMonto = Math.round(netoConDesc * iva / 100);
  const linea = (label, val, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 9).fillColor(bold ? NAVY : GRAY)
      .text(label, 330, y, { width: 130, align: 'right' })
      .fillColor(bold ? CYAN : '#000').text(money(val), 470, y, { width: 77, align: 'right' });
    y += bold ? 20 : 15;
  };
  linea('Subtotal neto', cot.subtotal);
  if (desc > 0) linea(`Descuento (${desc}%)`, -descMonto);
  if (iva > 0) linea(`IVA (${iva}%)`, ivaMonto);
  doc.moveTo(330, y).lineTo(547, y).lineWidth(1.5).strokeColor(NAVY).stroke(); y += 6;
  linea('TOTAL', cot.total, true);

  // Condiciones + banco.
  y += 14;
  const yBloque = y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(CYAN).text('CONDICIONES COMERCIALES', M, y);
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text(cot.condiciones || 'Precios en pesos chilenos (CLP). Validez según lo indicado. Garantía según fabricante.', M, y + 14, { width: 250 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(CYAN).text('DATOS BANCARIOS', 320, yBloque);
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text([emisor.banco, emisor.cuenta_tipo && `${emisor.cuenta_tipo} N° ${emisor.cuenta_numero}`,
           emisor.razon_social && `${emisor.razon_social} · RUT ${emisor.rut}`, emisor.email_cobranzas].filter(Boolean).join('\n'),
      320, yBloque + 14, { width: 235 });

  doc.end();
}

module.exports = { generarCotizacionPDF };
