import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const fecha = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-CL') : '';
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];
const badgePrioridad = p => ({
  baja: 'bg-gray-100 text-gray-600',
  media: 'bg-ht-accent/15 text-ht-navy',
  alta: 'bg-amber-100 text-amber-700',
  urgente: 'bg-red-100 text-red-700',
}[p] || 'bg-gray-100 text-gray-600');

export default function Postventa() {
  const { user } = useAuth();
  const puedeGestionar = user?.rol === 'administrador' || user?.rol === 'jefe_comercial' || user?.es_encargado_postventa;
  const [searchParams] = useSearchParams();

  const [etapas, setEtapas] = useState([]);
  const [casos, setCasos] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [detalle, setDetalle] = useState(null); // caso abierto en el panel lateral

  const cargar = async () => {
    try { setCasos((await api.get('/postventa')).data); }
    catch { setError('No se pudieron cargar los casos de postventa.'); }
  };
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    api.get('/postventa/etapas').then(r => setEtapas(r.data.filter(e => e.activo))).catch(() => {});
    if (puedeGestionar) api.get('/users').then(r => setTecnicos(r.data.filter(u => u.activo))).catch(() => {});
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (searchParams.get('negocio_id')) setShowNuevo(true);
    // eslint-disable-next-line
  }, []);

  const mover = async (caso, etapa) => {
    if (!puedeGestionar || caso.etapa_id === etapa.id) return;
    try { await api.put(`/postventa/${caso.id}/etapa`, { etapa_id: etapa.id }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar la etapa.'); }
  };

  const onDrop = etapa => {
    if (!drag) return;
    const caso = drag; setDrag(null);
    mover(caso, etapa);
  };

  const porEtapa = id => casos.filter(c => c.etapa_id === id);

  const guardarGestion = async (caso, campos) => {
    try { await api.put(`/postventa/${caso.id}`, campos); cargar(); setDetalle(null); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar.'); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-ht-navy">Postventa</h1>
        <button onClick={() => setShowNuevo(true)} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">+ Nuevo caso</button>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {!puedeGestionar && (
        <p className="text-sm text-gray-500 mb-4">Ves los casos que has creado. El encargado de postventa gestiona el resto del tablero.</p>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {etapas.map(et => {
          const items = porEtapa(et.id);
          return (
            <div key={et.id}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(et)}
              className="flex-shrink-0 w-72 bg-slate-100 rounded-lg p-2">
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-sm font-semibold text-ht-navy">{et.nombre}</span>
                <span className="text-xs text-gray-500">{items.length}</span>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {items.map(c => (
                  <div key={c.id} draggable={puedeGestionar} onDragStart={() => setDrag(c)}
                    onClick={() => setDetalle(c)}
                    className={`bg-white rounded-md border border-gray-200 p-3 hover:border-ht-accent cursor-pointer ${puedeGestionar ? 'cursor-move' : ''}`}>
                    <div className="text-sm font-medium text-ht-navy">{c.titulo}</div>
                    <div className="text-xs text-gray-500 mt-1">{c.contacto_nombre} {c.contacto_apellido}{c.empresa_nombre ? ` · ${c.empresa_nombre}` : ''}</div>
                    {c.producto_nombre && <div className="text-xs text-gray-400">{c.producto_nombre}</div>}
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full capitalize ${badgePrioridad(c.prioridad)}`}>{c.prioridad}</span>
                      {c.fecha_limite_respuesta && <span className="text-[11px] text-gray-400">SLA {fecha(c.fecha_limite_respuesta)}</span>}
                    </div>
                    {c.tecnico_nombre && <div className="text-[11px] text-gray-400 mt-1">Técnico: {c.tecnico_nombre}</div>}
                    {puedeGestionar && (
                      <select value="" onClick={e => e.stopPropagation()} onChange={e => {
                        const destino = etapas.find(x => String(x.id) === e.target.value);
                        if (destino) mover(c, destino);
                      }} className="md:hidden w-full mt-2 text-xs border border-gray-300 rounded px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-ht-accent">
                        <option value="">Mover a etapa…</option>
                        {etapas.filter(x => x.id !== et.id).map(x => (
                          <option key={x.id} value={x.id}>{x.nombre}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showNuevo && (
        <NuevoCaso negocioIdInicial={searchParams.get('negocio_id')} onClose={() => setShowNuevo(false)}
          onCreado={() => { setShowNuevo(false); cargar(); }} />
      )}

      {detalle && (
        <DetalleCaso caso={detalle} puedeGestionar={puedeGestionar} tecnicos={tecnicos}
          onClose={() => setDetalle(null)} onGuardar={guardarGestion} />
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">{children}</div>
    </div>
  );
}

function NuevoCaso({ negocioIdInicial, onClose, onCreado }) {
  const [q, setQ] = useState(''); const [resultados, setResultados] = useState([]);
  const [negocio, setNegocio] = useState(null);
  const [form, setForm] = useState({ titulo: '', descripcion: '', prioridad: 'media', detalle_equipo: '', fecha_limite_respuesta: '' });
  const [productoQ, setProductoQ] = useState(''); const [productos, setProductos] = useState([]);
  const [productoSel, setProductoSel] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (negocioIdInicial) {
      api.get(`/negocios/${negocioIdInicial}`).then(r => setNegocio(r.data)).catch(() => {});
    }
  }, [negocioIdInicial]);

  const buscarNegocio = async val => {
    setQ(val);
    if (val.length < 2) { setResultados([]); return; }
    try { setResultados((await api.get('/negocios', { params: { q: val } })).data.slice(0, 8)); } catch { /* */ }
  };

  const buscarProducto = async val => {
    setProductoQ(val);
    if (val.length < 2) { setProductos([]); return; }
    try { setProductos((await api.get('/productos', { params: { q: val } })).data.slice(0, 8)); } catch { /* */ }
  };

  const crear = async e => {
    e.preventDefault(); setError('');
    if (!negocio) { setError('Selecciona el negocio de origen (la venta a la que corresponde este caso).'); return; }
    try {
      await api.post('/postventa', {
        negocio_id: negocio.id, titulo: form.titulo, descripcion: form.descripcion || undefined,
        prioridad: form.prioridad, detalle_equipo: form.detalle_equipo || undefined,
        fecha_limite_respuesta: form.fecha_limite_respuesta || undefined,
        producto_id: productoSel?.id,
      });
      onCreado();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear el caso.'); }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-semibold text-ht-navy text-lg mb-3">Nuevo caso de postventa</h2>
      {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      <form onSubmit={crear} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Negocio de origen (la venta a la que corresponde)</label>
          {negocio ? (
            <div className="flex items-center justify-between border border-gray-300 rounded px-3 py-2 text-sm">
              <span>{negocio.titulo} · {negocio.contacto_nombre} {negocio.contacto_apellido || ''}</span>
              <button type="button" onClick={() => setNegocio(null)} className="text-ht-accent text-xs hover:underline">cambiar</button>
            </div>
          ) : (
            <>
              <input value={q} onChange={e => buscarNegocio(e.target.value)} placeholder="Buscar negocio por título, cliente o empresa…"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              {resultados.length > 0 && (
                <div className="border border-gray-200 rounded mt-1 max-h-40 overflow-y-auto">
                  {resultados.map(nd => (
                    <button type="button" key={nd.id} onClick={() => { setNegocio(nd); setResultados([]); }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">
                      {nd.titulo} <span className="text-gray-400">· {nd.contacto_nombre} {nd.contacto_apellido || ''}{nd.empresa_nombre ? ` · ${nd.empresa_nombre}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Título del caso</label>
          <input required value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Bomba no enciende, reclamo de garantía"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Descripción (opcional)</label>
          <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Prioridad</label>
            <select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ht-accent">
              {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Fecha límite de respuesta (opcional)</label>
            <input type="date" value={form.fecha_limite_respuesta} onChange={e => setForm({ ...form, fecha_limite_respuesta: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Equipo/producto reclamado (opcional)</label>
          {productoSel ? (
            <div className="flex items-center justify-between border border-gray-300 rounded px-3 py-2 text-sm">
              <span>{productoSel.nombre}</span>
              <button type="button" onClick={() => setProductoSel(null)} className="text-ht-accent text-xs hover:underline">cambiar</button>
            </div>
          ) : (
            <>
              <input value={productoQ} onChange={e => buscarProducto(e.target.value)} placeholder="Buscar producto del catálogo…"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              {productos.length > 0 && (
                <div className="border border-gray-200 rounded mt-1 max-h-40 overflow-y-auto">
                  {productos.map(p => (
                    <button type="button" key={p.id} onClick={() => { setProductoSel(p); setProductos([]); }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">{p.nombre}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Detalle del equipo (opcional)</label>
          <input value={form.detalle_equipo} onChange={e => setForm({ ...form, detalle_equipo: e.target.value })} placeholder="N° de serie, ubicación, fecha de instalación…"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Crear</button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

function DetalleCaso({ caso, puedeGestionar, tecnicos, onClose, onGuardar }) {
  const [prioridad, setPrioridad] = useState(caso.prioridad);
  const [tecnicoId, setTecnicoId] = useState(caso.tecnico_asignado_id || '');
  const [fechaLimite, setFechaLimite] = useState(caso.fecha_limite_respuesta ? caso.fecha_limite_respuesta.slice(0, 10) : '');

  return (
    <Modal onClose={onClose}>
      <h2 className="font-semibold text-ht-navy text-lg mb-1">{caso.titulo}</h2>
      <p className="text-xs text-gray-400 mb-3">Venta de origen: {caso.negocio_titulo}</p>
      {caso.descripcion && <p className="text-sm text-gray-600 mb-3">{caso.descripcion}</p>}
      <dl className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div><dt className="text-xs text-gray-500">Contacto</dt><dd className="text-ht-navy">{caso.contacto_nombre} {caso.contacto_apellido}</dd></div>
        <div><dt className="text-xs text-gray-500">Empresa</dt><dd className="text-ht-navy">{caso.empresa_nombre || '—'}</dd></div>
        <div><dt className="text-xs text-gray-500">Equipo</dt><dd className="text-ht-navy">{caso.producto_nombre || '—'}</dd></div>
        <div><dt className="text-xs text-gray-500">Detalle equipo</dt><dd className="text-ht-navy">{caso.detalle_equipo || '—'}</dd></div>
        <div><dt className="text-xs text-gray-500">Creado por</dt><dd className="text-ht-navy">{caso.creado_por_nombre}</dd></div>
        <div><dt className="text-xs text-gray-500">Etapa</dt><dd className="text-ht-navy">{caso.etapa_nombre}</dd></div>
      </dl>

      {puedeGestionar ? (
        <div className="space-y-3 border-t border-gray-100 pt-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Prioridad</label>
            <select value={prioridad} onChange={e => setPrioridad(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ht-accent">
              {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Técnico asignado</label>
            <select value={tecnicoId} onChange={e => setTecnicoId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
              <option value="">— Sin asignar —</option>
              {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Fecha límite de respuesta</label>
            <input type="date" value={fechaLimite} onChange={e => setFechaLimite(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <button onClick={() => onGuardar(caso, { prioridad, tecnico_asignado_id: tecnicoId || null, fecha_limite_respuesta: fechaLimite || null })}
            className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Guardar</button>
        </div>
      ) : (
        <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">Solo el encargado de postventa puede editar prioridad, técnico y SLA.</p>
      )}

      <div className="mt-3">
        <Link to={`/negocios/${caso.negocio_id}`} className="text-sm text-ht-accent hover:underline">Ver negocio de origen →</Link>
      </div>
    </Modal>
  );
}
