import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const numeroCompleto = (numero, version) => `${numero}-${String(version).padStart(2, '0')}`;
// Mismo criterio que el tablero de Pipeline: mover de pipeline es una acción
// más sensible que editar la cotización, acotada a admin/jefe comercial.
const PUEDE_MOVER_PIPELINE = ['administrador', 'jefe_comercial'];

export default function DetalleCotizacion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cot, setCot] = useState(null);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [etapas, setEtapas] = useState([]);
  const [pipelines, setPipelines] = useState([]);
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
    api.get('/config/causas-no-cierre').then(r => setCausas(r.data.filter(c => c.activo))).catch(() => {});
    if (PUEDE_MOVER_PIPELINE.includes(user?.rol)) {
      api.get('/config/pipelines').then(r => setPipelines(r.data.filter(p => p.activo))).catch(() => {});
    }
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    // Las etapas deben ser las del pipeline al que pertenece ESTE negocio —
    // sin pipeline_id, el endpoint devuelve por defecto las de "Ventas
    // Directas" (id=1), que no son las etapas correctas si el negocio está
    // en otro pipeline (ej. Operaciones).
    if (!cot?.negocio_pipeline_id) return;
    api.get('/config/pipeline-etapas', { params: { pipeline_id: cot.negocio_pipeline_id } })
      .then(r => setEtapas(r.data.filter(e => e.activo))).catch(() => {});
  }, [cot?.negocio_pipeline_id]);
  useEffect(() => { if (cot) setProbEnEdicion(cot.negocio_probabilidad_cierre ?? ''); }, [cot?.negocio_probabilidad_cierre]);

  const cambiarPipeline = async pipelineId => {
    if (!pipelineId || Number(pipelineId) === cot.negocio_pipeline_id) return;
    await accion(() => api.put(`/negocios/${cot.negocio_id}/pipeline`, { pipeline_id: Number(pipelineId) }));
  };
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

  const descargarWord = async () => {
    try {
      const { data } = await api.get(`/cotizaciones/${id}/word`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = `${numeroCompleto(cot.numero, cot.version)}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch { setError('No se pudo generar el Word.'); }
  };

  const verDocumentoFinal = async () => {
    try {
      const { data } = await api.get(`/cotizaciones/${id}/documento-final`, { responseType: 'blob' });
      window.open(URL.createObjectURL(data), '_blank');
    } catch { setError('No se pudo abrir el documento final.'); }
  };

  const [subiendoFinal, setSubiendoFinal] = useState(false);
  const subirDocumentoFinal = async (ev) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!archivo) return;
    setError(''); setMsg(''); setSubiendoFinal(true);
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      await api.post(`/cotizaciones/${id}/documento-final`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg('Documento final subido.');
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo subir el documento.'); }
    setSubiendoFinal(false);
  };

  // --- Consideraciones de ejecución (solo cotizaciones con plantilla) ---
  const TAGS_CONSIDERACION = [
    { value: 'info', label: 'Info' }, { value: 'atencion', label: 'Atención' },
    { value: 'corte_agua', label: 'Corte agua' }, { value: 'horario_no_habil', label: 'Horario no hábil' },
    { value: 'acceso', label: 'Acceso' }, { value: 'otro', label: 'Otro' },
  ];
  const [nuevaConsideracionTag, setNuevaConsideracionTag] = useState('info');
  const [nuevaConsideracionTexto, setNuevaConsideracionTexto] = useState('');
  const agregarConsideracion = async () => {
    if (!nuevaConsideracionTexto.trim()) return;
    await accion(() => api.post(`/cotizaciones/${id}/consideraciones`, { tag: nuevaConsideracionTag, texto: nuevaConsideracionTexto.trim() }));
    setNuevaConsideracionTexto('');
  };
  const quitarConsideracion = async (considId) => {
    await accion(() => api.delete(`/cotizaciones/${id}/consideraciones/${considId}`));
  };

  const copiarLink = () => {
    const link = `${window.location.origin}/c/${cot.token_publico}`;
    navigator.clipboard.writeText(link).then(() => setMsg('Link público copiado al portapapeles.'));
  };

  const [enviando, setEnviando] = useState(false);
  const [canalCorreo, setCanalCorreo] = useState(true);
  useEffect(() => {
    if (cot) setCanalCorreo(!!cot.contacto_email);
  }, [cot?.id]);

  const enviarCotizacion = async () => {
    setError(''); setMsg(''); setEnviando(true);
    const mensajes = []; const errores = [];
    if (canalCorreo) {
      try { const { data } = await api.post(`/cotizaciones/${id}/enviar`); mensajes.push(data.message); }
      catch (err) { errores.push(err.response?.data?.error || 'No se pudo enviar el correo.'); }
    }
    if (mensajes.length) setMsg(mensajes.join(' · '));
    if (errores.length) setError(errores.join(' · '));
    await cargar();
    setEnviando(false);
  };

  // Completa el email del contacto al vuelo (sin ir a su ficha) y envía la
  // cotización de inmediato, para el caso frecuente de una cotización lista
  // para enviar cuyo contacto simplemente no tenía email cargado.
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [guardandoEmail, setGuardandoEmail] = useState(false);
  const guardarEmailYEnviar = async () => {
    if (!nuevoEmail.trim()) { setError('Ingresa un email.'); return; }
    setError(''); setMsg(''); setGuardandoEmail(true);
    try {
      await api.put(`/contactos/${cot.contacto_id}/email`, { email: nuevoEmail.trim() });
      setNuevoEmail(''); setCanalCorreo(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el email.');
      setGuardandoEmail(false);
      return;
    }
    // El email ya quedó guardado en el contacto aunque el envío falle —
    // siempre recargamos para reflejarlo y sacar el aviso, y distinguimos
    // el error de envío del de guardado en el mensaje.
    try {
      const { data } = await api.post(`/cotizaciones/${id}/enviar`);
      setMsg(data.message);
    } catch (err) {
      setError('Email guardado. ' + (err.response?.data?.error || 'No se pudo enviar el correo.'));
    }
    await cargar();
    setGuardandoEmail(false);
  };

  const accion = async (fn) => { setError(''); setMsg(''); try { await fn(); cargar(); } catch (err) { setError(err.response?.data?.error || 'Error.'); } };

  if (error && !cot) return <div className="p-6 text-red-600">{error}</div>;
  if (!cot) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <Link to={`/negocios/${cot.negocio_id}`} className="text-sm text-ht-accent hover:underline">← {cot.negocio_titulo}</Link>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-2xl font-bold text-ht-navy">{numeroCompleto(cot.numero, cot.version)}</h1>
        <span className="text-sm px-3 py-1 rounded-full bg-ht-accent/15 text-ht-navy capitalize">{cot.estado}</span>
      </div>
      <p className="text-gray-600 text-sm mb-5 min-h-[1.25rem]">{cot.titulo}</p>

      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {cot.requiere_aprobacion && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 flex items-center justify-between">
          <span>Descuento {Number(cot.descuento_pct)}% supera el tope ({cot.descuento_max}%). Requiere aprobación de un administrador para enviarse.</span>
          {user?.rol === 'administrador'
            ? <button onClick={() => accion(() => api.post(`/cotizaciones/${id}/aprobar-descuento`))} className="ml-3 bg-ht-accent text-ht-navy px-3 py-1.5 rounded text-xs hover:bg-ht-accent/90">Aprobar</button>
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
                <tr key={it.id} className="border-t border-gray-100 hover:bg-gray-50">
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
            {cot.tipo_plantilla === 'ninguna' && (
              <button onClick={descargarPDF} className="w-full text-sm px-3 py-2 rounded bg-ht-accent text-ht-navy hover:bg-ht-accent/90">Descargar PDF</button>
            )}
            {cot.tipo_plantilla !== 'ninguna' && (
              <div className="border border-gray-200 rounded p-2 space-y-1.5">
                <p className="text-xs text-gray-500">Esta cotización usa una plantilla de propuesta. Descarga el Word, retócalo (fotos, ajustes) y sube el PDF final antes de enviar.</p>
                <button onClick={descargarWord} className="w-full text-sm px-3 py-2 rounded bg-ht-accent text-ht-navy hover:bg-ht-accent/90">Descargar Word</button>
                <label className="w-full block text-center text-sm px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-slate-50 cursor-pointer">
                  {subiendoFinal ? 'Subiendo…' : cot.documento_final_url ? 'Reemplazar documento final' : 'Subir documento final (PDF)'}
                  <input type="file" accept="application/pdf" className="hidden" onChange={subirDocumentoFinal} disabled={subiendoFinal} />
                </label>
                {cot.documento_final_url && (
                  <button onClick={verDocumentoFinal} className="block w-full text-center text-xs text-ht-accent hover:underline">Ver documento final subido</button>
                )}
              </div>
            )}
            {cot.puede_editar && (
              <div className="border border-gray-200 rounded p-2 space-y-1.5">
                {cot.tipo_plantilla !== 'ninguna' && !cot.documento_final_url && (
                  <p className="text-xs text-amber-600">Sube el documento final antes de enviar.</p>
                )}
                {!cot.contacto_email && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 space-y-1.5">
                    <p>Este contacto no tiene email registrado.</p>
                    <input type="email" value={nuevoEmail} onChange={e => setNuevoEmail(e.target.value)}
                      placeholder="correo@cliente.cl"
                      className="w-full border border-amber-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                    <button onClick={guardarEmailYEnviar}
                      disabled={guardandoEmail || !nuevoEmail.trim() || (cot.tipo_plantilla !== 'ninguna' && !cot.documento_final_url)}
                      className="w-full text-sm px-3 py-1.5 rounded bg-ht-accent text-ht-navy hover:bg-ht-accent/90 disabled:opacity-50">
                      {guardandoEmail ? 'Guardando y enviando…' : 'Guardar email y enviar'}
                    </button>
                  </div>
                )}
                <label className={`flex items-center gap-2 text-sm ${cot.contacto_email ? 'text-gray-700' : 'text-gray-300'}`}>
                  <input type="checkbox" checked={canalCorreo} disabled={!cot.contacto_email}
                    onChange={e => setCanalCorreo(e.target.checked)} />
                  Correo
                </label>
                <button onClick={enviarCotizacion} disabled={enviando || !canalCorreo || (cot.tipo_plantilla !== 'ninguna' && !cot.documento_final_url)}
                  className="w-full text-sm px-3 py-2 rounded border border-ht-accent text-ht-navy hover:bg-ht-accent/5 disabled:opacity-50 mt-1">
                  {enviando ? 'Enviando…' : 'Enviar cotización'}
                </button>
              </div>
            )}
            <button onClick={copiarLink} className="w-full text-sm px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-slate-50">Copiar link público</button>
            <a href={`/c/${cot.token_publico}`} target="_blank" rel="noreferrer" className="block w-full text-center text-sm px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-slate-50">Ver como cliente</a>
            {cot.puede_editar && cot.estado === 'borrador' && (
              <Link to={`/cotizaciones/${id}/editar`} className="block w-full text-center text-sm px-3 py-2 rounded bg-ht-accent text-ht-navy hover:bg-ht-accent/90">Editar</Link>
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
              {PUEDE_MOVER_PIPELINE.includes(user?.rol) && pipelines.length > 1 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pipeline</label>
                  <select value={cot.negocio_pipeline_id || ''} onChange={e => cambiarPipeline(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              )}
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

          {cot.tipo_plantilla !== 'ninguna' && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 h-fit space-y-3">
              <h2 className="font-semibold text-ht-navy">Consideraciones de ejecución</h2>
              <p className="text-xs text-gray-400">Aparecen al final de "Condiciones de ejecución" en el Word.</p>
              {(cot.consideraciones || []).map(c => (
                <div key={c.id} className="flex items-start gap-2 text-sm border-t border-gray-100 pt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-ht-accent/15 text-ht-navy flex-shrink-0">{TAGS_CONSIDERACION.find(t => t.value === c.tag)?.label || c.tag}</span>
                  <span className="flex-1 text-gray-700">{c.texto}</span>
                  {cot.puede_editar && cot.estado === 'borrador' && (
                    <button onClick={() => quitarConsideracion(c.id)} className="text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
                  )}
                </div>
              ))}
              {cot.puede_editar && cot.estado === 'borrador' && (
                <div className="border-t border-gray-100 pt-2 space-y-1.5">
                  <select value={nuevaConsideracionTag} onChange={e => setNuevaConsideracionTag(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
                    {TAGS_CONSIDERACION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <textarea value={nuevaConsideracionTexto} onChange={e => setNuevaConsideracionTexto(e.target.value)} rows={2}
                    placeholder="Texto de la consideración…"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                  <button onClick={agregarConsideracion} className="w-full text-sm px-3 py-1.5 rounded border border-ht-accent text-ht-navy hover:bg-ht-accent/5">+ Agregar</button>
                </div>
              )}
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
                className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">Confirmar</button>
              <button onClick={() => setModalPerdido(null)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
