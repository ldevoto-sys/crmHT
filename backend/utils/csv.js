// Parser CSV mínimo, sin dependencias. Maneja:
// - Separador , o ; (autodetección por la cabecera; Excel chileno suele usar ;)
// - Campos entre comillas dobles con comas/saltos de línea internos y "" escapado
// - BOM inicial y saltos \r\n / \n
function detectarDelimitador(headerLine) {
  const comas = (headerLine.match(/,/g) || []).length;
  const puntoComas = (headerLine.match(/;/g) || []).length;
  return puntoComas > comas ? ';' : ',';
}

function parseCSV(texto) {
  if (!texto) return { headers: [], rows: [] };
  let s = texto.replace(/^﻿/, ''); // quitar BOM
  // Detectar delimitador con la primera línea "lógica".
  const primeraLinea = s.split(/\r?\n/)[0] || '';
  const delim = detectarDelimitador(primeraLinea);

  const registros = [];
  let campo = '';
  let fila = [];
  let enComillas = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (enComillas) {
      if (ch === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += ch;
    } else {
      if (ch === '"') enComillas = true;
      else if (ch === delim) { fila.push(campo); campo = ''; }
      else if (ch === '\n') { fila.push(campo); registros.push(fila); fila = []; campo = ''; }
      else if (ch === '\r') { /* ignorar */ }
      else campo += ch;
    }
  }
  // Último campo/fila si el archivo no termina en salto de línea.
  if (campo.length > 0 || fila.length > 0) { fila.push(campo); registros.push(fila); }

  // Descartar filas totalmente vacías.
  const limpias = registros.filter(r => r.some(c => c.trim() !== ''));
  if (limpias.length === 0) return { headers: [], rows: [] };

  const headers = limpias[0].map(h => h.trim().toLowerCase());
  const rows = limpias.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
  return { headers, rows };
}

// Serializa filas a CSV (separador coma, comillas cuando el valor las necesita).
function toCSV(headers, rows) {
  const escapar = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [headers.map(escapar).join(',')];
  for (const row of rows) lineas.push(headers.map(h => escapar(row[h])).join(','));
  return lineas.join('\r\n');
}

module.exports = { parseCSV, toCSV };
