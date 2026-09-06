// Mapea filas CSV a contactos de cobranza (importación desde Buk Finanzas,
// que es donde hoy vive esta información). A diferencia del importador de
// contactos comerciales, acá NO se crean empresas nuevas: si el nombre de
// empresa no matchea una ya existente en el CRM, el contacto se crea igual
// pero sin vínculo — se deja para que el cobrador lo registre a mano (mismo
// criterio que la cuenta de paso, sección 9 de la especificación: no
// generar fichas de empresa sin RUT confiable a partir de una fuente
// externa que no lo trae).
// Plantilla: nombre, email, telefono, empresa_rut, empresa_nombre, nivel
const { normalizarTelefono } = require('./dedup');
const { validarRut, normalizarRut, validarEmail } = require('../utils/validaciones');

const MAPA = {
  'nombre': 'nombre', 'nombres': 'nombre', 'name': 'nombre',
  'email': 'email', 'correo': 'email', 'e-mail': 'email',
  'telefono': 'telefono', 'teléfono': 'telefono', 'phone': 'telefono', 'celular': 'telefono',
  'móvil': 'telefono', 'movil': 'telefono', 'fono': 'telefono',
  'empresa_rut': 'empresa_rut', 'rut empresa': 'empresa_rut', 'rut_empresa': 'empresa_rut',
  'empresa': 'empresa_nombre', 'empresa_nombre': 'empresa_nombre', 'company': 'empresa_nombre',
  'razon social': 'empresa_nombre', 'razón social': 'empresa_nombre',
  'nivel': 'nivel', 'level': 'nivel', 'nivel_contacto': 'nivel',
};

// Buk usa "Partner"/"Boss" en la ficha de contacto; el CRM habla de
// par/jefe/superior — se acepta cualquiera de las dos formas.
const NIVELES = {
  'partner': 'par', 'par': 'par',
  'boss': 'jefe', 'jefe': 'jefe',
  'superior': 'superior',
};

const PLANTILLA_HEADERS = ['nombre', 'email', 'telefono', 'empresa_rut', 'empresa_nombre', 'nivel'];

function mapearFila(row) {
  const c = {};
  for (const [header, valorRaw] of Object.entries(row)) {
    const h = header.trim().toLowerCase();
    const campo = MAPA[h];
    if (campo) c[campo] = (valorRaw ?? '').toString().trim();
  }

  const advertencias = [];
  c.telefono_e164 = normalizarTelefono(c.telefono);
  if (c.telefono && !c.telefono_e164) advertencias.push('teléfono no normalizable (se ignoró)');
  if (c.email && !validarEmail(c.email)) { advertencias.push('email con formato inválido (se ignoró)'); c.email = null; }
  if (c.empresa_rut) {
    if (!validarRut(c.empresa_rut)) { advertencias.push('RUT de empresa inválido (se ignoró, se intenta por nombre)'); c.empresa_rut = null; }
    else c.empresa_rut = normalizarRut(c.empresa_rut);
  }

  const errores = [];
  if (!c.nombre) errores.push('falta nombre');
  if (!c.nivel) errores.push('falta nivel');
  else {
    const nivelNormalizado = NIVELES[c.nivel.toLowerCase()];
    if (!nivelNormalizado) errores.push(`nivel inválido "${c.nivel}" (se espera Partner/Boss/Superior o par/jefe/superior)`);
    else c.nivel = nivelNormalizado;
  }
  if (!c.empresa_rut && !c.empresa_nombre) errores.push('falta empresa (RUT o nombre)');

  return { contacto: c, advertencias, errores };
}

function mapearContactos(rows) {
  const validos = [];
  const rechazos = [];

  rows.forEach((row, idx) => {
    const fila = idx + 2;
    const { contacto, advertencias, errores } = mapearFila(row);
    if (errores.length) { rechazos.push({ fila, motivo: errores.join('; ') }); return; }
    validos.push({ fila, contacto, advertencias });
  });

  return { validos, rechazos };
}

module.exports = { mapearContactos, PLANTILLA_HEADERS };
