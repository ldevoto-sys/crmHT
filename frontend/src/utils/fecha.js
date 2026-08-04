// Todas las fechas del sistema se muestran en hora de Chile, sin importar el
// huso horario configurado en el navegador/equipo de quien mira la pantalla
// (evita que un usuario con el reloj en otro huso horario, o detrás de una
// VPN que fuerza otra zona, vea el día equivocado en columnas como "Fecha").
// Sin timeZone explícito, toLocaleDateString/toLocaleString usan el huso
// horario ambiente del navegador — ese fue el bug reportado en Cotizaciones.
export function formatFecha(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
}

export function formatFechaHora(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-CL', { timeZone: 'America/Santiago' });
}
