import { useEffect, useState } from 'react';
import api from '../../api';

export default function ConfigEncuesta() {
  const [pregunta, setPregunta] = useState('');
  const [msg, setMsg] = useState(''); const [error, setError] = useState('');

  useEffect(() => { api.get('/config/encuesta').then(r => setPregunta(r.data.pregunta || '')).catch(() => {}); }, []);

  const submit = async e => {
    e.preventDefault(); setMsg(''); setError('');
    try { await api.put('/config/encuesta', { pregunta }); setMsg('Pregunta actualizada.'); }
    catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Encuesta post-cierre</h1>
      <p className="text-gray-500 text-sm mb-6">
        Pregunta que ve el cliente al responder la encuesta (formato NPS: puntaje de 0 a 10 + comentario libre).
      </p>

      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 max-w-xl space-y-3">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Pregunta</label>
          <textarea required rows={3} value={pregunta} onChange={e => setPregunta(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <button type="submit" className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90">Guardar</button>
      </form>
    </div>
  );
}
