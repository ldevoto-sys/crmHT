import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const vacio = { nombre: '', apellido: '', email: '', telefono: '', empresa_id: '', rut_comprador: '', cargo: '' };

export default function Contactos() {
  const { user } = useAuth();
  const puedeEditar = ['administrador', 'callcenter', 'vendedor'].includes(user?.rol);
  const [contactos, setContactos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [candidatos, setCandidatos] = useState([]);
  const [empresaSugerida, setEmpresaSugerida] = useState(null);
  // Selección múltiple
  const [sel, setSel] = useState(() => new Set());
  const [bulkEmpresa, setBulkEmpresa] = useState('');

  const cargar = async () => {
    const params = {};
    if (q) params.q = q;
    const { data } = await api.get('/contactos', { params });
    setContactos(data);
    setSel(new Set());
  };
  useEffect(() => { cargar(); }, []);
  useEffect(() => { api.get('/empresas').then(r => setEmpresas(r.data)).catch(() => {}); }, []);

  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const todosSel = contactos.length > 0 && contactos.every(c => sel.has(c.id));
  const toggleTodos = () => setSel(todosSel ? new Set() : new Set(contactos.map(c => c.id)));

  const bulk = async (accion, extra = {}) => {
    setError(''); setMsg('');
    try {
      const { data } = await api.post('/contactos/bulk-accion', { ids: [...sel], accion, ...extra });
      setMsg(`${data.message} (${data.afectados}).`);
      setBulkEmpresa('');
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error en la acción en lote.'); }
  };

  const abrirNuevo = () => { setForm(vacio); setEditId(null); setCandidatos([]); setEmpresaSugerida(null); setError(''); setMsg(''); setShowForm(true); };
  const abrirEditar = async c => {
    const { data } = await api.get(`/contactos/${c.id}`);
    setEditId(c.id);
    setForm({ nombre: data.nombre || '', apellido: data.apellido || '', email: data.email || '',
      telefono: data.telefono_e164 || '', empresa_id: data.empresa_id || '', rut_comprador: data.rut_comprador || '', cargo: data.cargo || '' });
    setCandidatos([]); setEmpresaSugerida(null); setError(''); setMsg(''); setShowForm(true);
  };

  const verificar = async () => {
    if (!form.email && !form.telefono && !form.nombre) return;
    try {
      const { data } = await api.post('/contactos/verificar', { ...form, id: editId });
      setCandidatos(data.candidatos || []);
      setEmpresaSugerida(data.empresa_sugerida || null);
    } catch { /* silencioso */ }
  };

  const submit = async ev => {
    ev.preventDefault(); setError('');
    const payload = { ...form, empresa_id: form.empresa_id || null };
    try {
      if (editId) { await api.put(`/contactos/${editId}`, payload); setMsg('Contacto actualizado.'); }
      else { await api.post('/contactos', payload); setMsg('Contacto creado.'); }
      setShowForm(false); cargar();
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.contacto_existente) {
        const c = err.response.data.contacto_existente;
        setError(`Ese teléfono ya pertenece a: ${c.nombre} ${c.apellido || ''} (contacto #${c.id}).`);
      } else {
        setError(err.response?.data?.error || 'Error al guardar.');
      }
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ht-navy">Contactos</h1>
        <div className="flex gap-2">
          {(user?.rol === 'administrador' || user?.rol === 'jefe_comercial') && (
            <Link to="/contactos/importar" className="px-4 py-2 rounded text-sm font-medium border border-ht-navy text-ht-navy hover:bg-ht-navy/5">
              Importar CSV
            </Link>
          )}
          <button onClick={abrirNuevo} className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90">+ Nuevo contacto</button>
        </div>
      </div>

      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <form onSubmit={e => { e.preventDefault(); cargar(); }} className="mb-4 flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nombre, email o teléfono…"
          className="border border-gray-300 rounded px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        <button className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Buscar</button>
      </form>

      {/* Barra de acciones en lote */}
      {puedeEditar && sel.size > 0 && (
        <div className="mb-3 p-3 bg-ht-navy/5 border border-ht-navy/20 rounded flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-ht-navy">{sel.size} seleccionado(s)</span>
          <div className="flex items-center gap-2">
            <select value={bulkEmpresa} onChange={e => setBulkEmpresa(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
              <option value="">Asignar a empresa…</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
            </select>
            <button disabled={!bulkEmpresa} onClick={() => bulk('asignar_empresa', { empresa_id: Number(bulkEmpresa) })}
              className="text-sm px-3 py-1.5 rounded bg-ht-navy text-white hover:bg-ht-navy/90 disabled:opacity-50">Asignar</button>
          </div>
          <button onClick={() => bulk('marcar_revisado')} className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Marcar revisado</button>
          <button onClick={() => { if (window.confirm(`¿Desactivar ${sel.size} contacto(s)?`)) bulk('desactivar'); }}
            className="text-sm px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50">Desactivar</button>
          <button onClick={() => setSel(new Set())} className="text-sm text-gray-500 hover:underline ml-auto">Limpiar selección</button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              {puedeEditar && <th className="px-4 py-2 w-8"><input type="checkbox" checked={todosSel} onChange={toggleTodos} /></th>}
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Empresa</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Teléfono</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {contactos.map(c => (
              <tr key={c.id} className={`border-t border-gray-100 ${sel.has(c.id) ? 'bg-ht-accent/5' : ''}`}>
                {puedeEditar && <td className="px-4 py-2"><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /></td>}
                <td className="px-4 py-2 text-ht-navy font-medium">
                  {c.nombre} {c.apellido}
                  {c.revisar_duplicado && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-ht-accent/20 text-ht-navy">revisar</span>}
                </td>
                <td className="px-4 py-2 text-gray-600">{c.empresa_nombre || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{c.email || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{c.telefono_e164 || '—'}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => abrirEditar(c)} className="text-ht-accent hover:underline">Editar</button>
                </td>
              </tr>
            ))}
            {contactos.length === 0 && <tr><td colSpan={puedeEditar ? 6 : 5} className="px-4 py-6 text-center text-gray-400">Sin contactos.</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={submit}
            className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3">
            <h2 className="font-semibold text-ht-navy text-lg">{editId ? 'Editar contacto' : 'Nuevo contacto'}</h2>
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nombre" req value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} />
              <Campo label="Apellido" value={form.apellido} onChange={v => setForm({ ...form, apellido: v })} />
            </div>
            <Campo label="Email" type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} onBlur={verificar} />
            <Campo label="Teléfono" value={form.telefono} onChange={v => setForm({ ...form, telefono: v })} onBlur={verificar} placeholder="+56 9 1234 5678" />

            {candidatos.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                <p className="font-medium mb-1">Posible duplicado ({candidatos.length}):</p>
                <ul className="list-disc pl-5">
                  {candidatos.map(c => <li key={c.id}>{c.nombre} {c.apellido} — {c.email || c.telefono_e164}</li>)}
                </ul>
                <p className="mt-1 text-xs">Puedes continuar; quedará marcado para revisión de duplicados.</p>
              </div>
            )}
            {empresaSugerida && !form.empresa_id && (
              <div className="p-3 bg-ht-accent/10 border border-ht-accent/30 rounded text-sm text-ht-navy flex items-center justify-between">
                <span>Empresa sugerida por dominio: <strong>{empresaSugerida.razon_social}</strong></span>
                <button type="button" onClick={() => setForm({ ...form, empresa_id: empresaSugerida.id })}
                  className="text-ht-navy underline">Asociar</button>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-700 mb-1">Empresa</label>
              <select value={form.empresa_id} onChange={e => setForm({ ...form, empresa_id: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
                <option value="">— Sin empresa —</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="RUT comprador" value={form.rut_comprador} onChange={v => setForm({ ...form, rut_comprador: v })} placeholder="12.345.678-9" />
              <Campo label="Cargo" value={form.cargo} onChange={v => setForm({ ...form, cargo: v })} />
            </div>

            <div className="flex gap-2 pt-2">
              <button type="submit" className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90">Guardar</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Campo({ label, value, onChange, onBlur, req, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}{req && ' *'}</label>
      <input required={req} type={type} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
    </div>
  );
}
