// Mapea filas CSV a empresas normalizadas.
// Plantilla: razon_social, rut, dominio_correo, telefono, giro, direccion, comuna, ciudad
const { normalizarTelefono } = require('./dedup');
const { validarRut } = require('../utils/validaciones');

const MAPA = {
  'razon_social': 'razon_social', 'razón social': 'razon_social', 'razon social': 'razon_social',
  'nombre': 'razon_social', 'empresa': 'razon_social', 'company': 'razon_social', 'name': 'razon_social',
  'rut': 'rut', 'rut empresa': 'rut',
  'dominio_correo': 'dominio_correo', 'dominio': 'dominio_correo', 'dominio correo': 'dominio_correo', 'domain': 'dominio_correo',
  'telefono': 'telefono', 'teléfono': 'telefono', 'phone': 'telefono', 'fono': 'telefono',
  'giro': 'giro',
  'direccion': 'direccion', 'dirección': 'direccion', 'address': 'direccion',
  'comuna': 'comuna', 'ciudad': 'ciudad',
};

const PLANTILLA_HEADERS = ['razon_social', 'rut', 'dominio_correo', 'telefono', 'giro', 'direccion', 'comuna', 'ciudad'];

function limpiarDominio(d) {
  if (!d) return null;
  // Aceptar dominios sueltos o URLs/emails; quedarnos con el dominio.
  let s = String(d).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (s.includes('@')) s = s.split('@')[1];
  return s || null;
}

function mapearFila(row) {
  const e = {};
  for (const [header, valorRaw] of Object.entries(row)) {
    const campo = MAPA[header.trim().toLowerCase()];
    if (campo) e[campo] = (valorRaw ?? '').toString().trim();
  }
  const advertencias = [];
  e.telefono_e164 = normalizarTelefono(e.telefono);
  e.dominio_correo = limpiarDominio(e.dominio_correo);
  if (e.rut && !validarRut(e.rut)) { advertencias.push('RUT inválido (se ignoró)'); e.rut = null; }

  const errores = [];
  if (!e.razon_social) errores.push('falta razón social');

  return { empresa: e, advertencias, errores };
}

function mapearEmpresas(rows) {
  const validos = [];
  const rechazos = [];
  const rutsVistos = new Set();

  rows.forEach((row, idx) => {
    const fila = idx + 2;
    const { empresa, advertencias, errores } = mapearFila(row);
    if (errores.length) { rechazos.push({ fila, motivo: errores.join('; ') }); return; }
    if (empresa.rut) {
      if (rutsVistos.has(empresa.rut)) { rechazos.push({ fila, motivo: 'RUT duplicado dentro del archivo' }); return; }
      rutsVistos.add(empresa.rut);
    }
    validos.push({ fila, empresa, advertencias });
  });

  return { validos, rechazos };
}

module.exports = { mapearEmpresas, PLANTILLA_HEADERS };
