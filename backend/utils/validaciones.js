// validarRut: reutilizado EXACTO de GastosHT/EPP (HT-AP-03 §16).
// Valida el dígito verificador de un RUT chileno.
function validarRut(rut) {
  if (!rut) return false;
  const clean = String(rut).replace(/\./g, '').replace('-', '');
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  if (!/^\d+$/.test(body)) return false;
  let sum = 0, factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const expected = 11 - (sum % 11);
  const dvCalc = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected);
  return dv === dvCalc;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validarEmail(email) {
  return EMAIL_RE.test(email || '');
}

// Contraseña: mínimo 8, una mayúscula, una minúscula y un carácter especial.
function validarPassword(p) {
  return typeof p === 'string' && p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[^A-Za-z0-9]/.test(p);
}

module.exports = { validarRut, validarEmail, validarPassword };
