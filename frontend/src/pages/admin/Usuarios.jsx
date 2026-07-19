import { useEffect, useState } from 'react';
import api from '../../api';

const ROLES = ['administrador', 'jefe_comercial', 'vendedor', 'callcenter', 'gerencia'];
const vacio = { nombre: '', rut: '', email: '', rol: 'vendedor', recibe_round_robin: true, password: '' };

export default function Usuarios() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordGenerada, setPasswordGenerada] = useState(null); // {nombre, password}
  const [resetPara, setResetPara] = useState(null); // usuario en modal de reset
  const [resetPassword, setResetPassword] = useState('');
  const [vendedores, setVendedores] = useState([]);
  const [desactivarPara, setDesactivarPara] = useState(null); // {usuario, impacto}
  const [reasignarA, setReasignarA] = useState('');

  const cargar = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch {
      setError('No se pudo cargar la lista de usuarios.');
    }
  };

  useEffect(() => { cargar(); }, []);
  useEffect(() => { api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {}); }, []);

  const resetForm = () => { setForm(vacio); setEditId(null); };

  const submit = async e => {
    e.preventDefault();
    setError(''); setMsg(''); setLoading(true); setPasswordGenerada(null);
    try {
      if (editId) {
        await api.put(`/users/${editId}`, form);
        setMsg('Usuario actualizado.');
      } else {
        const { data } = await api.post('/users', form);
        setMsg('Usuario creado.');
        setPasswordGenerada({ nombre: data.nombre, password: data.password_temporal });
      }
      resetForm();
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar.');
    } finally {
      setLoading(false);
    }
  };

  const abrirReset = u => { setResetPara(u); setResetPassword(''); setError(''); };
  const confirmarReset = async e => {
    e.preventDefault();
    setError(''); setMsg(''); setPasswordGenerada(null);
    try {
      const { data } = await api.post(`/users/${resetPara.id}/reset-password`, resetPassword ? { password: resetPassword } : {});
      setPasswordGenerada({ nombre: resetPara.nombre, password: data.password_temporal });
      setResetPara(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al restablecer la contraseña.');
    }
  };

  const editar = u => {
    setEditId(u.id);
    setForm({ nombre: u.nombre, rut: u.rut || '', email: u.email, rol: u.rol, recibe_round_robin: u.recibe_round_robin });
    setError(''); setMsg('');
  };

  const desactivar = async u => {
    setError(''); setMsg('');
    try {
      const { data: impacto } = await api.get(`/users/${u.id}/impacto`);
      const tieneDatos = impacto.contactos > 0 || impacto.empresas > 0 || impacto.negocios_abiertos > 0;
      if (tieneDatos) {
        setDesactivarPara({ usuario: u, impacto }); setReasignarA('');
      } else {
        if (!window.confirm(`¿Desactivar a ${u.nombre}? No tiene contactos, empresas ni negocios abiertos asignados.`)) return;
        await api.delete(`/users/${u.id}`);
        cargar();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al desactivar.');
    }
  };

  const confirmarDesactivar = async e => {
    e.preventDefault();
    setError('');
    try {
      await api.delete(`/users/${desactivarPara.usuario.id}`, { data: { reasignar_a: Number(reasignarA) } });
      setMsg(`${desactivarPara.usuario.nombre} inhabilitado; sus contactos, empresas y negocios abiertos se reasignaron.`);
      setDesactivarPara(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al inhabilitar.');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-6">Usuarios</h1>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {passwordGenerada && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 flex items-center justify-between gap-3">
          <span>
            Contraseña para <strong>{passwordGenerada.nombre}</strong>:{' '}
            <code className="bg-white px-2 py-0.5 rounded border border-amber-200">{passwordGenerada.password}</code>
            {' '}— cópiala y entrégasela a mano (el correo automático puede no estar configurado todavía).
          </span>
          <button onClick={() => setPasswordGenerada(null)} className="text-amber-700 hover:underline flex-shrink-0">Cerrar</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Formulario */}
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 lg:col-span-1">
          <h2 className="font-semibold text-ht-navy">{editId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">RUT <span className="text-gray-400">(opcional)</span></label>
            <input value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="12.345.678-9"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email</label>
            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="usuario@hidrotecnica.cl"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Rol</label>
            <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ht-accent">
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
          {!editId && (
            <div>
              <label className="block text-sm text-gray-700 mb-1">Contraseña <span className="text-gray-400">(opcional; si la dejas vacía se genera una)</span></label>
              <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mín. 8 caracteres, mayúscula, minúscula y carácter especial"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-60">
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
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
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-ht-navy">{u.nombre}</td>
                  <td className="px-4 py-2 text-gray-600">{u.email}</td>
                  <td className="px-4 py-2 capitalize">{u.rol}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.activo ? 'bg-ht-accent/15 text-ht-navy' : 'bg-gray-100 text-gray-400'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => editar(u)} className="text-ht-accent hover:underline mr-3">Editar</button>
                    <button onClick={() => abrirReset(u)} className="text-ht-accent hover:underline mr-3">Restablecer contraseña</button>
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

      {resetPara && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setResetPara(null)}>
          <form onSubmit={confirmarReset} onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-sm space-y-3">
            <h2 className="font-semibold text-ht-navy text-lg">Restablecer contraseña de {resetPara.nombre}</h2>
            {error && <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
            <div>
              <label className="block text-sm text-gray-700 mb-1">Nueva contraseña <span className="text-gray-400">(opcional; si la dejas vacía se genera una)</span></label>
              <input value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Mín. 8 caracteres, mayúscula, minúscula y carácter especial"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Restablecer</button>
              <button type="button" onClick={() => setResetPara(null)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {desactivarPara && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setDesactivarPara(null)}>
          <form onSubmit={confirmarDesactivar} onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-md space-y-3">
            <h2 className="font-semibold text-ht-navy text-lg">Inhabilitar a {desactivarPara.usuario.nombre}</h2>
            {error && <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
              <p className="mb-1">Este usuario tiene:</p>
              <ul className="list-disc pl-5">
                {desactivarPara.impacto.contactos > 0 && <li>{desactivarPara.impacto.contactos} contacto(s) asignado(s)</li>}
                {desactivarPara.impacto.empresas > 0 && <li>{desactivarPara.impacto.empresas} empresa(s) asignada(s)</li>}
                {desactivarPara.impacto.negocios_abiertos > 0 && <li>{desactivarPara.impacto.negocios_abiertos} negocio(s) abierto(s)</li>}
              </ul>
              <p className="mt-1 text-xs">
                Los negocios ya cerrados (ganados/perdidos) no se reasignan: quedan con {desactivarPara.usuario.nombre} para no alterar el histórico.
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Reasignar todo a</label>
              <select required value={reasignarA} onChange={e => setReasignarA(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
                <option value="">— Selecciona un vendedor —</option>
                {vendedores.filter(v => v.id !== desactivarPara.usuario.id).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={!reasignarA} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
                Reasignar e inhabilitar
              </button>
              <button type="button" onClick={() => setDesactivarPara(null)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
