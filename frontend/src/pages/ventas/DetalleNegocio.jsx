import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import NotasYTareas from '../../components/NotasYTareas';
import SeguimientoNegocio from '../../components/SeguimientoNegocio';
import { formatFechaHora } from '../../utils/fecha';
import { slaEstado, ESTILO_SLA } from '../../utils/sla';

const money = v => v ? `$${Number(v).toLocaleString('es-CL')}` : '—';
const fecha = formatFechaHora;
const numeroCompleto = (numero, version) => `${numero}-${String(version).padStart(2, '0')}`;
// Reasignar el vendedor dueño del negocio: administrador o jefe comercial —
// no el propio vendedor dueño, aunque n.puede_editar sí lo deje editar el
// resto de los campos.
const PUEDE_REASIGNAR_VENDEDOR = ['administrador', 'jefe_comercial'];

export default function DetalleNegocio() {
  const { id } = useParams();
  const { user } = useAuth();
  const [n, setN] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [causas, setCausas] = useState([]);
  const [error, setError] = useState('');
  const [prob, setProb] = useState('');
  const [monto, setMonto] = useState('');
  const [fechaEstimada, setFechaEstimada] = useState('');
  const [fechaCompromiso, setFechaCompromiso] = useState('');
  const [modalPerdido, setModalPerdido] = useState(null); // etapa perdida
  const [causaSel, setCausaSel] = useState(''); const [detalle, setDetalle] = useState('');

  const [cots, setCots] = useState([]);
  const [encuesta, setEncuesta] = useState(null);
  const [contactoNombre, setContactoNombre] = useState('');
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [vendedores, setVendedores] = useState([]);
  const [guardandoVendedor, setGuardandoVendedor] = useState(false);
  const cargar = async () => {
    try {
      const { data } = await api.get(`/negocios/${id}`); setN(data); setProb(data.probabilidad_cierre ?? '');
      setMonto(data.monto_estimado ?? '');
      setFechaEstimada(data.fecha_cierre_estimada ? data.fecha_cierre_estimada.slice(0, 10) : '');
      setFechaCompromiso(data.fecha_compromiso ? data.fecha_compromiso.slice(0, 10) : '');
      setContactoNombre(`${data.contacto_nombre} ${data.contacto_apellido || ''}`.trim());
      setEmpresaNombre(data.empresa_nombre || '');
      setCots((await api.get('/cotizaciones', { params: { negocio_id: id } })).data);
      if (data.etapa_tipo === 'ganada') setEncuesta((await api.get(`/negocios/${id}/encuesta`)).data);
    }
    catch { setError('No se pudo cargar el negocio.'); }
  };
  useEffect(() => { cargar(); }, [id]);
  useEffect(() => {
    if (PUEDE_REASIGNAR_VENDEDOR.includes(user?.rol)) api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {});
  }, [user]);
  useEffect(() => {
    // Las etapas deben ser las del pipeline al que pertenece ESTE negocio, no
    // siempre las de "Ventas Directas" — antes de tener n.pipeline_id no se
    // puede pedir esto todavía.
    if (!n) return;
    api.get('/config/pipeline-etapas', { params: { pipeline_id: n.pipeline_id } }).then(r => setEtapas(r.data.filter(e => e.activo))).catch(() => {});
    api.get('/config/causas-no-cierre').then(r => setCausas(r.data.filter(c => c.activo))).catch(() => {});
  }, [n?.pipeline_id]); // eslint-disable-line

  const cambiarEtapa = async (etapa, extra = {}) => {
    try { await api.put(`/negocios/${id}/etapa`, { etapa_id: etapa.id, ...extra }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar la etapa.'); }
  };

  const guardarMonto = async () => {
    try { await api.put(`/negocios/${id}`, { monto_estimado: monto === '' ? null : Number(monto) }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar el monto estimado.'); }
  };

  const guardarProb = async () => {
    try { await api.put(`/negocios/${id}`, { probabilidad_cierre: prob === '' ? null : Number(prob) }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar la probabilidad.'); }
  };

  const guardarFechaEstimada = async () => {
    try { await api.put(`/negocios/${id}`, { fecha_cierre_estimada: fechaEstimada || null }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar la fecha estimada.'); }
  };

  const guardarFechaCompromiso = async () => {
    try { await api.put(`/negocios/${id}`, { fecha_compromiso: fechaCompromiso || null }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar la fecha de compromiso.'); }
  };

  const cambiarContacto = async contacto => {
    try { await api.put(`/negocios/${id}`, { contacto_id: contacto.id }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar el contacto.'); }
  };

  const cambiarEmpresa = async empresa => {
    try { await api.put(`/negocios/${id}`, { empresa_id: empresa.id }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar la empresa.'); }
  };

  const cambiarVendedor = async vendedorId => {
    setGuardandoVendedor(true);
    try { await api.put(`/negocios/${id}`, { vendedor_id: Number(vendedorId) }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar el vendedor.'); }
    finally { setGuardandoVendedor(false); }
  };

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!n) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <Link to="/pipeline" className="text-sm text-ht-accent hover:underline">← Pipeline</Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-2xl font-bold text-ht-navy">{n.titulo}</h1>
        <span className="text-sm px-3 py-1 rounded-full bg-ht-accent/15 text-ht-navy">{n.etapa_nombre}</span>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-3">Datos</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {n.puede_editar ? (
                <div>
                  <dt className="text-xs text-gray-500 mb-1">Contacto</dt>
                  <dd><BuscadorContacto value={contactoNombre} onChange={setContactoNombre} onElegir={cambiarContacto} /></dd>
                </div>
              ) : <Dato label="Contacto" val={`${n.contacto_nombre} ${n.contacto_apellido || ''}`} />}
              {n.puede_editar ? (
                <div>
                  <dt className="text-xs text-gray-500 mb-1">Empresa</dt>
                  <dd><BuscadorEmpresa value={empresaNombre} onChange={setEmpresaNombre} onElegir={cambiarEmpresa} /></dd>
                </div>
              ) : <Dato label="Empresa" val={n.empresa_nombre} />}
              <Dato label="Email" val={n.contacto_email} />
              <Dato label="Teléfono" val={n.contacto_telefono} />
              {PUEDE_REASIGNAR_VENDEDOR.includes(user?.rol) ? (
                <div>
                  <dt className="text-xs text-gray-500 mb-1">Vendedor</dt>
                  <dd>
                    <select value={n.vendedor_id} disabled={guardandoVendedor}
                      onChange={e => cambiarVendedor(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent disabled:opacity-50">
                      {!vendedores.some(v => v.id === n.vendedor_id) && (
                        <option value={n.vendedor_id}>{n.vendedor_nombre}</option>
                      )}
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  </dd>
                </div>
              ) : <Dato label="Vendedor" val={n.vendedor_nombre} />}
              {n.etapa_tipo === 'perdida' && <Dato label="Causa no cierre" val={n.causa_nombre} />}
              {n.fecha_cierre && <Dato label="Cierre" val={fecha(n.fecha_cierre)} />}
            </dl>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-ht-navy">Cotizaciones</h2>
              <div className="flex gap-2">
                <Link to={`/despacho?negocio_id=${id}`} className="text-sm border border-ht-navy text-ht-navy px-3 py-1.5 rounded hover:bg-ht-navy/5">Crear despacho</Link>
                <Link to={`/postventa?negocio_id=${id}`} className="text-sm border border-ht-navy text-ht-navy px-3 py-1.5 rounded hover:bg-ht-navy/5">Crear caso de postventa</Link>
                {n.puede_editar && <Link to={`/negocios/${id}/cotizar`} className="text-sm bg-ht-accent text-ht-navy px-3 py-1.5 rounded hover:bg-ht-accent/90">+ Cotizar</Link>}
              </div>
            </div>
            {cots.length === 0 ? <p className="text-sm text-gray-400">Sin cotizaciones.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {cots.map(c => (
                    <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5"><Link to={`/cotizaciones/${c.id}`} className="text-ht-navy hover:underline">{numeroCompleto(c.numero, c.version)}</Link></td>
                      <td className="py-1.5 capitalize text-gray-500">{c.estado}</td>
                      <td className="py-1.5 text-right text-ht-navy">{money(c.neto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {n.etapa_tipo === 'ganada' && encuesta && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="font-semibold text-ht-navy mb-3">Encuesta de satisfacción</h2>
              {encuesta.respondida_en ? (
                <div className="text-sm">
                  <div className="text-ht-navy font-medium mb-1">Puntaje: {encuesta.puntaje}/10</div>
                  {encuesta.comentario && <div className="text-gray-600">"{encuesta.comentario}"</div>}
                  <div className="text-xs text-gray-400 mt-1">Respondida el {fecha(encuesta.respondida_en)}</div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Aún sin respuesta. Comparte este link con el cliente:{' '}
                  <span className="text-ht-navy break-all">{window.location.origin}/encuesta/{encuesta.token_publico}</span>
                  {encuesta.recordatorio_enviado_en && <span className="block text-xs text-gray-400 mt-1">Recordatorio enviado el {fecha(encuesta.recordatorio_enviado_en)}</span>}
                </p>
              )}
            </div>
          )}

          <SeguimientoNegocio negocioId={Number(id)} puedeEditar={n.puede_editar} />

          <NotasYTareas negocioId={Number(id)} vendedorId={n.vendedor_id} />

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-3">Línea de tiempo</h2>
            {n.timeline.length === 0 ? <p className="text-sm text-gray-400">Sin eventos.</p> : (
              <ul className="space-y-3">
                {n.timeline.map(t => (
                  <li key={t.id} className="text-sm border-l-2 border-ht-accent/40 pl-3">
                    <div className="text-ht-navy">{t.descripcion}</div>
                    <div className="text-xs text-gray-400">{fecha(t.created_at)} · {t.usuario_nombre || 'sistema'} · {t.tipo}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-3">Etapa</h2>
            {!n.puede_editar ? (
              <p className="text-sm text-gray-400">Solo el vendedor dueño puede editar.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {etapas.map(e => (
                  <button key={e.id} disabled={e.id === n.etapa_id}
                    onClick={() => e.tipo === 'perdida' ? (setModalPerdido(e), setCausaSel(''), setDetalle('')) : cambiarEtapa(e)}
                    className={`text-sm px-3 py-2 rounded border text-left flex justify-between ${e.id === n.etapa_id ? 'bg-ht-accent text-ht-navy border-ht-accent' : 'border-gray-300 text-gray-700 hover:bg-slate-50'}`}>
                    <span>{e.nombre}</span><span className="opacity-70">{e.probabilidad_cierre}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-2">Monto estimado (neto, sin IVA)</h2>
            <p className="text-xs text-gray-500 mb-2">Se sincroniza solo con el neto de la cotización al generarla o actualizarla; puedes ajustarlo a mano en cualquier momento.</p>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input type="number" min="0" value={monto} disabled={!n.puede_editar}
                onChange={e => setMonto(e.target.value)}
                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              {n.puede_editar && <button onClick={guardarMonto} className="bg-ht-accent text-ht-navy px-3 py-2 rounded text-sm hover:bg-ht-accent/90">Guardar</button>}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-2">Probabilidad de cierre</h2>
            <p className="text-xs text-gray-500 mb-2">Hereda el % de la etapa; puedes ajustarlo para esta oportunidad.</p>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="100" value={prob} disabled={!n.puede_editar}
                onChange={e => setProb(e.target.value)}
                className="w-24 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              <span className="text-gray-500">%</span>
              {n.puede_editar && <button onClick={guardarProb} className="ml-auto bg-ht-accent text-ht-navy px-3 py-2 rounded text-sm hover:bg-ht-accent/90">Guardar</button>}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-2">Fecha estimada de cierre</h2>
            <p className="text-xs text-gray-500 mb-2">Para forecasting; se usa como filtro en Reportes.</p>
            <div className="flex items-center gap-2">
              <input type="date" value={fechaEstimada} disabled={!n.puede_editar}
                onChange={e => setFechaEstimada(e.target.value)}
                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              {n.puede_editar && <button onClick={guardarFechaEstimada} className="bg-ht-accent text-ht-navy px-3 py-2 rounded text-sm hover:bg-ht-accent/90">Guardar</button>}
            </div>
          </div>

          <div className={`bg-white border border-gray-200 rounded-lg p-5 ${ESTILO_SLA[slaEstado(n.fecha_compromiso)]?.borde || ''}`}>
            <h2 className="font-semibold text-ht-navy mb-2">Fecha de compromiso</h2>
            <p className="text-xs text-gray-500 mb-2">Fecha pactada con el cliente (ej. entrega). Se muestra con alerta si está vencida o próxima.</p>
            <div className="flex items-center gap-2">
              <input type="date" value={fechaCompromiso} disabled={!n.puede_editar}
                onChange={e => setFechaCompromiso(e.target.value)}
                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              {n.puede_editar && <button onClick={guardarFechaCompromiso} className="bg-ht-accent text-ht-navy px-3 py-2 rounded text-sm hover:bg-ht-accent/90">Guardar</button>}
            </div>
            {n.fecha_compromiso && ESTILO_SLA[slaEstado(n.fecha_compromiso)]?.label && (
              <p className={`text-xs mt-2 ${ESTILO_SLA[slaEstado(n.fecha_compromiso)].texto}`}>{ESTILO_SLA[slaEstado(n.fecha_compromiso)].label}</p>
            )}
          </div>
        </div>
      </div>

      {modalPerdido && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setModalPerdido(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="font-semibold text-ht-navy text-lg mb-3">Marcar como {modalPerdido.nombre}</h2>
            <select value={causaSel} onChange={e => setCausaSel(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent">
              <option value="">— Selecciona causa —</option>
              {causas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <textarea value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Detalle (opcional)" rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            <div className="flex gap-2">
              <button disabled={!causaSel}
                onClick={async () => { await cambiarEtapa(modalPerdido, { causa_no_cierre_id: Number(causaSel), causa_no_cierre_detalle: detalle }); setModalPerdido(null); }}
                className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">Confirmar</button>
              <button onClick={() => setModalPerdido(null)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dato({ label, val }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-ht-navy">{val || '—'}</dd>
    </div>
  );
}

function BuscadorContacto({ value, onChange, onElegir }) {
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);

  const buscar = async val => {
    onChange(val);
    if (val.length < 2) { setResultados([]); return; }
    try { setResultados((await api.get('/contactos', { params: { q: val } })).data.slice(0, 15)); }
    catch { /* */ }
  };

  return (
    <div className="relative">
      <input value={value} onChange={e => buscar(e.target.value)}
        onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar por nombre, email o teléfono…"
        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
      {abierto && resultados.length > 0 && (
        <div className="absolute z-10 bg-white border border-gray-200 rounded mt-1 w-full max-h-64 overflow-y-auto shadow">
          {resultados.map(c => (
            <button key={c.id} type="button" onMouseDown={() => { onElegir(c); setResultados([]); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
              <span className="text-ht-navy">{c.nombre} {c.apellido || ''}</span>
              {c.empresa_nombre && <span className="text-gray-400"> · {c.empresa_nombre}</span>}
            </button>
          ))}
        </div>
      )}
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
        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
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
