import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const fecha = d => d ? new Date(d).toLocaleString('es-CL') : '';
const PUEDE_VER_TODAS = ['administrador', 'jefe_comercial'];

export default function MisTareas() {
  const { user } = useAuth();
  const [tareas, setTareas] = useState([]);
  const [estado, setEstado] = useState('pendiente');
  const [soloMias, setSoloMias] = useState(true);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      const params = {};
      if (estado) params.estado = estado;
      if (soloMias || !PUEDE_VER_TODAS.includes(user?.rol)) params.asignado_a_id = user.id;
      const { data } = await api.get('/tareas', { params });
      setTareas(data);
    } catch { setError('No se pudieron cargar las tareas.'); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [estado, soloMias]);

  const cumplir = async id => {
    try { await api.post(`/tareas/${id}/cumplir`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo actualizar.'); }
  };

  const destino = t => t.negocio_id ? `/negocios/${t.negocio_id}` : (t.contacto_id ? `/contactos/${t.contacto_id}` : (t.empresa_id ? `/empresas/${t.empresa_id}` : null));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-6">Mis tareas</h1>
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <div className="flex items-center gap-3 mb-4">
        <select value={estado} onChange={e => setEstado(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
          <option value="pendiente">Pendientes</option>
          <option value="cumplida">Cumplidas</option>
          <option value="cancelada">Canceladas</option>
          <option value="">Todas</option>
        </select>
        {PUEDE_VER_TODAS.includes(user?.rol) && (
          <label className="text-sm text-gray-600 flex items-center gap-1.5">
            <input type="checkbox" checked={soloMias} onChange={e => setSoloMias(e.target.checked)} />
            Solo mis tareas
          </label>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Tarea</th>
              <th className="text-left px-4 py-2 font-medium">Relacionado a</th>
              <th className="text-left px-4 py-2 font-medium">Asignado</th>
              <th className="text-left px-4 py-2 font-medium">Vence</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tareas.map(t => {
              const link = destino(t);
              const vencida = t.estado === 'pendiente' && t.fecha_vencimiento && new Date(t.fecha_vencimiento) < new Date();
              return (
                <tr key={t.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-ht-navy">{t.titulo}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {link ? <Link to={link} className="text-ht-accent hover:underline">
                      {t.negocio_titulo || `${t.contacto_nombre || ''} ${t.contacto_apellido || ''}`.trim() || t.empresa_nombre}
                    </Link> : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{t.asignado_nombre}</td>
                  <td className={`px-4 py-2 ${vencida ? 'text-red-600 font-medium' : 'text-gray-600'}`}>{fecha(t.fecha_vencimiento)}</td>
                  <td className="px-4 py-2 text-right">
                    {t.estado === 'pendiente' && <button onClick={() => cumplir(t.id)} className="text-ht-accent hover:underline">Cumplir</button>}
                  </td>
                </tr>
              );
            })}
            {tareas.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin tareas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
