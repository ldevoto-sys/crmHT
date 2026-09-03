import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const vacio = { razon_social: '', rut: '', dominio_correo: '', giro: '', direccion: '', comuna: '', ciudad: '', telefono: '', vendedor_id: '' };

export default function Empresas() {
  const { user } = useAuth();
  const [empresas, setEmpresas] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [q, setQ] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const cargar = async () => {
    const params = {};
    if (q) params.q = q;
    if (filtroVendedor === '__sin_asignar__') params.sin_vendedor = '1';
    else if (filtroVendedor) params.vendedor_id = filtroVendedor;
    const { data } = await api.get('/empresas', { params });
    setEmpresas(data);
  };
  useEffect(() => {
    const t = setTimeout(() => { cargar(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q, filtroVendedor]);
  useEffect(() => { api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {}); }, []);

  const abrirNuevo = () => { setForm(vacio); setEditId(null); setError(''); setMsg(''); setShowForm(true); };
  // Carga el registro completo antes de editar (mismo criterio que
  // Contactos.jsx) — la fila de la lista (GET /empresas) no trae giro,
  // dirección ni teléfono, así que armar el formulario directo desde ahí
  // dejaba esos campos vacíos y el guardado (reemplazo completo) los borraba
  // sin que el usuario lo notara (reportado 03-09-2026: empresas que perdían
  // teléfono/dirección al volver a revisarlas).
  const abrirEditar = async e => {
    const { data } = await api.get(`/empresas/${e.id}`);
    setEditId(e.id);
    setForm({ razon_social: data.razon_social || '', rut: data.rut || '', dominio_correo: data.dominio_correo || '',
      giro: data.giro || '', direccion: data.direccion || '', comuna: data.comuna || '', ciudad: data.ciudad || '',
      telefono: data.telefono_e164 || '', vendedor_id: data.vendedor_id || '' });
    setError(''); setMsg(''); setShowForm(true);
  };

  const submit = async ev => {
    ev.preventDefault(); setError('');
    const payload = { ...form, vendedor_id: form.vendedor_id || null };
    try {
      if (editId) { await api.put(`/empresas/${editId}`, payload); setMsg('Empresa actualizada.'); }
      else { await api.post('/empresas', payload); setMsg('Empresa creada.'); }
      setShowForm(false); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-ht-navy">Empresas</h1>
        <div className="flex gap-2 flex-wrap">
          {(user?.rol === 'administrador' || user?.rol === 'jefe_comercial') && (
            <Link to="/empresas/importar" className="px-4 py-2 rounded text-sm font-medium border border-ht-navy text-ht-navy hover:bg-ht-navy/5">
              Importar CSV
            </Link>
          )}
          <button onClick={abrirNuevo} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">+ Nueva empresa</button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mb-4">
        <label className="text-sm text-gray-600">Vendedor de cuenta</label>
        <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
          <option value="">Todos</option>
          <option value="__sin_asignar__">Sin asignar</option>
          {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
      </div>

      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, RUT o dominio…"
        className="mb-4 w-full max-w-md block border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Razón social</th>
              <th className="text-left px-4 py-2 font-medium">RUT</th>
              <th className="text-left px-4 py-2 font-medium">Dominio</th>
              <th className="text-left px-4 py-2 font-medium">Vendedor</th>
              <th className="text-center px-4 py-2 font-medium">Contactos</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-ht-navy font-medium">
                  <Link to={`/empresas/${e.id}`} className="hover:underline">{e.razon_social}</Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{e.rut || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{e.dominio_correo || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{e.vendedor_nombre || '—'}</td>
                <td className="px-4 py-2 text-center">{e.contactos_count}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => abrirEditar(e)} className="text-ht-accent hover:underline">Editar</button>
                </td>
              </tr>
            ))}
            {empresas.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin empresas.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={submit}
            className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3">
            <h2 className="font-semibold text-ht-navy text-lg">{editId ? 'Editar empresa' : 'Nueva empresa'}</h2>
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
            <Campo label="Razón social" req value={form.razon_social} onChange={v => setForm({ ...form, razon_social: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Campo label="RUT" value={form.rut} onChange={v => setForm({ ...form, rut: v })} placeholder="76.086.428-5" />
              <Campo label="Dominio correo" value={form.dominio_correo} onChange={v => setForm({ ...form, dominio_correo: v })} placeholder="empresa.cl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Teléfono" value={form.telefono} onChange={v => setForm({ ...form, telefono: v })} />
              <Campo label="Giro" value={form.giro} onChange={v => setForm({ ...form, giro: v })} />
            </div>
            <Campo label="Dirección" value={form.direccion} onChange={v => setForm({ ...form, direccion: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Comuna" value={form.comuna} onChange={v => setForm({ ...form, comuna: v })} />
              <Campo label="Ciudad" value={form.ciudad} onChange={v => setForm({ ...form, ciudad: v })} />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Vendedor de cuenta</label>
              {user?.rol === 'vendedor' ? (
                <input disabled value={vendedores.find(v => v.id === Number(form.vendedor_id))?.nombre || 'Sin asignar'}
                  className="w-full border border-gray-200 bg-gray-50 text-gray-500 rounded px-3 py-2 text-sm" />
              ) : (
                <select value={form.vendedor_id} onChange={e => setForm({ ...form, vendedor_id: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
                  <option value="">— Sin asignar —</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              )}
              {user?.rol === 'vendedor' && (
                <p className="text-xs text-gray-400 mt-1">Solo administrador, jefe comercial o call center pueden reasignarla.</p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Guardar</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Campo({ label, value, onChange, req, placeholder }) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}{req && ' *'}</label>
      <input required={req} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
    </div>
  );
}
