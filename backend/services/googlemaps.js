// Geocodificación y optimización de ruta con Google Maps Platform (Geocoding
// API + Directions API). Sin API key configurada, no falla: registra y avisa
// al llamador, igual que el resto de servicios externos (email, r2).

function configurado() {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

// Sesga a Chile: las direcciones de despacho son siempre nacionales, y
// muchas no traen el país en el texto.
function direccionCompleta(direccion, comuna) {
  const partes = [direccion, comuna, 'Chile'].filter(Boolean);
  return partes.join(', ');
}

async function geocodificar(direccion, comuna) {
  if (!configurado()) return { ok: false, motivo: 'Google Maps no configurado' };
  const params = new URLSearchParams({
    address: direccionCompleta(direccion, comuna),
    region: 'cl',
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const data = await r.json();
    if (data.status !== 'OK' || !data.results[0]) {
      return { ok: false, motivo: `No se pudo ubicar "${direccion}, ${comuna}" (${data.status})` };
    }
    const { lat, lng } = data.results[0].geometry.location;
    return { ok: true, lat, lng };
  } catch (e) {
    console.error('[googlemaps] Error geocodificando:', e.message);
    return { ok: false, motivo: 'Error de conexión con Google Maps' };
  }
}

// Ruta de ida y vuelta desde `origen` visitando `paradas` en el orden que
// Google determine más eficiente (waypoints optimize:true). Devuelve el
// orden sugerido (índices sobre el arreglo `paradas` recibido) y la
// duración/distancia de cada tramo, en el orden ya optimizado.
async function optimizarRuta(origen, paradas) {
  if (!configurado()) return { ok: false, motivo: 'Google Maps no configurado' };
  const origenStr = `${origen.lat},${origen.lng}`;
  const waypointsStr = 'optimize:true|' + paradas.map(p => `${p.lat},${p.lng}`).join('|');
  const params = new URLSearchParams({
    origin: origenStr,
    destination: origenStr,
    waypoints: waypointsStr,
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
    const data = await r.json();
    if (data.status !== 'OK' || !data.routes[0]) {
      return { ok: false, motivo: `No se pudo calcular la ruta (${data.status})` };
    }
    const ruta = data.routes[0];
    const ordenSugerido = ruta.waypoint_order; // índices sobre `paradas`, ya en orden de visita
    const tramos = ruta.legs.map(leg => ({
      duracion_min: Math.round(leg.duration.value / 60),
      distancia_km: Math.round(leg.distance.value / 100) / 10,
    }));
    const duracionTotalMin = tramos.reduce((acc, t) => acc + t.duracion_min, 0);
    return { ok: true, ordenSugerido, tramos, duracionTotalMin };
  } catch (e) {
    console.error('[googlemaps] Error calculando ruta:', e.message);
    return { ok: false, motivo: 'Error de conexión con Google Maps' };
  }
}

module.exports = { configurado, geocodificar, optimizarRuta };
