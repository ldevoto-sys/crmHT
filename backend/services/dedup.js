// Normalización de teléfonos y anti-duplicados de contactos (HT-AP-03 §7.2).
const { db } = require('../db');

const DOMINIOS_PUBLICOS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'hotmail.cl',
  'gmail.cl', 'live.cl', 'live.com', 'icloud.com', 'yahoo.es',
]);

// Normaliza a E.164 chileno. Devuelve null si no hay dígitos.
// Reglas §7.2: quitar espacios/guiones/puntos; conservar + internacional;
// anteponer +56 a números chilenos de 9 dígitos.
function normalizarTelefono(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const hadPlus = s.startsWith('+');
  const d = s.replace(/\D/g, '');
  if (!d) return null;
  if (hadPlus) return '+' + d;          // respeta prefijo internacional explícito
  if (d.startsWith('56')) return '+' + d;
  if (d.length === 9) return '+56' + d; // móvil (9…) o fijo (2…) de 9 dígitos
  if (d.length === 8) return '+569' + d; // móvil legacy de 8 dígitos
  return '+56' + d;                      // fallback: asumir Chile
}

function dominioDeEmail(email) {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1].trim().toLowerCase();
}

function esDominioPublico(dominio) {
  return dominio ? DOMINIOS_PUBLICOS.has(dominio.toLowerCase()) : false;
}

// Sugiere empresa por dominio de correo (nunca con dominios públicos).
async function sugerirEmpresaPorEmail(email) {
  const dominio = dominioDeEmail(email);
  if (!dominio || esDominioPublico(dominio)) return null;
  return db.get(
    'SELECT id, razon_social FROM empresas WHERE lower(dominio_correo) = $1 AND activo = true LIMIT 1',
    [dominio]
  );
}

// Busca contactos que podrían ser el mismo (para alertar al crear/editar).
// Coincidencia por: email igual, teléfono igual, o nombre+apellido en la misma empresa.
async function buscarDuplicados({ email, telefono_e164, nombre, apellido, empresa_id }, excludeId = null) {
  const clauses = [];
  const params = [];
  let i = 1;

  if (email) { clauses.push(`lower(email) = $${i++}`); params.push(email.toLowerCase()); }
  if (telefono_e164) { clauses.push(`telefono_e164 = $${i++}`); params.push(telefono_e164); }
  if (nombre && apellido && empresa_id) {
    clauses.push(`(lower(nombre) = $${i++} AND lower(apellido) = $${i++} AND empresa_id = $${i++})`);
    params.push(nombre.toLowerCase(), apellido.toLowerCase(), empresa_id);
  }
  if (clauses.length === 0) return [];

  let sql = `SELECT id, nombre, apellido, email, telefono_e164, empresa_id
             FROM contactos WHERE activo = true AND (${clauses.join(' OR ')})`;
  if (excludeId) { sql += ` AND id != $${i++}`; params.push(excludeId); }
  sql += ' ORDER BY created_at LIMIT 20';

  return db.all(sql, params);
}

module.exports = {
  normalizarTelefono,
  dominioDeEmail,
  esDominioPublico,
  sugerirEmpresaPorEmail,
  buscarDuplicados,
  DOMINIOS_PUBLICOS,
};
