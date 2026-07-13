import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const fecha = d => d ? new Date(d).toLocaleString('es-CL') : '';

export default function ColaAsignacion() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState('nuevo');
  const [leads, setLeads] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [sel, setSel] = useState({}); // leadId -> vendedorId elegido
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');

  const cargar = async () => {
    try { setLeads((await api.get('/leads', { params: estado === 'todos' ? {} : { estado } })).data); }
    catch { setError('No se pudieron cargar los leads.'); }
  };
  useEffect(() => { cargar(); }, [estado]);
  useEffect(() => { api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {}); }, []);

  const asignar = async (lead) => {
    const vid = sel[lead.id] || lead.vendedor_sugerido_id;
    if (!vid) { setError('Selecciona un vendedor.'); return; }
    setError(''); setMsg('');
    try { await api.post(`/leads/${lead.id}/asignar`, { vendedor_id: Number(vid) }); setMsg('Lead asignado.'); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'Error al asignar.'); }
  };
  const convertir = async (lead) => {
    setError(''); setMsg('');
    try { const { data } = await api.post(`/leads/${lead.id}/convertir`, {}); navigate(`/negocios/${data.negocio_id}`); }
    catch (err) { setError(err.response?.data?.error || 'Error al convertir.'); }
  };
  const descartar = async (lead) => {
    if (!window.confirm('¿Descartar este lead?')) return;
    try { await api.post(`/leads/${lead.id}/descartar`); cargar(); } catch { setError('Error al descartar.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-4">Cola de asignación</h1>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="mb-4 flex gap-2">
        {['nuevo', 'asignado', 'convertido', 'todos'].map(e => (
          <button key={e} onClick={() => setEstado(e)}
            className={`text-sm px-3 py-1.5 rounded capitalize ${estado === e ? 'bg-ht-navy text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{e}</button>
        ))}
      </div>

      <div className="space-y-3">
        {leads.map(l => (
          <div key={l.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-ht-navy font-medium">
                  {l.contacto_nombre} {l.contacto_apellido}
                  {l.empresa_nombre && <span className="text-gray-400 font-normal"> · {l.empresa_nombre}</span>}
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-ht-accent/15 text-ht-navy">{l.origen}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{l.contacto_email || '—'} · {l.contacto_telefono || '—'} · {fecha(l.created_at)}</div>
                {l.producto_nombre && <div className="text-xs text-gray-600 mt-1">Interés: <strong>{l.producto_nombre}</strong></div>}
                {l.mensaje_formulario && <div className="text-sm text-gray-700 mt-1 bg-slate-50 rounded p-2">{l.mensaje_formulario}</div>}
                {l.pagina_origen && <div className="text-[11px] text-gray-400 mt-1">{l.pagina_origen}</div>}
              </div>
              <div className="flex-shrink-0 w-56">
                {l.estado === 'nuevo' && (
                  <>
                    {l.sugerido_nombre && <div className="text-xs text-gray-500 mb-1">Sugerido: <strong className="text-ht-navy">{l.sugerido_nombre}</strong></div>}
                    <select value={sel[l.id] || l.vendedor_sugerido_id || ''} onChange={e => setSel({ ...sel, [l.id]: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-ht-accent">
                      <option value="">— Vendedor —</option>
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => asignar(l)} className="flex-1 bg-ht-navy text-white text-sm py-1.5 rounded hover:bg-ht-navy/90">Asignar</button>
                      <button onClick={() => descartar(l)} className="text-sm px-2 py-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">✕</button>
                    </div>
                  </>
                )}
                {l.estado === 'asignado' && (
                  <>
                    <div className="text-xs text-gray-500 mb-2">Asignado a <strong className="text-ht-navy">{l.asignado_nombre}</strong></div>
                    <button onClick={() => convertir(l)} className="w-full bg-ht-navy text-white text-sm py-1.5 rounded hover:bg-ht-navy/90">Convertir a negocio</button>
                  </>
                )}
                {l.estado === 'convertido' && (
                  <button onClick={() => navigate(`/negocios/${l.negocio_id}`)} className="w-full border border-ht-navy text-ht-navy text-sm py-1.5 rounded hover:bg-ht-navy/5">Ver negocio</button>
                )}
                {l.estado === 'descartado' && <div className="text-xs text-gray-400 text-right">Descartado</div>}
              </div>
            </div>
          </div>
        ))}
        {leads.length === 0 && <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">Sin leads en este estado.</div>}
      </div>
    </div>
  );
}
