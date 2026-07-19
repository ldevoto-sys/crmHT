import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const money = v => v != null ? '$' + Number(v).toLocaleString('es-CL') : 'Sin precio';

const TL = {
  centrifuga: 'Centrífuga', piscina: 'Piscina', sumergible: 'Sumergible', pozo: 'Pozo profundo',
  multicelular_vertical: 'Multicelular vert.', recirculadora: 'Recirculadora',
  aguas_servidas: 'Aguas servidas', hidroneumatico: 'Hidroneumático', control: 'Control/Presostato',
};

const UC = { lmin: 1, m3h: 1000 / 60, lseg: 60, gpm: 3.785 };
const UA = { m: 1, bar: 10.197, psi: 0.7031, ft: 0.3048 };
const toLmin = (v, u) => (!v || isNaN(v) || v <= 0) ? null : parseFloat(v) * (UC[u] || 1);
const toM = (v, u) => (!v || isNaN(v) || v <= 0) ? null : parseFloat(v) * (UA[u] || 1);
const toHp = (v, u) => (!v || isNaN(v) || v <= 0) ? null : (u === 'kw' ? parseFloat(v) / 0.7457 : parseFloat(v));
const norm = s => String(s).toLowerCase().replace(/[\s\-_.]/g, '');
const esTrifasico = voltaje => /3\s*f|trif|380/i.test(voltaje || '');

// Interpola la curva Q/H (lista de pares [q,h] ordenados por q) para saber qué
// altura entrega la bomba al caudal pedido.
function hAtQ(p, qReq) {
  const pts = [...(p.curva_completa || [])].sort((a, b) => a[0] - b[0]);
  if (!pts.length) return null;
  if (qReq <= pts[0][0]) return pts[0][1];
  if (qReq > pts[pts.length - 1][0]) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [q0, h0] = pts[i], [q1, h1] = pts[i + 1];
    if (qReq >= q0 && qReq <= q1) return h0 + (h1 - h0) * (qReq - q0) / (q1 - q0);
  }
  return null;
}

function score(p, cR, aR) {
  if (!cR && !aR) return 70;
  let s = 100;
  if (cR && p.caudal_max) s -= Math.abs(p.caudal_max - cR) / cR * 60;
  if (aR && p.altura_max) s -= Math.abs(p.altura_max - aR) / aR * 60;
  return Math.max(0, s);
}

function findBase(lista, q) {
  if (!q || q.length < 2) return null;
  const qn = norm(q);
  return lista.find(p => norm(p.codigo) === qn) || lista.find(p => norm(p.codigo).includes(qn) || norm(p.nombre).includes(qn)) || null;
}

function distinctos(lista, campo) {
  return [...new Set(lista.map(p => p[campo]).filter(Boolean))].sort();
}

export default function BusquedaEquivalentes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [subTab, setSubTab] = useState('bombas');
  const [seleccion, setSeleccion] = useState(() => new Set());

  useEffect(() => {
    api.get('/productos/equivalencias').then(r => { setProductos(r.data); setCargando(false); })
      .catch(() => { setError('No se pudo cargar el catálogo de equivalencias.'); setCargando(false); });
  }, []);

  const IDX = useMemo(() => Object.fromEntries(productos.map(p => [p.codigo, p])), [productos]);
  const bombas = useMemo(() => productos.filter(p => p.tipo !== 'filtro_arena'), [productos]);
  const filtrosArena = useMemo(() => productos.filter(p => p.tipo === 'filtro_arena'), [productos]);
  const hidroneumaticos = useMemo(() => productos.filter(p => p.tipo === 'hidroneumatico'), [productos]);

  const toggleSel = id => setSeleccion(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [showSelector, setShowSelector] = useState(false);
  const [modoNuevo, setModoNuevo] = useState(false);
  const [q, setQ] = useState('');
  const [negocios, setNegocios] = useState([]);
  const [contactos, setContactos] = useState([]);

  const abrirSelector = async () => {
    setShowSelector(true); setModoNuevo(false); setQ('');
    try {
      const params = user?.rol === 'vendedor' ? { vendedor_id: user.id } : {};
      setNegocios((await api.get('/negocios', { params })).data);
    } catch { /* silencioso */ }
  };
  const buscarContactos = async val => {
    setQ(val);
    if (val.length < 2) { setContactos([]); return; }
    try { setContactos((await api.get('/contactos', { params: { q: val } })).data.slice(0, 15)); } catch { /* */ }
  };
  const filtradosNegocio = negocios.filter(n => {
    const texto = `${n.titulo} ${n.contacto_nombre || ''} ${n.contacto_apellido || ''} ${n.empresa_nombre || ''}`.toLowerCase();
    return texto.includes(q.toLowerCase());
  });
  const idsParam = () => [...seleccion].join(',');
  const elegirNegocio = n => navigate(`/negocios/${n.id}/cotizar?productos=${idsParam()}`);
  const elegirContacto = c => navigate(`/cotizaciones/nueva?contacto_id=${c.id}&productos=${idsParam()}`);

  if (cargando) return <div className="p-6 text-gray-400">Cargando catálogo…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex gap-1 mb-4 border border-gray-200 rounded p-1 bg-slate-50 w-fit">
        {[['bombas', 'Bombas'], ['hidroneumaticos', 'Hidroneumáticos'], ['filtros', 'Filtros de piscina']].map(([k, lbl]) => (
          <button key={k} onClick={() => setSubTab(k)}
            className={`px-3 py-1.5 rounded text-sm font-medium ${subTab === k ? 'bg-white text-ht-navy shadow-sm' : 'text-gray-500'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {subTab === 'bombas' && <TabBombas lista={bombas} IDX={IDX} seleccion={seleccion} onToggle={toggleSel} />}
      {subTab === 'hidroneumaticos' && <TabHidroneumaticos lista={hidroneumaticos} seleccion={seleccion} onToggle={toggleSel} />}
      {subTab === 'filtros' && <TabFiltros lista={filtrosArena} seleccion={seleccion} onToggle={toggleSel} />}

      {seleccion.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-ht-accent text-ht-navy px-6 py-3 flex items-center justify-between shadow-lg z-40">
          <span className="text-sm">{seleccion.size} producto(s) seleccionado(s)</span>
          <div className="flex gap-3">
            <button onClick={() => setSeleccion(new Set())} className="text-sm text-white/70 hover:text-white underline">Limpiar</button>
            <button onClick={abrirSelector} className="bg-ht-accent text-ht-navy px-4 py-1.5 rounded text-sm font-semibold hover:brightness-95">
              Generar cotización
            </button>
          </div>
        </div>
      )}

      {showSelector && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowSelector(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <h2 className="font-semibold text-ht-navy text-lg mb-3">Generar cotización</h2>
            <p className="text-xs text-gray-500 mb-3">Elige el negocio o el contacto destino. Los {seleccion.size} producto(s) seleccionados se precargarán como líneas.</p>

            <div className="flex gap-1 mb-3 border border-gray-200 rounded p-1 bg-slate-50 w-fit">
              <button onClick={() => { setModoNuevo(false); setQ(''); }}
                className={`px-3 py-1.5 rounded text-sm font-medium ${!modoNuevo ? 'bg-white text-ht-navy shadow-sm' : 'text-gray-500'}`}>
                Negocio existente
              </button>
              <button onClick={() => { setModoNuevo(true); setQ(''); setContactos([]); }}
                className={`px-3 py-1.5 rounded text-sm font-medium ${modoNuevo ? 'bg-white text-ht-navy shadow-sm' : 'text-gray-500'}`}>
                Negocio nuevo
              </button>
            </div>

            {!modoNuevo ? (
              <>
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título, contacto o empresa…"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                <div className="flex-1 overflow-y-auto space-y-1">
                  {filtradosNegocio.map(n => (
                    <button key={n.id} onClick={() => elegirNegocio(n)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 border border-transparent hover:border-gray-200">
                      <div className="text-sm text-ht-navy font-medium">{n.titulo}</div>
                      <div className="text-xs text-gray-500">
                        {n.contacto_nombre} {n.contacto_apellido || ''}{n.empresa_nombre ? ` · ${n.empresa_nombre}` : ''} · {n.etapa_nombre}
                      </div>
                    </button>
                  ))}
                  {filtradosNegocio.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Sin negocios que coincidan.</p>}
                </div>
              </>
            ) : (
              <>
                <input autoFocus value={q} onChange={e => buscarContactos(e.target.value)} placeholder="Buscar contacto o empresa…"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                <div className="flex-1 overflow-y-auto space-y-1">
                  {contactos.map(c => (
                    <button key={c.id} onClick={() => elegirContacto(c)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 border border-transparent hover:border-gray-200">
                      <div className="text-sm text-ht-navy font-medium">{c.nombre} {c.apellido || ''}</div>
                      <div className="text-xs text-gray-500">{c.empresa_nombre || 'Sin empresa'}</div>
                    </button>
                  ))}
                  {q.length >= 2 && contactos.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Sin contactos que coincidan.</p>}
                </div>
              </>
            )}

            <button onClick={() => setShowSelector(false)} className="mt-3 px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 self-end">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// === Tarjeta genérica de resultado (bombas) ===
function TarjetaBomba({ p, best, approx, declarado, seleccionado, onToggle, onBuscarModelo }) {
  const specs = [
    p.caudal_max != null && ['Caudal máx.', `${p.caudal_max} l/min`],
    p.altura_max != null && ['Altura máx.', `${p.altura_max} m`],
    p.hp != null && ['Potencia', `${p.hp} HP`],
    p.voltaje && ['Voltaje', p.voltaje],
    p.conexion && ['Conexión', p.conexion],
  ].filter(Boolean);

  return (
    <div className={`bg-white rounded-lg border overflow-hidden flex flex-col ${best ? 'border-2 border-ht-accent' : approx ? 'border-dashed border-amber-400' : 'border-gray-200'}`}>
      {declarado && <div className="bg-ht-navy text-white text-[10px] font-bold text-center py-1 tracking-wide">SUSTITUTO DECLARADO</div>}
      {best && !declarado && <div className="bg-ht-accent text-ht-navy text-[10px] font-bold text-center py-1 tracking-wide">MEJOR COINCIDENCIA</div>}
      {approx && !best && !declarado && <div className="bg-amber-50 text-amber-800 text-[10px] font-semibold text-center py-1">Solo valores máx. — verificar ficha</div>}
      <div className="h-24 bg-slate-50 flex items-center justify-center border-b border-gray-100">
        {p.url_imagen
          ? <img src={p.url_imagen} alt={p.codigo} className="max-h-20 max-w-[85%] object-contain" onError={e => { e.target.style.display = 'none'; }} />
          : <span className="text-xs text-gray-300">{p.codigo}</span>}
      </div>
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">{p.marca}</span>
        <span className="text-[10px] font-mono font-bold text-ht-navy bg-slate-100 px-1.5 py-0.5 rounded">{p.codigo}</span>
      </div>
      <div className="px-3 py-2 flex-1">
        <div className="text-sm font-medium text-ht-navy mb-1">{p.nombre.length > 60 ? p.nombre.slice(0, 60) + '…' : p.nombre}</div>
        <div className="space-y-0.5 mb-2">
          {specs.map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-gray-400">{k}</span><span className="text-gray-700">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap mb-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-gray-600">{TL[p.tipo] || p.tipo}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.tiene_curva ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {p.tiene_curva ? 'Curva HQ real' : 'Solo máx.'}
          </span>
        </div>
        {p.ficha_tecnica_url && (
          <a href={p.ficha_tecnica_url} target="_blank" rel="noreferrer" className="text-xs text-ht-accent hover:underline">📄 Ficha técnica</a>
        )}
        {p.sustitutos.length > 0 && (
          <div className="mt-1.5 text-[11px] text-gray-500">
            Sustitutos: {p.sustitutos.map(cod => (
              <button key={cod} onClick={() => onBuscarModelo(cod)} className="text-ht-accent hover:underline mr-1.5">{cod}</button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-slate-50">
        <span className="text-sm font-semibold text-ht-navy">{money(p.precio)}</span>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={seleccionado} onChange={() => onToggle(p.id)} /> Elegir
        </label>
      </div>
    </div>
  );
}

function TabBombas({ lista, IDX, seleccion, onToggle }) {
  const [tipo, setTipo] = useState('');
  const [voltaje, setVoltaje] = useState('');
  const [marca, setMarca] = useState('');
  const [pmax, setPmax] = useState('');
  const [subQ, setSubQ] = useState('');
  const [caudal, setCaudal] = useState(''); const [cauUnit, setCauUnit] = useState('lmin');
  const [altura, setAltura] = useState(''); const [altUnit, setAltUnit] = useState('m');
  const [pot, setPot] = useState(''); const [potUnit, setPotUnit] = useState('hp');
  const [tol, setTol] = useState(5);
  const [srt, setSrt] = useState('score');

  const tipos = useMemo(() => distinctos(lista, 'tipo'), [lista]);
  const marcas = useMemo(() => distinctos(lista, 'marca'), [lista]);
  const voltajes = useMemo(() => distinctos(lista, 'voltaje'), [lista]);

  const resultado = useMemo(() => {
    const cR = toLmin(caudal, cauUnit), aR = toM(altura, altUnit), hR = toHp(pot, potUnit);
    const any = tipo || voltaje || marca || pmax || subQ.trim() || cR || aR || hR;
    if (!any) return { declared: [], calculados: [], base: null, mensaje: 'Usa los filtros para buscar alternativas' };

    const base = findBase(lista, subQ.trim());
    let effCR = cR, effAR = aR, effHR = hR, baseVoltaje = voltaje;
    if (base && !cR && !aR && !hR) {
      effHR = base.hp || null;
      // Solo se prioriza la línea trifásica del modelo base (igual que la herramienta
      // original): no forzar monofásico automáticamente, para no descartar candidatos
      // válidos cuando el usuario no especificó voltaje.
      if (!voltaje && esTrifasico(base.voltaje)) baseVoltaje = base.voltaje;
    }

    const declaredCodes = new Set((base?.sustitutos || []));
    const declared = base ? base.sustitutos.map(cod => IDX[cod]).filter(Boolean).map(p => ({ ...p, _declarado: true })) : [];

    const t = tol / 100;
    const pmaxNum = parseFloat(pmax) || null;
    const calculados = [];
    for (const p of lista) {
      if (tipo && p.tipo !== tipo) continue;
      if (baseVoltaje && p.voltaje !== baseVoltaje) continue;
      if (!baseVoltaje && voltaje && p.voltaje !== voltaje) continue;
      if (marca && p.marca !== marca) continue;
      if (pmaxNum && p.precio != null && p.precio > pmaxNum) continue;
      if (base) {
        if (p.codigo === base.codigo) continue;
        if (declaredCodes.has(p.codigo)) continue;
        if (p.tipo !== base.tipo) continue;
      }
      const hpTol = base && !hR ? 0.4 : 0.3;
      if (effHR && p.hp) { if (p.hp < effHR * (1 - hpTol) || p.hp > effHR * (1 + hpTol)) continue; }
      else if (effHR && !p.hp) continue;

      let modo = 'max', cSc = null, aSc = null;
      if (effCR || effAR) {
        if (p.tiene_curva && effCR) {
          const hI = hAtQ(p, effCR);
          if (hI === null) continue;
          if (effAR) { if (hI < effAR * (1 - t)) continue; aSc = hI >= effAR ? 'hit' : 'near'; }
          cSc = Math.abs(p.caudal_max - effCR) / effCR * 100 <= 5 ? 'hit' : 'near';
          modo = 'curva';
        } else {
          if (effCR && p.caudal_max && p.caudal_max < effCR * (1 - t)) continue;
          if (effCR && !p.caudal_max) continue;
          if (effAR && p.altura_max && p.altura_max < effAR * (1 - t)) continue;
          if (effAR && !p.altura_max) continue;
          if (effCR && p.caudal_max) cSc = Math.abs(p.caudal_max - effCR) / p.caudal_max * 100 <= 5 ? 'hit' : 'near';
          if (effAR && p.altura_max) aSc = Math.abs(p.altura_max - effAR) / p.altura_max * 100 <= 5 ? 'hit' : 'near';
        }
      }
      calculados.push({ ...p, _score: score(p, effCR, effAR), _mode: modo, _cs: cSc, _as: aSc });
    }

    if (srt === 'precio_asc') calculados.sort((a, b) => (a.precio ?? 0) - (b.precio ?? 0));
    else if (srt === 'precio_desc') calculados.sort((a, b) => (b.precio ?? 0) - (a.precio ?? 0));
    else if (srt === 'marca') calculados.sort((a, b) => a.marca.localeCompare(b.marca));
    else calculados.sort((a, b) => {
      if (a._mode === 'curva' && b._mode !== 'curva') return -1;
      if (b._mode === 'curva' && a._mode !== 'curva') return 1;
      return b._score - a._score;
    });

    // Límite de resultados: 10 cuando se busca por sustitución de un modelo base
    // (para no saturar con opciones poco relevantes), 200 en búsqueda manual.
    const limite = base ? 10 : 200;
    const calculadosLimitados = calculados.slice(0, Math.max(0, limite - declared.length));

    return { declared, calculados: calculadosLimitados, base, hasFiltroQH: !!(cR || aR) };
  }, [lista, IDX, tipo, voltaje, marca, pmax, subQ, caudal, cauUnit, altura, altUnit, pot, potUnit, tol, srt]);

  return (
    <div className="flex flex-col md:flex-row gap-5">
      <div className="w-full md:w-64 flex-shrink-0 bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Buscar modelo base (sustitutos)</label>
          <input value={subQ} onChange={e => setSubQ(e.target.value)} placeholder="Código o nombre…"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">Cualquier tipo</option>
            {tipos.map(t => <option key={t} value={t}>{TL[t] || t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Caudal requerido</label>
          <div className="flex gap-1">
            <input type="number" min="0" value={caudal} onChange={e => setCaudal(e.target.value)} placeholder="ej: 80"
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm" />
            <select value={cauUnit} onChange={e => setCauUnit(e.target.value)} className="w-20 border border-gray-300 rounded text-xs">
              <option value="lmin">l/min</option><option value="m3h">m³/h</option><option value="lseg">l/seg</option><option value="gpm">GPM</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Altura manométrica</label>
          <div className="flex gap-1">
            <input type="number" min="0" value={altura} onChange={e => setAltura(e.target.value)} placeholder="ej: 30"
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm" />
            <select value={altUnit} onChange={e => setAltUnit(e.target.value)} className="w-16 border border-gray-300 rounded text-xs">
              <option value="m">m</option><option value="bar">bar</option><option value="psi">PSI</option><option value="ft">ft</option>
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Tolerancia</label>
          </div>
          <div className="flex gap-1">
            {[5, 10, 20, 30].map(v => (
              <button key={v} onClick={() => setTol(v)}
                className={`text-xs px-2 py-1 rounded-full border ${tol === v ? 'bg-ht-accent text-ht-navy border-ht-accent' : 'border-gray-300 text-gray-500'}`}>
                ±{v}%
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Potencia</label>
          <div className="flex gap-1">
            <input type="number" min="0" step="0.25" value={pot} onChange={e => setPot(e.target.value)} placeholder="ej: 1.5"
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm" />
            <select value={potUnit} onChange={e => setPotUnit(e.target.value)} className="w-16 border border-gray-300 rounded text-xs">
              <option value="hp">HP</option><option value="kw">kW</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Voltaje</label>
          <select value={voltaje} onChange={e => setVoltaje(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">Cualquier voltaje</option>
            {voltajes.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Marca</label>
          <select value={marca} onChange={e => setMarca(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">Cualquier marca</option>
            {marcas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Precio máximo (neto $)</label>
          <input type="number" min="0" value={pmax} onChange={e => setPmax(e.target.value)} placeholder="Sin límite"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-ht-navy">
              {resultado.declared.length + resultado.calculados.length === 0
                ? (resultado.mensaje || 'Sin resultados')
                : `${resultado.declared.length + resultado.calculados.length} alternativa(s) encontrada(s)`}
            </div>
            {resultado.base && <div className="text-xs text-gray-500">Sustitutos de: {resultado.base.nombre.slice(0, 50)}</div>}
          </div>
          <select value={srt} onChange={e => setSrt(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-xs">
            <option value="score">Mejor coincidencia</option>
            <option value="precio_asc">Menor precio</option>
            <option value="precio_desc">Mayor precio</option>
            <option value="marca">Marca A–Z</option>
          </select>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {resultado.declared.map(p => (
            <TarjetaBomba key={'d' + p.id} p={p} declarado seleccionado={seleccion.has(p.id)} onToggle={onToggle} onBuscarModelo={setSubQ} />
          ))}
          {resultado.calculados.map((p, i) => (
            <TarjetaBomba key={p.id} p={p} best={i === 0 && resultado.declared.length === 0}
              approx={p._mode === 'max' && resultado.hasFiltroQH}
              seleccionado={seleccion.has(p.id)} onToggle={onToggle} onBuscarModelo={setSubQ} />
          ))}
        </div>
        {resultado.declared.length + resultado.calculados.length === 0 && resultado.mensaje !== 'Usa los filtros para buscar alternativas' && (
          <p className="text-sm text-gray-400 text-center py-10">Sin resultados — amplía la tolerancia.</p>
        )}
      </div>
    </div>
  );
}

// === Hidroneumáticos (estanques) ===
function TabHidroneumaticos({ lista, seleccion, onToggle }) {
  const [lt, setLt] = useState('');
  const [bar, setBar] = useState('');
  const [orient, setOrient] = useState('');
  const [marca, setMarca] = useState('');

  const litrosOpts = useMemo(() => distinctos(lista, 'litros'), [lista]);
  const marcas = useMemo(() => distinctos(lista, 'marca'), [lista]);
  const orientaciones = useMemo(() => distinctos(lista, 'orientacion'), [lista]);

  const resultados = useMemo(() => {
    let r = lista.filter(p => {
      if (lt && p.litros !== Number(lt)) return false;
      if (bar && (p.bar_max || 0) < Number(bar)) return false;
      if (orient && p.orientacion !== orient) return false;
      if (marca && p.marca !== marca) return false;
      return true;
    });
    r.sort((a, b) => (a.litros || 0) - (b.litros || 0) || (a.bar_max || 0) - (b.bar_max || 0));
    return r;
  }, [lista, lt, bar, orient, marca]);

  return (
    <div className="flex flex-col md:flex-row gap-5">
      <div className="w-full md:w-56 flex-shrink-0 bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Litros</label>
          <select value={lt} onChange={e => setLt(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">Cualquier tamaño</option>
            {litrosOpts.map(v => <option key={v} value={v}>{v} L</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Presión mínima</label>
          <select value={bar} onChange={e => setBar(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">Cualquier presión</option>
            <option value="8">≥ 8 bar</option><option value="10">≥ 10 bar</option><option value="16">≥ 16 bar</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Orientación</label>
          <select value={orient} onChange={e => setOrient(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">Cualquiera</option>
            {orientaciones.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Marca</label>
          <select value={marca} onChange={e => setMarca(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {marcas.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 mb-3">{resultados.length} estanque(s) encontrado(s)</p>
        <div className="space-y-2">
          {resultados.map(p => (
            <TarjetaSimple key={p.id} p={p} seleccionado={seleccion.has(p.id)} onToggle={onToggle}
              badges={[p.litros ? `${p.litros} L` : null, p.bar_max ? `${p.bar_max} bar` : null, p.orientacion].filter(Boolean)} />
          ))}
          {resultados.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Sin resultados con esos parámetros.</p>}
        </div>
      </div>
    </div>
  );
}

// === Filtros de piscina ===
function TabFiltros({ lista, seleccion, onToggle }) {
  const [query, setQuery] = useState('');
  const [vol, setVol] = useState('');
  const [marca, setMarca] = useState('');
  const marcas = useMemo(() => distinctos(lista, 'marca'), [lista]);
  const volumenes = useMemo(() => distinctos(lista, 'volumen_piscina_m3'), [lista]);

  const { resultados, base } = useMemo(() => {
    const b = query.trim().length >= 3 ? findBase(lista, query.trim()) : null;
    let r = [...lista];
    if (b) {
      const v = b.volumen_piscina_m3 || 0;
      r = r.filter(f => f.codigo !== b.codigo && f.volumen_piscina_m3 && f.volumen_piscina_m3 >= v * 0.7 && f.volumen_piscina_m3 <= v * 1.3);
      r.sort((a, b2) => Math.abs((a.volumen_piscina_m3 || 0) - v) - Math.abs((b2.volumen_piscina_m3 || 0) - v));
    } else {
      if (vol) {
        const volTol = 5;
        r = r.filter(f => f.volumen_piscina_m3 && Math.abs(f.volumen_piscina_m3 - Number(vol)) <= volTol);
        r.sort((a, b2) => Math.abs((a.volumen_piscina_m3 || 0) - Number(vol)) - Math.abs((b2.volumen_piscina_m3 || 0) - Number(vol)));
      } else {
        r.sort((a, b2) => (a.volumen_piscina_m3 || 0) - (b2.volumen_piscina_m3 || 0));
      }
      if (marca) r = r.filter(f => f.marca === marca);
    }
    return { resultados: r, base: b };
  }, [lista, query, vol, marca]);

  return (
    <div className="flex flex-col md:flex-row gap-5">
      <div className="w-full md:w-56 flex-shrink-0 bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Código / modelo</label>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ej: VC30, P450…"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">O volumen de piscina</label>
          <select value={vol} onChange={e => setVol(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">Cualquier volumen</option>
            {volumenes.map(v => <option key={v} value={v}>~{v} m³</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Marca</label>
          <select value={marca} onChange={e => setMarca(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {marcas.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 mb-3">
          {base ? `${resultados.length} equivalente(s) para ${base.nombre.slice(0, 40)} (±30% volumen)` : `${resultados.length} filtro(s) encontrado(s)`}
        </p>
        <div className="space-y-2">
          {resultados.map(p => (
            <TarjetaSimple key={p.id} p={p} seleccionado={seleccion.has(p.id)} onToggle={onToggle}
              badges={[p.volumen_piscina_m3 ? `${p.volumen_piscina_m3} m³ piscina` : null, p.m3h_max ? `${p.m3h_max} m³/h` : null, p.diametro_mm ? `ø${p.diametro_mm}mm` : null].filter(Boolean)} />
          ))}
          {resultados.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Sin equivalentes con esos parámetros.</p>}
        </div>
      </div>
    </div>
  );
}

function TarjetaSimple({ p, badges, seleccionado, onToggle }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
      {p.url_imagen
        ? <img src={p.url_imagen} alt={p.codigo} className="w-14 h-14 object-contain bg-slate-50 rounded flex-shrink-0" onError={e => { e.target.style.display = 'none'; }} />
        : <div className="w-14 h-14 bg-slate-50 rounded flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500">{p.marca} <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded ml-1">{p.codigo}</span></div>
        <div className="text-sm font-medium text-ht-navy truncate">{p.nombre}</div>
        <div className="flex gap-1.5 mt-1 flex-wrap">
          {badges.map(b => <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-gray-600">{b}</span>)}
        </div>
        {p.ficha_tecnica_url && <a href={p.ficha_tecnica_url} target="_blank" rel="noreferrer" className="text-xs text-ht-accent hover:underline">📄 Ficha técnica</a>}
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-semibold text-ht-navy mb-1">{money(p.precio)}</div>
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer justify-end">
          <input type="checkbox" checked={seleccionado} onChange={() => onToggle(p.id)} /> Elegir
        </label>
      </div>
    </div>
  );
}
