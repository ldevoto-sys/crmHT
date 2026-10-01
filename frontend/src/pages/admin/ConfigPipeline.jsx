import { useEffect, useState } from 'react';
import api from '../../api';

export default function ConfigPipeline() {
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineId] = useState(1);
  const [etapas, setEtapas] = useState([]);
  const [secuenciasDisponibles, setSecuenciasDisponibles] = useState([]);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [nuevo, setNuevo] = useState({ nombre: '', probabilidad_cierre: 0 });
  const [nuevoPipeline, setNuevoPipeline] = useState('');
  // Etapas del flujo de Órdenes de Trabajo (Aceptado/Programado/Ejecutado de
  // Operaciones) que no existen: el sistema las reconoce por nombre (v1.40).
  const [flujoOT, setFlujoOT] = useState(null);

  const cargar = async () => {
    try { setEtapas((await api.get('/config/pipeline-etapas', { params: { pipeline_id: pipelineId } })).data); }
    catch { setError('No se pudieron cargar las etapas.'); }
    api.get('/config/flujo-ot').then(r => setFlujoOT(r.data)).catch(() => {});
  };
  useEffect(() => { api.get('/config/pipelines').then(r => setPipelines(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    api.get('/secuencias').then(r => setSecuenciasDisponibles(r.data.filter(s => s.activo))).catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [pipelineId]); // eslint-disable-line

  const set = (id, campo, valor) => setEtapas(es => es.map(e => e.id === id ? { ...e, [campo]: valor } : e));

  const guardar = async (e) => {
    setError(''); setMsg('');
    const body = {
      nombre: e.nombre, probabilidad_cierre: Number(e.probabilidad_cierre), activo: e.activo,
      secuencia_id: e.secuencia_id || null,
    };
    try {
      try {
        await api.put(`/config/pipeline-etapas/${e.id}`, body);
      } catch (err) {
        // Renombrar/desactivar una etapa del flujo de OT pide confirmación.
        if (err.response?.status === 409 && err.response.data?.requiere_confirmacion) {
          if (!window.confirm(`${err.response.data.error}\n\n¿Guardar de todas formas?`)) { cargar(); return; }
          await api.put(`/config/pipeline-etapas/${e.id}`, { ...body, confirmar_flujo_ot: true });
        } else throw err;
      }
      setMsg('Etapa guardada.'); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const eliminar = async (e) => {
    if (!window.confirm(`¿Eliminar la etapa "${e.nombre}"?`)) return;
    setError(''); setMsg('');
    try {
      try { await api.delete(`/config/pipeline-etapas/${e.id}`); }
      catch (err) {
        if (err.response?.status === 409 && err.response.data?.requiere_confirmacion) {
          if (!window.confirm(`${err.response.data.error}\n\n¿Eliminar de todas formas?`)) return;
          await api.delete(`/config/pipeline-etapas/${e.id}`, { params: { confirmar_flujo_ot: 'true' } });
        } else throw err;
      }
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al eliminar.'); }
  };

  // Reordenar solo tiene sentido entre las etapas "abiertas" — las
  // terminales (Ganado/Perdido) siempre quedan fijas al final.
  const moverOrden = async (etapa, direccion) => {
    const abiertas = etapas.filter(x => x.tipo === 'abierta').sort((a, b) => a.orden - b.orden);
    const idx = abiertas.findIndex(x => x.id === etapa.id);
    const vecino = direccion === 'arriba' ? abiertas[idx - 1] : abiertas[idx + 1];
    if (!vecino) return;
    setError(''); setMsg('');
    try {
      await Promise.all([
        api.put(`/config/pipeline-etapas/${etapa.id}`, { nombre: etapa.nombre, probabilidad_cierre: Number(etapa.probabilidad_cierre), activo: etapa.activo, orden: vecino.orden }),
        api.put(`/config/pipeline-etapas/${vecino.id}`, { nombre: vecino.nombre, probabilidad_cierre: Number(vecino.probabilidad_cierre), activo: vecino.activo, orden: etapa.orden }),
      ]);
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo reordenar.'); }
  };

  const crear = async (ev) => {
    ev.preventDefault(); setError(''); setMsg('');
    try {
      await api.post('/config/pipeline-etapas', { nombre: nuevo.nombre, probabilidad_cierre: Number(nuevo.probabilidad_cierre), pipeline_id: pipelineId });
      setNuevo({ nombre: '', probabilidad_cierre: 0 }); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear.'); }
  };

  const crearPipeline = async (ev) => {
    ev.preventDefault(); setError(''); setMsg('');
    try {
      const { data } = await api.post('/config/pipelines', { nombre: nuevoPipeline });
      setNuevoPipeline('');
      setPipelines(ps => [...ps, data]);
      setPipelineId(data.id);
    } catch (err) { setError(err.response?.data?.error || 'Error al crear el pipeline.'); }
  };

  const badgeTipo = t => t === 'ganada' ? 'bg-green-100 text-green-700' : t === 'perdida' ? 'bg-red-100 text-red-700' : 'bg-ht-accent/15 text-ht-navy';

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Configuración del pipeline</h1>
      <p className="text-gray-500 text-sm mb-6">Etapas y probabilidad de cierre por defecto, por pipeline. "Ganado" y "Perdido" no se pueden eliminar.</p>

      {flujoOT && (!flujoOT.pipeline_encontrado || flujoOT.faltantes.length > 0) && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded text-sm">
          {flujoOT.pipeline_encontrado
            ? <>Al pipeline Operaciones le falta la etapa {flujoOT.faltantes.map(f => `"${f.charAt(0).toUpperCase() + f.slice(1)}"`).join(', ')}. El sistema las reconoce por su nombre: sin ella no se aplican las reglas de Órdenes de Trabajo (tipo de trabajo, horas y técnicos, fecha de ejecución) ni funciona el reporte de OT's.</>
            : <>No se encontró el pipeline "Operaciones" (¿fue renombrado?). Sin él no se aplican las reglas de Órdenes de Trabajo ni funciona el reporte de OT's.</>}
        </div>
      )}
      <p className="text-xs text-gray-500 mb-4">En el pipeline Operaciones, las etapas "Aceptado", "Programado" y "Ejecutado" son parte del flujo de Órdenes de Trabajo y se reconocen por su nombre: el sistema pide confirmación antes de renombrarlas, desactivarlas o eliminarlas.</p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-gray-700">Pipeline</label>
        <select value={pipelineId} onChange={e => setPipelineId(Number(e.target.value))}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
          {pipelines.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Orden</th>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">% cierre</th>
              <th className="text-left px-4 py-2 font-medium">Tipo</th>
              <th className="text-left px-4 py-2 font-medium">Activa</th>
              <th className="text-left px-4 py-2 font-medium">Secuencia al entrar</th>
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
                <td className="px-4 py-2">
                  {e.tipo === 'abierta' ? (
                    <select value={e.secuencia_id || ''} onChange={ev => set(e.id, 'secuencia_id', ev.target.value ? Number(ev.target.value) : null)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-ht-accent">
                      <option value="">Ninguna</option>
                      {secuenciasDisponibles.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  ) : <span className="text-xs text-gray-400">no aplica</span>}
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

      <form onSubmit={crearPipeline} className="bg-white border border-gray-200 rounded-lg p-5 flex items-end gap-3 max-w-lg mt-6">
        <div className="flex-1">
          <label className="block text-sm text-gray-700 mb-1">Nuevo pipeline (otra área comercial)</label>
          <input required value={nuevoPipeline} onChange={e => setNuevoPipeline(e.target.value)} placeholder="Ej: Mantención"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <button type="submit" className="px-4 py-2 rounded text-sm font-medium border border-ht-navy text-ht-navy hover:bg-ht-navy/5">Crear pipeline</button>
      </form>
    </div>
  );
}
