import { useEffect, useRef, useState } from 'react';
import api from '../../api';

const fecha = d => d ? new Date(d).toLocaleString('es-CL') : '';
const ESTADOS = ['todos', 'nuevo', 'asignado', 'convertido', 'descartado'];
const EMOJIS = ['😀', '😂', '🙂', '👍', '🙏', '👋', '✅', '❌', '📄', '📞', '⏳', '🎉'];

export default function BandejaWhatsApp() {
  const [conversaciones, setConversaciones] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroAbierta, setFiltroAbierta] = useState('todas');
  const [seleccionada, setSeleccionada] = useState(null); // contacto_id
  const [hilo, setHilo] = useState([]);
  const [texto, setTexto] = useState('');
  const [mostrarEmojis, setMostrarEmojis] = useState(false);
  const [enviandoArchivo, setEnviandoArchivo] = useState(false);
  const [mediaUrls, setMediaUrls] = useState({}); // mensaje id -> blob URL
  const [error, setError] = useState(''); const [errorEnvio, setErrorEnvio] = useState('');
  const hiloRef = useRef(null);
  const archivoInputRef = useRef(null);

  const cargarConversaciones = async () => {
    try {
      const params = {};
      if (filtroVendedor) params.vendedor_id = filtroVendedor;
      if (filtroEstado !== 'todos') params.estado = filtroEstado;
      if (filtroAbierta !== 'todas') params.abierta = filtroAbierta === 'abiertas';
      const { data } = await api.get('/whatsapp/conversaciones', { params });
      setConversaciones(data);
    } catch { setError('No se pudieron cargar las conversaciones.'); }
  };

  const cargarHilo = async (contactoId) => {
    try { setHilo((await api.get(`/whatsapp/conversaciones/${contactoId}/mensajes`)).data); }
    catch { setError('No se pudo cargar la conversación.'); }
  };

  useEffect(() => { api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {}); }, []);
  useEffect(() => { cargarConversaciones(); }, [filtroVendedor, filtroEstado, filtroAbierta]);

  // Refresco periódico simple: lista cada 15s, hilo abierto cada 8s.
  useEffect(() => {
    const t = setInterval(cargarConversaciones, 15000);
    return () => clearInterval(t);
  }, [filtroVendedor, filtroEstado, filtroAbierta]);

  useEffect(() => {
    if (!seleccionada) return;
    cargarHilo(seleccionada);
    const t = setInterval(() => cargarHilo(seleccionada), 8000);
    return () => clearInterval(t);
  }, [seleccionada]);

  useEffect(() => { hiloRef.current?.scrollTo(0, hiloRef.current.scrollHeight); }, [hilo]);

  // Los medios (foto/audio/video/documento) requieren el token de la sesión,
  // así que no se pueden poner directo en un <img src>: se descargan como blob
  // (mismo patrón que la descarga de PDF) y se cachean por mensaje.
  useEffect(() => {
    const pendientes = hilo.filter(m => m.tiene_archivo && !mediaUrls[m.id]);
    if (!pendientes.length) return;
    let cancelado = false;
    (async () => {
      const nuevas = {};
      for (const m of pendientes) {
        try {
          const { data } = await api.get(`/whatsapp/mensajes/${m.id}/archivo`, { responseType: 'blob' });
          nuevas[m.id] = URL.createObjectURL(data);
        } catch { /* se muestra solo el texto/nombre si falla */ }
      }
      if (!cancelado) setMediaUrls(prev => ({ ...prev, ...nuevas }));
    })();
    return () => { cancelado = true; };
  }, [hilo]);

  const conversacionActual = conversaciones.find(c => c.contacto_id === seleccionada);

  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setErrorEnvio('');
    try {
      await api.post(`/whatsapp/conversaciones/${seleccionada}/mensajes`, { texto: texto.trim() });
      setTexto('');
      cargarHilo(seleccionada);
      cargarConversaciones();
    } catch (err) { setErrorEnvio(err.response?.data?.error || 'No se pudo enviar el mensaje.'); }
  };

  const adjuntarArchivo = async (e) => {
    const archivo = e.target.files[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después
    if (!archivo) return;
    setErrorEnvio(''); setEnviandoArchivo(true);
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      await api.post(`/whatsapp/conversaciones/${seleccionada}/adjuntos`, form);
      cargarHilo(seleccionada);
      cargarConversaciones();
    } catch (err) { setErrorEnvio(err.response?.data?.error || 'No se pudo enviar el adjunto.'); }
    finally { setEnviandoArchivo(false); }
  };

  const cerrarConversacion = async () => {
    if (!window.confirm('¿Cerrar esta conversación? Se reabre sola si el cliente vuelve a escribir.')) return;
    try {
      await api.post(`/whatsapp/conversaciones/${seleccionada}/cerrar`);
      cargarConversaciones();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cerrar la conversación.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-4">Bandeja WhatsApp</h1>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="flex gap-4 mb-4 flex-wrap">
        <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm">
          <option value="">Todos los vendedores</option>
          {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
        <div className="flex gap-1">
          {ESTADOS.map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`text-sm px-3 py-1.5 rounded capitalize ${filtroEstado === e ? 'bg-ht-accent text-ht-navy' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{e}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {['todas', 'abiertas', 'cerradas'].map(a => (
            <button key={a} onClick={() => setFiltroAbierta(a)}
              className={`text-sm px-3 py-1.5 rounded capitalize ${filtroAbierta === a ? 'bg-ht-accent text-ht-navy' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{a}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 bg-white border border-gray-200 rounded-lg overflow-hidden" style={{ height: '65vh' }}>
        <div className="w-80 flex-shrink-0 border-r border-gray-200 overflow-y-auto">
          {conversaciones.map(c => (
            <button key={c.contacto_id} onClick={() => setSeleccionada(c.contacto_id)}
              className={`w-full text-left p-3 border-b border-gray-100 hover:bg-slate-50 ${seleccionada === c.contacto_id ? 'bg-ht-accent/10' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="font-medium text-ht-navy text-sm">{c.contacto_nombre} {c.contacto_apellido || ''}</div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.abierta ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {c.abierta ? 'abierta' : 'cerrada'}
                </span>
              </div>
              <div className="text-xs text-gray-500">{c.telefono_e164}</div>
              <div className="text-xs text-gray-400 mt-1 truncate">{c.ultimo_direccion === 'saliente' ? '↑ ' : '↓ '}{c.ultimo_mensaje}</div>
              <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                <span>{c.vendedor_nombre || 'Sin asignar'} · {c.lead_estado}</span>
                <span>{fecha(c.ultimo_at)}</span>
              </div>
            </button>
          ))}
          {conversaciones.length === 0 && <div className="p-6 text-center text-gray-400 text-sm">Sin conversaciones.</div>}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {!seleccionada && <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Selecciona una conversación.</div>}
          {seleccionada && (
            <>
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
                <div className="text-sm text-ht-navy font-medium">
                  {conversacionActual?.contacto_nombre} {conversacionActual?.contacto_apellido || ''}
                  <span className="text-gray-400 font-normal ml-2">{conversacionActual?.telefono_e164}</span>
                </div>
                <div className="flex items-center gap-2">
                  <a target="_blank" rel="noreferrer"
                    href={conversacionActual?.negocio_id
                      ? `/negocios/${conversacionActual.negocio_id}/cotizar`
                      : `/cotizaciones/nueva?contacto_id=${conversacionActual?.contacto_id}`}
                    className="text-xs text-ht-navy border border-ht-accent rounded px-2 py-1 hover:bg-ht-accent/5">
                    Crear cotización ↗
                  </a>
                  {conversacionActual?.abierta && (
                    <button onClick={cerrarConversacion} className="text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
                      Cerrar conversación
                    </button>
                  )}
                </div>
              </div>
              <div ref={hiloRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {hilo.map(m => (
                  <div key={m.id} className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${m.direccion === 'saliente' ? 'ml-auto bg-ht-navy text-white' : 'bg-slate-100 text-gray-800'}`}>
                    {m.enviado_por_nombre && (
                      <div className={`text-xs font-bold mb-1 ${m.direccion === 'saliente' ? 'text-white/90' : 'text-ht-navy'}`}>{m.enviado_por_nombre}</div>
                    )}
                    {m.tiene_archivo && m.tipo === 'imagen' && (
                      mediaUrls[m.id]
                        ? <img src={mediaUrls[m.id]} alt={m.archivo_nombre || 'imagen'} className="max-w-full rounded mb-1" />
                        : <div className="text-xs italic opacity-70 mb-1">Cargando imagen…</div>
                    )}
                    {m.tiene_archivo && m.tipo === 'audio' && (
                      mediaUrls[m.id]
                        ? <audio controls src={mediaUrls[m.id]} className="max-w-full mb-1" />
                        : <div className="text-xs italic opacity-70 mb-1">Cargando audio…</div>
                    )}
                    {m.tiene_archivo && m.tipo === 'video' && (
                      mediaUrls[m.id]
                        ? <video controls src={mediaUrls[m.id]} className="max-w-full rounded mb-1" />
                        : <div className="text-xs italic opacity-70 mb-1">Cargando video…</div>
                    )}
                    {m.tiene_archivo && m.tipo === 'documento' && (
                      mediaUrls[m.id]
                        ? <a href={mediaUrls[m.id]} download={m.archivo_nombre} className="underline block mb-1">📎 {m.archivo_nombre || 'Documento'}</a>
                        : <div className="text-xs italic opacity-70 mb-1">Cargando documento…</div>
                    )}
                    <div>{m.texto}</div>
                    <div className={`text-[10px] mt-1 ${m.direccion === 'saliente' ? 'text-white/60' : 'text-gray-400'}`}>
                      {fecha(m.created_at)}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={enviar} className="border-t border-gray-200 p-3">
                {errorEnvio && <div className="mb-2 text-xs text-red-600">{errorEnvio}</div>}
                {conversacionActual && !conversacionActual.abierta && (
                  <div className="mb-2 text-xs text-amber-600">
                    Conversación cerrada (pasaron más de 24 h desde el último mensaje del cliente): no se puede enviar texto libre.
                  </div>
                )}
                <div className="flex gap-2 relative">
                  <input type="file" ref={archivoInputRef} onChange={adjuntarArchivo} className="hidden" />
                  <button type="button" onClick={() => archivoInputRef.current?.click()}
                    disabled={(conversacionActual && !conversacionActual.abierta) || enviandoArchivo}
                    title="Adjuntar archivo"
                    className="border border-gray-300 rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40">
                    {enviandoArchivo ? '…' : '📎'}
                  </button>
                  <button type="button" onClick={() => setMostrarEmojis(v => !v)}
                    disabled={conversacionActual && !conversacionActual.abierta}
                    className="border border-gray-300 rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40">
                    😀
                  </button>
                  {mostrarEmojis && (
                    <div className="absolute bottom-12 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex flex-wrap gap-1 w-64 z-10">
                      {EMOJIS.map(em => (
                        <button key={em} type="button" onClick={() => { setTexto(t => t + em); setMostrarEmojis(false); }}
                          className="text-lg hover:bg-gray-100 rounded p-1">{em}</button>
                      ))}
                    </div>
                  )}
                  <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe una respuesta..."
                    disabled={conversacionActual && !conversacionActual.abierta}
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent disabled:bg-gray-50" />
                  <button type="submit" disabled={conversacionActual && !conversacionActual.abierta}
                    className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-40">
                    Enviar
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
