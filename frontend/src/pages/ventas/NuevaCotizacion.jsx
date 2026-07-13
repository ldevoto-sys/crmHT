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
  const [iva, setIva] = useState(19);
  const [validez, setValidez] = useState(15);
  const [condiciones, setCondiciones] = useState('');
  const [q, setQ] = useState(''); const [resultados, setResultados] = useState([]);
  const [categoria, setCategoria] = useState(''); const [marca, setMarca] = useState('');
  const [facetas, setFacetas] = useState({ categorias: [], marcas: [] });
  const [error, setError] = useState('');

  useEffect(() => { api.get(`/negocios/${negocioId}`).then(r => setNegocio(r.data)).catch(() => setError('No se pudo cargar el negocio.')); }, [negocioId]);
  useEffect(() => { api.get('/productos/facetas').then(r => setFacetas(r.data)).catch(() => {}); }, []);

  const buscar = async (val, cat = categoria, mar = marca) => {
    setQ(val);
    if (val.length < 2 && !cat && !mar) { setResultados([]); return; }
    try {
      const params = {};
      if (val.length >= 2) params.q = val;
      if (cat) params.categoria = cat;
      if (mar) params.marca = mar;
      setResultados((await api.get('/productos', { params })).data.slice(0, 15));
    } catch { /* */ }
  };
  const cambiarCategoria = val => { setCategoria(val); buscar(q, val, marca); };
  const cambiarMarca = val => { setMarca(val); buscar(q, categoria, val); };

  const agregarProducto = p => {
    setItems(is => [...is, {
      producto_id: p.id, descripcion: p.nombre, cantidad: 1, precio_unitario: Number(p.precio_lista) || 0,
      producto_meta: { sku: p.sku, marca: p.marca, categoria: p.categoria, url_imagen: p.url_imagen },
    }]);
    setQ(''); setResultados([]);
  };
  const agregarLibre = () => setItems(is => [...is, { producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0, producto_meta: null }]);
  const setItem = (i, campo, val) => setItems(is => is.map((it, idx) => idx === i ? { ...it, [campo]: val } : it));
  const quitar = i => setItems(is => is.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, it) => s + Number(it.cantidad || 0) * Number(it.precio_unitario || 0), 0);
  const descMonto = Math.round(subtotal * (Number(descuento) || 0) / 100);
  const neto = subtotal - descMonto;
  const ivaMonto = Math.round(neto * (Number(iva) || 0) / 100);
  const total = neto + ivaMonto;

  const guardar = async () => {
    setError('');
    if (items.length === 0) { setError('Agrega al menos un ítem.'); return; }
    try {
      const { data } = await api.post('/cotizaciones', {
        negocio_id: Number(negocioId), descuento_pct: Number(descuento) || 0, iva_pct: Number(iva) || 0,
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
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <input value={q} onChange={e => buscar(e.target.value)} placeholder="Buscar producto por nombre, código, marca o categoría…"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            {resultados.length > 0 && (
              <div className="absolute z-10 bg-white border border-gray-200 rounded mt-1 w-full max-h-72 overflow-y-auto shadow">
                {resultados.map(p => (
                  <button key={p.id} onClick={() => agregarProducto(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
                    {p.url_imagen && <img src={p.url_imagen} alt="" className="h-8 w-8 object-contain flex-shrink-0" />}
                    <span>
                      <span className="text-ht-navy">{p.nombre}</span>
                      <span className="text-gray-400"> · {p.sku}{p.marca ? ` · ${p.marca}` : ''}{p.categoria ? ` · ${p.categoria}` : ''} · {money(p.precio_lista)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={categoria} onChange={e => cambiarCategoria(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Categoría</option>
            {facetas.categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={marca} onChange={e => cambiarMarca(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Marca</option>
            {facetas.marcas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
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
              <tr key={i} className="border-t border-gray-100 align-top">
                <td className="py-2 pr-2">
                  <input value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                  {it.producto_meta && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {it.producto_meta.url_imagen && <img src={it.producto_meta.url_imagen} alt="" className="h-6 w-6 object-contain" />}
                      <span>{it.producto_meta.sku}{it.producto_meta.marca ? ` · ${it.producto_meta.marca}` : ''}</span>
                    </div>
                  )}
                </td>
                <td className="py-2">
                  <input type="number" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                </td>
                <td className="py-2 pl-2">
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
            <label className="text-sm text-gray-700 w-32">IVA (%)</label>
            <input type="number" min="0" max="100" value={iva} onChange={e => setIva(e.target.value)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
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
          <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Subtotal neto</span><span>{money(subtotal)}</span></div>
          {Number(descuento) > 0 && <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Descuento ({descuento}%)</span><span>−{money(descMonto)}</span></div>}
          {Number(iva) > 0 && <div className="flex justify-between text-sm text-gray-600 mb-1"><span>IVA ({iva}%)</span><span>{money(ivaMonto)}</span></div>}
          <div className="flex justify-between text-lg font-bold text-ht-navy border-t border-gray-200 pt-2 mt-2"><span>Total</span><span>{money(total)}</span></div>
          <button onClick={guardar} className="w-full mt-4 bg-ht-navy text-white py-2 rounded text-sm font-medium hover:bg-ht-navy/90">Crear cotización</button>
        </div>
      </div>
    </div>
  );
}
