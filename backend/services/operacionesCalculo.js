// Motor de cálculo del Cotizador Operaciones (HT-AP-03 nota de cambio v1.18 §1).
// Puerto fiel de la fórmula de `cotizador_hidrotecnica.html` (recalc()/calcMO()),
// con una única adaptación: los materiales se cotizan en CLP (productos.precio_lista,
// igual que Ventas Directas) en vez de en UF — la mano de obra/traslado/elementos de
// furgón siguen en UF y se convierten a CLP con el valor de la UF del día antes de
// sumarse. Funciones puras, sin acceso a BD, para reutilizar en guardado, vista
// previa y generación del documento final.

// Subtotal de materiales en CLP. `items`: [{cantidad, precio_unitario, factor}].
// factor por defecto 1 (solo se usa/edita en el flujo de Operaciones).
function calcularItems(items) {
  let subtotalMateriales = 0;
  const itemsCalculados = items.map((it) => {
    const cantidad = Number(it.cantidad) || 0;
    const precioUnitario = Number(it.precio_unitario) || 0;
    const factor = it.factor === undefined || it.factor === null ? 1 : Number(it.factor);
    const totalLinea = cantidad * precioUnitario * factor;
    subtotalMateriales += totalLinea;
    return { ...it, factor, total_linea: totalLinea };
  });
  return { itemsCalculados, subtotalMateriales };
}

// Mano de obra y traslado, en UF. `comuna`: {horas_transito, costo_traslado_uf} o null.
// `config`: {hh_uf, hm_uf, elem_furg_uf} (config_operaciones_mo).
// Gate explícito (mismo de la herramienta original): sin horas no hay MO ni
// traslado, aunque haya comuna seleccionada — evita cobrar traslado sin visita real.
function calcularManoDeObra({ horasNormales, horasExtra, comuna, config }) {
  const horas = Number(horasNormales) || 0;
  const horasExtraN = Number(horasExtra) || 0;
  if (!comuna || (horas === 0 && horasExtraN === 0)) {
    return {
      totalUF: 0,
      desglose: { hh: 0, hhExtra: 0, hmTrabajo: 0, hmTransito: 0, traslado: 0, elementosFurgon: 0, horasTotal: 0 },
    };
  }
  const hhUf = Number(config.hh_uf);
  const hmUf = Number(config.hm_uf);
  const hh = hhUf * horas * 2; // 2 técnicos
  const hhExtra = hhUf * 1.5 * horasExtraN * 2;
  const horasTotal = horas + horasExtraN;
  const hmTrabajo = hmUf * horasTotal;
  const hmTransito = hmUf * Number(comuna.horas_transito) * 2;
  const traslado = Number(comuna.costo_traslado_uf) * 2;
  const elementosFurgon = Number(config.elem_furg_uf);
  const totalUF = hh + hhExtra + hmTrabajo + hmTransito + traslado + elementosFurgon;
  return { totalUF, desglose: { hh, hhExtra, hmTrabajo, hmTransito, traslado, elementosFurgon, horasTotal } };
}

// Totales finales. `config`: config_operaciones_mo (markup, elem_mat_pct además de
// lo usado por calcularManoDeObra). `ufValor`: valor de la UF del día (snapshot).
// `ivaPct`: cotizaciones.iva_pct, como número porcentual (ej. 19), igual que Ventas
// Directas — NO confundir con elem_mat_pct, que se guarda como fracción (0.07).
function calcularTotales({ items, horasNormales, horasExtra, comuna, config, ufValor, ivaPct }) {
  const { itemsCalculados, subtotalMateriales } = calcularItems(items);
  const elementosMenores = subtotalMateriales * Number(config.elem_mat_pct);
  const materialesConMarkup = (subtotalMateriales + elementosMenores) * Number(config.markup);
  const mo = calcularManoDeObra({ horasNormales, horasExtra, comuna, config });
  const moCLP = mo.totalUF * Number(ufValor);
  const totalNetoCLP = materialesConMarkup + moCLP;
  const iva = totalNetoCLP * (Number(ivaPct) / 100);
  const totalConIva = totalNetoCLP + iva;
  return {
    itemsCalculados,
    subtotalMateriales,
    elementosMenores,
    materialesConMarkup,
    manoDeObra: mo,
    moCLP,
    totalNetoCLP,
    iva,
    totalConIva,
  };
}

module.exports = { calcularItems, calcularManoDeObra, calcularTotales };
