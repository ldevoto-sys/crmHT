import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';

const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const fecha = d => d ? new Date(d).toLocaleDateString('es-CL') : '';

export default function CotizacionPublica() {
  const { token } = useParams();
  const [cot, setCot] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/public/cotizacion/${token}`).then(r => setCot(r.data)).catch(() => setError('Cotización no encontrada o link inválido.'));
  }, [token]);

  if (error) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">{error}</div>;
  if (!cot) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">Cargando…</div>;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="bg-ht-navy text-white px-8 py-6 flex items-center justify-between">
          <div>
            <div className="text-xl font-bold">HidroTecnica SpA</div>
            <div className="text-ht-accent text-sm">Cotización comercial</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-bold text-lg">{cot.numero}</div>
            <div className="text-white/70">v{cot.version} · {fecha(cot.created_at)}</div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <div className="text-xs text-gray-400 uppercase mb-1">Cliente</div>
              {cot.cliente.empresa_nombre && <div className="text-ht-navy font-medium">{cot.cliente.empresa_nombre}</div>}
              <div>{cot.cliente.contacto_nombre} {cot.cliente.contacto_apellido}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase mb-1">Validez</div>
              <div>{cot.validez_dias} días</div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ht-navy text-white">
                <th className="text-left px-3 py-2 font-medium rounded-l">Descripción</th>
                <th className="text-right px-3 py-2 font-medium">Cant.</th>
                <th className="text-right px-3 py-2 font-medium">P. unitario</th>
                <th className="text-right px-3 py-2 font-medium rounded-r">Total</th>
              </tr>
            </thead>
            <tbody>
              {cot.items.map((it, i) => (
                <tr key={i} className={i % 2 ? 'bg-slate-50' : ''}>
                  <td className="px-3 py-2 text-ht-navy">{it.descripcion}</td>
                  <td className="px-3 py-2 text-right">{Number(it.cantidad)}</td>
                  <td className="px-3 py-2 text-right">{money(it.precio_unitario)}</td>
                  <td className="px-3 py-2 text-right">{money(it.total_linea)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 ml-auto max-w-xs text-sm">
            <div className="flex justify-between text-gray-600 py-1"><span>Subtotal</span><span>{money(cot.subtotal)}</span></div>
            {Number(cot.descuento_pct) > 0 && <div className="flex justify-between text-gray-600 py-1"><span>Descuento ({Number(cot.descuento_pct)}%)</span><span>−{money(cot.subtotal - cot.total)}</span></div>}
            <div className="flex justify-between font-bold text-ht-navy text-lg border-t border-gray-200 pt-2 mt-1"><span>Total</span><span>{money(cot.total)}</span></div>
          </div>

          {cot.condiciones && (
            <div className="mt-6 text-xs text-gray-500 whitespace-pre-wrap border-t border-gray-100 pt-4">{cot.condiciones}</div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="text-sm text-gray-500">
              <div className="text-ht-navy font-medium">{cot.vendedor.nombre}</div>
              <div>{cot.vendedor.email}</div>
            </div>
            <a href={`/api/public/cotizacion/${token}/pdf`} target="_blank" rel="noreferrer"
              className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90">Descargar PDF</a>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-4">HidroTecnica SpA · www.hidrotecnica.cl</p>
    </div>
  );
}
