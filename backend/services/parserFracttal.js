// Parser de solicitudes Fracttal + matching de materiales (HT-AP-03 nota de
// cambio v1.18 §1 y v1.17 §2-3). Puerto fiel de `parseFracttal()` y
// `fuzzyMatchBBDD()` de la herramienta standalone `cotizador_hidrotecnica.html`,
// en uso actual del equipo de Operaciones — no se reimplementa desde la
// especificación en prosa, se porta la lógica ya probada.
//
// Determinístico, auditable, sin IA/LLM eligiendo el producto (política de la
// empresa de no adivinar). El matching consulta el maestro `productos` del CRM
// en vez del array BBDD hardcodeado de la herramienta original (decisión de
// v1.17: no se crea un catálogo paralelo).
//
// Funciones puras: no tocan la BD. El caller (ruta) trae `productos` y
// `sinonimos` desde la BD y se los pasa.

const FAIL_VERBS = [
  'falla', 'fall', 'avería', 'averia', 'bloqueado', 'bloqueada', 'quemad', 'dañad',
  'danad', 'malogr', 'roto', 'rota', 'sin funcionar', 'no funciona', 'desgast', 'colapso',
];

const NON_RM = [
  'calama', 'iquique', 'arica', 'antofagasta', 'copiapo', 'la serena', 'coquimbo',
  'valparaiso', 'vina del mar', 'rancagua', 'talca', 'chillan', 'concepcion', 'temuco',
  'valdivia', 'osorno', 'puerto montt', 'castro', 'coyhaique', 'punta arenas',
];

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 /]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fracciones unicode (½ ¾ ⅜ ...) a texto plano, antes de normalizar/matchear.
function normFrac(s) {
  return (s || '')
    .replace(/¼/g, '1/4').replace(/½/g, '1/2').replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3').replace(/⅔/g, '2/3')
    .replace(/⅛/g, '1/8').replace(/⅜/g, '3/8').replace(/⅝/g, '5/8').replace(/⅞/g, '7/8')
    .replace(/⅕/g, '1/5').replace(/⅙/g, '1/6').replace(/⅐/g, '1/7').replace(/↉/g, '0/3');
}

function get(text, label) {
  const re = new RegExp(label + '[:\\s]+([^\\n\\r]+)', 'i');
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

// Extrae los datos de una solicitud Fracttal pegada como texto plano de correo.
function parseFracttal(textoOriginal) {
  const text = (textoOriginal || '').trim();
  if (!text) return null;

  const num = get(text, 'Número de solicitud');
  const fecha = get(text, 'Fecha de creación');
  const solicitante = get(text, 'Solicitado por');
  const desc = get(text, 'Descripción de la solicitud');
  const urgente = get(text, 'Es urgente');
  const activo = get(text, 'Activo asociado').replace(/\{[^}]*\}\s*/g, '').trim();
  const clienteRaw = get(text, 'Ubicación del activo asociado');
  const segs = clienteRaw.split('/').map((s) => s.trim()).filter((s) => s.length > 0);
  const cliente = segs.length > 0 ? segs[0] : activo.split(' ').slice(0, 4).join(' ');

  const geo = (activo + ' ' + clienteRaw + ' ' + text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const fueraRM = NON_RM.some((c) => geo.includes(c));

  const obsM = text.match(/Observaciones[\s\S]*?(?=Palabras clave|$)/i);
  const obsRaw = obsM ? obsM[0].replace(/^Observaciones[:\s]*/i, '').trim() : '';
  const tieneImp = /imprevistos/i.test(obsRaw);

  // Hallazgo: por verbo de falla en la descripción, o primera oración útil de
  // las observaciones antes del bloque de "cotizar"/lista numerada.
  let hallazgo = '';
  const descLow = desc.toLowerCase();
  if (FAIL_VERBS.some((v) => descLow.includes(v))) hallazgo = desc;
  if (!hallazgo && obsRaw) {
    const splitRe = /hay que cotizar|cotizar[:\s]|se debe cambiar|^\s*\d{1,4}\s+\w/im;
    const splitM = splitRe.exec(obsRaw);
    const introBlock = splitM ? obsRaw.substring(0, splitM.index).trim() : '';
    if (introBlock.length > 15) {
      const sentences = introBlock.split(/[.\n]/);
      for (const s of sentences) {
        const st = s.trim();
        if (st.length > 15) { hallazgo = st; break; }
      }
    }
  }
  hallazgo = hallazgo.replace(/hay que cotizar.*/i, '').replace(/cotizar urgente.*/i, '').trim();

  // Ítems de materiales: lista numerada tras un marcador "cotizar:", o
  // frases "se requiere de N...".
  const matItems = [];
  let matBlock = normFrac(obsRaw);
  const hasNum = /^[\s\-]*\d{1,4}\s+\w/m.test(matBlock);
  const hasReq = /^se requiere/im.test(matBlock);
  if (hasNum) {
    const tm = matBlock.match(/(cotizar[^\n]*:|hay que cotizar[^\n]*:|se debe cambiar[^\n]*:)/i);
    if (tm) {
      matBlock = matBlock.substring(matBlock.indexOf(tm[0]) + tm[0].length).trim();
    } else {
      const lines = matBlock.split('\n');
      const fi = lines.findIndex((l) => /^[\s\-]*\d{1,4}[\s]/.test(l.trim()));
      if (fi > 0) matBlock = lines.slice(fi).join('\n');
    }
    matBlock.split('\n').forEach((raw) => {
      const l = raw.trim().replace(/^[\-–•]\s*/, '');
      const mA = l.match(/^(\d{1,4})\s+(.+)$/);
      const mB = l.match(/^(\d{1,4})([a-záéíóúñA-Z].+)$/i);
      const hit = mA || mB;
      if (hit && !/imprevistos/i.test(l) && !/^(persona|técnico|hora)/i.test((hit[2] || '').trim())) {
        matItems.push({ qty: hit[1], desc: (hit[2] || '').trim() });
      }
    });
  } else if (hasReq) {
    obsRaw.split('\n').forEach((raw) => {
      const m = raw.trim().match(/^se requiere[s]?\s+(.+)$/i);
      if (!m) return;
      const content = m[1].replace(/\burgente\b\s*/i, '');
      const qN = content.match(/\bde\s+(\d+)\s+(.+)$/i);
      let qty = '1', d = content;
      if (qN) { qty = qN[1]; d = qN[2]; }
      d = d.replace(/^(cambio|reemplazo|instalación|lavado)\s+(de\s+)?/i, '').trim();
      d = d.charAt(0).toUpperCase() + d.slice(1);
      matItems.push({ qty, desc: d });
    });
  }

  // Horas de mano de obra: "N personas/técnicos ... M horas".
  const labor = { personas: null, horas: null };
  const laborPatterns = [
    /(\d+)\s*persona[s]?[\s,]*[\w\s]*?(\d+)\s*h(?:rs?|oras?)/i,
    /(\d+)\s*técnicos?[\s,]*[\w\s]*?(\d+)\s*h(?:rs?|oras?)/i,
  ];
  for (const re of laborPatterns) {
    const m = obsRaw.match(re);
    if (m) { labor.personas = m[1]; labor.horas = m[2]; break; }
  }

  // Notas de ejecución.
  const notas = [];
  obsRaw.split('\n').forEach((raw) => {
    const l = raw.trim();
    if (l.length < 5) return;
    if (/\b(llevar|conseguir|coordinar|ejecuta|escalera|camion|camión)/i.test(l)) notas.push(l);
  });

  return { num, fecha, solicitante, desc, urgente, activo, cliente, fueraRM, matItems, labor, notas, tieneImp, hallazgo };
}

// Matching determinístico contra el maestro `productos`. `productos`: filas
// {id, nombre, descripcion, precio_lista}. `sinonimos`: filas
// {termino_fracttal, termino_bbdd}.
function fuzzyMatchProducto(query, productos, sinonimos) {
  const q = normFrac(query || '');
  const nq = normalize(q);
  const words = nq.split(' ').filter((w) => w.length > 1);
  if (!words.length) return null;

  const extraWords = [];
  (sinonimos || []).forEach((s) => {
    const nk = normalize(s.termino_fracttal);
    if (nk && nq.includes(nk)) {
      normalize(s.termino_bbdd).split(' ').forEach((w) => { if (w.length > 1) extraWords.push(w); });
    }
  });

  const allWords = words.concat(extraWords);
  const modelTok = allWords.filter((w) => /[0-9]/.test(w) || w.length <= 4);
  const descW = allWords.filter((w) => !/[0-9]/.test(w) && w.length > 2);

  let best = null;
  let bestSc = 0;
  for (const p of productos || []) {
    const t = normalize([p.nombre, p.descripcion].filter(Boolean).join(' '));
    let ds = 0;
    descW.forEach((w) => { if (t.includes(w)) ds += w.length; });
    let ms = 0;
    modelTok.forEach((w) => { if (t.includes(w)) ms += w.length * 3; });
    const total = ds + ms;
    if (total > bestSc) { bestSc = total; best = { producto_id: p.id, nombre: p.nombre, precio_lista: p.precio_lista, ms }; }
  }
  if (!best) return null;
  if (modelTok.length > 0 && best.ms === 0) return null; // filtro de confianza: sin token de modelo, se rechaza
  return bestSc >= nq.length * 0.3 ? best : null;
}

module.exports = { parseFracttal, fuzzyMatchProducto, normalize, normFrac };
