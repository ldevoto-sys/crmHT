// Aviso manual de novedades: se dispara a mano (vía POST /api/novedades/enviar)
// cada vez que se promueve a producción un conjunto de cambios que conviene
// avisar a los usuarios. Reutiliza el mismo criterio de "usuarios activos con
// correo" que el informe diario (services/informeDiario.js).
const { db } = require('../db');
const email = require('./email');

async function enviarNovedades(titulo, cambios) {
  const usuarios = await db.all(
    `SELECT nombre, email FROM users WHERE activo = true AND email IS NOT NULL AND email <> ''`
  );

  if (!usuarios.length) {
    console.warn('[novedades] No hay usuarios activos con correo; no se envía nada.');
    return { enviados: 0, total: 0 };
  }

  let enviados = 0;
  for (const usuario of usuarios) {
    try {
      const resultado = await email.novedades(usuario, titulo, cambios);
      if (resultado.enviado) enviados++;
    } catch (err) {
      console.error(`[novedades] Error enviando a ${usuario.email}:`, err.message);
    }
  }
  console.log(`[novedades] "${titulo}" enviado a ${enviados}/${usuarios.length} usuarios.`);
  return { enviados, total: usuarios.length };
}

module.exports = { enviarNovedades };
