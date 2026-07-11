// Mapea filas CSV a contactos normalizados (HT-AP-03 v1.2 §importador).
// Plantilla: nombre, apellido, email, telefono, empresa_rut, empresa_nombre, rut_comprador, cargo
const { normalizarTelefono } = require('./dedup');
const { validarRut, validarEmail } = require('../utils/validaciones');

const MAPA = {
  'nombre': 'nombre', 'nombres': 'nombre', 'first name': 'nombre', 'firstname': 'nombre',
  'apellido': 'apellido', 'apellidos': 'apellido', 'last name': 'apellido', 'lastname': 'apellido',
  'email': 'email', 'correo': 'email', 'e-mail': 'email',
  'telefono': 'telefono', 'teléfono': 'telefono', 'phone': 'telefono', 'celular': 'telefono',
  'móvil': 'telefono', 'movil': 'telefono', 'fono': 'telefono',
  'empresa_rut': 'empresa_rut', 'rut empresa': 'empresa_rut',
  'empresa': 'empresa_nombre', 'empresa_nombre': 'empresa_nombre', 'company': 'empresa_nombre',
  'razon social': 'empresa_nombre', 'razón social': 'empresa_nombre',
  'rut': 'rut_comprador', 'rut_comprador': 'rut_comprador', 'rut comprador': 'rut_comprador',
  'cargo': 'cargo', 'jobtitle': 'cargo', 'job title': 'cargo',
};

const PLANTILLA_HEADERS = ['nombre', 'apellido', 'email', 'telefono', 'empresa_rut', 'empresa_nombre', 'rut_comprador', 'cargo'];

function mapearFila(row) {
  const c = {};
  for (const [header, valorRaw] of Object.entries(row)) {
    const h = header.trim().toLowerCase();
    const campo = MAPA[h];
    if (campo) c[campo] = (valorRaw ?? '').toString().trim();
  }

  const advertencias = [];
  c.telefono_e164 = normalizarTelefono(c.telefono);
  if (c.telefono && !c.telefono_e164) advertencias.push('teléfono no normalizable');
  if (c.email && !validarEmail(c.email)) { advertencias.push('email con formato inválido'); c.email = null; }
  if (c.rut_comprador && !validarRut(c.rut_comprador)) { advertencias.push('RUT comprador inválido (se ignoró)'); c.rut_comprador = null; }
  if (c.empresa_rut && !validarRut(c.empresa_rut)) { advertencias.push('RUT empresa inválido (se ignoró)'); c.empresa_rut = null; }

  const errores = [];
  if (!c.nombre) errores.push('falta nombre');
  if (!c.email && !c.telefono_e164) errores.push('sin email ni teléfono');

  return { contacto: c, advertencias, errores };
}

function mapearContactos(rows) {
  const validos = [];
  const rechazos = [];
  const telefonosVistos = new Set();

  rows.forEach((row, idx) => {
    const fila = idx + 2;
    const { contacto, advertencias, errores } = mapearFila(row);
    if (errores.length) { rechazos.push({ fila, motivo: errores.join('; ') }); return; }
    if (contacto.telefono_e164) {
      if (telefonosVistos.has(contacto.telefono_e164)) {
        rechazos.push({ fila, motivo: 'teléfono duplicado dentro del archivo' });
        return;
      }
      telefonosVistos.add(contacto.telefono_e164);
    }
    validos.push({ fila, contacto, advertencias });
  });

  return { validos, rechazos };
}

module.exports = { mapearContactos, PLANTILLA_HEADERS };
