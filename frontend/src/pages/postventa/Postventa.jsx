import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { slaEstado, ESTILO_SLA } from '../../utils/sla';

// fecha_limite_respuesta llega del backend como timestamp completo (el
// driver de Postgres convierte DATE a un objeto Date, que se serializa como
// ISO completo), no como "AAAA-MM-DD" — hay que recortar antes de parsear.
const fecha = d => d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CL') : '';
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];
const TIPOS_ADJUNTO = [
  { value: 'foto_cliente', label: 'Foto cliente' },
  { value: 'video_cliente', label: 'Video cliente' },
  { value: 'informe_tecnico', label: 'Informe técnico' },
  { value: 'otro', label: 'Otro' },
];
const labelTipoAdjunto = t => TIPOS_ADJUNTO.find(x => x.value === t)?.label || 'Otro';
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
  const [filtroSla, setFiltroSla] = useState('todos'); // todos | vencido | proximo

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

  // Filtro por estado de SLA (vencidos / por vencer / todos), aplicado antes
  // de repartir los casos por columna.
  const casosFiltrados = filtroSla === 'todos' ? casos : casos.filter(c => slaEstado(c.fecha_limite_respuesta) === filtroSla);
  const porEtapa = id => casosFiltrados.filter(c => c.etapa_id === id);
  // Casos creados antes de que existiera alguna etapa "abierta" en Postventa
  // quedan sin etapa_id — se muestran aparte para que nunca queden invisibles.
  const idsEtapas = new Set(etapas.map(e => e.id));
  const sinEtapa = casosFiltrados.filter(c => !c.etapa_id || !idsEtapas.has(c.etapa_id));

  const guardarGestion = async (caso, campos) => {
    try { await api.put(`/postventa/${caso.id}`, campos); cargar(); setDetalle(null); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar.'); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-ht-navy">Postventa</h1>
        <div className="flex items-center gap-2">
          <select value={filtroSla} onChange={e => setFiltroSla(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="todos">Todos</option>
            <option value="vencido">Vencidos</option>
            <option value="proximo">Por vencer (≤3 días)</option>
          </select>
          <button onClick={() => setShowNuevo(true)} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">+ Nuevo caso</button>
        </div>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {!puedeGestionar && (
        <p className="text-sm text-gray-500 mb-4">Ves los casos que has creado. El encargado de postventa gestiona el resto del tablero.</p>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {sinEtapa.length > 0 && (
          <div className="flex-shrink-0 w-72 bg-amber-50 border border-amber-200 rounded-lg p-2">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-sm font-semibold text-amber-800">Sin etapa asignada</span>
              <span className="text-xs text-amber-700">{sinEtapa.length}</span>
            </div>
            <p className="text-[11px] text-amber-700 px-1 mb-2">Define las etapas de Postventa en Config Postventa y muévelos desde aquí.</p>
            <div className="space-y-2 min-h-[40px]">
              {sinEtapa.map(c => (
                <TarjetaCaso key={c.id} c={c} etapas={etapas} etapaActualId={null}
                  puedeGestionar={puedeGestionar} onDragStart={setDrag} onClick={setDetalle} onMover={mover} />
              ))}
            </div>
          </div>
        )}
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
                  <TarjetaCaso key={c.id} c={c} etapas={etapas} etapaActualId={et.id}
                    puedeGestionar={puedeGestionar} onDragStart={setDrag} onClick={setDetalle} onMover={mover} />
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
        <DetalleCaso caso={detalle} puedeGestionar={puedeGestionar}
          puedeSubir={puedeGestionar || detalle.creado_por_id === user?.id} tecnicos={tecnicos}
          onClose={() => setDetalle(null)} onGuardar={guardarGestion} />
      )}
    </div>
  );
}

function TarjetaCaso({ c, etapas, etapaActualId, puedeGestionar, onDragStart, onClick, onMover }) {
  const estadoSla = slaEstado(c.fecha_limite_respuesta);
  const estilo = ESTILO_SLA[estadoSla] || ESTILO_SLA.normal;
  return (
    <div draggable={puedeGestionar} onDragStart={() => onDragStart(c)}
      onClick={() => onClick(c)}
      className={`bg-white rounded-md border border-gray-200 ${estilo.borde} p-3 hover:border-ht-accent cursor-pointer ${puedeGestionar ? 'cursor-move' : ''}`}>
      <div className="text-sm font-medium text-ht-navy">{c.titulo}</div>
      <div className="text-xs text-gray-500 mt-1">{c.contacto_nombre} {c.contacto_apellido}{c.empresa_nombre ? ` · ${c.empresa_nombre}` : ''}</div>
      {c.producto_nombre && <div className="text-xs text-gray-400">{c.producto_nombre}</div>}
      <div className="flex items-center justify-between mt-2">
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full capitalize ${badgePrioridad(c.prioridad)}`}>{c.prioridad}</span>
        {c.fecha_limite_respuesta && (
          <span className={`text-[11px] ${estilo.texto}`}>{estilo.label ? `${estilo.label} · ` : 'SLA '}{fecha(c.fecha_limite_respuesta)}</span>
        )}
      </div>
      {c.tecnico_nombre && <div className="text-[11px] text-gray-400 mt-1">Técnico: {c.tecnico_nombre}</div>}
      {puedeGestionar && (
        <select value="" onClick={e => e.stopPropagation()} onChange={e => {
          const destino = etapas.find(x => String(x.id) === e.target.value);
          if (destino) onMover(c, destino);
        }} className="md:hidden w-full mt-2 text-xs border border-gray-300 rounded px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-ht-accent">
          <option value="">Mover a etapa…</option>
          {etapas.filter(x => x.id !== etapaActualId).map(x => (
            <option key={x.id} value={x.id}>{x.nombre}</option>
          ))}
        </select>
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
  const [sinNegocio, setSinNegocio] = useState(false);
  const [contactoQ, setContactoQ] = useState(''); const [contactosResultados, setContactosResultados] = useState([]);
  const [contacto, setContacto] = useState(null);
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

  const buscarContacto = async val => {
    setContactoQ(val);
    if (val.length < 2) { setContactosResultados([]); return; }
    try { setContactosResultados((await api.get('/contactos', { params: { q: val } })).data.slice(0, 8)); } catch { /* */ }
  };

  const buscarProducto = async val => {
    setProductoQ(val);
    if (val.length < 2) { setProductos([]); return; }
    try { setProductos((await api.get('/productos', { params: { q: val } })).data.slice(0, 8)); } catch { /* */ }
  };

  const crear = async e => {
    e.preventDefault(); setError('');
    if (sinNegocio) {
      if (!contacto) { setError('Selecciona el contacto del caso.'); return; }
    } else if (!negocio) { setError('Selecciona el negocio de origen (la venta a la que corresponde este caso).'); return; }
    try {
      await api.post('/postventa', {
        negocio_id: sinNegocio ? undefined : negocio.id, contacto_id: sinNegocio ? contacto.id : undefined,
        titulo: form.titulo, descripcion: form.descripcion || undefined,
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
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm text-gray-700">
              {sinNegocio ? 'Contacto (sin venta previa asociada)' : 'Negocio de origen (la venta a la que corresponde)'}
            </label>
            <button type="button" onClick={() => { setSinNegocio(!sinNegocio); setNegocio(null); setContacto(null); }}
              className="text-ht-accent text-xs hover:underline">
              {sinNegocio ? 'Tiene venta asociada' : '¿Sin venta asociada?'}
            </button>
          </div>
          {sinNegocio ? (
            contacto ? (
              <div className="flex items-center justify-between border border-gray-300 rounded px-3 py-2 text-sm">
                <span>{contacto.nombre} {contacto.apellido || ''}{contacto.empresa_nombre ? ` · ${contacto.empresa_nombre}` : ''}</span>
                <button type="button" onClick={() => setContacto(null)} className="text-ht-accent text-xs hover:underline">cambiar</button>
              </div>
            ) : (
              <>
                <input value={contactoQ} onChange={e => buscarContacto(e.target.value)} placeholder="Buscar contacto por nombre, email o empresa…"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                {contactosResultados.length > 0 && (
                  <div className="border border-gray-200 rounded mt-1 max-h-40 overflow-y-auto">
                    {contactosResultados.map(c => (
                      <button type="button" key={c.id} onClick={() => { setContacto(c); setContactosResultados([]); }}
                        className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">
                        {c.nombre} {c.apellido || ''} <span className="text-gray-400">{c.empresa_nombre ? `· ${c.empresa_nombre}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          ) : negocio ? (
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
            <label className="block text-sm text-gray-700 mb-1">Fecha límite de respuesta</label>
            <input required type="date" value={form.fecha_limite_respuesta} onChange={e => setForm({ ...form, fecha_limite_respuesta: e.target.value })}
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

function DetalleCaso({ caso, puedeGestionar, puedeSubir, tecnicos, onClose, onGuardar }) {
  const [prioridad, setPrioridad] = useState(caso.prioridad);
  const [tecnicoId, setTecnicoId] = useState(caso.tecnico_asignado_id || '');
  const [fechaLimite, setFechaLimite] = useState(caso.fecha_limite_respuesta ? caso.fecha_limite_respuesta.slice(0, 10) : '');

  return (
    <Modal onClose={onClose}>
      <h2 className="font-semibold text-ht-navy text-lg mb-1">{caso.titulo}</h2>
      <p className="text-xs text-gray-400 mb-3">{caso.negocio_id ? `Venta de origen: ${caso.negocio_titulo}` : 'Sin venta previa asociada'}</p>
      {caso.descripcion && <p className="text-sm text-gray-600 mb-3">{caso.descripcion}</p>}
      <dl className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div><dt className="text-xs text-gray-500">Contacto</dt><dd className="text-ht-navy">{caso.contacto_nombre} {caso.contacto_apellido}</dd></div>
        <div><dt className="text-xs text-gray-500">Empresa</dt><dd className="text-ht-navy">{caso.empresa_nombre || '—'}</dd></div>
        <div><dt className="text-xs text-gray-500">Equipo</dt><dd className="text-ht-navy">{caso.producto_nombre || '—'}</dd></div>
        <div><dt className="text-xs text-gray-500">Detalle equipo</dt><dd className="text-ht-navy">{caso.detalle_equipo || '—'}</dd></div>
        <div><dt className="text-xs text-gray-500">Creado por</dt><dd className="text-ht-navy">{caso.creado_por_nombre}</dd></div>
        <div><dt className="text-xs text-gray-500">Etapa</dt><dd className="text-ht-navy">{caso.etapa_nombre}</dd></div>
      </dl>

      <AdjuntosCaso casoId={caso.id} puedeSubir={puedeSubir} puedeGestionar={puedeGestionar} />

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

      <div className="mt-3 flex items-center justify-between">
        {caso.negocio_id ? (
          <Link to={`/negocios/${caso.negocio_id}`} className="text-sm text-ht-accent hover:underline">Ver negocio de origen →</Link>
        ) : <span />}
        <Link to={`/despacho?caso_postventa_id=${caso.id}`} className="text-sm border border-ht-navy text-ht-navy px-3 py-1.5 rounded hover:bg-ht-navy/5">Crear despacho</Link>
      </div>
    </Modal>
  );
}

function AdjuntosCaso({ casoId, puedeSubir }) {
  const { user } = useAuth();
  const [adjuntos, setAdjuntos] = useState([]);
  const [error, setError] = useState('');
  const [tipo, setTipo] = useState('foto_cliente');
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  const cargar = () => api.get(`/postventa/${casoId}/adjuntos`).then(r => setAdjuntos(r.data)).catch(() => {});
  useEffect(() => { cargar(); }, [casoId]);

  const subir = async e => {
    e.preventDefault();
    if (!archivo) return;
    setError(''); setSubiendo(true);
    const form = new FormData();
    form.append('archivo', archivo);
    form.append('tipo', tipo);
    if (descripcion) form.append('descripcion', descripcion);
    try {
      await api.post(`/postventa/${casoId}/adjuntos`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setArchivo(null); setDescripcion(''); cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo subir el archivo.'); }
    finally { setSubiendo(false); }
  };

  const ver = async adj => {
    try {
      const { data } = await api.get(`/postventa/adjuntos/${adj.id}/archivo`, { responseType: 'blob' });
      window.open(URL.createObjectURL(data), '_blank');
    } catch { setError('No se pudo abrir el archivo.'); }
  };

  const eliminar = async adjId => {
    try { await api.delete(`/postventa/adjuntos/${adjId}`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo eliminar el adjunto.'); }
  };

  return (
    <div className="border-t border-gray-100 pt-3 mt-3">
      <h3 className="text-sm font-semibold text-ht-navy mb-2">Adjuntos ({adjuntos.length})</h3>
      {error && <div className="mb-2 text-xs text-red-600">{error}</div>}
      {adjuntos.length === 0 ? (
        <p className="text-xs text-gray-400 mb-2">Sin adjuntos todavía.</p>
      ) : (
        <ul className="space-y-1.5 mb-2">
          {adjuntos.map(a => (
            <li key={a.id} className="flex items-center justify-between text-sm border border-gray-100 rounded px-2 py-1.5">
              <button type="button" onClick={() => ver(a)} className="text-left flex-1 hover:underline">
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-gray-600 mr-2">{labelTipoAdjunto(a.tipo)}</span>
                <span className="text-ht-navy">{a.archivo_nombre || 'archivo'}</span>
                {a.descripcion && <span className="text-gray-400"> · {a.descripcion}</span>}
                <span className="block text-[11px] text-gray-400">{a.subido_por_nombre || 'sistema'} · {new Date(a.created_at).toLocaleString('es-CL')}</span>
              </button>
              {(user?.id === a.subido_por_id || user?.rol === 'administrador' || user?.rol === 'jefe_comercial' || user?.es_encargado_postventa) && (
                <button type="button" onClick={() => eliminar(a.id)} className="text-xs text-red-500 hover:underline ml-2 flex-shrink-0">Eliminar</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeSubir && (
        <form onSubmit={subir} className="flex flex-wrap items-end gap-2">
          <select value={tipo} onChange={e => setTipo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            {TIPOS_ADJUNTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción (opcional)"
            className="flex-1 min-w-[140px] border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <input type="file" onChange={e => setArchivo(e.target.files?.[0] || null)} className="text-xs" />
          <button type="submit" disabled={!archivo || subiendo}
            className="text-sm px-3 py-1.5 rounded bg-ht-accent text-ht-navy hover:bg-ht-accent/90 disabled:opacity-50">
            {subiendo ? 'Subiendo…' : 'Subir'}
          </button>
        </form>
      )}
    </div>
  );
}
