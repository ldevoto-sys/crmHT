// Los vendedores suelen tipear nombres en minúscula o mezclado; se estandariza
// a mayúsculas al guardar para que los documentos que ve el cliente (cotización,
// PDF) siempre queden parejos.
function mayusculas(s) {
  return s ? String(s).trim().toUpperCase() : s;
}

module.exports = { mayusculas };
