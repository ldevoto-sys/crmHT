// Sugerencias de facturación (nota de cambio v1.33): cruza facturas de
// Softland aún sin revisar con negocios del pipeline, para que una persona
// confirme o descarte el match — nunca se mueve un negocio solo.
//
// Por qué RUT y no nombre de cliente: el nombre en Softland (nombre_cliente)
// es texto libre, sin garantía de coincidir con razon_social del CRM. El RUT
// (cod_cliente en Softland, formato "81201000-K") es la clave real del
// cliente en ambos sistemas.
//
// Por qué monto exacto y no aproximado: con datos reales (conversación
// 08-09-2026) clientes de mantención recurrente (ej. CENCOSUD) repiten el
// mismo monto en decenas de negocios distintos — una tolerancia de monto
// solo ampliaría esa ambigüedad, nunca la reduce. El match exacto no alcanza
// a distinguir CUÁL de esos negocios es (eso necesitaría un identificador de
// sitio/tarea en Softland — pendiente "match completo" de CLAUDE.md); por
// eso se listan todos los candidatos y decide la persona, no el sistema.
const { db } = require('../db');
const { normalizarRut } = require('../utils/validaciones');

function rutOrNull(rut) {
  try { return normalizarRut(rut); } catch { return null; }
}

// Facturas de Softland sin resolver (negocio_id IS NULL AND revisado_en IS
// NULL) con sus negocios candidatos — cruce por RUT de empresa + monto
// exacto, acotado a pipelines que tengan una etapa "Facturado" configurada.
async function candidatos() {
  const facturasPendientes = await db.all(
    `SELECT folio, fecha, cod_cliente, nombre_cliente, monto
     FROM reporte_softland_facturas
     WHERE negocio_id IS NULL AND revisado_en IS NULL`
  );
  if (!facturasPendientes.length) return [];

  const empresas = await db.all(`SELECT id, rut FROM empresas WHERE rut IS NOT NULL`);
  const empresaIdPorRut = new Map();
  for (const e of empresas) {
    const rut = rutOrNull(e.rut);
    if (rut) empresaIdPorRut.set(rut, e.id);
  }

  // Solo participan pipelines con una etapa "Facturado" activa — si un
  // pipeline no la tiene, sus negocios no tienen a dónde moverse, así que ni
  // se evalúan (nada de inventar una etapa destino).
  const etapasFacturado = await db.all(
    `SELECT id, pipeline_id FROM pipeline_etapas WHERE lower(nombre) = 'facturado' AND activo = true`
  );
  if (!etapasFacturado.length) return [];
  const etapaFacturadoIdPorPipeline = new Map(etapasFacturado.map(e => [e.pipeline_id, e.id]));
  const pipelineIds = etapasFacturado.map(e => e.pipeline_id);

  const negociosCandidatos = await db.all(
    `SELECT n.id, n.titulo, n.empresa_id, n.pipeline_id, n.monto_estimado,
            pe.nombre AS etapa_nombre, u.nombre AS vendedor_nombre
     FROM negocios n
     JOIN pipeline_etapas pe ON pe.id = n.etapa_id
     LEFT JOIN users u ON u.id = n.vendedor_id
     WHERE n.pipeline_id = ANY($1) AND n.empresa_id IS NOT NULL
       AND pe.tipo <> 'perdida' AND lower(pe.nombre) <> 'facturado'`,
    [pipelineIds]
  );
  const negociosPorEmpresaMonto = new Map();
  for (const n of negociosCandidatos) {
    const key = `${n.empresa_id}|${Math.round(Number(n.monto_estimado) || 0)}`;
    if (!negociosPorEmpresaMonto.has(key)) negociosPorEmpresaMonto.set(key, []);
    negociosPorEmpresaMonto.get(key).push(n);
  }

  const resultado = [];
  for (const f of facturasPendientes) {
    const rutFactura = rutOrNull(f.cod_cliente);
    const empresaId = rutFactura ? empresaIdPorRut.get(rutFactura) : null;
    if (!empresaId) continue; // sin empresa identificada por RUT, no hay candidatos posibles
    const key = `${empresaId}|${Math.round(Number(f.monto) || 0)}`;
    const negocios = negociosPorEmpresaMonto.get(key) || [];
    if (!negocios.length) continue;
    resultado.push({
      folio: f.folio, fecha: f.fecha, cod_cliente: f.cod_cliente, nombre_cliente: f.nombre_cliente, monto: Number(f.monto),
      negocios: negocios.map(n => ({
        id: n.id, titulo: n.titulo, etapa_nombre: n.etapa_nombre, pipeline_id: n.pipeline_id,
        vendedor_nombre: n.vendedor_nombre, etapa_facturado_id: etapaFacturadoIdPorPipeline.get(n.pipeline_id),
      })),
    });
  }
  return resultado;
}

// candidatos(), reagrupados por negocio_id — para pintar el badge de
// sugerencia en la tarjeta del Pipeline sin que ese componente tenga que
// conocer la lógica de matching.
async function candidatosPorNegocio() {
  const porFactura = await candidatos();
  const mapa = new Map();
  for (const f of porFactura) {
    for (const n of f.negocios) {
      if (!mapa.has(n.id)) mapa.set(n.id, []);
      mapa.get(n.id).push({ folio: f.folio, monto: f.monto, fecha: f.fecha, nombre_cliente: f.nombre_cliente });
    }
  }
  return mapa;
}

module.exports = { candidatos, candidatosPorNegocio };
