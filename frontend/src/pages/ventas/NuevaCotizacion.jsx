import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api';

const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });

export default function NuevaCotizacion() {
  const { negocioId } = useParams();
  const navigate = useNavigate();
  const [negocio, setNegocio] = useState(null);
  const [items, setItems] = useState([]);
  const [descuento, setDescuento] = useState(0);
  const [validez, setValidez] = useState(15);
  const [condiciones, setCondiciones] = useState('');
  const [q, setQ] = useState(''); const [resultados, setResultados] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { api.get(`/negocios/${negocioId}`).then(r => setNegocio(r.data)).catch(() => setError('No se pudo cargar el negocio.')); }, [negocioId]);

  const buscar = async val => {
    setQ(val);
    if (val.length < 2) { setResultados([]); return; }
    try { setResultados((await api.get('/productos', { params: { q: val } })).data.slice(0, 8)); } catch { /* */ }
  };
  const agregarProducto = p => {
    setItems(is => [...is, { producto_id: p.id, descripcion: p.nombre, cantidad: 1, precio_unitario: Number(p.precio_lista) || 0 }]);
    setQ(''); setResultados([]);
  };
  const agregarLibre = () => setItems(is => [...is, { producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0 }]);
  const setItem = (i, campo, val) => setItems(is => is.map((it, idx) => idx === i ? { ...it, [campo]: val } : it));
  const quitar = i => setItems(is => is.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, it) => s + Number(it.cantidad || 0) * Number(it.precio_unitario || 0), 0);
  const total = Math.round(subtotal * (1 - (Number(descuento) || 0) / 100));

  const guardar = async () => {
    setError('');
    if (items.length === 0) { setError('Agrega al menos un ítem.'); return; }
    try {
      const { data } = await api.post('/cotizaciones', {
        negocio_id: Number(negocioId), descuento_pct: Number(descuento) || 0,
        validez_dias: Number(validez) || 15, condiciones,
        items: items.map(it => ({ producto_id: it.producto_id, descripcion: it.descripcion, cantidad: Number(it.cantidad), precio_unitario: Number(it.precio_unitario) })),
      });
      navigate(`/cotizaciones/${data.id}`);
    } catch (err) { setError(err.response?.data?.error || 'Error al crear la cotización.'); }
  };

  if (error && !negocio) return <div className="p-6 text-red-600">{error}</div>;
  if (!negocio) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <Link to={`/negocios/${negocioId}`} className="text-sm text-ht-accent hover:underline">← {negocio.titulo}</Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-1">Nueva cotización</h1>
      <p className="text-gray-500 text-sm mb-6">{negocio.contacto_nombre} {negocio.contacto_apellido} {negocio.empresa_nombre ? `· ${negocio.empresa_nombre}` : ''}</p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <div className="relative mb-3">
          <input value={q} onChange={e => buscar(e.target.value)} placeholder="Buscar producto por nombre o código…"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          {resultados.length > 0 && (
            <div className="absolute z-10 bg-white border border-gray-200 rounded mt-1 w-full max-h-56 overflow-y-auto shadow">
              {resultados.map(p => (
                <button key={p.id} onClick={() => agregarProducto(p)} className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                  <span className="text-ht-navy">{p.nombre}</span>
                  <span className="text-gray-400"> · {p.sku} · {money(p.precio_lista)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <table className="w-full text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 font-medium">Descripción</th>
              <th className="text-right py-1 font-medium w-20">Cant.</th>
              <th className="text-right py-1 font-medium w-32">P. unitario</th>
              <th className="text-right py-1 font-medium w-28">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1 pr-2">
                  <input value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                </td>
                <td className="py-1">
                  <input type="number" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                </td>
                <td className="py-1 pl-2">
                  <input type="number" value={it.precio_unitario} onChange={e => setItem(i, 'precio_unitario', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                </td>
                <td className="py-1 text-right text-ht-navy">{money(Number(it.cantidad || 0) * Number(it.precio_unitario || 0))}</td>
                <td className="py-1 text-right"><button onClick={() => quitar(i)} className="text-red-400 hover:text-red-600">✕</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400">Busca productos arriba o agrega una línea libre.</td></tr>}
          </tbody>
        </table>
        <button onClick={agregarLibre} className="mt-2 text-sm text-ht-accent hover:underline">+ Línea libre</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-32">Descuento (%)</label>
            <input type="number" min="0" max="100" value={descuento} onChange={e => setDescuento(e.target.value)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            {Number(descuento) > 10 && <span className="text-xs text-amber-600">requiere aprobación admin</span>}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-32">Validez (días)</label>
            <input type="number" value={validez} onChange={e => setValidez(e.target.value)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Condiciones comerciales</label>
            <textarea value={condiciones} onChange={e => setCondiciones(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {Number(descuento) > 0 && <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Descuento ({descuento}%)</span><span>−{money(subtotal - total)}</span></div>}
          <div className="flex justify-between text-lg font-bold text-ht-navy border-t border-gray-200 pt-2 mt-2"><span>Total</span><span>{money(total)}</span></div>
          <button onClick={guardar} className="w-full mt-4 bg-ht-navy text-white py-2 rounded text-sm font-medium hover:bg-ht-navy/90">Crear cotización</button>
        </div>
      </div>
    </div>
  );
}
