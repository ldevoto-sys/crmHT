// Relleno de las plantillas Word de propuesta (HTCO01-04) con los datos de una
// cotización (HT-AP-03 nota de cambio v1.18 §3). El resultado se descarga
// para retocar (fotos, ajustes) antes de convertir a PDF y subirlo como
// documento final — ver services/pdf.js para el PDF plano de Ventas Directas,
// que sigue existiendo sin cambios.
//
// Los 5 campos narrativos (objeto/alcances/exclusiones/condiciones de
// ejecución/otras consideraciones) son texto libre: cada línea no vacía se
// vuelve un párrafo propio en el documento (loop de docxtemplater). Algunos
// campos de las plantillas (Documentos de Referencia, Límite de Batería,
// condiciones de pago detalladas, firmante) no tienen columna propia en el
// modelo de datos — quedan en blanco para completarse a mano en el Word
// descargado, igual que ya ocurre con "Documentos de Referencia".
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { numeroCompleto } = require('./cotizacion_data');

const TEMPLATE_FILES = {
  simple_suministro: 'HTCO01.docx',
  estandar_suministro_montaje: 'HTCO02.docx',
  llave_en_mano_regulado: 'HTCO03.docx',
  lavado_sanitizacion: 'HTCO04.docx',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(fecha) {
  const d = new Date(fecha);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function fechaCorta(fecha) {
  const d = new Date(fecha);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}
function fmtCLP(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
}
// Líneas no vacías -> un párrafo propio cada una (ver loops de las plantillas).
function lineas(texto) {
  return (texto || '').split('\n').map((l) => l.trim()).filter(Boolean).map((t) => ({ texto: t }));
}

const TAGS_CONSIDERACION = {
  info: 'Info', atencion: 'Atención', corte_agua: 'Corte agua',
  horario_no_habil: 'Horario no hábil', acceso: 'Acceso', otro: 'Otro',
};

// data: el objeto {cot, items, cliente, vendedor, emisor} de fetchCompleta().
// consideraciones: filas de cotizacion_consideraciones (tag, texto, orden) —
// se agregan al final de "Condiciones de ejecución" como "[Tag] texto".
function generarWordPropuesta(data, consideraciones = []) {
  const { cot, items, cliente } = data;
  const archivo = TEMPLATE_FILES[cot.tipo_plantilla];
  if (!archivo) {
    const err = new Error('Esta cotización no tiene una plantilla de propuesta asignada (tipo_plantilla)');
    err.status = 400;
    throw err;
  }
  const templatePath = path.join(__dirname, '..', 'templates', 'operaciones', archivo);
  const zip = new PizZip(fs.readFileSync(templatePath, 'binary'));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, nullGetter: () => '' });

  const clienteNombre = cliente.empresa_nombre || `${cliente.contacto_nombre} ${cliente.contacto_apellido}`;
  const clienteContacto = [
    `${cliente.contacto_nombre} ${cliente.contacto_apellido}`.trim(),
    cliente.contacto_cargo,
    cliente.contacto_telefono,
    cliente.contacto_email,
  ].filter(Boolean).join(' | ');

  // "Suma alzada" en UF (HTCO01/02/03): el subtotal neto ya calculado en CLP
  // se expresa en UF con el snapshot del día usado al cotizar.
  const montoUF = cot.uf_valor ? Number(cot.subtotal) / Number(cot.uf_valor) : null;

  const data_ = {
    nombre_trabajo: cot.titulo || '',
    nombre_proyecto: cot.negocio_titulo || '',
    subtitulo_llave_mano: cot.titulo || cot.negocio_titulo || '',
    version: String(cot.version),
    fecha_larga: fechaLarga(cot.created_at),
    fecha_corta: fechaCorta(cot.created_at),
    numero_cotizacion: numeroCompleto(cot.numero, cot.version),
    cliente_razon_social: clienteNombre,
    cliente_rut: cliente.empresa_rut || '',
    cliente_contacto: clienteContacto,
    proyecto_ubicacion: cot.negocio_titulo || '',
    objeto_lineas: lineas(cot.objeto_propuesta),
    alcances_lineas: lineas(cot.alcances_texto),
    exclusiones_lineas: lineas(cot.exclusiones_texto),
    condiciones_ejecucion_lineas: [
      ...lineas(cot.condiciones_ejecucion_texto),
      ...consideraciones.map((c) => ({ texto: `[${TAGS_CONSIDERACION[c.tag] || c.tag}] ${c.texto}` })),
    ],
    otras_consideraciones_lineas: lineas(cot.otras_consideraciones_texto),
    monto_texto: montoUF ? montoUF.toFixed(2) : '',
    items: (items || []).map((it) => ({
      descripcion: it.descripcion || it.producto_nombre || '',
      cantidad: String(Number(it.cantidad)),
      precio_unitario_texto: fmtCLP(it.precio_unitario),
      total_linea_texto: fmtCLP(it.total_linea),
    })),
    subtotal_texto: fmtCLP(cot.subtotal),
    iva_texto: fmtCLP(Number(cot.total) - Number(cot.subtotal)),
    total_texto: fmtCLP(cot.total),
  };

  doc.render(data_);
  return { buffer: doc.getZip().generate({ type: 'nodebuffer' }), nombreArchivo: `${numeroCompleto(cot.numero, cot.version)}.docx` };
}

module.exports = { generarWordPropuesta };
