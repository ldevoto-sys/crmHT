import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });

export default function DetalleCotizacion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cot, setCot] = useState(null);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [etapas, setEtapas] = useState([]);
  const [causas, setCausas] = useState([]);
  const [probEnEdicion, setProbEnEdicion] = useState('');
  const [modalPerdido, setModalPerdido] = useState(null); // { etapaId }
  const [causaSel, setCausaSel] = useState(''); const [detalle, setDetalle] = useState('');

  const cargar = async () => {
    try { setCot((await api.get(`/cotizaciones/${id}`)).data); }
    catch { setError('No se pudo cargar la cotización.'); }
  };
  useEffect(() => { cargar(); }, [id]);
  useEffect(() => {
    api.get('/config/pipeline-etapas').then(r => setEtapas(r.data.filter(e => e.activo))).catch(() => {});
    api.get('/config/causas-no-cierre').then(r => setCausas(r.data.filter(c => c.activo))).catch(() => {});
  }, []);
  useEffect(() => { if (cot) setProbEnEdicion(cot.negocio_probabilidad_cierre ?? ''); }, [cot?.negocio_probabilidad_cierre]);

  const cambiarEtapa = async etapaId => {
    const etapa = etapas.find(e => e.id === Number(etapaId));
    if (!etapa) return;
    if (etapa.tipo === 'perdida') { setModalPerdido({ etapaId: etapa.id }); setCausaSel(''); setDetalle(''); return; }
    await accion(() => api.put(`/negocios/${cot.negocio_id}/etapa`, { etapa_id: etapa.id }));
  };
  const confirmarPerdido = async () => {
    if (!causaSel) return;
    await accion(() => api.put(`/negocios/${cot.negocio_id}/etapa`, {
      etapa_id: modalPerdido.etapaId, causa_no_cierre_id: Number(causaSel), causa_no_cierre_detalle: detalle,
    }));
    setModalPerdido(null);
  };
  const guardarProbabilidad = async () => {
    const v = Number(probEnEdicion);
    if (Number.isNaN(v) || v < 0 || v > 100) { setError('El % de cierre debe estar entre 0 y 100.'); return; }
    if (v === cot.negocio_probabilidad_cierre) return;
    await accion(() => api.put(`/negocios/${cot.negocio_id}`, { probabilidad_cierre: v }));
  };

  const descargarPDF = async () => {
    try {
      const { data } = await api.get(`/cotizaciones/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch { setError('No se pudo generar el PDF.'); }
  };

  const copiarLink = () => {
    const link = `${window.location.origin}/c/${cot.token_publico}`;
    navigator.clipboard.writeText(link).then(() => setMsg('Link público copiado al portapapeles.'));
  };

  const [enviando, setEnviando] = useState(false);
  const enviarCorreo = async () => {
    setError(''); setMsg(''); setEnviando(true);
    try {
      const { data } = await api.post(`/cotizaciones/${id}/enviar`);
      setMsg(data.message);
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo enviar el correo.'); }
    finally { setEnviando(false); }
  };

  const accion = async (fn) => { setError(''); setMsg(''); try { await fn(); cargar(); } catch (err) { setError(err.response?.data?.error || 'Error.'); } };

  if (error && !cot) return <div className="p-6 text-red-600">{error}</div>;
  if (!cot) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <Link to={`/negocios/${cot.negocio_id}`} className="text-sm text-ht-accent hover:underline">← {cot.negocio_titulo}</Link>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-2xl font-bold text-ht-navy">{cot.numero} <span className="text-gray-400 text-lg">v{cot.version}</span></h1>
        <span className="text-sm px-3 py-1 rounded-full bg-ht-accent/15 text-ht-navy capitalize">{cot.estado}</span>
      </div>
      <p className="text-gray-600 text-sm mb-5 min-h-[1.25rem]">{cot.titulo}</p>

      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {cot.requiere_aprobacion && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 flex items-center justify-between">
          <span>Descuento {Number(cot.descuento_pct)}% supera el tope ({cot.descuento_max}%). Requiere aprobación de un administrador para enviarse.</span>
          {user?.rol === 'administrador'
            ? <button onClick={() => accion(() => api.post(`/cotizaciones/${id}/aprobar-descuento`))} className="ml-3 bg-ht-navy text-white px-3 py-1.5 rounded text-xs hover:bg-ht-navy/90">Aprobar</button>
            : cot.puede_editar && <button onClick={() => accion(() => api.post(`/cotizaciones/${id}/solicitar-aprobacion-descuento`))} className="ml-3 border border-ht-navy text-ht-navy px-3 py-1.5 rounded text-xs">Solicitar aprobación</button>}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white border border-gray-200 rounded-lg p-5">
          <div className="text-sm text-gray-500 mb-3">
            {cot.empresa_nombre && <div className="text-ht-navy font-medium">{cot.empresa_nombre}</div>}
            {cot.contacto_nombre} {cot.contacto_apellido}
          </div>
          <table className="w-full text-sm">
            <thead className="text-gray-500"><tr>
              <th className="text-left py-1 font-medium">Descripción</th>
              <th className="text-right py-1 font-medium">Cant.</th>
              <th className="text-right py-1 font-medium">P. unitario</th>
              <th className="text-right py-1 font-medium">Total</th>
            </tr></thead>
            <tbody>
              {cot.items.map(it => (
                <tr key={it.id} className="border-t border-gray-100">
                  <td className="py-1.5 text-ht-navy">{it.descripcion || it.producto_nombre}</td>
                  <td className="py-1.5 text-right">{Number(it.cantidad)}</td>
                  <td className="py-1.5 text-right">{money(it.precio_unitario)}</td>
                  <td className="py-1.5 text-right">{money(it.total_linea)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 border-t border-gray-200 pt-3 text-sm">
            {(() => {
              const desc = Number(cot.descuento_pct) || 0, iva = Number(cot.iva_pct) || 0;
              const descMonto = Math.round(Number(cot.subtotal) * desc / 100);
              const neto = Number(cot.subtotal) - descMonto;
              const ivaMonto = Math.round(neto * iva / 100);
              return (
                <>
                  <div className="flex justify-between text-gray-600"><span>Subtotal neto</span><span>{money(cot.subtotal)}</span></div>
                  {desc > 0 && <div className="flex justify-between text-gray-600"><span>Descuento ({desc}%)</span><span>−{money(descMonto)}</span></div>}
                  {iva > 0 && <div className="flex justify-between text-gray-600"><span>IVA ({iva}%)</span><span>{money(ivaMonto)}</span></div>}
                  <div className="flex justify-between font-bold text-ht-navy text-lg mt-1"><span>Total</span><span>{money(cot.total)}</span></div>
                </>
              );
            })()}
          </div>
          {cot.condiciones && <p className="mt-4 text-xs text-gray-500 whitespace-pre-wrap">{cot.condiciones}</p>}
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5 h-fit space-y-2">
            <h2 className="font-semibold text-ht-navy mb-1">Acciones</h2>
            <button onClick={descargarPDF} className="w-full text-sm px-3 py-2 rounded bg-ht-navy text-white hover:bg-ht-navy/90">Descargar PDF</button>
            {cot.puede_editar && (
              <button onClick={enviarCorreo} disabled={enviando}
                className="w-full text-sm px-3 py-2 rounded border border-ht-accent text-ht-navy hover:bg-ht-accent/5 disabled:opacity-50">
                {enviando ? 'Enviando…' : 'Enviar por correo'}
              </button>
            )}
            <button onClick={copiarLink} className="w-full text-sm px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-slate-50">Copiar link público</button>
            <a href={`/c/${cot.token_publico}`} target="_blank" rel="noreferrer" className="block w-full text-center text-sm px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-slate-50">Ver como cliente</a>
            {cot.puede_editar && cot.estado === 'borrador' && (
              <Link to={`/cotizaciones/${id}/editar`} className="block w-full text-center text-sm px-3 py-2 rounded bg-ht-navy text-white hover:bg-ht-navy/90">Editar</Link>
            )}
            {cot.puede_editar && (
              <button onClick={() => accion(async () => { const { data } = await api.post(`/cotizaciones/${id}/nueva-version`); navigate(`/cotizaciones/${data.id}/editar`); })}
                className="w-full text-sm px-3 py-2 rounded border border-ht-accent text-ht-navy hover:bg-ht-accent/5">Nueva versión</button>
            )}
            <p className="text-xs text-gray-400 pt-2">Validez: {cot.validez_dias} días</p>
          </div>

          {cot.puede_editar && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 h-fit space-y-3">
              <h2 className="font-semibold text-ht-navy">Pipeline del negocio</h2>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Etapa</label>
                <select value={cot.negocio_etapa_id || ''} onChange={e => cambiarEtapa(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
                  {etapas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">% de cierre</label>
                <div className="flex gap-2">
                  <input type="number" min="0" max="100" value={probEnEdicion} onChange={e => setProbEnEdicion(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                  <button onClick={guardarProbabilidad} className="px-3 py-1.5 rounded text-sm border border-gray-300 text-gray-700 hover:bg-slate-50 flex-shrink-0">
                    Guardar
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">El monto del negocio se actualiza desde la cotización, no aquí.</p>
            </div>
          )}
        </div>
      </div>

      {modalPerdido && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setModalPerdido(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="font-semibold text-ht-navy text-lg mb-3">Marcar como perdido</h2>
            <p className="text-sm text-gray-500 mb-3">La causa de no cierre es obligatoria.</p>
            <select value={causaSel} onChange={e => setCausaSel(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent">
              <option value="">— Selecciona causa —</option>
              {causas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <textarea value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Detalle (opcional)" rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            <div className="flex gap-2">
              <button onClick={confirmarPerdido} disabled={!causaSel}
                className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90 disabled:opacity-50">Confirmar</button>
              <button onClick={() => setModalPerdido(null)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
