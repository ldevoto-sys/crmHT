import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const fecha = d => d ? new Date(d).toLocaleDateString('es-CL') : '';

const estadoColor = {
  borrador: 'bg-gray-100 text-gray-600', enviada: 'bg-blue-100 text-blue-700',
  vista: 'bg-ht-accent/20 text-ht-navy', aceptada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700', vencida: 'bg-amber-100 text-amber-700',
  reemplazada: 'bg-gray-100 text-gray-400',
};

export default function Cotizaciones() {
  const [cots, setCots] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/cotizaciones').then(r => setCots(r.data)).catch(() => setError('No se pudieron cargar las cotizaciones.')); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-6">Cotizaciones</h1>
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
                <td className="px-4 py-2 text-gray-600">{c.negocio_titulo}</td>
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
    </div>
  );
}
