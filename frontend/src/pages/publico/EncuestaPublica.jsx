import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';

const NAVY = '#112548', CYAN = '#34B3DE';

export default function EncuestaPublica() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [puntaje, setPuntaje] = useState(null);
  const [comentario, setComentario] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get(`/public/encuesta/${token}`).then(r => setInfo(r.data)).catch(() => setError('Encuesta no encontrada o link inválido.'));
  }, [token]);

  const enviar = async e => {
    e.preventDefault();
    if (puntaje === null) return;
    setEnviando(true); setError('');
    try {
      await api.post(`/public/encuesta/${token}`, { puntaje, comentario });
      setEnviado(true);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo enviar la respuesta.'); }
    finally { setEnviando(false); }
  };

  if (error) return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-gray-500 px-4 text-center">{error}</div>;
  if (!info) return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-gray-400">Cargando…</div>;

  const mostrarGracias = enviado || info.ya_respondida;

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 flex items-start justify-center">
      <div className="max-w-lg w-full bg-white rounded shadow-sm overflow-hidden">
        <div style={{ background: NAVY }} className="px-6 py-5 flex items-center gap-3">
          <img src="/Hidrotecnica.jpg" alt="HidroTécnica" className="h-9 bg-white rounded px-2 py-1 object-contain" />
          <span className="font-bold uppercase tracking-wide text-sm" style={{ color: CYAN }}>Encuesta de satisfacción</span>
        </div>
        <div style={{ background: CYAN }} className="h-1" />

        <div className="p-6">
          {mostrarGracias ? (
            <p className="text-center py-8" style={{ color: NAVY }}>¡Gracias por tu respuesta!</p>
          ) : (
            <form onSubmit={enviar}>
              <p className="text-sm text-gray-600 mb-1">{info.empresa_nombre || info.negocio_titulo}</p>
              <p className="font-medium mb-4" style={{ color: NAVY }}>{info.pregunta}</p>
              <div className="grid grid-cols-11 gap-1 mb-4">
                {Array.from({ length: 11 }, (_, i) => i).map(n => (
                  <button type="button" key={n} onClick={() => setPuntaje(n)}
                    className={`h-9 rounded text-sm font-medium border ${puntaje === n ? 'text-white' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                    style={puntaje === n ? { background: NAVY, borderColor: NAVY } : {}}>
                    {n}
                  </button>
                ))}
              </div>
              <label className="block text-sm text-gray-700 mb-1">Comentario (opcional)</label>
              <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': CYAN }} />
              {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
              <button type="submit" disabled={puntaje === null || enviando}
                className="w-full text-white py-2.5 rounded font-medium disabled:opacity-50" style={{ background: NAVY }}>
                {enviando ? 'Enviando…' : 'Enviar respuesta'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
