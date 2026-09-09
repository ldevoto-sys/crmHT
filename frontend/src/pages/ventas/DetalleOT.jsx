import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';

const TIPOS_TRABAJO_LABEL = {
  mantenimiento_preventivo: 'Mantenimiento preventivo',
  lavado: 'Lavado de estanque',
  impermeabilizado: 'Impermeabilizado',
  mantenimiento_correctivo: 'Mantenimiento correctivo',
  otro: 'Otro',
};
const ORIGEN_ITEMS_LABEL = { plantilla: 'Plantilla estándar', cotizacion: 'Cotización', manual: 'Manual' };
const itemVacio = () => ({ tipo: 'material', producto_id: null, descripcion: '', cantidad: 1, precio_unitario: '' });

// Igual patrón que el buscador de producto de NuevaCotizacion.jsx, sin
// precio (la OT nace sin precios) ni filtros de categoría/marca. El
// desplegable se renderiza en un portal a <body> con posición fija
// calculada desde el input — la tabla de ítems va dentro de un
// contenedor "overflow-x-auto" (para scroll horizontal en mobile), y
// eso recorta cualquier hijo "absolute" que se salga de su alto; con
// "fixed" + portal, el desplegable ya no depende de ningún ancestro.
function BuscadorProducto({ value, onChange, onElegir }) {
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);
  const inputRef = useRef(null);

  const actualizarPos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  };
  const buscar = async val => {
    onChange(val);
    actualizarPos();
    if (val.length < 2) { setResultados([]); return; }
    try { setResultados((await api.get('/productos', { params: { q: val } })).data.slice(0, 15)); }
    catch { /* */ }
  };
  return (
    <div className="relative">
      <input ref={inputRef} value={value} onChange={e => buscar(e.target.value)}
        onFocus={() => { setAbierto(true); actualizarPos(); }} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Nombre, código, marca — o descripción libre"
        className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ht-accent" />
      {abierto && resultados.length > 0 && pos && createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 50 }}
          className="bg-white border border-gray-200 rounded max-h-64 overflow-y-auto shadow-lg">
          {resultados.map(p => (
            <button key={p.id} type="button" onMouseDown={() => { onElegir(p); setResultados([]); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
              <span className="text-ht-navy">{p.nombre}</span>
              <span className="text-gray-400"> · {p.sku}{p.marca ? ` · ${p.marca}` : ''}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function DetalleOT() {
  const { negocioId } = useParams();
  const [ot, setOt] = useState(null);
  const [items, setItems] = useState([]);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const { data } = await api.get(`/ordenes-trabajo/negocio/${negocioId}`);
      setOt(data);
      setItems(data.items.map(it => ({
        tipo: it.tipo, producto_id: it.producto_id, descripcion: it.descripcion || it.producto_nombre || '',
        cantidad: it.cantidad, precio_unitario: it.precio_unitario ?? '',
      })));
      setObservaciones(data.observaciones || '');
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cargar la Orden de Trabajo.'); }
  };
  useEffect(() => { cargar(); }, [negocioId]); // eslint-disable-line

  const setItem = (i, campo, val) => setItems(items.map((it, idx) => idx === i ? { ...it, [campo]: val } : it));
  const elegirProducto = (i, p) => setItems(items.map((it, idx) => idx === i ? { ...it, producto_id: p.id, descripcion: p.nombre } : it));
  const agregarItem = () => setItems([...items, itemVacio()]);
  const quitarItem = i => setItems(items.filter((_, idx) => idx !== i));

  const guardar = async () => {
    setError(''); setMsg(''); setGuardando(true);
    try {
      await api.put(`/ordenes-trabajo/${ot.id}/items`, {
        observaciones,
        items: items.map(it => ({
          tipo: it.tipo, producto_id: it.producto_id, descripcion: it.descripcion,
          cantidad: Number(it.cantidad), precio_unitario: it.precio_unitario === '' ? null : Number(it.precio_unitario),
        })),
      });
      setMsg('Orden de Trabajo guardada.'); cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar.'); }
    finally { setGuardando(false); }
  };

  const descargarPDF = async () => {
    try {
      const { data } = await api.get(`/ordenes-trabajo/${ot.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch { setError('No se pudo generar el PDF.'); }
  };

  if (error && !ot) return <div className="p-6 text-red-600">{error}</div>;
  if (!ot) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <Link to={`/negocios/${negocioId}`} className="text-sm text-ht-accent hover:underline">← Volver al negocio</Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-2xl font-bold text-ht-navy">OT-{ot.negocio_id}</h1>
        <button onClick={descargarPDF} className="text-sm border border-ht-navy text-ht-navy px-3 py-1.5 rounded hover:bg-ht-navy/5">
          Exportar PDF
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-gray-500">Negocio</dt><dd className="text-ht-navy">{ot.negocio_titulo}</dd></div>
          <div><dt className="text-xs text-gray-500">Tipo de trabajo</dt><dd className="text-ht-navy">{TIPOS_TRABAJO_LABEL[ot.tipo_trabajo] || ot.tipo_trabajo}</dd></div>
          <div><dt className="text-xs text-gray-500">Cliente</dt><dd className="text-ht-navy">{ot.empresa_nombre || `${ot.contacto_nombre} ${ot.contacto_apellido || ''}`.trim()}</dd></div>
          <div><dt className="text-xs text-gray-500">Ítems prellenados desde</dt><dd className="text-ht-navy">{ORIGEN_ITEMS_LABEL[ot.origen_items] || ot.origen_items}</dd></div>
        </dl>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-semibold text-ht-navy mb-3">Materiales y herramientas</h2>
        {!ot.puede_editar && <p className="text-sm text-gray-400 mb-3">Solo el vendedor dueño puede editar.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-3 min-w-[640px]">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left font-medium pb-2 w-32">Tipo</th>
                <th className="text-left font-medium pb-2">Descripción</th>
                <th className="text-right font-medium pb-2 w-24">Cantidad</th>
                <th className="text-right font-medium pb-2 w-32">Precio unitario</th>
                {ot.puede_editar && <th className="w-16"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-2 pr-2">
                    <select value={it.tipo} disabled={!ot.puede_editar} onChange={e => setItem(i, 'tipo', e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm disabled:opacity-60">
                      <option value="material">Material</option>
                      <option value="herramienta">Herramienta</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    {ot.puede_editar ? (
                      <BuscadorProducto value={it.descripcion} onChange={val => setItem(i, 'descripcion', val)} onElegir={p => elegirProducto(i, p)} />
                    ) : <span className="text-ht-navy">{it.descripcion}</span>}
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" disabled={!ot.puede_editar} value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right disabled:opacity-60" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" placeholder="—" disabled={!ot.puede_editar} value={it.precio_unitario}
                      onChange={e => setItem(i, 'precio_unitario', e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right disabled:opacity-60" />
                  </td>
                  {ot.puede_editar && (
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => quitarItem(i)} className="text-red-500 hover:underline text-xs">Quitar</button>
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400">Sin ítems.</td></tr>}
            </tbody>
          </table>
        </div>
        {ot.puede_editar && <button type="button" onClick={agregarItem} className="text-sm text-ht-accent hover:underline">+ Agregar línea</button>}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-semibold text-ht-navy mb-2">Observaciones</h2>
        <textarea rows={3} disabled={!ot.puede_editar} value={observaciones} onChange={e => setObservaciones(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent disabled:opacity-60" />
      </div>

      {ot.puede_editar && (
        <button onClick={guardar} disabled={guardando}
          className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      )}
    </div>
  );
}
