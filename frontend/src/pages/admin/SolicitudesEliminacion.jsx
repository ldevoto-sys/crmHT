import { useEffect, useState } from 'react';
import api from '../../api';

export default function SolicitudesEliminacion() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [meses, setMeses] = useState('');
  const [guardandoMeses, setGuardandoMeses] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/privacidad/solicitudes', soloPendientes ? { params: { estado: 'pendiente' } } : {});
      setSolicitudes(data);
    } catch { setError('No se pudieron cargar las solicitudes.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, [soloPendientes]);

  useEffect(() => {
    api.get('/config/privacidad').then(({ data }) => setMeses(String(data.meses_inactividad))).catch(() => {});
  }, []);

  const guardarMeses = async () => {
    setGuardandoMeses(true); setError(''); setMsg('');
    try {
      await api.put('/config/privacidad', { meses_inactividad: Number(meses) });
      setMsg('Configuración actualizada.');
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
    finally { setGuardandoMeses(false); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-2">Solicitudes de eliminación de datos</h1>
      <p className="text-gray-500 text-sm mb-6">
        Ley 21.719. Un contacto que pide "eliminar mis datos" por WhatsApp aparece acá automáticamente;
        las solicitudes por correo (info@hidrotecnica.cl) se cargan a mano. Anonimizar borra los datos
        identificables del contacto (nombre, teléfono, email, RUT, cargo) — no toca mensajes ni notas.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex items-center gap-3">
        <label className="text-sm text-gray-700">Meses de inactividad (aviso de privacidad + purga automática):</label>
        <input type="number" min="1" value={meses} onChange={e => setMeses(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-20" />
        <button onClick={guardarMeses} disabled={guardandoMeses}
          className="bg-ht-accent text-ht-navy px-3 py-1 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
          {guardandoMeses ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <label className="flex items-center gap-2 text-sm text-gray-600 mb-3">
        <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />
        Solo pendientes
      </label>

      {loading ? (
        <p className="text-gray-400">Cargando…</p>
      ) : solicitudes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No hay solicitudes {soloPendientes ? 'pendientes' : ''}.
        </div>
      ) : (
        <div className="space-y-4">
          {solicitudes.map(s => (
            <Solicitud key={s.id} solicitud={s} onResuelta={() => { setMsg('Solicitud resuelta.'); cargar(); }} onError={setError} />
          ))}
        </div>
      )}
    </div>
  );
}

function Solicitud({ solicitud: s, onResuelta, onError }) {
  const [tieneFacturas, setTieneFacturas] = useState(false);
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const esPendiente = s.estado === 'pendiente';

  const resolver = async estado => {
    setEnviando(true); onError('');
    try {
      await api.put(`/privacidad/solicitudes/${s.id}/resolver`, { estado, tiene_facturas: tieneFacturas, notas_resolucion: notas });
      onResuelta();
    } catch (err) { onError(err.response?.data?.error || 'Error al resolver la solicitud.'); }
    finally { setEnviando(false); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-ht-navy font-medium">
          {s.contacto_nombre} {s.contacto_apellido || ''} — {s.telefono_e164 || s.contacto_email || 'sin contacto directo'}
        </p>
        <span className={`text-xs px-2 py-0.5 rounded ${
          s.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-700' :
          s.estado === 'anonimizado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>{s.estado}</span>
      </div>
      <p className="text-sm text-gray-500 mb-1">Origen: {s.origen} · {new Date(s.created_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>
      {s.texto_solicitud && <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded p-2 mb-3">"{s.texto_solicitud}"</p>}

      {esPendiente ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={tieneFacturas} onChange={e => setTieneFacturas(e.target.checked)} />
            El contacto tiene boletas/facturas asociadas (se conserva el registro contable en Softland; esto no cambia la anonimización)
          </label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas de la revisión (opcional)"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm" rows={2} />
          <div className="flex gap-2">
            <button onClick={() => resolver('anonimizado')} disabled={enviando}
              className="bg-ht-accent text-ht-navy px-3 py-1.5 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
              Anonimizar
            </button>
            <button onClick={() => resolver('rechazada')} disabled={enviando}
              className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50 disabled:opacity-50">
              Rechazar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          Resuelta por {s.resuelta_por_nombre || '—'} el {s.resuelta_en ? new Date(s.resuelta_en).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : '—'}
          {s.tiene_facturas != null && ` · ${s.tiene_facturas ? 'tenía' : 'no tenía'} facturas`}
        </p>
      )}
    </div>
  );
}
