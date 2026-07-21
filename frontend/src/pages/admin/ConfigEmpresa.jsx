import { useEffect, useState } from 'react';
import api from '../../api';

const campos = [
  ['razon_social', 'Razón social'], ['rut', 'RUT'], ['direccion', 'Dirección'],
  ['comuna', 'Comuna'], ['ciudad', 'Ciudad'], ['telefono', 'Teléfono'], ['whatsapp', 'WhatsApp'],
  ['email_ventas', 'Email ventas'], ['email_cobranzas', 'Email cobranzas'], ['sitio_web', 'Sitio web'],
  ['banco', 'Banco'], ['cuenta_tipo', 'Tipo de cuenta'], ['cuenta_numero', 'N° de cuenta'],
];

export default function ConfigEmpresa() {
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState(''); const [error, setError] = useState('');

  useEffect(() => { api.get('/config/empresa').then(r => setForm(r.data || {})).catch(() => {}); }, []);

  const submit = async e => {
    e.preventDefault(); setMsg(''); setError('');
    try { await api.put('/config/empresa', form); setMsg('Datos de empresa actualizados.'); }
    catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Datos de empresa</h1>
      <p className="text-gray-500 text-sm mb-6">Emisor y datos bancarios que aparecen en las cotizaciones al cliente.</p>

      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 max-w-2xl grid grid-cols-2 gap-4">
        {campos.map(([k, label]) => (
          <div key={k}>
            <label className="block text-sm text-gray-700 mb-1">{label}</label>
            <input value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
        ))}
        <div className="col-span-2">
          <label className="block text-sm text-gray-700 mb-1">Mensaje al enviar cotización por WhatsApp</label>
          <textarea required rows={2} value={form.mensaje_cotizacion_whatsapp || ''}
            onChange={e => setForm({ ...form, mensaje_cotizacion_whatsapp: e.target.value })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm text-gray-700 mb-1">Mensaje al enviar cotización por correo</label>
          <textarea required rows={2} value={form.mensaje_cotizacion_email || ''}
            onChange={e => setForm({ ...form, mensaje_cotizacion_email: e.target.value })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <p className="text-xs text-gray-400 mt-1">Si la cotización tiene título, se agrega automáticamente al final (ej. "…: Proyecto X").</p>
        </div>
        <div className="col-span-2 border-t border-gray-200 pt-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
            <input type="checkbox" checked={form.incluir_whatsapp_email !== false}
              onChange={e => setForm({ ...form, incluir_whatsapp_email: e.target.checked })} />
            Incluir botón de WhatsApp en el correo de cotización
          </label>
          <textarea rows={2} disabled={form.incluir_whatsapp_email === false} value={form.mensaje_whatsapp_email || ''}
            onChange={e => setForm({ ...form, mensaje_whatsapp_email: e.target.value })}
            placeholder="Texto que acompaña el botón de WhatsApp en el correo"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent disabled:bg-gray-50 disabled:text-gray-400" />
        </div>
        <div className="col-span-2">
          <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Guardar</button>
        </div>
      </form>
    </div>
  );
}
