import { useEffect, useState } from 'react';
import api from '../../api';

const vacio = { nombre: '', incluir_datos_bancarios: false };

export default function ConfigFormasPago() {
  const [formas, setFormas] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');

  const cargar = async () => {
    try { setFormas((await api.get('/config/formas-pago')).data); }
    catch { setError('No se pudieron cargar las formas de pago.'); }
  };
  useEffect(() => { cargar(); }, []);

  const resetForm = () => { setForm(vacio); setEditId(null); };

  const guardar = async e => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      if (editId) { await api.put(`/config/formas-pago/${editId}`, form); setMsg('Forma de pago actualizada.'); }
      else { await api.post('/config/formas-pago', form); setMsg('Forma de pago creada.'); }
      resetForm(); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const editar = f => {
    setEditId(f.id);
    setForm({ nombre: f.nombre, incluir_datos_bancarios: f.incluir_datos_bancarios, activo: f.activo });
    setError(''); setMsg('');
  };

  const eliminar = async f => {
    if (!window.confirm(`¿Eliminar "${f.nombre}"?`)) return;
    setError(''); setMsg('');
    try { await api.delete(`/config/formas-pago/${f.id}`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al eliminar.'); }
  };

  const toggleActivo = async f => {
    setError(''); setMsg('');
    try { await api.put(`/config/formas-pago/${f.id}`, { nombre: f.nombre, incluir_datos_bancarios: f.incluir_datos_bancarios, activo: !f.activo }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al actualizar.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Formas de pago</h1>
      <p className="text-gray-500 text-sm mb-6">
        Opciones seleccionables al crear una cotización. Si "Incluir datos bancarios" está marcado, el correo de envío de la
        cotización agrega el bloque con los datos bancarios de la empresa (el PDF adjunto los muestra siempre, sin importar esta opción).
      </p>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={guardar} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 lg:col-span-1">
          <h2 className="font-semibold text-ht-navy">{editId ? 'Editar forma de pago' : 'Nueva forma de pago'}</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Transferencia bancaria"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.incluir_datos_bancarios}
              onChange={e => setForm({ ...form, incluir_datos_bancarios: e.target.checked })} />
            Incluir datos bancarios en el correo
          </label>
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
                  <th className="text-left px-4 py-2 font-medium">Datos bancarios en correo</th>
                  <th className="text-left px-4 py-2 font-medium">Activa</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {formas.map(f => (
                  <tr key={f.id} className={`border-t border-gray-100 hover:bg-gray-50 ${!f.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 text-ht-navy font-medium">{f.nombre}</td>
                    <td className="px-4 py-2 text-gray-600">{f.incluir_datos_bancarios ? 'Sí' : 'No'}</td>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={f.activo} onChange={() => toggleActivo(f)} />
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => editar(f)} className="text-ht-accent hover:underline mr-3">Editar</button>
                      <button onClick={() => eliminar(f)} className="text-red-500 hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))}
                {formas.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Sin formas de pago cargadas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
