import { useEffect, useState } from 'react';
import api from '../../api';

const money = v => `$${Number(v || 0).toLocaleString('es-CL')}`;

export default function Reportes() {
  const [embudo, setEmbudo] = useState([]);
  const [causas, setCausas] = useState([]);
  const [tiempos, setTiempos] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/reportes/embudo'),
      api.get('/reportes/causas-no-cierre'),
      api.get('/reportes/tiempos-etapa'),
      api.get('/reportes/ranking-vendedores'),
    ]).then(([e, c, t, r]) => {
      setEmbudo(e.data); setCausas(c.data); setTiempos(t.data); setRanking(r.data);
    }).catch(() => setError('No se pudieron cargar los reportes.'));
  }, []);

  const exportar = async tipo => {
    try {
      const { data } = await api.get('/reportes/export', { params: { tipo }, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = `reporte_${tipo}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('No se pudo exportar el reporte.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-6">Reportes</h1>
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <Seccion titulo="Embudo por etapa" onExportar={() => exportar('embudo')}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr><th className="text-left px-4 py-2 font-medium">Etapa</th><th className="text-left px-4 py-2 font-medium">Negocios</th><th className="text-right px-4 py-2 font-medium">Monto estimado</th></tr>
          </thead>
          <tbody>
            {embudo.map(e => (
              <tr key={e.etapa_id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-ht-navy">{e.etapa_nombre}</td>
                <td className="px-4 py-2 text-gray-600">{e.cantidad}</td>
                <td className="px-4 py-2 text-right text-ht-navy">{money(e.monto_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Seccion>

      <Seccion titulo="Causas de no cierre" onExportar={() => exportar('causas')}>
        {causas.length === 0 ? <p className="text-sm text-gray-400 px-4 py-4">Sin negocios perdidos en el rango.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr><th className="text-left px-4 py-2 font-medium">Causa</th><th className="text-left px-4 py-2 font-medium">Negocios</th><th className="text-right px-4 py-2 font-medium">Monto perdido</th></tr>
            </thead>
            <tbody>
              {causas.map(c => (
                <tr key={c.causa} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-ht-navy">{c.causa}</td>
                  <td className="px-4 py-2 text-gray-600">{c.cantidad}</td>
                  <td className="px-4 py-2 text-right text-ht-navy">{money(c.monto_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo="Tiempo promedio por etapa" onExportar={() => exportar('tiempos')}>
        {tiempos.length === 0 ? <p className="text-sm text-gray-400 px-4 py-4">Aún no hay tramos cerrados para calcular.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr><th className="text-left px-4 py-2 font-medium">Etapa</th><th className="text-left px-4 py-2 font-medium">Días promedio</th><th className="text-left px-4 py-2 font-medium">Tramos medidos</th></tr>
            </thead>
            <tbody>
              {tiempos.map(t => (
                <tr key={t.etapa_id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-ht-navy">{t.etapa_nombre}</td>
                  <td className="px-4 py-2 text-gray-600">{t.dias_promedio}</td>
                  <td className="px-4 py-2 text-gray-600">{t.tramos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo="Ranking de vendedores" onExportar={() => exportar('ranking')}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Vendedor</th>
              <th className="text-left px-4 py-2 font-medium">Ganados</th>
              <th className="text-left px-4 py-2 font-medium">Perdidos</th>
              <th className="text-left px-4 py-2 font-medium">Tasa de cierre</th>
              <th className="text-right px-4 py-2 font-medium">Monto ganado</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map(r => (
              <tr key={r.vendedor_id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-ht-navy">{r.vendedor_nombre}</td>
                <td className="px-4 py-2 text-gray-600">{r.ganados}</td>
                <td className="px-4 py-2 text-gray-600">{r.perdidos}</td>
                <td className="px-4 py-2 text-gray-600">{r.tasa_cierre_pct ?? '—'}%</td>
                <td className="px-4 py-2 text-right text-ht-navy">{money(r.monto_ganado)}</td>
              </tr>
            ))}
            {ranking.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin datos aún.</td></tr>}
          </tbody>
        </table>
      </Seccion>
    </div>
  );
}

function Seccion({ titulo, onExportar, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-ht-navy">{titulo}</h2>
        <button onClick={onExportar} className="text-xs text-ht-accent hover:underline">Exportar CSV</button>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {children}
      </div>
    </div>
  );
}
