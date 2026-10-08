// Resolución de técnicos citados en el importador de oportunidades (columna
// "tecnicos"): correo, nombre completo o nombre y apellido parcial, sin
// distinguir mayúsculas ni tildes.
function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// usuarios: [{ id, email, nombre }] (activos con perfil técnico).
// Devuelve texto → { id } | { ambiguo: true } | null.
//   1. Correo o nombre completo (normalizado): coincidencia exacta.
//   2. Si no, nombre parcial de 2 o más palabras: todas las palabras citadas
//      deben ser palabras del nombre del usuario. Un solo usuario → lo asigna;
//      más de uno → ambiguo (no se asigna ninguno).
// Una sola palabra (ej. "Ibarra") nunca se acepta por parcial.
function crearResolutorTecnicos(usuarios) {
  const lista = usuarios.map(u => ({ id: u.id, email: normalizar(u.email), nombre: normalizar(u.nombre) }));
  return function resolver(texto) {
    const t = normalizar(texto);
    if (!t) return null;
    const exactos = [...new Set(lista.filter(u => u.email === t || u.nombre === t).map(u => u.id))];
    if (exactos.length === 1) return { id: exactos[0] };
    if (exactos.length > 1) return { ambiguo: true };
    const palabras = t.split(' ');
    if (palabras.length < 2) return null;
    const parciales = lista.filter(u => { const pu = u.nombre.split(' '); return palabras.every(p => pu.includes(p)); });
    if (parciales.length === 1) return { id: parciales[0].id };
    if (parciales.length > 1) return { ambiguo: true };
    return null;
  };
}

module.exports = { normalizar, crearResolutorTecnicos };
