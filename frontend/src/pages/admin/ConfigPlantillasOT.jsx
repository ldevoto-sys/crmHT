import { useEffect, useState } from 'react';
import api from '../../api';

const TIPOS = [
  ['mantenimiento_preventivo', 'Mantenimiento preventivo'],
  ['lavado', 'Lavado de estanque'],
];
const itemVacio = () => ({ tipo: 'material', producto_id: null, descripcion: '', cantidad: 1, codigo: '', sku: '' });

function BuscadorProducto({ value, onChange, onElegir }) {
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const buscar = async val => {
    onChange(val);
    if (val.length < 2) { setResultados([]); return; }
    try { setResultados((await api.get('/productos', { params: { q: val } })).data.slice(0, 15)); }
    catch { /* */ }
  };
  return (
    <div className="relative">
      <input value={value} onChange={e => buscar(e.target.value)}
        onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Nombre, código, marca — o descripción libre"
        className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ht-accent" />
      {abierto && resultados.length > 0 && (
        <div className="absolute z-10 bg-white border border-gray-200 rounded mt-1 w-full max-h-64 overflow-y-auto shadow">
          {resultados.map(p => (
            <button key={p.id} type="button" onMouseDown={() => { onElegir(p); setResultados([]); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
              <span className="text-ht-navy">{p.nombre}</span>
              <span className="text-gray-400"> · {p.sku}{p.marca ? ` · ${p.marca}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConfigPlantillasOT() {
  const [tipo, setTipo] = useState(TIPOS[0][0]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = async t => {
    setError(''); setMsg('');
    try {
      const { data } = await api.get(`/ot-plantillas/${t}`);
      setItems(data.map(it => ({
        tipo: it.tipo, producto_id: it.producto_id, descripcion: it.descripcion || it.producto_nombre || '',
        cantidad: it.cantidad, codigo: it.codigo || '', sku: it.sku || '',
      })));
    } catch { setError('No se pudo cargar la plantilla.'); }
  };
  useEffect(() => { cargar(tipo); }, [tipo]); // eslint-disable-line

  const setItem = (i, campo, val) => setItems(items.map((it, idx) => idx === i ? { ...it, [campo]: val } : it));
  const elegirProducto = (i, p) => setItems(items.map((it, idx) => idx === i ? { ...it, producto_id: p.id, descripcion: p.nombre, sku: p.sku || '', codigo: '' } : it));
  // Igual que en DetalleOT.jsx: código que calza exacto con un SKU del
  // catálogo autocompleta la descripción al salir del campo.
  const buscarPorCodigo = async (i, codigo) => {
    if (!codigo || !codigo.trim()) return;
    try {
      const { data } = await api.get('/productos', { params: { q: codigo.trim() } });
      const match = data.find(p => p.sku && p.sku.toLowerCase() === codigo.trim().toLowerCase());
      if (match) elegirProducto(i, match);
    } catch { /* sin conexión o sin match: se deja como código manual */ }
  };
  const agregarItem = () => setItems([...items, itemVacio()]);
  const quitarItem = i => setItems(items.filter((_, idx) => idx !== i));

  const guardar = async () => {
    setError(''); setMsg(''); setGuardando(true);
    try {
      await api.put(`/ot-plantillas/${tipo}`, {
        items: items.map(it => ({
          tipo: it.tipo, producto_id: it.producto_id, descripcion: it.descripcion, cantidad: Number(it.cantidad),
          codigo: it.producto_id ? null : (it.codigo || null),
        })),
      });
      setMsg('Plantilla guardada.'); cargar(tipo);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar.'); }
    finally { setGuardando(false); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Plantillas de Orden de Trabajo</h1>
      <p className="text-gray-500 text-sm mb-4">
        Materiales y herramientas estándar para los tipos de trabajo que se repiten siempre igual. Se copian
        completos a la Orden de Trabajo cada vez que un negocio de este tipo entra a "Aceptado" — no aplica a
        impermeabilizado, mantenimiento correctivo ni otro, que se resuelven caso a caso desde la cotización.
      </p>

      <div className="flex gap-2 mb-4">
        {TIPOS.map(([v, label]) => (
          <button key={v} onClick={() => setTipo(v)}
            className={`text-sm px-3 py-2 rounded border ${tipo === v ? 'bg-ht-accent text-ht-navy border-ht-accent' : 'border-gray-300 text-gray-700 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-3 min-w-[640px]">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left font-medium pb-2 w-32">Tipo</th>
                <th className="text-left font-medium pb-2 w-28">Código</th>
                <th className="text-left font-medium pb-2">Descripción</th>
                <th className="text-right font-medium pb-2 w-24">Cantidad</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-2 pr-2">
                    <select value={it.tipo} onChange={e => setItem(i, 'tipo', e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm">
                      <option value="material">Material</option>
                      <option value="herramienta">Herramienta</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    {it.producto_id ? (
                      <span className="text-gray-500">{it.sku || '—'}</span>
                    ) : (
                      <input value={it.codigo} onChange={e => setItem(i, 'codigo', e.target.value)}
                        onBlur={e => buscarPorCodigo(i, e.target.value)} placeholder="—"
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <BuscadorProducto value={it.descripcion} onChange={val => setItem(i, 'descripcion', val)} onElegir={p => elegirProducto(i, p)} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right" />
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => quitarItem(i)} className="text-red-500 hover:underline text-xs">Quitar</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400">Sin ítems configurados.</td></tr>}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={agregarItem} className="text-sm text-ht-accent hover:underline">+ Agregar línea</button>

        <div className="mt-4">
          <button onClick={guardar} disabled={guardando}
            className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
