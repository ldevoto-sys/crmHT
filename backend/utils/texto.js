// Los vendedores suelen tipear nombres en minúscula o mezclado; se estandariza
// a mayúsculas al guardar para que los documentos que ve el cliente (cotización,
// PDF) siempre queden parejos.
function mayusculas(s) {
  return s ? String(s).trim().toUpperCase() : s;
}

// Reemplaza variables {{nombre}} en texto libre (asunto/mensaje del paso de
// correo de una secuencia — ver services/secuencias.js y services/email.js)
// por su valor real. Solo reemplaza las llaves presentes en `valores` — una
// {{variable}} no reconocida o cuyo valor vino vacío se deja tal cual en el
// texto en vez de desaparecer en silencio, para que quien revisa el correo
// note el problema (un typo, un dato faltante) antes de que le llegue así al
// cliente.
function reemplazarVariables(texto, valores) {
  if (!texto) return texto;
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, clave) => {
    const valor = valores[clave];
    return (valor !== undefined && valor !== null && valor !== '') ? String(valor) : match;
  });
}

module.exports = { mayusculas, reemplazarVariables };
