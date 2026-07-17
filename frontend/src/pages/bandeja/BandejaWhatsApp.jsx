import { useEffect, useRef, useState } from 'react';
import api from '../../api';

const fecha = d => d ? new Date(d).toLocaleString('es-CL') : '';
const ESTADOS = ['todos', 'nuevo', 'asignado', 'convertido', 'descartado'];

export default function BandejaWhatsApp() {
  const [conversaciones, setConversaciones] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroAbierta, setFiltroAbierta] = useState('todas');
  const [seleccionada, setSeleccionada] = useState(null); // contacto_id
  const [hilo, setHilo] = useState([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState(''); const [errorEnvio, setErrorEnvio] = useState('');
  const hiloRef = useRef(null);

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
              className={`text-sm px-3 py-1.5 rounded capitalize ${filtroEstado === e ? 'bg-ht-navy text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{e}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {['todas', 'abiertas', 'cerradas'].map(a => (
            <button key={a} onClick={() => setFiltroAbierta(a)}
              className={`text-sm px-3 py-1.5 rounded capitalize ${filtroAbierta === a ? 'bg-ht-navy text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{a}</button>
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
              <div ref={hiloRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {hilo.map(m => (
                  <div key={m.id} className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${m.direccion === 'saliente' ? 'ml-auto bg-ht-navy text-white' : 'bg-slate-100 text-gray-800'}`}>
                    <div>{m.texto}</div>
                    <div className={`text-[10px] mt-1 ${m.direccion === 'saliente' ? 'text-white/60' : 'text-gray-400'}`}>
                      {m.enviado_por_nombre ? `${m.enviado_por_nombre} · ` : ''}{fecha(m.created_at)}
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
                <div className="flex gap-2">
                  <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe una respuesta..."
                    disabled={conversacionActual && !conversacionActual.abierta}
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent disabled:bg-gray-50" />
                  <button type="submit" disabled={conversacionActual && !conversacionActual.abierta}
                    className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90 disabled:opacity-40">
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
