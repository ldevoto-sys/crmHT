import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

// fecha llega del backend como timestamp completo (el driver de Postgres
// convierte DATE a un objeto Date, serializado como ISO completo) — hay que
// recortar antes de parsear, mismo caso que en Postventa.
const fecha = d => d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CL') : '';
const hoyISO = () => new Date().toISOString().slice(0, 10);

const ESTADOS = ['programado', 'en_ruta', 'completado', 'cancelado'];
const badgeEstado = e => ({
  programado: 'bg-gray-100 text-gray-600',
  en_ruta: 'bg-ht-accent/15 text-ht-navy',
  completado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
}[e] || 'bg-gray-100 text-gray-600');

const TIPOS_PUNTO = [
  { value: 'retiro', label: 'Retiro' },
  { value: 'entrega', label: 'Entrega' },
];
const TIPOS_DOCUMENTO = [
  { value: 'factura', label: 'Factura' },
  { value: 'guia_despacho', label: 'Guía de despacho' },
  { value: 'orden_compra', label: 'O/C' },
  { value: 'otro', label: 'Otro' },
];

const puntoVacio = () => ({
  tipo: 'entrega', direccion: '', comuna: '', fecha: hoyISO(), contacto_nombre: '', contacto_telefono: '',
  documento_tipo: 'guia_despacho', documento_numero: '', duracion_estimada_min: '',
});

export default function Despacho() {
  const { user } = useAuth();
  const puedeGestionar = user?.rol === 'administrador' || user?.rol === 'jefe_comercial' || user?.es_encargado_despacho;
  const [searchParams] = useSearchParams();

  const [despachos, setDespachos] = useState([]);
  const [error, setError] = useState('');
  const [showNuevo, setShowNuevo] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [lugares, setLugares] = useState([]);
  useEffect(() => { api.get('/despachos/lugares-frecuentes').then(r => setLugares(r.data)).catch(() => {}); }, []);

  const cargar = async () => {
    try {
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;
      setDespachos((await api.get('/despachos', { params })).data);
    } catch { setError('No se pudieron cargar los despachos.'); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [filtroEstado, desde, hasta]);

  useEffect(() => {
    if (searchParams.get('negocio_id') || searchParams.get('caso_postventa_id')) setShowNuevo(true);
    // eslint-disable-next-line
  }, []);

  const abrirDetalle = async d => {
    try { setDetalle((await api.get(`/despachos/${d.id}`)).data); }
    catch { setError('No se pudo cargar el despacho.'); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-ht-navy">Despacho</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <span className="text-xs text-gray-400">a</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e} className="capitalize">{e.replace('_', ' ')}</option>)}
          </select>
          <button onClick={() => setShowNuevo(true)} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">+ Nuevo despacho</button>
        </div>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {!puedeGestionar && (
        <p className="text-sm text-gray-500 mb-4">Ves los despachos que has creado. El encargado de despacho gestiona el resto.</p>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Título</th>
                <th className="text-left px-4 py-2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 font-medium">Paradas</th>
                <th className="text-left px-4 py-2 font-medium">Origen</th>
                <th className="text-left px-4 py-2 font-medium">Estado</th>
                <th className="text-left px-4 py-2 font-medium">Creado por</th>
              </tr>
            </thead>
            <tbody>
              {despachos.map(d => (
                <tr key={d.id} onClick={() => abrirDetalle(d)} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-2 text-ht-navy font-medium">{d.titulo}</td>
                  <td className="px-4 py-2 text-gray-600">{fecha(d.primera_fecha)}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {d.puntos.length} {d.puntos.length === 1 ? 'parada' : 'paradas'}
                    {d.puntos.length > 0 && d.puntos.every(p => p.completado) && (
                      <span className="ml-1 text-green-600">✓</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {d.negocio_titulo && `Negocio: ${d.negocio_titulo}`}
                    {d.caso_postventa_titulo && `Postventa: ${d.caso_postventa_titulo}`}
                    {!d.negocio_titulo && !d.caso_postventa_titulo && 'Interno'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${badgeEstado(d.estado)}`}>{d.estado.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{d.creado_por_nombre}</td>
                </tr>
              ))}
              {despachos.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin despachos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNuevo && (
        <NuevoDespacho negocioIdInicial={searchParams.get('negocio_id')} casoPostventaIdInicial={searchParams.get('caso_postventa_id')} lugares={lugares}
          onClose={() => setShowNuevo(false)} onCreado={() => { setShowNuevo(false); cargar(); }} />
      )}

      {detalle && (
        <DetalleDespacho despacho={detalle} puedeGestionar={puedeGestionar} lugares={lugares}
          onClose={() => setDetalle(null)}
          onCambio={async () => { await cargar(); const r = await api.get(`/despachos/${detalle.id}`); setDetalle(r.data); }} />
      )}
    </div>
  );
}

function Modal({ children, onClose, ancho = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`bg-white rounded-lg p-6 w-full ${ancho} max-h-[90vh] overflow-y-auto`}>{children}</div>
    </div>
  );
}

function CamposPunto({ punto, onChange, lugares = [] }) {
  const set = (campo, val) => onChange({ ...punto, [campo]: val });
  const elegirLugar = id => {
    const lugar = lugares.find(l => String(l.id) === id);
    if (!lugar) return;
    onChange({
      ...punto,
      direccion: lugar.direccion, comuna: lugar.comuna,
      contacto_nombre: lugar.contacto_nombre || punto.contacto_nombre,
      contacto_telefono: lugar.contacto_telefono || punto.contacto_telefono,
    });
  };
  return (
    <div className="border border-gray-200 rounded p-3 space-y-2">
      {lugares.length > 0 && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">Lugar frecuente <span className="text-gray-400">(opcional, autocompleta)</span></label>
          <select value="" onChange={e => elegirLugar(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">— Elegir un lugar —</option>
            {lugares.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Tipo</label>
          <select value={punto.tipo} onChange={e => set('tipo', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            {TIPOS_PUNTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Fecha</label>
          <input required type="date" value={punto.fecha} onChange={e => set('fecha', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Dirección</label>
        <input required value={punto.direccion} onChange={e => set('direccion', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Comuna</label>
        <input required value={punto.comuna} onChange={e => set('comuna', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Contacto</label>
          <input required value={punto.contacto_nombre} onChange={e => set('contacto_nombre', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Teléfono <span className="text-gray-400">(opcional)</span></label>
          <input value={punto.contacto_telefono} onChange={e => set('contacto_telefono', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Documento</label>
          <select value={punto.documento_tipo} onChange={e => set('documento_tipo', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">N° documento <span className="text-gray-400">(opcional)</span></label>
          <input value={punto.documento_numero} onChange={e => set('documento_numero', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Duración estimada (min) <span className="text-gray-400">(opcional)</span></label>
        <input type="number" min="0" value={punto.duracion_estimada_min} onChange={e => set('duracion_estimada_min', e.target.value)}
          className="w-32 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
      </div>
    </div>
  );
}

function NuevoDespacho({ negocioIdInicial, casoPostventaIdInicial, lugares, onClose, onCreado }) {
  const [titulo, setTitulo] = useState('');
  const [q, setQ] = useState(''); const [resultados, setResultados] = useState([]);
  const [negocio, setNegocio] = useState(null);
  const [caso, setCaso] = useState(null);
  const [puntos, setPuntos] = useState([puntoVacio()]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (negocioIdInicial) api.get(`/negocios/${negocioIdInicial}`).then(r => setNegocio(r.data)).catch(() => {});
    if (casoPostventaIdInicial) api.get(`/postventa/${casoPostventaIdInicial}`).then(r => setCaso(r.data)).catch(() => {});
  }, [negocioIdInicial, casoPostventaIdInicial]);

  const buscarNegocio = async val => {
    setQ(val);
    if (val.length < 2) { setResultados([]); return; }
    try { setResultados((await api.get('/negocios', { params: { q: val } })).data.slice(0, 8)); } catch { /* */ }
  };

  const agregarPunto = () => setPuntos([...puntos, puntoVacio()]);
  const quitarPunto = i => setPuntos(puntos.filter((_, idx) => idx !== i));
  const cambiarPunto = (i, nuevo) => setPuntos(puntos.map((p, idx) => idx === i ? nuevo : p));

  const crear = async e => {
    e.preventDefault(); setError(''); setGuardando(true);
    try {
      await api.post('/despachos', {
        titulo,
        negocio_id: negocio?.id,
        caso_postventa_id: caso?.id,
        puntos: puntos.map(p => ({ ...p, duracion_estimada_min: p.duracion_estimada_min ? Number(p.duracion_estimada_min) : undefined })),
      });
      onCreado();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear el despacho.'); }
    finally { setGuardando(false); }
  };

  return (
    <Modal onClose={onClose} ancho="max-w-2xl">
      <h2 className="font-semibold text-ht-navy text-lg mb-3">Nuevo despacho</h2>
      {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      <form onSubmit={crear} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Título de la ruta</label>
          <input required value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Ruta retiro/entrega 01-08"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>

        {caso ? (
          <div className="flex items-center justify-between border border-gray-300 rounded px-3 py-2 text-sm">
            <span>Caso de postventa: {caso.titulo}</span>
          </div>
        ) : (
          <div>
            <label className="block text-sm text-gray-700 mb-1">Negocio relacionado <span className="text-gray-400">(opcional — vacío para despacho interno)</span></label>
            {negocio ? (
              <div className="flex items-center justify-between border border-gray-300 rounded px-3 py-2 text-sm">
                <span>{negocio.titulo} · {negocio.contacto_nombre} {negocio.contacto_apellido || ''}</span>
                <button type="button" onClick={() => setNegocio(null)} className="text-ht-accent text-xs hover:underline">quitar</button>
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
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm text-gray-700">Paradas de la ruta</label>
            <button type="button" onClick={agregarPunto} className="text-xs text-ht-accent hover:underline">+ Agregar parada</button>
          </div>
          <div className="space-y-3">
            {puntos.map((p, i) => (
              <div key={i} className="relative">
                <CamposPunto punto={p} onChange={n => cambiarPunto(i, n)} lugares={lugares} />
                {puntos.length > 1 && (
                  <button type="button" onClick={() => quitarPunto(i)}
                    className="absolute top-2 right-2 text-xs text-red-500 hover:underline">Quitar</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={guardando} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-60">
            {guardando ? 'Creando...' : 'Crear despacho'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

// puedeSubir: si además de ver la foto puede subir/reemplazarla (gestor) —
// en ese caso se muestra como botones apilados a la derecha, no como links.
function FotoPunto({ punto, onSubida, puedeSubir }) {
  const [url, setUrl] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const verFoto = async () => {
    setCargando(true); setError('');
    try {
      const { data } = await api.get(`/despachos/puntos/${punto.id}/foto`, { responseType: 'blob' });
      setUrl(URL.createObjectURL(data));
    } catch { setError('No se pudo obtener la foto.'); }
    finally { setCargando(false); }
  };

  const subirFoto = async e => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setCargando(true); setError('');
    const form = new FormData(); form.append('archivo', archivo);
    try {
      await api.post(`/despachos/puntos/${punto.id}/foto`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSubida();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo subir la foto.'); }
    finally { setCargando(false); e.target.value = ''; }
  };

  if (url) {
    return <img src={url} alt="Foto de respaldo" className="max-h-40 rounded border border-gray-200 mt-1" />;
  }

  if (puedeSubir) {
    return (
      <div className="flex flex-col items-end gap-1.5 max-w-[140px]">
        {error && <p className="text-xs text-red-600 text-right">{error}</p>}
        {punto.tiene_foto && (
          <button type="button" onClick={verFoto} disabled={cargando}
            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60">
            {cargando ? 'Cargando...' : 'Ver foto'}
          </button>
        )}
        <label className="text-xs px-2 py-1 rounded border border-ht-accent text-ht-navy hover:bg-ht-accent/10 cursor-pointer whitespace-nowrap">
          {punto.tiene_foto ? 'Reemplazar foto' : 'Subir foto'}
          <input type="file" accept="image/*" onChange={subirFoto} className="hidden" disabled={cargando} />
        </label>
      </div>
    );
  }

  return (
    <div className="mt-1">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {punto.tiene_foto && (
        <button type="button" onClick={verFoto} disabled={cargando} className="text-xs text-ht-accent hover:underline">
          {cargando ? 'Cargando...' : 'Ver foto de respaldo'}
        </button>
      )}
    </div>
  );
}

// Adapta una parada tal como llega del backend (fecha ISO completa,
// duración numérica o null) al formato que espera CamposPunto (fecha
// AAAA-MM-DD, duración como string para el input).
const puntoParaEditar = p => ({
  tipo: p.tipo, direccion: p.direccion, comuna: p.comuna, fecha: p.fecha.slice(0, 10),
  contacto_nombre: p.contacto_nombre, contacto_telefono: p.contacto_telefono || '',
  documento_tipo: p.documento_tipo, documento_numero: p.documento_numero || '',
  duracion_estimada_min: p.duracion_estimada_min ?? '',
});

function DetalleDespacho({ despacho, puedeGestionar, lugares, onClose, onCambio }) {
  const [error, setError] = useState('');
  const [mostrarAgregar, setMostrarAgregar] = useState(false);
  const [nuevoPunto, setNuevoPunto] = useState(puntoVacio());
  const [editandoId, setEditandoId] = useState(null);
  const [formEdicion, setFormEdicion] = useState(null);

  const completar = async (punto, completado) => {
    try { await api.put(`/despachos/puntos/${punto.id}/completar`, { completado }); onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo actualizar la parada.'); }
  };

  const empezarEdicion = punto => { setEditandoId(punto.id); setFormEdicion(puntoParaEditar(punto)); };
  const cancelarEdicion = () => { setEditandoId(null); setFormEdicion(null); };
  const guardarEdicion = async e => {
    e.preventDefault();
    try {
      await api.put(`/despachos/puntos/${editandoId}`, {
        ...formEdicion,
        duracion_estimada_min: formEdicion.duracion_estimada_min ? Number(formEdicion.duracion_estimada_min) : undefined,
      });
      cancelarEdicion(); onCambio();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar la parada.'); }
  };

  const cambiarEstado = async estado => {
    try { await api.put(`/despachos/${despacho.id}`, { estado }); onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo actualizar el estado.'); }
  };

  const eliminarPunto = async punto => {
    if (!window.confirm('¿Eliminar esta parada?')) return;
    try { await api.delete(`/despachos/puntos/${punto.id}`); onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo eliminar la parada.'); }
  };

  const agregarPunto = async e => {
    e.preventDefault();
    try {
      await api.post(`/despachos/${despacho.id}/puntos`, {
        ...nuevoPunto,
        duracion_estimada_min: nuevoPunto.duracion_estimada_min ? Number(nuevoPunto.duracion_estimada_min) : undefined,
      });
      setMostrarAgregar(false); setNuevoPunto(puntoVacio()); onCambio();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo agregar la parada.'); }
  };

  return (
    <Modal onClose={onClose} ancho="max-w-2xl">
      <div className="flex items-start justify-between mb-1">
        <h2 className="font-semibold text-ht-navy text-lg">{despacho.titulo}</h2>
        {puedeGestionar ? (
          <select value={despacho.estado} onChange={e => cambiarEstado(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 capitalize focus:outline-none focus:ring-2 focus:ring-ht-accent">
            {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
          </select>
        ) : (
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${badgeEstado(despacho.estado)}`}>{despacho.estado.replace('_', ' ')}</span>
        )}
      </div>
      {(despacho.negocio_titulo || despacho.caso_postventa_titulo) && (
        <p className="text-xs text-gray-400 mb-3">
          {despacho.negocio_titulo && (
            <Link to={`/negocios/${despacho.negocio_id}`} className="text-ht-accent hover:underline">Ver negocio: {despacho.negocio_titulo} →</Link>
          )}
          {despacho.caso_postventa_titulo && `Postventa: ${despacho.caso_postventa_titulo}`}
        </p>
      )}
      {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="space-y-3">
        {despacho.puntos.map(p => (
          <div key={p.id} className="border border-gray-200 rounded p-3">
            {editandoId === p.id ? (
              <form onSubmit={guardarEdicion} className="space-y-2">
                <CamposPunto punto={formEdicion} onChange={setFormEdicion} lugares={lugares} />
                <div className="flex gap-2">
                  <button type="submit" className="bg-ht-accent text-ht-navy px-3 py-1.5 rounded text-sm font-medium hover:bg-ht-accent/90">Guardar</button>
                  <button type="button" onClick={cancelarEdicion} className="px-3 py-1.5 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-ht-accent/15 text-ht-navy capitalize mr-2">{p.tipo}</span>
                    <span className="text-sm font-medium text-ht-navy">{p.direccion}, {p.comuna}</span>
                  </div>
                  {puedeGestionar && (
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <div className="flex gap-2">
                        <button onClick={() => empezarEdicion(p)} className="text-xs text-ht-accent hover:underline">Editar</button>
                        <button onClick={() => eliminarPunto(p)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                      </div>
                      <FotoPunto punto={p} onSubida={onCambio} puedeSubir />
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">{fecha(p.fecha)} · {p.contacto_nombre}{p.contacto_telefono ? ` · ${p.contacto_telefono}` : ''}</div>
                <div className="text-xs text-gray-500">
                  {TIPOS_DOCUMENTO.find(t => t.value === p.documento_tipo)?.label}{p.documento_numero ? ` ${p.documento_numero}` : ''}
                  {p.duracion_estimada_min ? ` · ~${p.duracion_estimada_min} min` : ''}
                </div>
                {puedeGestionar ? (
                  <>
                    <label className={`flex items-center gap-2 text-xs mt-2 ${!p.tiene_foto && !p.completado ? 'text-gray-400' : 'text-gray-700'}`}>
                      <input type="checkbox" checked={p.completado} disabled={!p.tiene_foto && !p.completado}
                        onChange={e => completar(p, e.target.checked)} />
                      Parada completada
                    </label>
                    {!p.tiene_foto && !p.completado && (
                      <p className="text-[11px] text-amber-600 mt-0.5">Sube la foto de respaldo para poder completarla.</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-xs mt-2">{p.completado ? <span className="text-green-600">✓ Completada</span> : <span className="text-gray-400">Pendiente</span>}</div>
                    <FotoPunto punto={p} onSubida={onCambio} puedeSubir={false} />
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {puedeGestionar && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {mostrarAgregar ? (
            <form onSubmit={agregarPunto} className="space-y-2">
              <CamposPunto punto={nuevoPunto} onChange={setNuevoPunto} lugares={lugares} />
              <div className="flex gap-2">
                <button type="submit" className="bg-ht-accent text-ht-navy px-3 py-1.5 rounded text-sm font-medium hover:bg-ht-accent/90">Agregar</button>
                <button type="button" onClick={() => setMostrarAgregar(false)} className="px-3 py-1.5 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setMostrarAgregar(true)} className="text-sm text-ht-accent hover:underline">+ Agregar otra parada</button>
          )}
        </div>
      )}
    </Modal>
  );
}
