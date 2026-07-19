import { useEffect, useState } from 'react';
import api from '../api';

const fecha = d => d ? new Date(d).toLocaleString('es-CL') : '';

// Panel de seguimiento de un negocio: secuencia activa (si hay) + seguimiento manual.
export default function SeguimientoNegocio({ negocioId, puedeEditar }) {
  const [estado, setEstado] = useState(undefined); // undefined = cargando, null = sin secuencia
  const [secuencias, setSecuencias] = useState([]);
  const [secuenciaSel, setSecuenciaSel] = useState('');
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');

  const cargar = async () => {
    try { setEstado((await api.get(`/negocios/${negocioId}/secuencia`)).data); }
    catch { setError('No se pudo cargar el estado de seguimiento.'); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [negocioId]);
  useEffect(() => {
    api.get('/secuencias').then(r => setSecuencias(r.data.filter(s => s.activo))).catch(() => {});
  }, []);

  const accion = async (fn, ...args) => {
    setError('');
    try { await fn(...args); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo completar la acción.'); }
  };

  const iniciar = () => secuenciaSel && accion(() => api.post(`/negocios/${negocioId}/secuencia`, { secuencia_id: Number(secuenciaSel) }));
  const pausar = () => accion(() => api.post(`/negocios/${negocioId}/secuencia/pausar`, { motivo: window.prompt('Motivo de la pausa (opcional):') || undefined }));
  const reactivar = () => accion(() => api.post(`/negocios/${negocioId}/secuencia/reactivar`));
  const marcarRespondido = () => accion(() => api.post(`/negocios/${negocioId}/secuencia/marcar-respondido`));
  const cancelar = () => accion(() => api.post(`/negocios/${negocioId}/secuencia/cancelar`));

  const registrarManual = async e => {
    e.preventDefault();
    if (!manual.trim()) return;
    await accion(() => api.post(`/negocios/${negocioId}/seguimiento-manual`, { descripcion: manual }));
    setManual('');
  };

  if (estado === undefined) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="font-semibold text-ht-navy mb-3">Seguimiento</h2>
      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

      {estado ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ht-navy font-medium">{estado.secuencia_nombre}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${estado.estado === 'activa' ? 'bg-green-100 text-green-700' : estado.estado === 'pausada' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
              {estado.estado}
            </span>
          </div>
          <div className="text-gray-500">Paso {estado.paso_actual} de {estado.pasos.length}</div>
          {estado.proxima_ejecucion && <div className="text-gray-500">Próximo paso: {fecha(estado.proxima_ejecucion)}</div>}
          {estado.pausada_motivo && <div className="text-gray-500">Motivo pausa: {estado.pausada_motivo}</div>}

          {puedeEditar && ['activa', 'pausada'].includes(estado.estado) && (
            <div className="flex flex-wrap gap-2 pt-2">
              {estado.estado === 'activa' && <button onClick={pausar} className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">Pausar</button>}
              {estado.estado === 'pausada' && <button onClick={reactivar} className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">Reactivar</button>}
              <button onClick={marcarRespondido} className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">Cliente respondió</button>
              <button onClick={cancelar} className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50">Cancelar secuencia</button>
            </div>
          )}
        </div>
      ) : (
        puedeEditar && (
          <div className="flex gap-2">
            <select value={secuenciaSel} onChange={e => setSecuenciaSel(e.target.value)}
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
              <option value="">— Selecciona una secuencia —</option>
              {secuencias.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <button onClick={iniciar} disabled={!secuenciaSel} className="bg-ht-accent text-ht-navy px-3 py-2 rounded text-sm hover:bg-ht-accent/90 disabled:opacity-50">Iniciar</button>
          </div>
        )
      )}

      {puedeEditar && (
        <form onSubmit={registrarManual} className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <input value={manual} onChange={e => setManual(e.target.value)} placeholder="Registrar seguimiento manual (llamada, visita…)"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <button type="submit" className="bg-ht-accent text-ht-navy px-3 py-2 rounded text-sm hover:bg-ht-accent/90">Registrar</button>
        </form>
      )}
    </div>
  );
}
