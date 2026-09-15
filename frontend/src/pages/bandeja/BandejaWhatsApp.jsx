import { useEffect, useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';
import Recorder from 'opus-recorder';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { formatFechaHora } from '../../utils/fecha';

const fecha = formatFechaHora;
const ESTADOS = ['todos', 'nuevo', 'asignado', 'convertido', 'descartado'];
const DIACRITICOS = new RegExp('[̀-ͯ]', 'g');
const normalizar = s => (s || '').normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
// Mismo criterio que el backend (routes/leads.js POST /:id/asignar): solo
// quien reparte leads puede asignarlos — un vendedor no puede asignarse
// leads ni a sí mismo ni a otros (política 07-09-2026).
const ROLES_REASIGNAN_A_CUALQUIERA = ['administrador', 'jefe_comercial', 'callcenter', 'gerencia'];

export default function BandejaWhatsApp() {
  const { user } = useAuth();
  const [conversaciones, setConversaciones] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [usuariosFiltro, setUsuariosFiltro] = useState([]);
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroAbierta, setFiltroAbierta] = useState('todas');
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [soloNoLeidos, setSoloNoLeidos] = useState(false);
  const [cantidadNoLeidos, setCantidadNoLeidos] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState(null); // contacto_id
  const [hilo, setHilo] = useState([]);
  const [texto, setTexto] = useState('');
  const [mostrarEmojis, setMostrarEmojis] = useState(false);
  const [enviandoArchivo, setEnviandoArchivo] = useState(false);
  const [mediaUrls, setMediaUrls] = useState({}); // mensaje id -> blob URL
  const [error, setError] = useState(''); const [errorEnvio, setErrorEnvio] = useState('');
  const [busquedaHilo, setBusquedaHilo] = useState('');
  const [indiceMatch, setIndiceMatch] = useState(0);
  const [grabando, setGrabando] = useState(false);
  const [enviandoPlantilla, setEnviandoPlantilla] = useState(false);
  const [respondiendoA, setRespondiendoA] = useState(null); // mensaje al que se está citando, o null
  const [reaccionandoA, setReaccionandoA] = useState(null); // id del mensaje con el selector de emoji abierto
  const [enviandoReaccion, setEnviandoReaccion] = useState(false);
  const hiloRef = useRef(null);
  const inputTextoRef = useRef(null);
  const archivoInputRef = useRef(null);
  const recorderRef = useRef(null);
  const matchRefs = useRef({});

  const cargarConversaciones = async () => {
    try {
      const params = {};
      if (filtroVendedor) params.vendedor_id = filtroVendedor;
      if (filtroEstado !== 'todos') params.estado = filtroEstado;
      if (filtroAbierta !== 'todas') params.abierta = filtroAbierta === 'abiertas';
      if (verArchivadas) params.archivadas = true;
      // Un vendedor viendo "No leídos" siempre ve solo lo suyo, sin importar
      // el filtro de usuario elegido — administrador/jefe_comercial/
      // callcenter/gerencia sí ven el total (política 07-09-2026).
      if (soloNoLeidos && user?.rol === 'vendedor') params.vendedor_id = user.id;
      const { data } = await api.get('/whatsapp/conversaciones', { params });
      setConversaciones(data);
    } catch { setError('No se pudieron cargar las conversaciones.'); }
  };

  const cargarCantidadNoLeidos = async () => {
    try { setCantidadNoLeidos((await api.get('/whatsapp/no-leidos/cantidad')).data.cantidad); }
    catch { /* el badge del menú lateral usa el mismo endpoint; si falla acá, se ignora */ }
  };

  const asignarLead = async (leadId, vendedorId) => {
    if (!leadId || !vendedorId) return;
    setError('');
    try {
      await api.post(`/leads/${leadId}/asignar`, { vendedor_id: Number(vendedorId) });
      cargarConversaciones();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo asignar la conversación.'); }
  };

  const cargarHilo = async (contactoId) => {
    try { setHilo((await api.get(`/whatsapp/conversaciones/${contactoId}/mensajes`)).data); }
    catch { setError('No se pudo cargar la conversación.'); }
  };

  useEffect(() => { api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get('/users/activos').then(r => setUsuariosFiltro(r.data)).catch(() => {}); }, []);
  useEffect(() => { cargarConversaciones(); }, [filtroVendedor, filtroEstado, filtroAbierta, verArchivadas, soloNoLeidos]);
  useEffect(() => { cargarCantidadNoLeidos(); }, []);

  // Refresco periódico simple: lista cada 15s, hilo abierto cada 8s.
  useEffect(() => {
    const t = setInterval(() => { cargarConversaciones(); cargarCantidadNoLeidos(); }, 15000);
    return () => clearInterval(t);
  }, [filtroVendedor, filtroEstado, filtroAbierta, verArchivadas, soloNoLeidos]);

  useEffect(() => {
    setBusquedaHilo('');
    if (!seleccionada) return;
    cargarHilo(seleccionada);
    // Marca la conversación como leída (apaga su indicador de no leído) —
    // optimista en la lista local y en el contador, confirmado en el próximo refresco.
    const eraNoLeido = conversaciones.find(c => c.contacto_id === seleccionada)?.no_leido;
    setConversaciones(cs => cs.map(c => c.contacto_id === seleccionada ? { ...c, no_leido: false } : c));
    if (eraNoLeido) setCantidadNoLeidos(n => Math.max(0, n - 1));
    api.post(`/whatsapp/conversaciones/${seleccionada}/marcar-leido`).catch(() => {});
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

  // Búsqueda libre en el lado del cliente (la lista ya viene acotada a 300
  // conversaciones desde el backend) — sin distinguir mayúsculas ni tildes.
  const terminoBusqueda = normalizar(busqueda.trim());
  const conversacionesFiltradas = conversaciones.filter(c => {
    if (soloNoLeidos && !c.no_leido) return false;
    if (!terminoBusqueda) return true;
    return [c.contacto_nombre, c.contacto_apellido, c.empresa_razon_social, c.telefono_e164]
      .some(campo => normalizar(campo).includes(terminoBusqueda));
  });

  // Búsqueda dentro de la conversación abierta: mensajes cuyo texto contiene
  // el término (mismo criterio sin mayúsculas/tildes que el buscador de
  // conversaciones). indiceMatch navega entre coincidencias con Siguiente/Anterior.
  const terminoHilo = normalizar(busquedaHilo.trim());
  const mensajesConMatch = terminoHilo
    ? hilo.filter(m => m.texto && normalizar(m.texto).includes(terminoHilo))
    : [];
  useEffect(() => { setIndiceMatch(0); }, [busquedaHilo, seleccionada]);
  useEffect(() => {
    if (!mensajesConMatch.length) return;
    const id = mensajesConMatch[Math.min(indiceMatch, mensajesConMatch.length - 1)]?.id;
    matchRefs.current[id]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [indiceMatch, terminoHilo, hilo]);

  // Envuelve la parte del texto que coincide con el término buscado en <mark>.
  const resaltar = (texto, esActual) => {
    if (!terminoHilo || !texto) return texto;
    const norm = normalizar(texto);
    const pos = norm.indexOf(terminoHilo);
    if (pos === -1) return texto;
    return (
      <>
        {texto.slice(0, pos)}
        <mark className={esActual ? 'bg-ht-accent text-ht-navy' : 'bg-yellow-200'}>{texto.slice(pos, pos + terminoHilo.length)}</mark>
        {texto.slice(pos + terminoHilo.length)}
      </>
    );
  };

  // WhatsApp no permite editar ni eliminar un mensaje ya enviado (ni Meta lo
  // expone en la Cloud API) — esto prellena el cuadro de respuesta con una
  // aclaración para que el vendedor la edite y la mande como mensaje nuevo,
  // sin tocar el mensaje original.
  const corregirMensaje = (m) => {
    setTexto(`Disculpa, el mensaje anterior tenía un error. ${m.texto}`);
    inputTextoRef.current?.focus();
  };

  const responderMensaje = (m) => {
    setRespondiendoA(m);
    inputTextoRef.current?.focus();
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setErrorEnvio('');
    try {
      await api.post(`/whatsapp/conversaciones/${seleccionada}/mensajes`, {
        texto: texto.trim(),
        respondido_a_id: respondiendoA?.id || undefined,
      });
      setTexto('');
      setRespondiendoA(null);
      cargarHilo(seleccionada);
      cargarConversaciones();
    } catch (err) { setErrorEnvio(err.response?.data?.error || 'No se pudo enviar el mensaje.'); }
  };

  const EMOJIS_REACCION = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  const reaccionar = async (m, emoji) => {
    setReaccionandoA(null);
    setEnviandoReaccion(true);
    setErrorEnvio('');
    try {
      // Tocar el mismo emoji que ya está puesto la quita (mismo gesto que en
      // el teléfono).
      await api.post(`/whatsapp/conversaciones/${seleccionada}/mensajes/${m.id}/reaccion`, {
        emoji: m.reaccion_emoji === emoji ? '' : emoji,
      });
      cargarHilo(seleccionada);
    } catch (err) { setErrorEnvio(err.response?.data?.error || 'No se pudo enviar la reacción.'); }
    finally { setEnviandoReaccion(false); }
  };

  const subirYEnviarArchivo = async (archivo) => {
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

  const adjuntarArchivo = async (e) => {
    const archivo = e.target.files[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después
    if (!archivo) return;
    await subirYEnviarArchivo(archivo);
  };

  // Nota de audio: se graba directo en Ogg/Opus (vía WebAssembly, librería
  // opus-recorder) en vez del webm/opus que entrega MediaRecorder de forma
  // nativa — WhatsApp Cloud API no acepta webm, solo AAC/MP4/MPEG/AMR/OGG
  // (códec Opus). Se manda por el mismo camino que un adjunto común.
  const iniciarGrabacion = async () => {
    setErrorEnvio('');
    try {
      const rec = new Recorder({ encoderPath: '/opus-recorder/encoderWorker.min.js', encoderApplication: 2048 });
      rec.ondataavailable = async (arrayBuffer) => {
        const archivo = new File([arrayBuffer], `nota-de-voz-${Date.now()}.ogg`, { type: 'audio/ogg' });
        await subirYEnviarArchivo(archivo);
      };
      await rec.start();
      recorderRef.current = rec;
      setGrabando(true);
    } catch {
      setErrorEnvio('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    }
  };
  const detenerGrabacion = () => {
    recorderRef.current?.stop();
    recorderRef.current?.close();
    setGrabando(false);
  };

  const reabrirConPlantilla = async () => {
    setErrorEnvio(''); setEnviandoPlantilla(true);
    try {
      await api.post(`/whatsapp/conversaciones/${seleccionada}/reabrir-plantilla`);
      cargarHilo(seleccionada);
      cargarConversaciones();
    } catch (err) { setErrorEnvio(err.response?.data?.error || 'No se pudo enviar la plantilla.'); }
    finally { setEnviandoPlantilla(false); }
  };

  const cerrarConversacion = async () => {
    if (!window.confirm('¿Cerrar esta conversación? Se reabre sola si el cliente vuelve a escribir.')) return;
    try {
      await api.post(`/whatsapp/conversaciones/${seleccionada}/cerrar`);
      cargarConversaciones();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cerrar la conversación.'); }
  };

  const archivarConversacion = async () => {
    if (!window.confirm('¿Archivar esta conversación? Se oculta de la Bandeja y se desarchiva sola si el cliente vuelve a escribir.')) return;
    try {
      await api.post(`/whatsapp/conversaciones/${seleccionada}/archivar`);
      setSeleccionada(null);
      cargarConversaciones();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo archivar la conversación.'); }
  };

  const desarchivarConversacion = async () => {
    try {
      await api.post(`/whatsapp/conversaciones/${seleccionada}/desarchivar`);
      setSeleccionada(null);
      cargarConversaciones();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo desarchivar la conversación.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-4">Bandeja WhatsApp</h1>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="flex gap-4 mb-4 flex-wrap">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por cliente, empresa o teléfono…"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm">
          <option value="">Todos los usuarios</option>
          {usuariosFiltro.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <div className="flex gap-1 flex-wrap">
          {ESTADOS.map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`text-sm px-3 py-1.5 rounded capitalize ${filtroEstado === e ? 'bg-ht-accent text-ht-navy' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{e}</button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {['todas', 'abiertas', 'cerradas'].map(a => (
            <button key={a} onClick={() => setFiltroAbierta(a)}
              className={`text-sm px-3 py-1.5 rounded capitalize ${filtroAbierta === a ? 'bg-ht-accent text-ht-navy' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{a}</button>
          ))}
        </div>
        <button onClick={() => setSoloNoLeidos(v => !v)}
          className={`text-sm px-3 py-1.5 rounded ${soloNoLeidos ? 'bg-ht-accent text-ht-navy' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          {soloNoLeidos ? '✓ No leídos' : `No leídos${cantidadNoLeidos ? ` (${cantidadNoLeidos})` : ''}`}
        </button>
        <button onClick={() => { setSeleccionada(null); setVerArchivadas(v => !v); }}
          className={`text-sm px-3 py-1.5 rounded ${verArchivadas ? 'bg-ht-accent text-ht-navy' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          {verArchivadas ? '✓ Archivadas' : 'Archivadas'}
        </button>
      </div>

      <div className="flex gap-4 bg-white border border-gray-200 rounded-lg overflow-hidden" style={{ height: '65vh' }}>
        <div className={`w-full md:w-80 flex-shrink-0 border-r border-gray-200 overflow-y-auto ${seleccionada ? 'hidden md:block' : 'block'}`}>
          {conversacionesFiltradas.map(c => (
            <button key={c.contacto_id} onClick={() => setSeleccionada(c.contacto_id)}
              className={`w-full text-left p-3 border-b border-gray-100 hover:bg-slate-50 ${seleccionada === c.contacto_id ? 'bg-ht-accent/10' : ''}`}>
              <div className="flex justify-between items-start">
                <div className={`text-sm flex items-center gap-1.5 ${c.no_leido ? 'font-bold text-ht-navy' : 'font-medium text-ht-navy'}`}>
                  {c.no_leido && <span className="h-2 w-2 rounded-full bg-ht-accent flex-shrink-0" title="No leído" />}
                  {c.contacto_nombre} {c.contacto_apellido || ''}
                  {c.empresa_razon_social && <span className="text-gray-400 font-normal"> · {c.empresa_razon_social}</span>}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.abierta ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {c.abierta ? 'abierta' : 'cerrada'}
                </span>
              </div>
              <div className="text-xs text-gray-500">{c.telefono_e164}</div>
              <div className={`text-xs mt-1 truncate ${c.no_leido ? 'text-ht-navy font-medium' : 'text-gray-400'}`}>{c.ultimo_direccion === 'saliente' ? '↑ ' : '↓ '}{c.ultimo_mensaje}</div>
              <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                <span>{c.vendedor_nombre || 'Sin asignar'} · {c.lead_estado}</span>
                <span>{fecha(c.ultimo_at)}</span>
              </div>
            </button>
          ))}
          {conversacionesFiltradas.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">
              {terminoBusqueda ? 'Sin resultados para esa búsqueda.' : 'Sin conversaciones.'}
            </div>
          )}
        </div>

        <div className={`flex-1 flex-col min-w-0 ${seleccionada ? 'flex' : 'hidden md:flex'}`}>
          {!seleccionada && <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Selecciona una conversación.</div>}
          {seleccionada && (
            <>
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => setSeleccionada(null)} className="md:hidden text-ht-navy shrink-0" title="Volver a conversaciones">←</button>
                  <div className="min-w-0">
                    <div className="text-sm text-ht-navy font-medium truncate">
                      {conversacionActual?.contacto_nombre} {conversacionActual?.contacto_apellido || ''}
                      <span className="text-gray-400 font-normal ml-2">{conversacionActual?.telefono_e164}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs mt-0.5">
                      <span className="text-gray-400">Asignado a:</span>
                      {ROLES_REASIGNAN_A_CUALQUIERA.includes(user?.rol) ? (
                        <select value={conversacionActual?.vendedor_id || ''}
                          onChange={e => e.target.value && asignarLead(conversacionActual?.lead_id, e.target.value)}
                          className="border border-gray-300 rounded px-1 py-0.5 text-xs">
                          <option value="">Sin asignar</option>
                          {usuariosFiltro.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                        </select>
                      ) : (
                        <span className={conversacionActual?.vendedor_id ? 'text-ht-navy font-medium' : 'text-gray-500'}>
                          {conversacionActual?.vendedor_nombre || 'Sin asignar'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a target="_blank" rel="noreferrer"
                    href={conversacionActual?.negocio_id
                      ? `/negocios/${conversacionActual.negocio_id}/cotizar`
                      : `/cotizaciones/nueva?contacto_id=${conversacionActual?.contacto_id}`}
                    className="text-xs text-ht-navy border border-ht-accent rounded px-2 py-1 hover:bg-ht-accent/5">
                    Crear cotización ↗
                  </a>
                  {conversacionActual?.abierta && !verArchivadas && (
                    <button onClick={cerrarConversacion} className="text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
                      Cerrar conversación
                    </button>
                  )}
                  {verArchivadas ? (
                    <button onClick={desarchivarConversacion} className="text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
                      Desarchivar
                    </button>
                  ) : (
                    <button onClick={archivarConversacion} className="text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
                      Archivar
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
                <input value={busquedaHilo} onChange={e => setBusquedaHilo(e.target.value)}
                  placeholder="Buscar en esta conversación…"
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                {terminoHilo && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    <span>{mensajesConMatch.length ? `${indiceMatch + 1}/${mensajesConMatch.length}` : '0/0'}</span>
                    <button type="button" disabled={!mensajesConMatch.length}
                      onClick={() => setIndiceMatch(i => (i - 1 + mensajesConMatch.length) % mensajesConMatch.length)}
                      className="border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-50 disabled:opacity-40">↑</button>
                    <button type="button" disabled={!mensajesConMatch.length}
                      onClick={() => setIndiceMatch(i => (i + 1) % mensajesConMatch.length)}
                      className="border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-50 disabled:opacity-40">↓</button>
                  </div>
                )}
              </div>
              <div ref={hiloRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {hilo.map((m) => (
                  <div key={m.id} ref={el => { matchRefs.current[m.id] = el; }}
                    className={`relative max-w-[70%] rounded-lg px-3 py-2 pb-3.5 text-sm ${m.direccion === 'saliente' ? 'ml-auto bg-ht-accent/15 text-ht-navy' : 'bg-slate-100 text-gray-800'}`}>
                    {m.reaccion_emoji && (
                      <span className={`absolute -bottom-2.5 bg-white border border-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-[11px] shadow-sm ${m.direccion === 'saliente' ? 'left-1' : 'right-1'}`}
                        title={m.reaccion_por === 'cliente' ? 'Reacción del cliente' : 'Tu reacción'}>
                        {m.reaccion_emoji}
                      </span>
                    )}
                    {m.enviado_por_nombre && (
                      <div className={`text-xs font-bold mb-1 ${m.direccion === 'saliente' ? 'text-ht-navy/70' : 'text-ht-navy'}`}>{m.enviado_por_nombre}</div>
                    )}
                    {m.respondido_a_id && (
                      <div className="text-xs opacity-70 border-l-2 border-current pl-2 mb-1 truncate">
                        {m.respondido_a_texto || 'Mensaje original no disponible'}
                      </div>
                    )}
                    {m.tiene_archivo && m.tipo === 'imagen' && (
                      mediaUrls[m.id]
                        ? (
                          <div className="relative mb-1 group">
                            <img src={mediaUrls[m.id]} alt={m.archivo_nombre || 'imagen'} className="max-w-full rounded" />
                            <a href={mediaUrls[m.id]} download={m.archivo_nombre || 'imagen'}
                              title="Descargar imagen"
                              className="absolute top-1 right-1 bg-black/50 text-white text-xs rounded px-1.5 py-0.5 opacity-80 hover:opacity-100">⬇</a>
                          </div>
                        )
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
                    <div className="whitespace-pre-wrap">{resaltar(m.texto, mensajesConMatch[indiceMatch]?.id === m.id)}</div>
                    <div className={`text-[10px] mt-1 flex items-center gap-2 ${m.direccion === 'saliente' ? 'text-ht-navy/50' : 'text-gray-400'}`}>
                      <span>{fecha(m.created_at)}</span>
                      {m.se_puede_reaccionar_responder && (
                        <>
                          <button type="button" onClick={() => responderMensaje(m)}
                            disabled={conversacionActual && !conversacionActual.abierta}
                            title="Responder citando este mensaje"
                            className="underline hover:no-underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline">
                            Responder
                          </button>
                          <button type="button" onClick={() => setReaccionandoA(v => v === m.id ? null : m.id)}
                            disabled={(conversacionActual && !conversacionActual.abierta) || enviandoReaccion}
                            title="Reaccionar con un emoji"
                            className="underline hover:no-underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline">
                            Reaccionar
                          </button>
                        </>
                      )}
                      {m.direccion === 'saliente' && (
                        <button type="button" onClick={() => corregirMensaje(m)}
                          disabled={conversacionActual && !conversacionActual.abierta}
                          title="WhatsApp no permite editar ni eliminar un mensaje enviado — esto prepara uno nuevo de aclaración"
                          className="underline hover:no-underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline">
                          Corregir
                        </button>
                      )}
                    </div>
                    {reaccionandoA === m.id && (
                      <div className={`absolute z-10 -top-9 flex items-center gap-0.5 bg-white border border-gray-200 rounded-full shadow-md px-1.5 py-1 ${m.direccion === 'saliente' ? 'right-0' : 'left-0'}`}>
                        {EMOJIS_REACCION.map(emoji => (
                          <button key={emoji} type="button" onClick={() => reaccionar(m, emoji)}
                            className={`text-base leading-none rounded-full px-1 py-0.5 hover:scale-125 hover:bg-gray-50 transition-transform ${m.reaccion_emoji === emoji ? 'bg-ht-accent/15' : ''}`}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={enviar} className="border-t border-gray-200 p-3">
                {errorEnvio && <div className="mb-2 text-xs text-red-600">{errorEnvio}</div>}
                {respondiendoA && (
                  <div className="mb-2 flex items-start justify-between gap-2 bg-gray-50 border-l-2 border-ht-accent rounded px-2 py-1.5 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-ht-navy">Respondiendo a</div>
                      <div className="truncate text-gray-600">{respondiendoA.texto}</div>
                    </div>
                    <button type="button" onClick={() => setRespondiendoA(null)} title="Cancelar respuesta"
                      className="shrink-0 text-gray-400 hover:text-gray-700">✕</button>
                  </div>
                )}
                {conversacionActual && !conversacionActual.abierta && (
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-amber-600">
                    <span>Conversación cerrada (pasaron más de 24 h desde el último mensaje del cliente): no se puede enviar texto libre.</span>
                    <button type="button" onClick={reabrirConPlantilla} disabled={enviandoPlantilla}
                      className="shrink-0 border border-ht-accent text-ht-navy rounded px-2 py-1 hover:bg-ht-accent/5 disabled:opacity-40">
                      {enviandoPlantilla ? 'Enviando…' : 'Reabrir con plantilla'}
                    </button>
                  </div>
                )}
                <div className="flex gap-2 relative items-end">
                  <input type="file" ref={archivoInputRef} onChange={adjuntarArchivo} className="hidden" />
                  <button type="button" onClick={() => archivoInputRef.current?.click()}
                    disabled={(conversacionActual && !conversacionActual.abierta) || enviandoArchivo}
                    title="Adjuntar archivo"
                    className="border border-gray-300 rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40">
                    {enviandoArchivo ? '…' : '📎'}
                  </button>
                  <button type="button" onClick={grabando ? detenerGrabacion : iniciarGrabacion}
                    disabled={(conversacionActual && !conversacionActual.abierta) || enviandoArchivo}
                    title={grabando ? 'Detener y enviar grabación' : 'Grabar nota de voz'}
                    className={`border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 ${grabando ? 'border-red-400 text-red-600 animate-pulse' : 'border-gray-300'}`}>
                    {grabando ? '⏹' : '🎤'}
                  </button>
                  <button type="button" onClick={() => setMostrarEmojis(v => !v)}
                    disabled={conversacionActual && !conversacionActual.abierta}
                    className="border border-gray-300 rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40">
                    😀
                  </button>
                  {mostrarEmojis && (
                    <div className="absolute bottom-12 left-0 z-10">
                      <EmojiPicker
                        onEmojiClick={(emojiData) => { setTexto(t => t + emojiData.emoji); setMostrarEmojis(false); }}
                        searchDisabled={false}
                        skinTonesDisabled
                        width={300}
                        height={350}
                      />
                    </div>
                  )}
                  <textarea ref={inputTextoRef} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe una respuesta... (Enter para saltar de línea)"
                    disabled={conversacionActual && !conversacionActual.abierta}
                    rows={Math.min(6, texto.split('\n').length)}
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ht-accent disabled:bg-gray-50" />
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
