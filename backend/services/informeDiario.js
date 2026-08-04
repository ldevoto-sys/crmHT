// Informe diario por correo: cotizaciones generadas y negocios ganados el día
// hábil anterior (ambos pipelines, Ventas Directas + Operaciones), a todos los
// usuarios activos. Reutiliza el mismo criterio ya validado en
// routes/reportes.js (última versión de cada cotización, monto del negocio
// ganado = última cotización asociada).
const { db } = require('../db');
const { toCSV } = require('../utils/csv');
const email = require('./email');

// "Ayer" se calcula en hora de Chile: el job corre a las 8am America/Santiago
// (server.js), sin importar en qué huso horario esté el servidor.
function fechaChileHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

function diaAnterior(fechaISO) {
  // Mediodía UTC como ancla: evita que un cambio de horario de verano
  // desplace el cálculo al día equivocado.
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function cotizacionesGeneradas(fecha) {
  return db.all(
    `SELECT c.numero, c.version, c.total,
            n.titulo AS negocio_titulo, p.nombre AS pipeline_nombre,
            coalesce(e.razon_social, trim(ct.nombre || ' ' || coalesce(ct.apellido, ''))) AS cliente_nombre,
            u.nombre AS vendedor_nombre
     FROM cotizaciones c
     JOIN negocios n ON n.id = c.negocio_id
     JOIN pipelines p ON p.id = n.pipeline_id
     JOIN contactos ct ON ct.id = n.contacto_id
     LEFT JOIN empresas e ON e.id = n.empresa_id
     LEFT JOIN users u ON u.id = n.vendedor_id
     WHERE date(c.created_at) = $1::date
       AND c.version = (SELECT MAX(c2.version) FROM cotizaciones c2 WHERE c2.negocio_id = c.negocio_id AND c2.numero = c.numero)
     ORDER BY p.nombre, c.created_at`,
    [fecha]
  );
}

async function negociosGanados(fecha) {
  return db.all(
    `SELECT n.titulo AS negocio_titulo, p.nombre AS pipeline_nombre,
            coalesce(e.razon_social, trim(ct.nombre || ' ' || coalesce(ct.apellido, ''))) AS cliente_nombre,
            u.nombre AS vendedor_nombre,
            uc.numero, uc.version, uc.total AS monto
     FROM negocios n
     JOIN pipeline_etapas pe ON pe.id = n.etapa_id
     JOIN pipelines p ON p.id = n.pipeline_id
     JOIN contactos ct ON ct.id = n.contacto_id
     LEFT JOIN empresas e ON e.id = n.empresa_id
     LEFT JOIN users u ON u.id = n.vendedor_id
     JOIN LATERAL (
       SELECT numero, version, total FROM cotizaciones WHERE negocio_id = n.id ORDER BY created_at DESC LIMIT 1
     ) uc ON true
     WHERE date(n.fecha_cierre) = $1::date AND pe.tipo = 'ganada'
     ORDER BY p.nombre, n.fecha_cierre`,
    [fecha]
  );
}

// Arma el informe del día indicado y lo envía a todos los usuarios activos.
// No verifica si ya se envió — eso lo hace enviarInformeDiarioSiCorresponde()
// (o quien llame esto manualmente sabe lo que está haciendo).
async function enviarInformeDiario(fecha = diaAnterior(fechaChileHoy())) {
  const [cotizaciones, ganados, usuarios] = await Promise.all([
    cotizacionesGeneradas(fecha),
    negociosGanados(fecha),
    db.all(`SELECT nombre, email FROM users WHERE activo = true AND email IS NOT NULL AND email <> ''`),
  ]);

  if (!usuarios.length) {
    console.warn('[informeDiario] No hay usuarios activos con correo; no se envía nada.');
    return { enviados: 0, cotizaciones: cotizaciones.length, ganados: ganados.length };
  }

  const resumen = {
    totalCotizaciones: cotizaciones.reduce((acc, c) => acc + Number(c.total || 0), 0),
    totalGanados: ganados.reduce((acc, g) => acc + Number(g.monto || 0), 0),
  };

  const csvCotizaciones = '﻿' + toCSV(
    ['numero', 'version', 'cliente_nombre', 'vendedor_nombre', 'pipeline_nombre', 'total'],
    cotizaciones
  );
  const csvGanados = '﻿' + toCSV(
    ['numero', 'version', 'negocio_titulo', 'cliente_nombre', 'vendedor_nombre', 'pipeline_nombre', 'monto'],
    ganados
  );

  let enviados = 0;
  for (const usuario of usuarios) {
    try {
      const resultado = await email.informeDiario(usuario, fecha, cotizaciones, ganados, resumen, csvCotizaciones, csvGanados);
      if (resultado.enviado) enviados++;
    } catch (err) {
      console.error(`[informeDiario] Error enviando a ${usuario.email}:`, err.message);
    }
  }
  console.log(`[informeDiario] Informe del ${fecha} enviado a ${enviados}/${usuarios.length} usuarios (${cotizaciones.length} cotizaciones, ${ganados.length} ganados).`);
  return { enviados, cotizaciones: cotizaciones.length, ganados: ganados.length };
}

// Llamado desde el chequeo horario de server.js: solo dispara a las 8am hora
// de Chile, y solo una vez por día (queda registrado en informe_diario_envios).
async function enviarInformeDiarioSiCorresponde() {
  // VITE_AMBIENTE_LABEL solo está definida en ambientes que no son producción
  // (mismo mecanismo que usa BannerAmbiente.jsx en el frontend). El envío
  // automático diario solo debe salir desde producción; el endpoint manual
  // de prueba (/informe-diario/enviar-ahora) no pasa por aquí y sigue
  // funcionando igual en staging.
  if (process.env.VITE_AMBIENTE_LABEL) return;

  const hora = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (hora !== '08') return;

  const hoy = fechaChileHoy();
  const yaEnviado = await db.get('SELECT 1 FROM informe_diario_envios WHERE fecha = $1', [hoy]);
  if (yaEnviado) return;

  await enviarInformeDiario(diaAnterior(hoy));
  await db.run('INSERT INTO informe_diario_envios (fecha) VALUES ($1) ON CONFLICT (fecha) DO NOTHING', [hoy]);
}

module.exports = { enviarInformeDiario, enviarInformeDiarioSiCorresponde, diaAnterior, fechaChileHoy };
