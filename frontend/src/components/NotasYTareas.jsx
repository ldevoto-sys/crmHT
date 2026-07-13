import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

const fecha = d => d ? new Date(d).toLocaleString('es-CL') : '';
const PUEDE_ASIGNAR_A_OTROS = ['administrador', 'jefe_comercial'];

// Notas y tareas de un contacto, empresa o negocio (uno de los tres ids).
// Se usa en las fichas de detalle (HT-AP-03 Etapa 3A).
export default function NotasYTareas({ contactoId, empresaId, negocioId, vendedorId }) {
  const { user } = useAuth();
  const [notas, setNotas] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [texto, setTexto] = useState('');
  const [nuevaTarea, setNuevaTarea] = useState({ titulo: '', fecha_vencimiento: '', asignado_a_id: '' });
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');

  const params = { contacto_id: contactoId, empresa_id: empresaId, negocio_id: negocioId };

  const cargar = async () => {
    try {
      const [n, t] = await Promise.all([
        api.get('/notas', { params }),
        api.get('/tareas', { params }),
      ]);
      setNotas(n.data); setTareas(t.data);
    } catch { setError('No se pudieron cargar notas y tareas.'); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [contactoId, empresaId, negocioId]);
  useEffect(() => {
    if (PUEDE_ASIGNAR_A_OTROS.includes(user?.rol)) {
      api.get('/users').then(r => setUsuarios(r.data.filter(u => u.activo))).catch(() => {});
    }
  }, [user]);

  const agregarNota = async e => {
    e.preventDefault();
    if (!texto.trim()) return;
    try { await api.post('/notas', { texto, ...params }); setTexto(''); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar la nota.'); }
  };

  const agregarTarea = async e => {
    e.preventDefault();
    if (!nuevaTarea.titulo.trim()) return;
    try {
      await api.post('/tareas', {
        titulo: nuevaTarea.titulo,
        fecha_vencimiento: nuevaTarea.fecha_vencimiento || null,
        asignado_a_id: nuevaTarea.asignado_a_id || (vendedorId ?? undefined),
        ...params,
      });
      setNuevaTarea({ titulo: '', fecha_vencimiento: '', asignado_a_id: '' });
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear la tarea.'); }
  };

  const cumplirTarea = async id => {
    try { await api.post(`/tareas/${id}/cumplir`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo actualizar la tarea.'); }
  };

  return (
    <div className="space-y-6">
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-ht-navy mb-3">Tareas</h2>
        <form onSubmit={agregarTarea} className="flex flex-wrap gap-2 mb-3">
          <input value={nuevaTarea.titulo} onChange={e => setNuevaTarea({ ...nuevaTarea, titulo: e.target.value })}
            placeholder="Nueva tarea…" className="flex-1 min-w-[160px] border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <input type="datetime-local" value={nuevaTarea.fecha_vencimiento}
            onChange={e => setNuevaTarea({ ...nuevaTarea, fecha_vencimiento: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          {usuarios.length > 0 && (
            <select value={nuevaTarea.asignado_a_id} onChange={e => setNuevaTarea({ ...nuevaTarea, asignado_a_id: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
              <option value="">Asignar a mí</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          )}
          <button type="submit" className="bg-ht-navy text-white px-3 py-2 rounded text-sm hover:bg-ht-navy/90">Agregar</button>
        </form>
        {tareas.length === 0 ? <p className="text-sm text-gray-400">Sin tareas.</p> : (
          <ul className="space-y-2">
            {tareas.map(t => (
              <li key={t.id} className={`flex items-center justify-between text-sm border-t border-gray-100 pt-2 ${t.estado !== 'pendiente' ? 'opacity-50' : ''}`}>
                <div>
                  <span className={t.estado === 'cumplida' ? 'line-through text-gray-500' : 'text-ht-navy'}>{t.titulo}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {t.asignado_nombre}{t.fecha_vencimiento ? ` · vence ${fecha(t.fecha_vencimiento)}` : ''}
                  </span>
                </div>
                {t.estado === 'pendiente' && <button onClick={() => cumplirTarea(t.id)} className="text-ht-accent hover:underline text-xs">Marcar cumplida</button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-ht-navy mb-3">Notas</h2>
        <form onSubmit={agregarNota} className="flex gap-2 mb-3">
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribir una nota…"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <button type="submit" className="bg-ht-navy text-white px-3 py-2 rounded text-sm hover:bg-ht-navy/90">Guardar</button>
        </form>
        {notas.length === 0 ? <p className="text-sm text-gray-400">Sin notas.</p> : (
          <ul className="space-y-3">
            {notas.map(n => (
              <li key={n.id} className="text-sm border-l-2 border-ht-accent/40 pl-3">
                <div className="text-ht-navy">{n.texto}</div>
                <div className="text-xs text-gray-400">{fecha(n.created_at)} · {n.usuario_nombre}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
