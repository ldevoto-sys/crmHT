// UF del día vía findic.cl (https://findic.cl/docs/), con caché en
// uf_diaria: evita golpear la API externa en cada cotización y deja
// registro de qué UF estuvo vigente cada día, para poder auditar contra qué
// valor se calculó una cotización antigua. Si la API falla, cae al último
// valor cacheado (marcado como desactualizado) para que el vendedor pueda
// revisarlo o ingresarlo a mano.
const { db } = require('../db');

function formatoFecha(fecha) {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yyyy = fecha.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function fechaISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}

async function consultarFindic(fecha) {
  const url = `https://findic.cl/api/uf/${formatoFecha(fecha)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`findic.cl respondió ${r.status}`);
  const data = await r.json();
  const registro = data.serie && data.serie[0];
  if (!registro) return null;
  return { fecha: registro.fecha, valor: registro.valor };
}

// Devuelve { ok, valor, fecha, desactualizado } — desactualizado=true si el
// valor viene de la caché por no haberse podido confirmar el de hoy.
async function obtenerUFDelDia() {
  const hoy = new Date();
  const hoyISO = fechaISO(hoy);

  const cacheHoy = await db.get('SELECT valor FROM uf_diaria WHERE fecha = $1', [hoyISO]);
  if (cacheHoy) {
    return { ok: true, valor: Number(cacheHoy.valor), fecha: hoyISO, desactualizado: false };
  }

  try {
    const resultado = await consultarFindic(hoy);
    if (resultado) {
      await db.run(
        `INSERT INTO uf_diaria (fecha, valor) VALUES ($1, $2)
         ON CONFLICT (fecha) DO UPDATE SET valor = EXCLUDED.valor, obtenido_en = now()`,
        [resultado.fecha, resultado.valor]
      );
      return { ok: true, valor: Number(resultado.valor), fecha: resultado.fecha, desactualizado: false };
    }
  } catch (e) {
    console.error('[uf] Error consultando findic.cl:', e.message);
  }

  const ultimaCacheada = await db.get('SELECT fecha, valor FROM uf_diaria ORDER BY fecha DESC LIMIT 1');
  if (ultimaCacheada) {
    return {
      ok: true,
      valor: Number(ultimaCacheada.valor),
      fecha: fechaISO(new Date(ultimaCacheada.fecha)),
      desactualizado: true,
    };
  }

  return { ok: false, motivo: 'No se pudo obtener la UF de findic.cl y no hay ningún valor en caché' };
}

module.exports = { obtenerUFDelDia };
