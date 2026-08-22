import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

const money = v => `$${Number(v || 0).toLocaleString('es-CL')}`;
const moneyCompacto = v => new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v || 0));

function rangoMesEnCurso() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const pad = n => String(n).padStart(2, '0');
  const ultimoDia = new Date(y, m + 1, 0).getDate();
  return {
    desde: `${y}-${pad(m + 1)}-01`,
    hasta: `${y}-${pad(m + 1)}-${pad(ultimoDia)}`,
    etiqueta: hoy.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
  };
}

function StatTile({ titulo, monto, cantidad, colorClase }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 flex-1 min-w-[220px]">
      <p className="text-sm text-gray-500 mb-1">{titulo}</p>
      <p className={`text-2xl font-bold ${colorClase}`}>{money(monto)}</p>
      <p className="text-xs text-gray-400 mt-1">{cantidad} {cantidad === 1 ? 'registro' : 'registros'}</p>
    </div>
  );
}

function TooltipActividad({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-ht-navy mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {money(p.value)}</p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [softland, setSoftland] = useState(null); // null = todavía no disponible (o el rol no tiene acceso) — se ocultan las tarjetas
  const { desde, hasta, etiqueta } = rangoMesEnCurso();

  useEffect(() => {
    api.get('/reportes/actividad-mes', { params: { desde, hasta } })
      .then(r => setDatos(r.data))
      .catch(() => setError('No se pudo cargar la actividad del mes.'))
      .finally(() => setCargando(false));
    // Notas de venta y facturas del mes en curso (Softland) — no todos los
    // roles tienen acceso a este endpoint (ej. callcenter); si falla, se
    // ocultan las tarjetas en silencio, sin mostrar error.
    api.get('/softland/reporte').then(r => setSoftland(r.data)).catch(() => setSoftland(null));
    // eslint-disable-next-line
  }, []);

  const hoy = new Date();
  const anioActual = hoy.getFullYear(), mesActual = hoy.getMonth() + 1;
  const softlandMes = softland?.mensual?.filter(m => m.anio === anioActual && m.mes === mesActual) || [];
  const nvMonto = softlandMes.reduce((s, m) => s + Number(m.cerrado_monto || 0), 0);
  const nvCant = softlandMes.reduce((s, m) => s + Number(m.cerrado_cant || 0), 0);
  const facturasMonto = softlandMes.reduce((s, m) => s + Number(m.facturado_monto || 0), 0);
  const facturasCant = softlandMes.reduce((s, m) => s + Number(m.facturado_cant || 0), 0);

  const totalCotizado = datos.reduce((s, d) => s + Number(d.cotizaciones_monto || 0), 0);
  const totalGanado = datos.reduce((s, d) => s + Number(d.ganados_monto || 0), 0);
  const cantCotizado = datos.reduce((s, d) => s + Number(d.cotizaciones_cantidad || 0), 0);
  const cantGanado = datos.reduce((s, d) => s + Number(d.ganados_cantidad || 0), 0);

  const datosGrafico = datos.map(d => ({
    vendedor: d.vendedor_nombre,
    Cotizado: Number(d.cotizaciones_monto || 0),
    'Cerrado ganado': Number(d.ganados_monto || 0),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Dashboard</h1>
      <p className="text-gray-500 mb-6">
        Bienvenido, {user?.nombre}. Rol: <span className="capitalize font-medium text-ht-navy">{user?.rol}</span>.
      </p>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Actividad de {etiqueta}</h2>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex flex-wrap gap-4 mb-6">
        <StatTile titulo="Cotizado en el mes" monto={totalCotizado} cantidad={cantCotizado} colorClase="text-ht-accent" />
        <StatTile titulo="Cerrado ganado en el mes" monto={totalGanado} cantidad={cantGanado} colorClase="text-ht-navy" />
        {softland && <StatTile titulo="Notas de venta del mes (Softland)" monto={nvMonto} cantidad={nvCant} colorClase="text-amber-600" />}
        {softland && <StatTile titulo="Facturas del mes (Softland)" monto={facturasMonto} cantidad={facturasCant} colorClase="text-emerald-600" />}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-ht-navy mb-4">Cotizado vs. cerrado ganado por vendedor</h3>
        {cargando ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : datosGrafico.length === 0 ? (
          <p className="text-sm text-gray-400">Sin actividad registrada este mes.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, datosGrafico.length * 60)}>
            <BarChart data={datosGrafico} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barGap={2} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tickFormatter={moneyCompacto} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
              <YAxis type="category" dataKey="vendedor" width={120} tick={{ fontSize: 12, fill: '#374151' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
              <Tooltip content={<TooltipActividad />} cursor={{ fill: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Cotizado" fill="#34B3DE" radius={[0, 4, 4, 0]} maxBarSize={28} />
              <Bar dataKey="Cerrado ganado" fill="#112548" radius={[0, 4, 4, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {datos.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Vendedor</th>
                <th className="text-right px-4 py-2 font-medium">Cotizaciones</th>
                <th className="text-right px-4 py-2 font-medium">Monto cotizado</th>
                <th className="text-right px-4 py-2 font-medium">Cerrados ganados</th>
                <th className="text-right px-4 py-2 font-medium">Monto ganado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {datos.map(d => (
                <tr key={d.vendedor_id}>
                  <td className="px-4 py-2 text-ht-navy font-medium">{d.vendedor_nombre}</td>
                  <td className="px-4 py-2 text-right">{d.cotizaciones_cantidad}</td>
                  <td className="px-4 py-2 text-right">{money(d.cotizaciones_monto)}</td>
                  <td className="px-4 py-2 text-right">{d.ganados_cantidad}</td>
                  <td className="px-4 py-2 text-right">{money(d.ganados_monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
