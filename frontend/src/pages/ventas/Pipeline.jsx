import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const money = v => v ? `$${Number(v).toLocaleString('es-CL')}` : '$0';
const PUEDE_EXPORTAR = ['administrador', 'jefe_comercial'];

export default function Pipeline() {
  const { user } = useAuth();
  const [negocios, setNegocios] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [causas, setCausas] = useState([]);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(null);
  const [modalPerdido, setModalPerdido] = useState(null); // {negocio, etapa}
  const [causaSel, setCausaSel] = useState(''); const [detalle, setDetalle] = useState('');
  const [showNuevo, setShowNuevo] = useState(false);

  const cargar = async () => {
    try { setNegocios((await api.get('/negocios')).data); }
    catch { setError('No se pudieron cargar los negocios.'); }
  };
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    api.get('/config/pipeline-etapas').then(r => setEtapas(r.data.filter(e => e.activo))).catch(() => {});
    api.get('/config/causas-no-cierre').then(r => setCausas(r.data.filter(c => c.activo))).catch(() => {});
  }, []);

  const mover = async (negocio, etapa, extra = {}) => {
    if (negocio.etapa_id === etapa.id) return;
    try { await api.put(`/negocios/${negocio.id}/etapa`, { etapa_id: etapa.id, ...extra }); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar la etapa.'); }
  };

  const onDrop = (etapa) => {
    if (!drag) return;
    const negocio = drag; setDrag(null);
    if (etapa.tipo === 'perdida') { setModalPerdido({ negocio, etapa }); setCausaSel(''); setDetalle(''); }
    else mover(negocio, etapa);
  };

  const confirmarPerdido = async () => {
    if (!causaSel) return;
    await mover(modalPerdido.negocio, modalPerdido.etapa, { causa_no_cierre_id: Number(causaSel), causa_no_cierre_detalle: detalle });
    setModalPerdido(null);
  };

  const porEtapa = id => negocios.filter(n => n.etapa_id === id);

  const exportar = async () => {
    try {
      const { data } = await api.get('/negocios/exportar', { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = 'negocios.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('No se pudo exportar el listado.'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-ht-navy">Pipeline</h1>
        <div className="flex gap-2">
          {PUEDE_EXPORTAR.includes(user?.rol) && (
            <button onClick={exportar} className="px-4 py-2 rounded text-sm font-medium border border-ht-navy text-ht-navy hover:bg-ht-navy/5">
              Exportar CSV
            </button>
          )}
          <button onClick={() => setShowNuevo(true)} className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90">+ Nuevo negocio</button>
        </div>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {etapas.map(et => {
          const items = porEtapa(et.id);
          const total = items.reduce((s, n) => s + (Number(n.monto_estimado) || 0), 0);
          const ponderado = items.reduce((s, n) => s + (Number(n.monto_estimado) || 0) * ((n.probabilidad_cierre ?? et.probabilidad_cierre) / 100), 0);
          return (
            <div key={et.id}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(et)}
              className="flex-shrink-0 w-64 bg-slate-100 rounded-lg p-2">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-sm font-semibold text-ht-navy">{et.nombre}</span>
                <span className="text-xs text-gray-500">{items.length} · {et.probabilidad_cierre}%</span>
              </div>
              <div className="text-xs text-gray-500 px-1 mb-2">
                {money(total)}{et.tipo === 'abierta' && ponderado > 0 && <span className="text-ht-accent"> · pond. {money(Math.round(ponderado))}</span>}
              </div>
              <div className="space-y-2 min-h-[40px]">
                {items.map(n => (
                  <div key={n.id} draggable onDragStart={() => setDrag(n)}
                    className="bg-white rounded-md border border-gray-200 p-3 cursor-move hover:border-ht-accent">
                    <Link to={`/negocios/${n.id}`} className="block text-sm font-medium text-ht-navy hover:underline">{n.titulo}</Link>
                    <div className="text-xs text-gray-500 mt-1">{n.contacto_nombre} {n.contacto_apellido}</div>
                    {n.empresa_nombre && <div className="text-xs text-gray-400">{n.empresa_nombre}</div>}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-medium text-ht-navy">{money(n.monto_estimado)}</span>
                      <span className="text-[11px] text-gray-400">{n.probabilidad_cierre ?? et.probabilidad_cierre}%</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-gray-400">{n.vendedor_nombre}</span>
                      {et.tipo === 'abierta' && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${n.dias_sin_actividad > 7 ? 'bg-red-100 text-red-700' : 'text-gray-400'}`}>{n.dias_sin_actividad}d</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modalPerdido && (
        <Modal onClose={() => setModalPerdido(null)}>
          <h2 className="font-semibold text-ht-navy text-lg mb-3">Marcar como {modalPerdido.etapa.nombre}</h2>
          <p className="text-sm text-gray-500 mb-3">La causa de no cierre es obligatoria.</p>
          <select value={causaSel} onChange={e => setCausaSel(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">— Selecciona causa —</option>
            {causas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <textarea value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Detalle (opcional)" rows={2}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <div className="flex gap-2">
            <button onClick={confirmarPerdido} disabled={!causaSel}
              className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90 disabled:opacity-50">Confirmar</button>
            <button onClick={() => setModalPerdido(null)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
          </div>
        </Modal>
      )}

      {showNuevo && <NuevoNegocio onClose={() => setShowNuevo(false)} onCreado={() => { setShowNuevo(false); cargar(); }} />}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-md">{children}</div>
    </div>
  );
}

function NuevoNegocio({ onClose, onCreado }) {
  const [q, setQ] = useState(''); const [resultados, setResultados] = useState([]);
  const [contacto, setContacto] = useState(null);
  const [titulo, setTitulo] = useState(''); const [monto, setMonto] = useState('');
  const [error, setError] = useState('');

  const buscar = async val => {
    setQ(val);
    if (val.length < 2) { setResultados([]); return; }
    try { setResultados((await api.get('/contactos', { params: { q: val } })).data.slice(0, 8)); } catch { /* */ }
  };

  const crear = async e => {
    e.preventDefault(); setError('');
    if (!contacto) { setError('Selecciona un contacto.'); return; }
    try {
      await api.post('/negocios', { contacto_id: contacto.id, titulo, monto_estimado: monto || null });
      onCreado();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear.'); }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-semibold text-ht-navy text-lg mb-3">Nuevo negocio</h2>
      {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      <form onSubmit={crear} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Contacto</label>
          {contacto ? (
            <div className="flex items-center justify-between border border-gray-300 rounded px-3 py-2 text-sm">
              <span>{contacto.nombre} {contacto.apellido} {contacto.empresa_nombre ? `· ${contacto.empresa_nombre}` : ''}</span>
              <button type="button" onClick={() => setContacto(null)} className="text-ht-accent text-xs hover:underline">cambiar</button>
            </div>
          ) : (
            <>
              <input value={q} onChange={e => buscar(e.target.value)} placeholder="Buscar contacto…"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              {resultados.length > 0 && (
                <div className="border border-gray-200 rounded mt-1 max-h-40 overflow-y-auto">
                  {resultados.map(c => (
                    <button type="button" key={c.id} onClick={() => { setContacto(c); setResultados([]); }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">
                      {c.nombre} {c.apellido} <span className="text-gray-400">{c.empresa_nombre || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Título</label>
          <input required value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Bomba pozo profundo 2 HP"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Monto estimado (opcional)</label>
          <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90">Crear</button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
