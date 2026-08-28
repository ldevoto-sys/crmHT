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
// departureTimestamp (segundos unix, opcional): si viene, Directions calcula
// la duración considerando el tráfico esperado a esa hora en vez de la
// duración teórica sin tráfico (solo acepta instantes actuales o futuros).
async function optimizarRuta(origen, paradas, departureTimestamp) {
  if (!configurado()) return { ok: false, motivo: 'Google Maps no configurado' };
  const origenStr = `${origen.lat},${origen.lng}`;
  const waypointsStr = 'optimize:true|' + paradas.map(p => `${p.lat},${p.lng}`).join('|');
  const params = new URLSearchParams({
    origin: origenStr,
    destination: origenStr,
    waypoints: waypointsStr,
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  if (departureTimestamp) params.set('departure_time', String(departureTimestamp));
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
    const data = await r.json();
    if (data.status !== 'OK' || !data.routes[0]) {
      return { ok: false, motivo: `No se pudo calcular la ruta (${data.status})` };
    }
    const ruta = data.routes[0];
    const ordenSugerido = ruta.waypoint_order; // índices sobre `paradas`, ya en orden de visita
    const tramos = ruta.legs.map(leg => ({
      // duration_in_traffic solo viene si se pidió con departure_time.
      duracion_min: Math.round((leg.duration_in_traffic || leg.duration).value / 60),
      distancia_km: Math.round(leg.distance.value / 100) / 10,
      con_trafico: !!leg.duration_in_traffic,
    }));
    const duracionTotalMin = tramos.reduce((acc, t) => acc + t.duracion_min, 0);
    return { ok: true, ordenSugerido, tramos, duracionTotalMin };
  } catch (e) {
    console.error('[googlemaps] Error calculando ruta:', e.message);
    return { ok: false, motivo: 'Error de conexión con Google Maps' };
  }
}

// Google no siempre clasifica la comuna chilena bajo el mismo tipo: en la
// mayoría de los resultados es administrative_area_level_3, pero en algunos
// (sobre todo zonas rurales o localidades pequeñas) solo viene como
// locality o sublocality — se intenta en ese orden.
function parseComponentesDireccion(components) {
  const get = tipo => components.find(c => c.types.includes(tipo))?.long_name || '';
  const direccion = [get('route'), get('street_number')].filter(Boolean).join(' ');
  const comuna = get('administrative_area_level_3') || get('locality') || get('sublocality') || '';
  return { direccion, comuna };
}

// Sugerencias de direcciones mientras se escribe (Places Autocomplete),
// acotadas a Chile. Con menos de 3 caracteres no vale la pena pedirle nada
// a Google — devuelve vacío sin gastar la llamada.
async function autocompletarDireccion(texto) {
  if (!configurado()) return { ok: false, motivo: 'Google Maps no configurado' };
  if (!texto || texto.trim().length < 3) return { ok: true, sugerencias: [] };
  const params = new URLSearchParams({
    input: texto,
    components: 'country:cl',
    language: 'es',
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
    const data = await r.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return { ok: false, motivo: `Autocompletado no disponible (${data.status})` };
    }
    const sugerencias = (data.predictions || []).map(p => ({ place_id: p.place_id, descripcion: p.description }));
    return { ok: true, sugerencias };
  } catch (e) {
    console.error('[googlemaps] Error en autocompletado:', e.message);
    return { ok: false, motivo: 'Error de conexión con Google Maps' };
  }
}

// Resuelve una sugerencia elegida (place_id) a dirección/comuna/coordenadas.
async function detalleLugar(placeId) {
  if (!configurado()) return { ok: false, motivo: 'Google Maps no configurado' };
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'address_component,geometry',
    language: 'es',
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
    const data = await r.json();
    if (data.status !== 'OK' || !data.result) {
      return { ok: false, motivo: `No se pudo obtener el detalle del lugar (${data.status})` };
    }
    const { direccion, comuna } = parseComponentesDireccion(data.result.address_components || []);
    const { lat, lng } = data.result.geometry?.location || {};
    return { ok: true, direccion, comuna, lat, lng };
  } catch (e) {
    console.error('[googlemaps] Error obteniendo detalle de lugar:', e.message);
    return { ok: false, motivo: 'Error de conexión con Google Maps' };
  }
}

module.exports = { configurado, geocodificar, optimizarRuta, autocompletarDireccion, detalleLugar };
