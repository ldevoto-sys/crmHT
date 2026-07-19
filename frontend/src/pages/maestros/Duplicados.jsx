import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

export default function Duplicados() {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/contactos/duplicados');
      setGrupos(data);
    } catch { setError('No se pudieron cargar los duplicados.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const fusionar = async (grupo, masterId) => {
    const dupIds = grupo.contactos.map(c => c.id).filter(id => id !== masterId);
    if (!window.confirm(`Fusionar ${dupIds.length} contacto(s) en el maestro seleccionado. Los duplicados quedarán inactivos. ¿Continuar?`)) return;
    setError(''); setMsg('');
    try {
      await api.post('/contactos/fusionar', { master_id: masterId, duplicado_ids: dupIds });
      setMsg('Contactos fusionados correctamente.');
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al fusionar.'); }
  };

  return (
    <div>
      <Link to="/contactos" className="text-sm text-ht-accent hover:underline">← Contactos</Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-2">Duplicados de contactos</h1>
      <p className="text-gray-500 text-sm mb-6">
        Candidatos por email igual o por nombre repetido dentro de la misma empresa.
        Elige el registro maestro y fusiona; los demás quedarán inactivos.
      </p>

      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {loading ? (
        <p className="text-gray-400">Cargando…</p>
      ) : grupos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No hay duplicados pendientes.
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((g, idx) => <Grupo key={idx} grupo={g} onFusionar={fusionar} />)}
        </div>
      )}
    </div>
  );
}

function Grupo({ grupo, onFusionar }) {
  const [master, setMaster] = useState(grupo.contactos[0]?.id);
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-sm text-gray-500 mb-3">
        Coincidencia por <strong className="text-ht-navy">{grupo.motivo === 'email' ? 'email' : 'nombre + empresa'}</strong>: {grupo.clave}
      </p>
      <table className="w-full text-sm mb-3">
        <thead className="text-gray-500">
          <tr>
            <th className="w-16 text-left px-2 py-1 font-medium">Maestro</th>
            <th className="text-left px-2 py-1 font-medium">Nombre</th>
            <th className="text-left px-2 py-1 font-medium">Email</th>
            <th className="text-left px-2 py-1 font-medium">Teléfono</th>
            <th className="text-left px-2 py-1 font-medium">Empresa</th>
            <th className="text-left px-2 py-1 font-medium">Origen</th>
          </tr>
        </thead>
        <tbody>
          {grupo.contactos.map(c => (
            <tr key={c.id} className="border-t border-gray-100">
              <td className="px-2 py-1 text-center">
                <input type="radio" name={`master-${grupo.clave}`} checked={master === c.id} onChange={() => setMaster(c.id)} />
              </td>
              <td className="px-2 py-1 text-ht-navy">{c.nombre} {c.apellido}</td>
              <td className="px-2 py-1 text-gray-600">{c.email || '—'}</td>
              <td className="px-2 py-1 text-gray-600">{c.telefono_e164 || '—'}</td>
              <td className="px-2 py-1 text-gray-600">{c.empresa_nombre || '—'}</td>
              <td className="px-2 py-1 text-gray-500">{c.origen}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onFusionar(grupo, master)}
        className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">
        Fusionar en el maestro seleccionado
      </button>
    </div>
  );
}
