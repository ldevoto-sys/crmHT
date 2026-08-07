import { useEffect, useState } from 'react';
import api from '../../api';

export default function ConfigServicioTecnicoEtapas() {
  const [etapas, setEtapas] = useState([]);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [nuevo, setNuevo] = useState('');

  const cargar = async () => {
    try { setEtapas((await api.get('/servicio-tecnico/etapas')).data); }
    catch { setError('No se pudieron cargar las etapas.'); }
  };
  useEffect(() => { cargar(); }, []);

  const set = (id, campo, valor) => setEtapas(es => es.map(e => e.id === id ? { ...e, [campo]: valor } : e));

  const guardar = async (e) => {
    setError(''); setMsg('');
    try {
      await api.put(`/servicio-tecnico/etapas/${e.id}`, { nombre: e.nombre, activo: e.activo });
      setMsg('Etapa guardada.'); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const eliminar = async (e) => {
    if (!window.confirm(`¿Eliminar la etapa "${e.nombre}"?`)) return;
    setError(''); setMsg('');
    try { await api.delete(`/servicio-tecnico/etapas/${e.id}`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al eliminar.'); }
  };

  const crear = async (ev) => {
    ev.preventDefault(); setError(''); setMsg('');
    try {
      await api.post('/servicio-tecnico/etapas', { nombre: nuevo });
      setNuevo(''); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear.'); }
  };

  const moverOrden = async (etapa, direccion) => {
    const abiertas = etapas.filter(x => x.tipo === 'abierta').sort((a, b) => a.orden - b.orden);
    const idx = abiertas.findIndex(x => x.id === etapa.id);
    const vecino = direccion === 'arriba' ? abiertas[idx - 1] : abiertas[idx + 1];
    if (!vecino) return;
    setError(''); setMsg('');
    try {
      await Promise.all([
        api.put(`/servicio-tecnico/etapas/${etapa.id}`, { nombre: etapa.nombre, activo: etapa.activo, orden: vecino.orden }),
        api.put(`/servicio-tecnico/etapas/${vecino.id}`, { nombre: vecino.nombre, activo: vecino.activo, orden: etapa.orden }),
      ]);
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo reordenar.'); }
  };

  const badgeTipo = t => t === 'resuelto' ? 'bg-green-100 text-green-700' : t === 'rechazado' ? 'bg-red-100 text-red-700' : 'bg-ht-accent/15 text-ht-navy';

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Configuración de Servicio Técnico</h1>
      <p className="text-gray-500 text-sm mb-6">Etapas del tablero de Servicio Técnico. "Resuelto" y "Rechazado" no se pueden eliminar.</p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Orden</th>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Tipo</th>
              <th className="text-left px-4 py-2 font-medium">Activa</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {etapas.map(e => {
              const abiertas = etapas.filter(x => x.tipo === 'abierta').sort((a, b) => a.orden - b.orden);
              const idx = abiertas.findIndex(x => x.id === e.id);
              return (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">
                  <div className="flex items-center gap-1">
                    <span>{e.orden}</span>
                    {e.tipo === 'abierta' && (
                      <span className="flex flex-col leading-none ml-1">
                        <button type="button" onClick={() => moverOrden(e, 'arriba')} disabled={idx === 0}
                          title="Subir" className="text-gray-400 hover:text-ht-navy disabled:opacity-20 disabled:hover:text-gray-400">▲</button>
                        <button type="button" onClick={() => moverOrden(e, 'abajo')} disabled={idx === abiertas.length - 1}
                          title="Bajar" className="text-gray-400 hover:text-ht-navy disabled:opacity-20 disabled:hover:text-gray-400">▼</button>
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <input value={e.nombre} onChange={ev => set(e.id, 'nombre', ev.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
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
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={crear} className="bg-white border border-gray-200 rounded-lg p-5 flex items-end gap-3 max-w-lg">
        <div className="flex-1">
          <label className="block text-sm text-gray-700 mb-1">Nueva etapa</label>
          <input required value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="Ej: Diagnóstico"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Agregar</button>
      </form>
    </div>
  );
}
