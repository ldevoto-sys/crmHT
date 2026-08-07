import { useState } from 'react';
import api from '../../api';

export default function Novedades() {
  const [titulo, setTitulo] = useState('');
  const [cambiosTexto, setCambiosTexto] = useState('');
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambios = cambiosTexto.split('\n').map(c => c.trim()).filter(Boolean);

  const enviar = async e => {
    e.preventDefault(); setError(''); setMsg('');
    if (!window.confirm(`Se enviará este correo a TODOS los usuarios activos. ¿Confirmas?`)) return;
    setEnviando(true);
    try {
      const { data } = await api.post('/novedades/enviar', { titulo, cambios });
      setMsg(`Enviado a ${data.enviados}/${data.total} usuarios.`);
      setTitulo(''); setCambiosTexto('');
    } catch (err) { setError(err.response?.data?.error || 'Error al enviar.'); }
    finally { setEnviando(false); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Avisar novedades</h1>
      <p className="text-gray-500 text-sm mb-6">
        Envía un correo a todos los usuarios activos informando los últimos cambios aplicados al CRM.
        Un cambio por línea.
      </p>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <form onSubmit={enviar} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Título del correo</label>
          <input required value={titulo} onChange={e => setTitulo(e.target.value)}
            placeholder="Ej: Novedades del CRM — 7 de agosto"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Cambios (uno por línea)</label>
          <textarea required rows={8} value={cambiosTexto} onChange={e => setCambiosTexto(e.target.value)}
            placeholder={'Ej:\nAhora puedes editar el monto estimado de un negocio a mano.\nEl monto estimado se actualiza solo al generar una cotización.'}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent font-mono" />
          <p className="text-xs text-gray-400 mt-1">{cambios.length} cambio(s) detectado(s).</p>
        </div>
        <button type="submit" disabled={enviando || cambios.length === 0}
          className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
          {enviando ? 'Enviando…' : 'Enviar a todos los usuarios'}
        </button>
      </form>
    </div>
  );
}
