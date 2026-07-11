import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';

const ETAPAS = ['lead', 'calificado', 'cotizado', 'negociacion', 'ganado', 'perdido'];
const money = v => v ? `$${Number(v).toLocaleString('es-CL')}` : '—';
const fecha = d => d ? new Date(d).toLocaleString('es-CL') : '';

export default function DetalleNegocio() {
  const { id } = useParams();
  const [n, setN] = useState(null);
  const [causas, setCausas] = useState([]);
  const [error, setError] = useState('');
  const [modalPerdido, setModalPerdido] = useState(false);
  const [causaSel, setCausaSel] = useState(''); const [detalle, setDetalle] = useState('');

  const cargar = async () => {
    try { setN((await api.get(`/negocios/${id}`)).data); }
    catch { setError('No se pudo cargar el negocio.'); }
  };
  useEffect(() => { cargar(); }, [id]);
  useEffect(() => { api.get('/config/causas-no-cierre').then(r => setCausas(r.data.filter(c => c.activo))).catch(() => {}); }, []);

  const cambiarEtapa = async (etapa, extra = {}) => {
    try { await api.put(`/negocios/${id}/etapa`, { etapa, ...extra }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar la etapa.'); }
  };

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!n) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <Link to="/pipeline" className="text-sm text-ht-accent hover:underline">← Pipeline</Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-2xl font-bold text-ht-navy">{n.titulo}</h1>
        <span className="text-sm px-3 py-1 rounded-full bg-ht-accent/15 text-ht-navy capitalize">{n.etapa}</span>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-3">Datos</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Dato label="Contacto" val={`${n.contacto_nombre} ${n.contacto_apellido || ''}`} />
              <Dato label="Empresa" val={n.empresa_nombre} />
              <Dato label="Email" val={n.contacto_email} />
              <Dato label="Teléfono" val={n.contacto_telefono} />
              <Dato label="Vendedor" val={n.vendedor_nombre} />
              <Dato label="Monto estimado" val={money(n.monto_estimado)} />
              {n.etapa === 'perdido' && <Dato label="Causa no cierre" val={n.causa_nombre} />}
              {n.fecha_cierre && <Dato label="Cierre" val={fecha(n.fecha_cierre)} />}
            </dl>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-3">Línea de tiempo</h2>
            {n.timeline.length === 0 ? <p className="text-sm text-gray-400">Sin eventos.</p> : (
              <ul className="space-y-3">
                {n.timeline.map(t => (
                  <li key={t.id} className="text-sm border-l-2 border-ht-accent/40 pl-3">
                    <div className="text-ht-navy">{t.descripcion}</div>
                    <div className="text-xs text-gray-400">{fecha(t.created_at)} · {t.usuario_nombre || 'sistema'} · {t.tipo}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 h-fit">
          <h2 className="font-semibold text-ht-navy mb-3">Cambiar etapa</h2>
          {!n.puede_editar ? (
            <p className="text-sm text-gray-400">Solo el vendedor dueño puede editar.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {ETAPAS.map(e => (
                <button key={e} disabled={e === n.etapa}
                  onClick={() => e === 'perdido' ? setModalPerdido(true) : cambiarEtapa(e)}
                  className={`text-sm px-3 py-2 rounded border text-left capitalize ${e === n.etapa ? 'bg-ht-navy text-white border-ht-navy' : 'border-gray-300 text-gray-700 hover:bg-slate-50'}`}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalPerdido && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setModalPerdido(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="font-semibold text-ht-navy text-lg mb-3">Marcar como perdido</h2>
            <select value={causaSel} onChange={e => setCausaSel(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent">
              <option value="">— Selecciona causa —</option>
              {causas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <textarea value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Detalle (opcional)" rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            <div className="flex gap-2">
              <button disabled={!causaSel}
                onClick={async () => { await cambiarEtapa('perdido', { causa_no_cierre_id: Number(causaSel), causa_no_cierre_detalle: detalle }); setModalPerdido(false); }}
                className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90 disabled:opacity-50">Confirmar</button>
              <button onClick={() => setModalPerdido(false)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dato({ label, val }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-ht-navy">{val || '—'}</dd>
    </div>
  );
}
