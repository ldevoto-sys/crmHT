// Parser de cartolas bancarias para el módulo de Cobranzas (Fase 2,
// especificación HT-DO-XX v0.4 §2.2/4). Detecta el banco por la forma del
// archivo (no por el nombre) y solo extrae los ABONOS (dinero recibido) —
// los cargos (pagos a proveedores, comisiones, etc.) no son relevantes para
// conciliar contra facturas por cobrar. Ninguno de los dos formatos trae el
// RUT del pagador, solo texto libre con el nombre.
const XLSX = require('@e965/xlsx');

const RE_FECHA = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function fechaISO(ddmmyyyy) {
  const m = RE_FECHA.exec(String(ddmmyyyy || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// "2,247,578 " / "-424,802" / "40,436" → número. Los montos de estos
// archivos siempre vienen en pesos chilenos, sin decimales.
function numeroCLP(texto) {
  const limpio = String(texto ?? '').replace(/[, ]/g, '');
  const n = Number(limpio);
  return Number.isNaN(n) ? 0 : n;
}

// Santander manda "000000000" como N° Documento cuando no hay uno real —
// se trata igual que vacío.
function numeroDocumento(texto) {
  const limpio = String(texto || '').trim();
  return limpio && !/^0+$/.test(limpio) ? limpio : null;
}

function leerHojaComoFilas(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
}

// Banco de Chile: .xls binario antiguo. Encabezado de la cartola en las
// primeras ~20 filas, tabla de movimientos con columnas
// "Fecha | | Descripción | | Canal o Sucursal | Nro. Docto. | Cargos (CLP) | Abonos (CLP) | Saldo (CLP)".
function parseBancoDeChile(filas) {
  const idxCuenta = filas.findIndex(f => String(f[1] || '').trim() === 'Cuenta N°:');
  const idxHeader = filas.findIndex(f => String(f[1] || '').trim() === 'Fecha' && String(f[3] || '').trim() === 'Descripción');
  if (idxHeader === -1) return null;
  const cuentaBancaria = idxCuenta !== -1 ? String(filas[idxCuenta][3] || '').trim() : null;

  const movimientos = [];
  for (let i = idxHeader + 1; i < filas.length; i++) {
    const f = filas[i];
    const fecha = fechaISO(f[1]);
    if (!fecha) break; // termina la tabla de movimientos
    const abono = numeroCLP(f[8]);
    if (abono <= 0) continue; // solo dinero recibido, no cargos
    movimientos.push({
      fecha, monto: abono,
      glosa_original: String(f[3] || '').trim(),
      numero_documento: numeroDocumento(f[6]),
      // El saldo resultante (columna "Saldo (CLP)") es lo único que distingue
      // dos transferencias idénticas (mismo monto/glosa/fecha) en este
      // formato — no hay un ID de transacción propio como en Santander.
      referencia_banco: String(f[9] || '').trim() || null,
    });
  }
  return { banco: 'Banco de Chile', cuentaBancaria, movimientos };
}

// Banco Santander: .xlsx, encabezado de la cartola arriba de la tabla, luego
// "MONTO | DESCRIPCIÓN MOVIMIENTO | FECHA | SALDO | N° DOCUMENTO | SUCURSAL | CARGO/ABONO | N° MOVIMIENTO".
// MONTO viene con signo (negativo = cargo); CARGO/ABONO trae 'A'/'C' como
// confirmación redundante del signo.
function parseSantander(filas) {
  const filaCuenta = filas.find(f => String(f[0] || '').includes('Cuenta Corriente N°:'));
  const cuentaBancaria = filaCuenta
    ? (String(filaCuenta[0]).match(/Cuenta Corriente N°:\s*(\S+)/) || [])[1] || null
    : null;
  const idxHeader = filas.findIndex(f => String(f[0] || '').trim() === 'MONTO' && String(f[2] || '').trim() === 'FECHA');
  if (idxHeader === -1) return null;

  const movimientos = [];
  for (let i = idxHeader + 1; i < filas.length; i++) {
    const f = filas[i];
    const fecha = fechaISO(f[2]);
    if (!fecha) continue; // no cortar de inmediato: puede haber una fila vacía suelta
    const tipo = String(f[6] || '').trim().toUpperCase();
    if (tipo !== 'A') continue; // solo Abonos
    movimientos.push({
      fecha, monto: Math.abs(numeroCLP(f[0])),
      glosa_original: String(f[1] || '').trim(),
      numero_documento: numeroDocumento(f[4]),
      // N° MOVIMIENTO es un ID de transacción propio del banco — único por fila.
      referencia_banco: String(f[7] || '').trim() || null,
    });
  }
  return { banco: 'Banco Santander', cuentaBancaria, movimientos };
}

// Detecta el formato probando ambos parsers — no por extensión ni nombre de
// archivo, por la forma real del contenido (encabezados de columna).
function detectarYParsear(buffer) {
  const filas = leerHojaComoFilas(buffer);
  return parseBancoDeChile(filas) || parseSantander(filas) || null;
}

module.exports = { detectarYParsear };
