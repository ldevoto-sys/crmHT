import { useEffect, useState } from 'react';
import api from '../../api';

const DIAS = [
  { n: 1, lbl: 'L' }, { n: 2, lbl: 'M' }, { n: 3, lbl: 'M' }, { n: 4, lbl: 'J' },
  { n: 5, lbl: 'V' }, { n: 6, lbl: 'S' }, { n: 7, lbl: 'D' },
];
const opcionVacia = () => ({ label: '', categoria: '' });
const pasoVacio = () => ({ tiempo_espera_horas: 1, mensaje: '' });

export default function ConfigBotWhatsApp() {
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(true);

  const [diasHabiles, setDiasHabiles] = useState([1, 2, 3, 4, 5]);
  const [horaInicio, setHoraInicio] = useState('09:15');
  const [horaFin, setHoraFin] = useState('17:15');

  const [mensajeFueraHorario, setMensajeFueraHorario] = useState('');
  const [mensajeCategorizacion, setMensajeCategorizacion] = useState('');
  const [opciones, setOpciones] = useState([opcionVacia()]);
  const [mensajeConfirmacion, setMensajeConfirmacion] = useState('');
  const [bandejaAcceso, setBandejaAcceso] = useState('todos');
  const [recontactoRespetaHorario, setRecontactoRespetaHorario] = useState(true);
  const [pasosRecontacto, setPasosRecontacto] = useState([pasoVacio()]);

  useEffect(() => {
    Promise.all([api.get('/config/horario-atencion'), api.get('/config/whatsapp-bot')])
      .then(([h, w]) => {
        setDiasHabiles(h.data.dias_habiles);
        setHoraInicio(h.data.hora_inicio.slice(0, 5));
        setHoraFin(h.data.hora_fin.slice(0, 5));
        setMensajeFueraHorario(w.data.mensaje_fuera_horario);
        setMensajeCategorizacion(w.data.mensaje_categorizacion);
        setOpciones(w.data.opciones_categorizacion.length ? w.data.opciones_categorizacion : [opcionVacia()]);
        setMensajeConfirmacion(w.data.mensaje_confirmacion);
        setBandejaAcceso(w.data.bandeja_acceso);
        setRecontactoRespetaHorario(w.data.recontacto_respeta_horario);
        setPasosRecontacto(w.data.pasos_recontacto.map(p => ({ tiempo_espera_horas: p.tiempo_espera_horas, mensaje: p.mensaje })));
      })
      .catch(() => setError('No se pudo cargar la configuración.'))
      .finally(() => setCargando(false));
  }, []);

  const toggleDia = n => setDiasHabiles(dias => dias.includes(n) ? dias.filter(d => d !== n) : [...dias, n].sort());

  const agregarOpcion = () => setOpciones([...opciones, opcionVacia()]);
  const quitarOpcion = i => setOpciones(opciones.filter((_, idx) => idx !== i));
  const cambiarOpcion = (i, campo, val) => setOpciones(opciones.map((o, idx) => idx === i ? { ...o, [campo]: val } : o));

  const agregarPaso = () => setPasosRecontacto([...pasosRecontacto, pasoVacio()]);
  const quitarPaso = i => setPasosRecontacto(pasosRecontacto.filter((_, idx) => idx !== i));
  const cambiarPaso = (i, campo, val) => setPasosRecontacto(pasosRecontacto.map((p, idx) => idx === i ? { ...p, [campo]: val } : p));

  const guardar = async e => {
    e.preventDefault(); setError(''); setMsg('');
    if (diasHabiles.length === 0) { setError('Selecciona al menos un día hábil.'); return; }
    try {
      await api.put('/config/horario-atencion', { dias_habiles: diasHabiles, hora_inicio: horaInicio, hora_fin: horaFin });
      await api.put('/config/whatsapp-bot', {
        mensaje_fuera_horario: mensajeFueraHorario,
        mensaje_categorizacion: mensajeCategorizacion,
        opciones_categorizacion: opciones,
        mensaje_confirmacion: mensajeConfirmacion,
        bandeja_acceso: bandejaAcceso,
        recontacto_respeta_horario: recontactoRespetaHorario,
        pasos_recontacto: pasosRecontacto,
      });
      setMsg('Configuración guardada.');
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar la configuración.'); }
  };

  if (cargando) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Bot de WhatsApp</h1>
      <p className="text-gray-500 text-sm mb-4">
        Fuera de horario, el bot solo avisa y registra el lead. En horario hábil, pregunta para categorizar y
        asignar vendedor; si el cliente no responde, reintenta según la secuencia de recontacto y, al agotarla,
        cierra el lead automáticamente con causa identificable (no escala a un vendedor).
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <form onSubmit={guardar} className="space-y-6 max-w-3xl">
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-ht-navy">Horario de atención</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Días hábiles</label>
            <div className="flex gap-1.5">
              {DIAS.map(d => (
                <button key={d.n} type="button" onClick={() => toggleDia(d.n)}
                  className={`w-9 h-9 rounded-full text-sm font-medium border ${diasHabiles.includes(d.n) ? 'bg-ht-navy text-white border-ht-navy' : 'border-gray-300 text-gray-500'}`}>
                  {d.lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Hora inicio</label>
              <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Hora fin</label>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-ht-navy">Mensaje fuera de horario</h2>
          <textarea required rows={3} value={mensajeFueraHorario} onChange={e => setMensajeFueraHorario(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-ht-navy">Categorización (en horario hábil)</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Mensaje de la pregunta</label>
            <textarea required rows={2} value={mensajeCategorizacion} onChange={e => setMensajeCategorizacion(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ht-navy">Opciones (botones que ve el cliente)</label>
            {opciones.map((o, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Texto del botón</label>
                  <input required value={o.label} onChange={e => cambiarOpcion(i, 'label', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Categoría (para asignación)</label>
                  <input required value={o.categoria} onChange={e => cambiarOpcion(i, 'categoria', e.target.value)}
                    placeholder="debe coincidir con Reglas de asignación"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                {opciones.length > 1 && (
                  <button type="button" onClick={() => quitarOpcion(i)} className="text-red-500 hover:underline text-xs self-center mt-5">Quitar</button>
                )}
              </div>
            ))}
            <button type="button" onClick={agregarOpcion} className="text-sm text-ht-accent hover:underline">+ Agregar opción</button>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Mensaje de confirmación (al elegir una opción)</label>
            <textarea required rows={2} value={mensajeConfirmacion} onChange={e => setMensajeConfirmacion(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-ht-navy">Bandeja WhatsApp</h2>
          <label className="block text-sm text-gray-700 mb-1">¿Quién puede ver y responder las conversaciones?</label>
          <select value={bandejaAcceso} onChange={e => setBandejaAcceso(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="todos">Cualquier vendedor puede ver y responder todas las conversaciones</option>
            <option value="asignado">Solo el vendedor asignado al lead/negocio</option>
          </select>
          <p className="text-xs text-gray-400">Administrador y jefe comercial siempre ven todas las conversaciones, sin importar esta opción.</p>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-ht-navy">Secuencia de recontacto (si no responde a la categorización)</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={recontactoRespetaHorario} onChange={e => setRecontactoRespetaHorario(e.target.checked)} />
            Respetar horario hábil (no reintentar fuera de horario)
          </label>
          <div className="space-y-2">
            {pasosRecontacto.map((p, i) => (
              <div key={i} className="border border-gray-200 rounded p-3 flex flex-wrap gap-2 items-start">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Espera desde el paso anterior (horas)</label>
                  <input type="number" min="1" value={p.tiempo_espera_horas}
                    onChange={e => cambiarPaso(i, 'tiempo_espera_horas', Number(e.target.value))}
                    className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs text-gray-500 mb-1">Mensaje {i === pasosRecontacto.length - 1 ? '(último intento — se cierra el lead después de enviarlo)' : ''}</label>
                  <textarea required rows={2} value={p.mensaje} onChange={e => cambiarPaso(i, 'mensaje', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                {pasosRecontacto.length > 1 && (
                  <button type="button" onClick={() => quitarPaso(i)} className="text-red-500 hover:underline text-xs self-center">Quitar</button>
                )}
              </div>
            ))}
            <button type="button" onClick={agregarPaso} className="text-sm text-ht-accent hover:underline">+ Agregar intento</button>
          </div>
        </section>

        <button type="submit" className="bg-ht-navy text-white px-5 py-2 rounded text-sm font-medium hover:bg-ht-navy/90">Guardar configuración</button>
      </form>
    </div>
  );
}
