import { useEffect, useState } from 'react';
import api from '../../api';

const ROLES = ['administrador', 'vendedor', 'callcenter', 'gerencia'];
const vacio = { nombre: '', rut: '', email: '', rol: 'vendedor', recibe_round_robin: true };

export default function Usuarios() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const cargar = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch {
      setError('No se pudo cargar la lista de usuarios.');
    }
  };

  useEffect(() => { cargar(); }, []);

  const resetForm = () => { setForm(vacio); setEditId(null); };

  const submit = async e => {
    e.preventDefault();
    setError(''); setMsg(''); setLoading(true);
    try {
      if (editId) {
        await api.put(`/users/${editId}`, form);
        setMsg('Usuario actualizado.');
      } else {
        await api.post('/users', form);
        setMsg('Usuario creado. Se envió la contraseña temporal por correo.');
      }
      resetForm();
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar.');
    } finally {
      setLoading(false);
    }
  };

  const editar = u => {
    setEditId(u.id);
    setForm({ nombre: u.nombre, rut: u.rut || '', email: u.email, rol: u.rol, recibe_round_robin: u.recibe_round_robin });
    setError(''); setMsg('');
  };

  const desactivar = async u => {
    if (!window.confirm(`¿Desactivar a ${u.nombre}?`)) return;
    setError(''); setMsg('');
    try {
      await api.delete(`/users/${u.id}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al desactivar.');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-6">Usuarios</h1>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Formulario */}
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 lg:col-span-1">
          <h2 className="font-semibold text-ht-navy">{editId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-cyan" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">RUT <span className="text-gray-400">(opcional)</span></label>
            <input value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="12.345.678-9"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-cyan" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email</label>
            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="usuario@hidrotecnica.cl"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-cyan" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Rol</label>
            <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ht-cyan">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {form.rol === 'vendedor' && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.recibe_round_robin}
                onChange={e => setForm({ ...form, recibe_round_robin: e.target.checked })} />
              Participa en asignación round-robin
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90 disabled:opacity-60">
              {loading ? 'Guardando...' : editId ? 'Guardar' : 'Crear'}
            </button>
            {editId && (
              <button type="button" onClick={resetForm}
                className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
            )}
          </div>
        </form>

        {/* Tabla */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nombre</th>
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-left px-4 py-2 font-medium">Rol</th>
                <th className="text-left px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-ht-navy">{u.nombre}</td>
                  <td className="px-4 py-2 text-gray-600">{u.email}</td>
                  <td className="px-4 py-2 capitalize">{u.rol}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.activo ? 'bg-ht-cyan/15 text-ht-navy' : 'bg-gray-100 text-gray-400'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => editar(u)} className="text-ht-cyan hover:underline mr-3">Editar</button>
                    {u.activo && <button onClick={() => desactivar(u)} className="text-red-500 hover:underline">Desactivar</button>}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin usuarios.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
