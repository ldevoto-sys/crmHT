import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const vacio = { nombre: '', apellido: '', email: '', telefono: '', empresa_id: '', empresa_nombre: '', rut_comprador: '', cargo: '', vendedor_id: '' };

// Busca por nombre/RUT en vez de cargar todas las empresas: con ~49.000
// empresas reales, un <select> con todas no alcanza a mostrar más allá de
// la letra "A" (GET /api/empresas sin filtro trae ORDER BY razon_social
// LIMIT 500). Mismo patrón que BuscadorProducto en NuevaCotizacion.jsx.
function BuscadorEmpresa({ value, onChange, onElegir, placeholder = 'Buscar por nombre o RUT…' }) {
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);

  const buscar = async val => {
    onChange(val);
    if (val.length < 2) { setResultados([]); return; }
    try {
      setResultados((await api.get('/empresas', { params: { q: val } })).data.slice(0, 15));
    } catch { /* */ }
  };

  return (
    <div className="relative">
      <input value={value} onChange={e => buscar(e.target.value)}
        onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
      {abierto && resultados.length > 0 && (
        <div className="absolute z-10 bg-white border border-gray-200 rounded mt-1 w-full max-h-64 overflow-y-auto shadow">
          {resultados.map(e => (
            <button key={e.id} type="button" onMouseDown={() => { onElegir(e); setResultados([]); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
              <span className="text-ht-navy">{e.razon_social}</span>
              {e.rut && <span className="text-gray-400"> · {e.rut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Contactos() {
  const { user } = useAuth();
  const puedeEditar = ['administrador', 'jefe_comercial', 'callcenter', 'vendedor'].includes(user?.rol);
  const puedeVerDuplicados = ['administrador', 'jefe_comercial', 'callcenter'].includes(user?.rol);
  const puedeExportar = ['administrador', 'jefe_comercial'].includes(user?.rol);
  const [contactos, setContactos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [q, setQ] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('');
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
  const [bulkEmpresaNombre, setBulkEmpresaNombre] = useState('');

  const cargar = async () => {
    const params = {};
    if (q) params.q = q;
    if (filtroVendedor === '__sin_asignar__') params.sin_vendedor = '1';
    else if (filtroVendedor) params.vendedor_id = filtroVendedor;
    const { data } = await api.get('/contactos', { params });
    setContactos(data);
    setSel(new Set());
  };
  useEffect(() => {
    const t = setTimeout(() => { cargar(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q, filtroVendedor]);
  useEffect(() => { api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {}); }, []);

  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const todosSel = contactos.length > 0 && contactos.every(c => sel.has(c.id));
  const toggleTodos = () => setSel(todosSel ? new Set() : new Set(contactos.map(c => c.id)));

  const bulk = async (accion, extra = {}) => {
    setError(''); setMsg('');
    try {
      const { data } = await api.post('/contactos/bulk-accion', { ids: [...sel], accion, ...extra });
      setMsg(`${data.message} (${data.afectados}).`);
      setBulkEmpresa(''); setBulkEmpresaNombre('');
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error en la acción en lote.'); }
  };

  const abrirNuevo = () => { setForm(vacio); setEditId(null); setCandidatos([]); setEmpresaSugerida(null); setError(''); setMsg(''); setShowForm(true); };
  const abrirEditar = async c => {
    const { data } = await api.get(`/contactos/${c.id}`);
    setEditId(c.id);
    setForm({ nombre: data.nombre || '', apellido: data.apellido || '', email: data.email || '',
      telefono: data.telefono_e164 || '', empresa_id: data.empresa_id || '', empresa_nombre: data.empresa_nombre || '',
      rut_comprador: data.rut_comprador || '', cargo: data.cargo || '', vendedor_id: data.vendedor_id || '' });
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

  const exportar = async () => {
    try {
      const params = {};
      if (q) params.q = q;
      if (filtroVendedor === '__sin_asignar__') params.sin_vendedor = '1';
      else if (filtroVendedor) params.vendedor_id = filtroVendedor;
      const { data } = await api.get('/contactos/exportar', { params, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = 'contactos.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('No se pudo exportar el listado.'); }
  };

  const submit = async ev => {
    ev.preventDefault(); setError('');
    const payload = { ...form, empresa_id: form.empresa_id || null, vendedor_id: form.vendedor_id || null };
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-ht-navy">Contactos</h1>
        <div className="flex gap-2 flex-wrap">
          {puedeVerDuplicados && (
            <Link to="/duplicados" className="px-4 py-2 rounded text-sm font-medium border border-ht-navy text-ht-navy hover:bg-ht-navy/5">
              Duplicados
            </Link>
          )}
          {(user?.rol === 'administrador' || user?.rol === 'jefe_comercial') && (
            <Link to="/contactos/importar" className="px-4 py-2 rounded text-sm font-medium border border-ht-navy text-ht-navy hover:bg-ht-navy/5">
              Importar CSV
            </Link>
          )}
          {puedeExportar && (
            <button onClick={exportar} className="px-4 py-2 rounded text-sm font-medium border border-ht-navy text-ht-navy hover:bg-ht-navy/5">
              Exportar CSV
            </button>
          )}
          <button onClick={abrirNuevo} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">+ Nuevo contacto</button>
        </div>
      </div>

      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <form onSubmit={e => e.preventDefault()} className="mb-4 flex items-center gap-2 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nombre, email o teléfono…"
          className="border border-gray-300 rounded px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        <div className="sm:ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600">Vendedor asignado</label>
          <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Todos</option>
            <option value="__sin_asignar__">Sin asignar</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
      </form>

      {/* Barra de acciones en lote */}
      {puedeEditar && sel.size > 0 && (
        <div className="mb-3 p-3 bg-ht-navy/5 border border-ht-navy/20 rounded flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-ht-navy">{sel.size} seleccionado(s)</span>
          <div className="flex items-center gap-2 w-64">
            <BuscadorEmpresa value={bulkEmpresaNombre}
              onChange={v => { setBulkEmpresaNombre(v); setBulkEmpresa(''); }}
              onElegir={e => { setBulkEmpresa(e.id); setBulkEmpresaNombre(e.razon_social); }}
              placeholder="Asignar a empresa…" />
            <button disabled={!bulkEmpresa} onClick={() => bulk('asignar_empresa', { empresa_id: Number(bulkEmpresa) })}
              className="text-sm px-3 py-1.5 rounded bg-ht-accent text-ht-navy hover:bg-ht-accent/90 disabled:opacity-50 flex-shrink-0">Asignar</button>
          </div>
          <button onClick={() => bulk('marcar_revisado')} className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Marcar revisado</button>
          <button onClick={() => { if (window.confirm(`¿Desactivar ${sel.size} contacto(s)?`)) bulk('desactivar'); }}
            className="text-sm px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50">Desactivar</button>
          <button onClick={() => setSel(new Set())} className="text-sm text-gray-500 hover:underline ml-auto">Limpiar selección</button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              {puedeEditar && <th className="px-4 py-2 w-8"><input type="checkbox" checked={todosSel} onChange={toggleTodos} /></th>}
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Empresa</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Teléfono</th>
              <th className="text-left px-4 py-2 font-medium">Vendedor</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {contactos.map(c => (
              <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50 ${sel.has(c.id) ? 'bg-ht-accent/5' : ''}`}>
                {puedeEditar && <td className="px-4 py-2"><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /></td>}
                <td className="px-4 py-2 text-ht-navy font-medium max-w-[240px]">
                  <div className="flex items-center gap-2">
                    <Link to={`/contactos/${c.id}`} title={`${c.nombre} ${c.apellido || ''}`} className="truncate hover:underline">{c.nombre} {c.apellido}</Link>
                    {c.revisar_duplicado && <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-ht-accent/20 text-ht-navy">revisar</span>}
                  </div>
                </td>
                <td className="px-4 py-2 text-gray-600">{c.empresa_nombre || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{c.email || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{c.telefono_e164 || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{c.vendedor_nombre || '—'}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => abrirEditar(c)} className="text-ht-accent hover:underline">Editar</button>
                </td>
              </tr>
            ))}
            {contactos.length === 0 && <tr><td colSpan={puedeEditar ? 7 : 6} className="px-4 py-6 text-center text-gray-400">Sin contactos.</td></tr>}
          </tbody>
        </table>
        </div>
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
                <button type="button" onClick={() => setForm({ ...form, empresa_id: empresaSugerida.id, empresa_nombre: empresaSugerida.razon_social })}
                  className="text-ht-navy underline">Asociar</button>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-700 mb-1">Empresa</label>
              <BuscadorEmpresa value={form.empresa_nombre}
                onChange={v => setForm({ ...form, empresa_nombre: v, empresa_id: '' })}
                onElegir={e => setForm({ ...form, empresa_id: e.id, empresa_nombre: e.razon_social })} />
              {form.empresa_id && (
                <button type="button" onClick={() => setForm({ ...form, empresa_id: '', empresa_nombre: '' })}
                  className="text-xs text-gray-400 hover:underline mt-1">Quitar empresa</button>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Vendedor asignado</label>
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
                <p className="text-xs text-gray-400 mt-1">Solo administrador, jefe comercial o call center pueden reasignarlo.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="RUT comprador" value={form.rut_comprador} onChange={v => setForm({ ...form, rut_comprador: v })} placeholder="12.345.678-9" />
              <Campo label="Cargo" value={form.cargo} onChange={v => setForm({ ...form, cargo: v })} />
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

function Campo({ label, value, onChange, onBlur, req, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}{req && ' *'}</label>
      <input required={req} type={type} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
    </div>
  );
}
