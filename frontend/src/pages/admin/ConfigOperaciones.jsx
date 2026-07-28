import { useEffect, useState } from 'react';
import api from '../../api';

// --- Pestaña: Mano de obra (fila única) ---
function TabManoDeObra() {
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState(''); const [error, setError] = useState('');

  useEffect(() => { api.get('/config/operaciones-mo').then(r => setForm(r.data || {})).catch(() => {}); }, []);

  const submit = async e => {
    e.preventDefault(); setMsg(''); setError('');
    try { await api.put('/config/operaciones-mo', form); setMsg('Parámetros actualizados.'); }
    catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const campo = (k, label, hint) => (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}</label>
      <input type="number" step="0.01" min="0" required value={form[k] ?? ''}
        onChange={e => setForm({ ...form, [k]: e.target.value })}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div>
      <p className="text-gray-500 text-sm mb-6">Parámetros de mano de obra usados por el cotizador de Operaciones para calcular horas normales/extra, hora-máquina y elementos menores.</p>
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 max-w-xl grid grid-cols-2 gap-4">
        {campo('hh_uf', 'Costo hora-hombre (UF)', 'Por técnico. La cotización usa 2 técnicos.')}
        {campo('hm_uf', 'Costo hora-máquina / furgón (UF)')}
        {campo('markup', 'Markup sobre materiales', 'Factor de venta, ej. 1.3 = 30% sobre el costo de materiales.')}
        {campo('elem_mat_pct', 'Elementos menores (%)', '% sobre el subtotal de materiales.')}
        {campo('elem_furg_uf', 'Elementos menores de furgón (UF)', 'Monto fijo por trabajo.')}
        <div className="col-span-2">
          <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Guardar</button>
        </div>
      </form>
    </div>
  );
}

// --- Pestaña: Comunas (tabla de líneas con edición) ---
const comunaVacia = { nombre: '', km: '', horas_transito: '', costo_traslado_uf: '' };

function TabComunas() {
  const [comunas, setComunas] = useState([]);
  const [form, setForm] = useState(comunaVacia);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');

  const cargar = async () => {
    try { setComunas((await api.get('/config/comunas-operaciones')).data); }
    catch { setError('No se pudieron cargar las comunas.'); }
  };
  useEffect(() => { cargar(); }, []);

  const resetForm = () => { setForm(comunaVacia); setEditId(null); };

  const guardar = async e => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      if (editId) { await api.put(`/config/comunas-operaciones/${editId}`, form); setMsg('Comuna actualizada.'); }
      else { await api.post('/config/comunas-operaciones', form); setMsg('Comuna creada.'); }
      resetForm(); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const editar = c => {
    setEditId(c.id);
    setForm({ nombre: c.nombre, km: c.km ?? '', horas_transito: c.horas_transito, costo_traslado_uf: c.costo_traslado_uf });
    setError(''); setMsg('');
  };

  const eliminar = async c => {
    if (!window.confirm(`¿Eliminar "${c.nombre}"?`)) return;
    setError(''); setMsg('');
    try { await api.delete(`/config/comunas-operaciones/${c.id}`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al eliminar.'); }
  };

  return (
    <div>
      <p className="text-gray-500 text-sm mb-6">Comunas usadas para calcular tránsito y traslado en las cotizaciones de Operaciones.</p>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={guardar} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 lg:col-span-1">
          <h2 className="font-semibold text-ht-navy">{editId ? 'Editar comuna' : 'Nueva comuna'}</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Km <span className="text-gray-400">(opcional)</span></label>
            <input type="number" step="0.1" min="0" value={form.km} onChange={e => setForm({ ...form, km: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Horas de tránsito</label>
            <input type="number" step="0.01" min="0" required value={form.horas_transito}
              onChange={e => setForm({ ...form, horas_transito: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Costo de traslado (UF)</label>
            <input type="number" step="0.01" min="0" required value={form.costo_traslado_uf}
              onChange={e => setForm({ ...form, costo_traslado_uf: e.target.value })}
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
                  <th className="text-left px-4 py-2 font-medium">Comuna</th>
                  <th className="text-left px-4 py-2 font-medium">Km</th>
                  <th className="text-left px-4 py-2 font-medium">Hrs. tránsito</th>
                  <th className="text-left px-4 py-2 font-medium">Traslado (UF)</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {comunas.map(c => (
                  <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50 ${!c.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 text-ht-navy font-medium">{c.nombre}</td>
                    <td className="px-4 py-2 text-gray-600">{c.km ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{c.horas_transito}</td>
                    <td className="px-4 py-2 text-gray-600">{c.costo_traslado_uf}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => editar(c)} className="text-ht-accent hover:underline mr-3">Editar</button>
                      <button onClick={() => eliminar(c)} className="text-red-500 hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))}
                {comunas.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin comunas cargadas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Pestaña: Sinónimos (tabla de líneas con edición) ---
const sinonimoVacio = { termino_fracttal: '', termino_bbdd: '' };

function TabSinonimos() {
  const [sinonimos, setSinonimos] = useState([]);
  const [form, setForm] = useState(sinonimoVacio);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');

  const cargar = async () => {
    try { setSinonimos((await api.get('/config/sinonimos-operaciones')).data); }
    catch { setError('No se pudieron cargar los sinónimos.'); }
  };
  useEffect(() => { cargar(); }, []);

  const resetForm = () => { setForm(sinonimoVacio); setEditId(null); };

  const guardar = async e => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      if (editId) { await api.put(`/config/sinonimos-operaciones/${editId}`, form); setMsg('Sinónimo actualizado.'); }
      else { await api.post('/config/sinonimos-operaciones', form); setMsg('Sinónimo creado.'); }
      resetForm(); cargar();
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const editar = s => {
    setEditId(s.id);
    setForm({ termino_fracttal: s.termino_fracttal, termino_bbdd: s.termino_bbdd });
    setError(''); setMsg('');
  };

  const eliminar = async s => {
    if (!window.confirm(`¿Eliminar el sinónimo "${s.termino_fracttal} → ${s.termino_bbdd}"?`)) return;
    setError(''); setMsg('');
    try { await api.delete(`/config/sinonimos-operaciones/${s.id}`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al eliminar.'); }
  };

  return (
    <div>
      <p className="text-gray-500 text-sm mb-6">
        Términos que aparecen en las solicitudes Fracttal y no coinciden literalmente con el nombre del producto en el catálogo
        (ej. <span className="font-mono text-xs">tripolar → automatico</span>). Usados por el motor de matching del cotizador de Operaciones.
      </p>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={guardar} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 lg:col-span-1">
          <h2 className="font-semibold text-ht-navy">{editId ? 'Editar sinónimo' : 'Nuevo sinónimo'}</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Término en Fracttal</label>
            <input required value={form.termino_fracttal} onChange={e => setForm({ ...form, termino_fracttal: e.target.value })}
              placeholder="ej: tripolar"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Término en el catálogo</label>
            <input required value={form.termino_bbdd} onChange={e => setForm({ ...form, termino_bbdd: e.target.value })}
              placeholder="ej: automatico"
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
                  <th className="text-left px-4 py-2 font-medium">Término Fracttal</th>
                  <th className="text-left px-4 py-2 font-medium">Término catálogo</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sinonimos.map(s => (
                  <tr key={s.id} className={`border-t border-gray-100 hover:bg-gray-50 ${!s.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 text-ht-navy">{s.termino_fracttal}</td>
                    <td className="px-4 py-2 text-gray-600">{s.termino_bbdd}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => editar(s)} className="text-ht-accent hover:underline mr-3">Editar</button>
                      <button onClick={() => eliminar(s)} className="text-red-500 hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))}
                {sinonimos.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Sin sinónimos cargados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConfigOperaciones() {
  const [tab, setTab] = useState('mo');
  const tabs = [
    ['mo', 'Mano de obra'],
    ['comunas', 'Comunas'],
    ['sinonimos', 'Sinónimos'],
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Cotizador Operaciones</h1>
      <p className="text-gray-500 text-sm mb-4">Mantenedores usados por el cotizador de Operaciones (solicitudes Fracttal) para calcular mano de obra, traslado y matching de materiales.</p>

      <div className="flex gap-1 mb-6 border border-gray-200 rounded p-1 bg-slate-50 w-fit">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded text-sm font-medium ${tab === key ? 'bg-white text-ht-navy shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'mo' && <TabManoDeObra />}
      {tab === 'comunas' && <TabComunas />}
      {tab === 'sinonimos' && <TabSinonimos />}
    </div>
  );
}
