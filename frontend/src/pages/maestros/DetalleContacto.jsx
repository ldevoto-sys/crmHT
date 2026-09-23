import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';
import NotasYTareas from '../../components/NotasYTareas';
import { formatFechaHora } from '../../utils/fecha';
import { useAuth } from '../../contexts/AuthContext';

const money = v => v ? `$${Number(v).toLocaleString('es-CL')}` : '—';
const fecha = formatFechaHora;
const PUEDE_REASIGNAR_VENDEDOR = ['administrador', 'jefe_comercial', 'callcenter'];
const PUEDE_EDITAR_CONTACTO = ['administrador', 'jefe_comercial', 'callcenter', 'vendedor'];
const vacioForm = { nombre: '', apellido: '', email: '', telefono: '', empresa_id: '', empresa_nombre: '', cargo: '', rut_comprador: '', vendedor_id: '' };

export default function DetalleContacto() {
  const { id } = useParams();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [showNuevoNegocio, setShowNuevoNegocio] = useState(false);
  const [titulo, setTitulo] = useState(''); const [monto, setMonto] = useState('');
  const [vendedores, setVendedores] = useState([]);
  const [guardandoVendedor, setGuardandoVendedor] = useState(false);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(vacioForm);
  const [guardando, setGuardando] = useState(false);

  const cargar = () => api.get(`/contactos/${id}`).then(r => setC(r.data)).catch(() => setError('No se pudo cargar el contacto.'));
  useEffect(() => { cargar(); }, [id]);
  useEffect(() => {
    if (PUEDE_REASIGNAR_VENDEDOR.includes(user?.rol)) api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {});
  }, [user]);

  const cambiarVendedor = async vendedorId => {
    setError(''); setGuardandoVendedor(true);
    try {
      await api.put(`/contactos/${id}`, {
        nombre: c.nombre, apellido: c.apellido, email: c.email, telefono: c.telefono_e164,
        empresa_id: c.empresa_id, rut_comprador: c.rut_comprador, cargo: c.cargo,
        activo: c.activo, revisar_duplicado: c.revisar_duplicado, vendedor_id: vendedorId || null,
      });
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar el vendedor.'); }
    finally { setGuardandoVendedor(false); }
  };

  const abrirEditar = () => {
    setForm({
      nombre: c.nombre || '', apellido: c.apellido || '', email: c.email || '', telefono: c.telefono_e164 || '',
      empresa_id: c.empresa_id || '', empresa_nombre: c.empresa_nombre || '', cargo: c.cargo || '',
      rut_comprador: c.rut_comprador || '', vendedor_id: c.vendedor_id || '',
    });
    setError(''); setEditando(true);
  };

  const guardarEdicion = async e => {
    e.preventDefault(); setError(''); setGuardando(true);
    try {
      await api.put(`/contactos/${id}`, {
        nombre: form.nombre, apellido: form.apellido, email: form.email, telefono: form.telefono,
        empresa_id: form.empresa_id || null, rut_comprador: form.rut_comprador, cargo: form.cargo,
        activo: c.activo, revisar_duplicado: c.revisar_duplicado, vendedor_id: form.vendedor_id || null,
      });
      setEditando(false); cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar el contacto.'); }
    finally { setGuardando(false); }
  };

  const crearNegocio = async e => {
    e.preventDefault(); setError('');
    try {
      await api.post('/negocios', { contacto_id: Number(id), titulo, monto_estimado: monto || null });
      setShowNuevoNegocio(false); setTitulo(''); setMonto(''); cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear el negocio.'); }
  };

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!c) return <div className="p-6 text-gray-400">Cargando…</div>;

  const dato = (label, valor) => (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-ht-navy">{valor || '—'}</dd>
    </div>
  );

  return (
    <div>
      <Link to="/contactos" className="text-sm text-ht-accent hover:underline">← Contactos</Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-6">{c.nombre} {c.apellido}</h1>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-ht-navy">Datos</h2>
              {!editando && PUEDE_EDITAR_CONTACTO.includes(user?.rol) && (
                <button onClick={abrirEditar} className="text-sm text-ht-accent hover:underline">Editar</button>
              )}
            </div>
            {editando ? (
              <form onSubmit={guardarEdicion} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Nombre" req value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} />
                  <Campo label="Apellido" value={form.apellido} onChange={v => setForm({ ...form, apellido: v })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
                  <Campo label="Teléfono" value={form.telefono} onChange={v => setForm({ ...form, telefono: v })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Empresa</label>
                    <BuscadorEmpresa value={form.empresa_nombre}
                      onChange={v => setForm({ ...form, empresa_nombre: v, empresa_id: '' })}
                      onElegir={e => setForm({ ...form, empresa_id: e.id, empresa_nombre: e.razon_social })} />
                  </div>
                  <Campo label="Cargo" value={form.cargo} onChange={v => setForm({ ...form, cargo: v })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="RUT comprador" value={form.rut_comprador} onChange={v => setForm({ ...form, rut_comprador: v })} />
                  {PUEDE_REASIGNAR_VENDEDOR.includes(user?.rol) && (
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Vendedor asignado</label>
                      <select value={form.vendedor_id} onChange={e => setForm({ ...form, vendedor_id: e.target.value })}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
                        <option value="">— Sin asignar —</option>
                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={guardando} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
                    {guardando ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => setEditando(false)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
                </div>
              </form>
            ) : (
              <dl className="grid grid-cols-2 gap-4">
                {dato('Empresa', c.empresa_nombre)}
                {dato('Cargo', c.cargo)}
                {dato('Email', c.email)}
                {dato('Teléfono', c.telefono_e164)}
                {dato('RUT comprador', c.rut_comprador)}
                {dato('Origen', c.origen)}
                {PUEDE_REASIGNAR_VENDEDOR.includes(user?.rol) ? (
                  <div>
                    <dt className="text-xs text-gray-500">Vendedor asignado</dt>
                    <dd>
                      <select value={c.vendedor_id || ''} disabled={guardandoVendedor}
                        onChange={e => cambiarVendedor(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent disabled:opacity-50">
                        <option value="">— Sin asignar —</option>
                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                      </select>
                    </dd>
                  </div>
                ) : dato('Vendedor asignado', c.vendedor_nombre)}
              </dl>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-ht-navy">Negocios ({c.negocios.length})</h2>
              <button onClick={() => setShowNuevoNegocio(true)} className="text-sm bg-ht-accent text-ht-navy px-3 py-1.5 rounded hover:bg-ht-accent/90">+ Nuevo negocio</button>
            </div>
            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            {showNuevoNegocio && (
              <form onSubmit={crearNegocio} className="flex flex-wrap gap-2 mb-3 p-3 border border-gray-200 rounded">
                <input required value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título del negocio"
                  className="flex-1 min-w-[160px] border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                <input value={monto} onChange={e => setMonto(e.target.value)} type="number" min="0" placeholder="Monto estimado"
                  className="w-40 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                <button type="submit" className="bg-ht-accent text-ht-navy px-3 py-2 rounded text-sm hover:bg-ht-accent/90">Crear</button>
                <button type="button" onClick={() => setShowNuevoNegocio(false)} className="px-3 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
              </form>
            )}
            {c.negocios.length === 0 ? <p className="text-sm text-gray-400">Sin negocios.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {c.negocios.map(n => (
                    <tr key={n.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5"><Link to={`/negocios/${n.id}`} className="text-ht-navy hover:underline">{n.titulo}</Link></td>
                      <td className="py-1.5 text-gray-500">{n.etapa_nombre}</td>
                      <td className="py-1.5 text-right text-ht-navy">{money(n.monto_estimado)}</td>
                      <td className="py-1.5 text-right">
                        {n.etapa_tipo === 'abierta' && <Link to={`/negocios/${n.id}/cotizar`} className="text-ht-accent hover:underline">Cotizar</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <NotasYTareas contactoId={Number(id)} />

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-3">Línea de tiempo</h2>
            {c.timeline.length === 0 ? <p className="text-sm text-gray-400">Sin eventos.</p> : (
              <ul className="space-y-3">
                {c.timeline.map(t => (
                  <li key={t.id} className="text-sm border-l-2 border-ht-accent/40 pl-3">
                    <div className="text-ht-navy">{t.descripcion}</div>
                    <div className="text-xs text-gray-400">{fecha(t.created_at)} · {t.usuario_nombre || 'sistema'} · {t.tipo}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, req }) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}{req && ' *'}</label>
      <input required={req} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
    </div>
  );
}

function BuscadorEmpresa({ value, onChange, onElegir }) {
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);

  const buscar = async val => {
    onChange(val);
    if (val.length < 2) { setResultados([]); return; }
    try { setResultados((await api.get('/empresas', { params: { q: val } })).data.slice(0, 15)); }
    catch { /* */ }
  };

  return (
    <div className="relative">
      <input value={value} onChange={e => buscar(e.target.value)}
        onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar por nombre o RUT…"
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
