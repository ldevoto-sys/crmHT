import { useEffect, useState } from 'react';
import api from '../../api';

export default function ReglasAsignacion() {
  const [reglas, setReglas] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [cat, setCat] = useState(''); const [vend, setVend] = useState('');
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');

  const cargar = async () => {
    try {
      setReglas((await api.get('/config/reglas-asignacion')).data.filter(r => r.tipo === 'por_categoria'));
    } catch { setError('No se pudieron cargar las reglas.'); }
  };
  useEffect(() => { cargar(); }, []);
  useEffect(() => { api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {}); }, []);

  const crear = async e => {
    e.preventDefault(); setError(''); setMsg('');
    try { await api.post('/config/reglas-asignacion', { parametro: cat, vendedor_id: Number(vend) }); setCat(''); setVend(''); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al crear la regla.'); }
  };
  const eliminar = async id => { try { await api.delete(`/config/reglas-asignacion/${id}`); cargar(); } catch { setError('Error al eliminar.'); } };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Reglas de asignación</h1>
      <p className="text-gray-500 text-sm mb-6">
        Orden fijo (§7.1): <strong>vendedor de cuenta → regla por categoría → round-robin</strong>.
        Aquí defines los mapeos <em>categoría → vendedor</em>. El round-robin usa los vendedores con la casilla activa en Usuarios.
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <form onSubmit={crear} className="bg-white border border-gray-200 rounded-lg p-5 flex items-end gap-3 mb-6 max-w-2xl">
        <div className="flex-1">
          <label className="block text-sm text-gray-700 mb-1">Categoría de producto</label>
          <input required value={cat} onChange={e => setCat(e.target.value)} placeholder="ej: sumergible"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div className="flex-1">
          <label className="block text-sm text-gray-700 mb-1">Vendedor</label>
          <select required value={vend} onChange={e => setVend(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">— Selecciona —</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
        <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Agregar</button>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-2xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr><th className="text-left px-4 py-2 font-medium">Categoría</th><th className="text-left px-4 py-2 font-medium">Vendedor</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {reglas.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-ht-navy">{r.parametro}</td>
                <td className="px-4 py-2 text-gray-600">{r.vendedor_nombre}</td>
                <td className="px-4 py-2 text-right"><button onClick={() => eliminar(r.id)} className="text-red-500 hover:underline">Eliminar</button></td>
              </tr>
            ))}
            {reglas.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Sin reglas por categoría.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
