import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const PUEDE_COTIZAR = ['administrador', 'jefe_comercial', 'vendedor'];

const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const fecha = d => d ? new Date(d).toLocaleDateString('es-CL') : '';

const estadoColor = {
  borrador: 'bg-gray-100 text-gray-600', enviada: 'bg-blue-100 text-blue-700',
  vista: 'bg-ht-accent/20 text-ht-navy', aceptada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700', vencida: 'bg-amber-100 text-amber-700',
  reemplazada: 'bg-gray-100 text-gray-400',
};

export default function Cotizaciones() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cots, setCots] = useState([]);
  const [error, setError] = useState('');
  const [negocios, setNegocios] = useState([]);
  const [showSelector, setShowSelector] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => { api.get('/cotizaciones').then(r => setCots(r.data)).catch(() => setError('No se pudieron cargar las cotizaciones.')); }, []);

  const abrirSelector = async () => {
    setShowSelector(true);
    try {
      const params = user?.rol === 'vendedor' ? { vendedor_id: user.id } : {};
      setNegocios((await api.get('/negocios', { params })).data);
    } catch { /* silencioso */ }
  };

  const filtrados = negocios.filter(n => {
    const texto = `${n.titulo} ${n.contacto_nombre || ''} ${n.contacto_apellido || ''} ${n.empresa_nombre || ''}`.toLowerCase();
    return texto.includes(q.toLowerCase());
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ht-navy">Cotizaciones</h1>
        {PUEDE_COTIZAR.includes(user?.rol) && (
          <button onClick={abrirSelector} className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90">
            + Nueva cotización
          </button>
        )}
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Número</th>
              <th className="text-left px-4 py-2 font-medium">Negocio</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
              <th className="text-right px-4 py-2 font-medium">Total</th>
              <th className="text-left px-4 py-2 font-medium">Fecha</th>
              <th className="text-left px-4 py-2 font-medium">Vendedor</th>
            </tr>
          </thead>
          <tbody>
            {cots.map(c => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-ht-navy font-medium">
                  <Link to={`/cotizaciones/${c.id}`} className="hover:underline">{c.numero} <span className="text-gray-400">v{c.version}</span></Link>
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {c.negocio_titulo}
                  {c.titulo && <span className="block text-xs text-gray-400">{c.titulo}</span>}
                </td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${estadoColor[c.estado] || ''}`}>{c.estado}</span></td>
                <td className="px-4 py-2 text-right text-ht-navy">{money(c.total)}</td>
                <td className="px-4 py-2 text-gray-500">{fecha(c.created_at)}</td>
                <td className="px-4 py-2 text-gray-500">{c.creado_por}</td>
              </tr>
            ))}
            {cots.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin cotizaciones aún.</td></tr>}
          </tbody>
        </table>
      </div>

      {showSelector && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowSelector(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <h2 className="font-semibold text-ht-navy text-lg mb-3">Elige el negocio a cotizar</h2>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título, contacto o empresa…"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            <div className="flex-1 overflow-y-auto space-y-1">
              {filtrados.map(n => (
                <button key={n.id} onClick={() => navigate(`/negocios/${n.id}/cotizar`)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 border border-transparent hover:border-gray-200">
                  <div className="text-sm text-ht-navy font-medium">{n.titulo}</div>
                  <div className="text-xs text-gray-500">
                    {n.contacto_nombre} {n.contacto_apellido || ''}{n.empresa_nombre ? ` · ${n.empresa_nombre}` : ''} · {n.etapa_nombre}
                  </div>
                </button>
              ))}
              {filtrados.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Sin negocios que coincidan.</p>}
            </div>
            <button onClick={() => setShowSelector(false)} className="mt-3 px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 self-end">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
