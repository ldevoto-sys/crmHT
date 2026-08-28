import { useEffect, useState } from 'react';
import api from '../../api';

const vacio = { nombre: '' };

export default function ConfigCausasNoCierre() {
  const [causas, setCausas] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');

  const cargar = async () => {
    try { setCausas((await api.get('/config/causas-no-cierre')).data); }
    catch { setError('No se pudieron cargar las causas de no cierre.'); }
  };
  useEffect(() => { cargar(); }, []);

  const resetForm = () => { setForm(vacio); setEditId(null); };

  const guardar = async e => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      if (editId) { await api.put(`/config/causas-no-cierre/${editId}`, form); setMsg('Causa actualizada.'); }
      else { await api.post('/config/causas-no-cierre', form); setMsg('Causa creada.'); }
      resetForm(); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const editar = c => {
    setEditId(c.id);
    setForm({ nombre: c.nombre });
    setError(''); setMsg('');
  };

  const eliminar = async c => {
    if (!window.confirm(`¿Eliminar "${c.nombre}"?`)) return;
    setError(''); setMsg('');
    try {
      await api.delete(`/config/causas-no-cierre/${c.id}`);
      if (editId === c.id) resetForm();
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al eliminar.'); }
  };

  const causasVisibles = causas.filter(c => c.activo);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Causas de no cierre</h1>
      <p className="text-gray-500 text-sm mb-6">
        Opciones seleccionables al marcar un negocio como "Perdido" (en el Pipeline, o al importar/actualizar negocios
        por CSV). Al eliminar una causa, los negocios que ya la tenían asignada la conservan en su historial, pero
        deja de estar disponible para elegir en negocios nuevos.
      </p>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={guardar} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 lg:col-span-1">
          <h2 className="font-semibold text-ht-navy">{editId ? 'Editar causa' : 'Nueva causa'}</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Presupuesto insuficiente"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">
              {editId ? 'Guardar' : 'Crear'}
            </button>
            {editId && (
              <button type="button" onClick={resetForm} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            )}
          </div>
        </form>

        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-slate-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {causasVisibles.map(c => (
                  <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-ht-navy font-medium">{c.nombre}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => editar(c)} className="text-ht-accent hover:underline mr-3">Editar</button>
                      <button onClick={() => eliminar(c)} className="text-red-500 hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))}
                {causasVisibles.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">Sin causas cargadas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
