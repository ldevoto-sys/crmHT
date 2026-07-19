import { useEffect, useState } from 'react';
import api from '../../api';

export default function ConfigPipeline() {
  const [etapas, setEtapas] = useState([]);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [nuevo, setNuevo] = useState({ nombre: '', probabilidad_cierre: 0 });

  const cargar = async () => {
    try { setEtapas((await api.get('/config/pipeline-etapas')).data); }
    catch { setError('No se pudieron cargar las etapas.'); }
  };
  useEffect(() => { cargar(); }, []);

  const set = (id, campo, valor) => setEtapas(es => es.map(e => e.id === id ? { ...e, [campo]: valor } : e));

  const guardar = async (e) => {
    setError(''); setMsg('');
    try {
      await api.put(`/config/pipeline-etapas/${e.id}`, { nombre: e.nombre, probabilidad_cierre: Number(e.probabilidad_cierre), activo: e.activo });
      setMsg('Etapa guardada.'); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const eliminar = async (e) => {
    if (!window.confirm(`¿Eliminar la etapa "${e.nombre}"?`)) return;
    setError(''); setMsg('');
    try { await api.delete(`/config/pipeline-etapas/${e.id}`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al eliminar.'); }
  };

  const crear = async (ev) => {
    ev.preventDefault(); setError(''); setMsg('');
    try {
      await api.post('/config/pipeline-etapas', { nombre: nuevo.nombre, probabilidad_cierre: Number(nuevo.probabilidad_cierre) });
      setNuevo({ nombre: '', probabilidad_cierre: 0 }); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear.'); }
  };

  const badgeTipo = t => t === 'ganada' ? 'bg-green-100 text-green-700' : t === 'perdida' ? 'bg-red-100 text-red-700' : 'bg-ht-accent/15 text-ht-navy';

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Configuración del pipeline</h1>
      <p className="text-gray-500 text-sm mb-6">Etapas y probabilidad de cierre por defecto. "Ganado" y "Perdido" no se pueden eliminar.</p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Orden</th>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">% cierre</th>
              <th className="text-left px-4 py-2 font-medium">Tipo</th>
              <th className="text-left px-4 py-2 font-medium">Activa</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {etapas.map(e => (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{e.orden}</td>
                <td className="px-4 py-2">
                  <input value={e.nombre} onChange={ev => set(e.id, 'nombre', ev.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" min="0" max="100" value={e.probabilidad_cierre}
                    onChange={ev => set(e.id, 'probabilidad_cierre', ev.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                </td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${badgeTipo(e.tipo)}`}>{e.tipo}</span></td>
                <td className="px-4 py-2">
                  {e.tipo === 'abierta'
                    ? <input type="checkbox" checked={e.activo} onChange={ev => set(e.id, 'activo', ev.target.checked)} />
                    : <span className="text-xs text-gray-400">siempre</span>}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => guardar(e)} className="text-ht-accent hover:underline mr-3">Guardar</button>
                  {e.tipo === 'abierta' && <button onClick={() => eliminar(e)} className="text-red-500 hover:underline">Eliminar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={crear} className="bg-white border border-gray-200 rounded-lg p-5 flex items-end gap-3 max-w-lg">
        <div className="flex-1">
          <label className="block text-sm text-gray-700 mb-1">Nueva etapa</label>
          <input required value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">% cierre</label>
          <input type="number" min="0" max="100" value={nuevo.probabilidad_cierre}
            onChange={e => setNuevo({ ...nuevo, probabilidad_cierre: e.target.value })}
            className="w-24 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Agregar</button>
      </form>
    </div>
  );
}
