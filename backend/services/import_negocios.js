// Mapea filas CSV a negocios/oportunidades que nacen directo en la etapa
// "Aceptado" de un pipeline, sin cotización asociada (O/C de Cencosud,
// Sodimac, etc. contra un contrato ya firmado).
// Plantilla: empresa, rut_empresa, contacto_nombre, contacto_apellido, contacto_email, contacto_telefono, titulo, n_oc, monto, fecha_cierre, vendedor
const { normalizarTelefono } = require('./dedup');
const { validarRut, normalizarRut, validarEmail } = require('../utils/validaciones');

const MAPA = {
  'empresa': 'empresa_nombre', 'razon_social': 'empresa_nombre', 'razón social': 'empresa_nombre',
  'razon social': 'empresa_nombre', 'company': 'empresa_nombre',
  'rut_empresa': 'empresa_rut', 'rut empresa': 'empresa_rut',
  'contacto_nombre': 'contacto_nombre', 'nombre': 'contacto_nombre', 'nombres': 'contacto_nombre',
  'contacto_apellido': 'contacto_apellido', 'apellido': 'contacto_apellido', 'apellidos': 'contacto_apellido',
  'contacto_email': 'contacto_email', 'email': 'contacto_email', 'correo': 'contacto_email',
  'contacto_telefono': 'contacto_telefono', 'telefono': 'contacto_telefono', 'teléfono': 'contacto_telefono',
  'celular': 'contacto_telefono', 'fono': 'contacto_telefono',
  'titulo': 'titulo', 'título': 'titulo', 'nombre_negocio': 'titulo', 'oportunidad': 'titulo',
  'n_oc': 'n_oc', 'oc': 'n_oc', 'orden_compra': 'n_oc', 'orden de compra': 'n_oc',
  'n° oc': 'n_oc', 'nº oc': 'n_oc', 'numero_oc': 'n_oc', 'número de oc': 'n_oc',
  'monto': 'monto', 'monto_estimado': 'monto', 'total': 'monto',
  'fecha_cierre': 'fecha_cierre', 'fecha': 'fecha_cierre', 'fecha aceptacion': 'fecha_cierre',
  'fecha_aceptacion': 'fecha_cierre',
  'vendedor': 'vendedor', 'vendedor_email': 'vendedor', 'responsable': 'vendedor',
};

const PLANTILLA_HEADERS = [
  'empresa', 'rut_empresa', 'contacto_nombre', 'contacto_apellido', 'contacto_email',
  'contacto_telefono', 'titulo', 'n_oc', 'monto', 'fecha_cierre', 'vendedor',
];

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function mapearFila(row) {
  const n = {};
  for (const [header, valorRaw] of Object.entries(row)) {
    const h = header.trim().toLowerCase();
    const campo = MAPA[h];
    if (campo) n[campo] = (valorRaw ?? '').toString().trim();
  }

  const advertencias = [];

  n.contacto_telefono_e164 = normalizarTelefono(n.contacto_telefono);
  if (n.contacto_telefono && !n.contacto_telefono_e164) advertencias.push('teléfono de contacto no normalizable (se ignoró)');

  if (n.contacto_email && !validarEmail(n.contacto_email)) {
    advertencias.push('email de contacto con formato inválido (se ignoró)');
    n.contacto_email = null;
  }

  if (n.empresa_rut) {
    if (!validarRut(n.empresa_rut)) { advertencias.push('RUT de empresa inválido (se ignoró)'); n.empresa_rut = null; }
    else n.empresa_rut = normalizarRut(n.empresa_rut);
  }

  if (n.monto) {
    const monto = Number(n.monto.replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(monto)) { advertencias.push('monto no es un número válido (se ignoró)'); n.monto = null; }
    else n.monto = monto;
  } else {
    n.monto = null;
  }

  if (n.fecha_cierre) {
    if (!FECHA_RE.test(n.fecha_cierre)) {
      advertencias.push('fecha_cierre no tiene formato AAAA-MM-DD (se usó la fecha de hoy)');
      n.fecha_cierre = null;
    }
  }

  const errores = [];
  if (!n.empresa_nombre && !n.empresa_rut) errores.push('falta empresa (nombre o RUT)');
  if (!n.contacto_nombre) errores.push('falta nombre del contacto');
  if (!n.contacto_email && !n.contacto_telefono_e164) errores.push('el contacto no tiene email ni teléfono');
  if (!n.titulo) errores.push('falta título de la oportunidad');
  if (!n.vendedor) errores.push('falta vendedor responsable');

  return { negocio: n, advertencias, errores };
}

function mapearNegocios(rows) {
  const validos = [];
  const rechazos = [];

  rows.forEach((row, idx) => {
    const fila = idx + 2;
    const { negocio, advertencias, errores } = mapearFila(row);
    if (errores.length) { rechazos.push({ fila, motivo: errores.join('; ') }); return; }
    validos.push({ fila, negocio, advertencias });
  });

  return { validos, rechazos };
}

module.exports = { mapearNegocios, PLANTILLA_HEADERS };
