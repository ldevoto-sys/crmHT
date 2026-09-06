// Parser de los dos archivos que entrega Transbank para pagos con
// tarjeta crédito/débito (ampliación del módulo Cobranzas, HT-DO-XX).
// Ninguno de los dos trae folio de factura ni RUT del cliente:
//   - "Cartola de Movimientos": una fila por venta o anulación, monto bruto
//     (el monto con el que se paga la factura completa). Se cruza contra
//     cobranza_documentos por monto+fecha, con margen — igual que las
//     cartolas bancarias normales.
//   - "Resumen histórico de abonos": un total por día, neto de la comisión
//     de Transbank. No tiene detalle por venta.
// Una anulación no borra el movimiento contable original: Transbank la
// entrega como una fila espejo, y ambas comparten el mismo "Código de
// autorización de la venta" — esa es la clave real para vincularlas (no
// monto+fecha, que podría repetirse entre ventas distintas).
const XLSX = require('@e965/xlsx');

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

// "04 septiembre 2026 03:37 PM" / "09 septiembre 2026" → fecha ISO (se
// descarta la hora, no se necesita para el cruce contra facturas).
function fechaLargaISO(texto) {
  const m = /(\d{1,2})\s+([a-zñ]+)\s+(\d{4})/i.exec(String(texto || '').trim());
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const RE_FECHA_CORTA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
function fechaCortaISO(texto) {
  const m = RE_FECHA_CORTA.exec(String(texto || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// "$776,630" / "531700" → número. Los dos archivos vienen en pesos chilenos,
// sin decimales, pero con formato distinto entre sí (uno trae "$" y comas).
function numero(texto) {
  const limpio = String(texto ?? '').replace(/[$,\s]/g, '');
  const n = Number(limpio);
  return Number.isNaN(n) ? 0 : n;
}

// El archivo usa "-" o ceros ("0000000000") como relleno cuando el campo no
// aplica a esa fila (ej. código de autorización de la anulación en una
// venta que nunca se anuló) — se trata igual que vacío.
function limpiar(texto) {
  const t = String(texto || '').trim();
  return t && t !== '-' && !/^0+$/.test(t) ? t : null;
}

function leerFilas(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
}

// Cartola de Movimientos: encabezado real de la tabla en
// "Tipo de movimiento | Estado de movimiento | Fecha de movimiento | ... |
//  Monto venta valido para abono | ... | Código de autorización de la venta |
//  Código de autorización de la anulación | ... | N° de boleta | ...".
function parseMovimientos(buffer) {
  const filas = leerFilas(buffer);
  const idxHeader = filas.findIndex(
    f => String(f[0] || '').trim() === 'Tipo de movimiento' && String(f[2] || '').trim() === 'Fecha de movimiento'
  );
  if (idxHeader === -1) return null;

  const movimientos = [];
  for (let i = idxHeader + 1; i < filas.length; i++) {
    const f = filas[i];
    const tipoRaw = String(f[0] || '').trim();
    if (tipoRaw !== 'Venta' && tipoRaw !== 'Anulación') continue;
    const fecha = fechaLargaISO(f[2]);
    if (!fecha) continue;
    movimientos.push({
      tipo: tipoRaw === 'Venta' ? 'venta' : 'anulacion',
      fecha,
      nombre_local: String(f[6] || '').trim(),
      monto: numero(f[16]), // "Monto venta valido para abono"
      codigo_autorizacion_venta: limpiar(f[20]),
      codigo_autorizacion_anulacion: limpiar(f[21]),
      numero_boleta: limpiar(f[27]),
    });
  }
  return { movimientos };
}

// Resumen histórico de abonos: encabezado de la tabla diaria en la fila que
// trae "Comisión Transbank + IVA (-)" (hay otra fila más arriba con títulos
// más genéricos que no sirve para ubicar las columnas).
function parseAbonos(buffer) {
  const filas = leerFilas(buffer);
  const idxCuenta = filas.findIndex(f => String(f[5] || '').trim() === 'Cuenta corriente:');
  const cuentaBancaria = idxCuenta !== -1 ? String(filas[idxCuenta + 1]?.[5] || '').trim() || null : null;

  const idxHeader = filas.findIndex(f => String(f[3] || '').trim() === 'Comisión Transbank + IVA (-)');
  if (idxHeader === -1) return null;

  const dias = [];
  for (let i = idxHeader + 1; i < filas.length; i++) {
    const f = filas[i];
    const fecha = fechaCortaISO(f[1]);
    if (!fecha) continue;
    dias.push({
      fecha,
      total_ventas: numero(f[2]),
      comision_transbank_iva: numero(f[3]),
      ventas_anuladas: numero(f[4]),
      cobros_servicio: numero(f[5]),
      devolucion_comision: numero(f[7]),
      total_abono: numero(f[8]),
      cuenta_deposito: limpiar(f[9]) || cuentaBancaria,
      numero_ventas: Math.round(numero(f[10])),
    });
  }
  return { cuentaBancaria, dias };
}

// Detecta cuál de los dos archivos es, por la forma del contenido (no por
// el nombre del archivo).
function detectar(buffer) {
  const movimientos = parseMovimientos(buffer);
  if (movimientos) return { tipo: 'movimientos', data: movimientos };
  const abonos = parseAbonos(buffer);
  if (abonos) return { tipo: 'abonos', data: abonos };
  return null;
}

module.exports = { detectar, parseMovimientos, parseAbonos };
