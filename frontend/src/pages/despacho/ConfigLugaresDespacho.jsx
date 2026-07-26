import { useEffect, useState } from 'react';
import api from '../../api';

const vacio = { nombre: '', direccion: '', comuna: '', contacto_nombre: '', contacto_telefono: '' };

export default function ConfigLugaresDespacho() {
  const [lugares, setLugares] = useState([]);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);

  const cargar = async () => {
    try { setLugares((await api.get('/despachos/lugares-frecuentes')).data); }
    catch { setError('No se pudieron cargar los lugares frecuentes.'); }
  };
  useEffect(() => { cargar(); }, []);

  const resetForm = () => { setForm(vacio); setEditId(null); };

  const guardar = async e => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      if (editId) { await api.put(`/despachos/lugares-frecuentes/${editId}`, form); setMsg('Lugar actualizado.'); }
      else { await api.post('/despachos/lugares-frecuentes', form); setMsg('Lugar creado.'); }
      resetForm(); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const editar = l => {
    setEditId(l.id);
    setForm({ nombre: l.nombre, direccion: l.direccion, comuna: l.comuna, contacto_nombre: l.contacto_nombre || '', contacto_telefono: l.contacto_telefono || '' });
    setError(''); setMsg('');
  };

  const eliminar = async l => {
    if (!window.confirm(`¿Eliminar "${l.nombre}" de los lugares frecuentes?`)) return;
    setError(''); setMsg('');
    try { await api.delete(`/despachos/lugares-frecuentes/${l.id}`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al eliminar.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Lugares frecuentes de despacho</h1>
      <p className="text-gray-500 text-sm mb-6">Direcciones habituales de retiro o entrega (ej. proveedores). Al crear una parada, se pueden elegir para llenar dirección, comuna y contacto de inmediato.</p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={guardar} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 lg:col-span-1">
          <h2 className="font-semibold text-ht-navy">{editId ? 'Editar lugar' : 'Nuevo lugar'}</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Vulcano"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Dirección</label>
            <input required value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Comuna</label>
            <input required value={form.comuna} onChange={e => setForm({ ...form, comuna: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Contacto <span className="text-gray-400">(opcional)</span></label>
            <input value={form.contacto_nombre} onChange={e => setForm({ ...form, contacto_nombre: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Teléfono <span className="text-gray-400">(opcional)</span></label>
            <input value={form.contacto_telefono} onChange={e => setForm({ ...form, contacto_telefono: e.target.value })}
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
                  <th className="text-left px-4 py-2 font-medium">Dirección</th>
                  <th className="text-left px-4 py-2 font-medium">Comuna</th>
                  <th className="text-left px-4 py-2 font-medium">Contacto</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lugares.map(l => (
                  <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-ht-navy font-medium">{l.nombre}</td>
                    <td className="px-4 py-2 text-gray-600">{l.direccion}</td>
                    <td className="px-4 py-2 text-gray-600">{l.comuna}</td>
                    <td className="px-4 py-2 text-gray-500">{l.contacto_nombre || '—'}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => editar(l)} className="text-ht-accent hover:underline mr-3">Editar</button>
                      <button onClick={() => eliminar(l)} className="text-red-500 hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))}
                {lugares.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin lugares frecuentes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
