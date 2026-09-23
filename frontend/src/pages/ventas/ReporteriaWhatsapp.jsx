import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const PUEDE_FILTRAR_VENDEDOR = ['administrador', 'jefe_comercial', 'gerencia'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Mismo formato que ya usan las alertas de respuesta (backend
// services/alertasRespuestaWhatsapp.js#formatoTiempo) — "2 h 15 min" o
// "45 min" si es menos de una hora.
function formatoTiempo(minutos) {
  if (minutos === null || minutos === undefined) return '—';
  const m = Math.round(minutos);
  const horas = Math.floor(m / 60);
  const mins = m % 60;
  return horas > 0 ? `${horas} h ${mins} min` : `${mins} min`;
}
const fmtFecha = iso => (iso ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const mesActualYYYYMM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function TarjetaKpi({ color, label, valor, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 relative overflow-hidden pl-5">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />
      <div className="text-xs font-semibold text-gray-400 uppercase mb-1">{label}</div>
      <div className="text-2xl font-bold text-ht-navy">{valor}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function ReporteriaWhatsapp() {
  const { user } = useAuth();
  const puedeFiltrarVendedor = PUEDE_FILTRAR_VENDEDOR.includes(user?.rol);

  const [vendedores, setVendedores] = useState([]);
  const [vendedorId, setVendedorId] = useState('');
  const [mes, setMes] = useState(mesActualYYYYMM());

  const [resumenMensual, setResumenMensual] = useState([]);
  const [porVendedor, setPorVendedor] = useState([]);
  const [abiertas, setAbiertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [actualizando, setActualizando] = useState(false);
  const [mensajeActualizar, setMensajeActualizar] = useState('');

  useEffect(() => {
    if (puedeFiltrarVendedor) api.get('/users/con-cotizaciones').then(r => setVendedores(r.data)).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const cargarTodo = () => {
    setCargando(true); setError('');
    const params = vendedorId ? { vendedor_id: vendedorId } : {};
    Promise.all([
      api.get('/reportes/whatsapp/resumen-mensual', { params }),
      api.get('/reportes/whatsapp/por-vendedor', { params: { mes } }),
      api.get('/reportes/whatsapp/abiertas-ahora', { params }),
    ])
      .then(([r, v, a]) => { setResumenMensual(r.data); setPorVendedor(v.data); setAbiertas(a.data); })
      .catch(() => setError('No se pudieron cargar los reportes de WhatsApp.'))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargarTodo(); /* eslint-disable-next-line */ }, [vendedorId, mes]);

  // Refresca "Conversaciones abiertas ahora" solo (es en vivo, cambia
  // seguido) sin recargar el resto cada vez — cada 2 minutos mientras la
  // pestaña esté abierta.
  useEffect(() => {
    const id = setInterval(() => {
      const params = vendedorId ? { vendedor_id: vendedorId } : {};
      api.get('/reportes/whatsapp/abiertas-ahora', { params }).then(r => setAbiertas(r.data)).catch(() => {});
    }, 120000);
    return () => clearInterval(id);
  }, [vendedorId]);

  const actualizarAhora = async () => {
    setActualizando(true); setMensajeActualizar('');
    try {
      const { data } = await api.post('/reportes/whatsapp/actualizar-ahora');
      setMensajeActualizar(data.message);
      cargarTodo();
    } catch {
      setMensajeActualizar('No se pudo actualizar.');
    } finally {
      setActualizando(false);
    }
  };

  const filaMesActual = useMemo(() => resumenMensual.find(r => r.mes === mes), [resumenMensual, mes]);
  const maxPromedio = useMemo(() => Math.max(1, ...resumenMensual.map(r => Number(r.promedio_minutos_habiles) || 0)), [resumenMensual]);

  if (cargando && resumenMensual.length === 0) return <div className="text-gray-400 text-sm">Cargando reporte…</div>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <h1 className="text-2xl font-bold text-ht-navy">Tiempo de respuesta WhatsApp</h1>
        <button onClick={actualizarAhora} disabled={actualizando}
          className="bg-ht-accent text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-1">
        Se calcula automáticamente todas las noches (~23:50) — "Actualizar" corre el cálculo al toque, para no esperar hasta la noche.
      </p>
      <p className="text-xs text-gray-400 mb-4">
        Desde el primer mensaje del cliente sin responder hasta la primera respuesta, en horario hábil. Solo desde el 23-09-2026 en adelante — no incluye historial anterior.
        {mensajeActualizar && <span className="text-ht-navy"> {mensajeActualizar}</span>}
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-lg p-4 mb-5">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Mes</label>
          <select value={mes} onChange={e => setMes(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            {resumenMensual.length === 0 && <option value={mesActualYYYYMM()}>{MESES[new Date().getMonth()]} {new Date().getFullYear()}</option>}
            {resumenMensual.map(r => {
              const [a, m2] = r.mes.split('-');
              return <option key={r.mes} value={r.mes}>{MESES[Number(m2) - 1]} {a}</option>;
            })}
          </select>
        </div>
        {puedeFiltrarVendedor && (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Vendedor</label>
            <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
              <option value="">Todos los vendedores</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <TarjetaKpi color="#C6473F" label="Abiertas ahora" valor={abiertas.length}
          sub={abiertas.length > 0 ? `La más antigua: ${formatoTiempo(abiertas[0]?.minutos_habiles_transcurridos)}` : 'Nada pendiente'} />
        <TarjetaKpi color="#34B3DE" label="Promedio del mes" valor={formatoTiempo(filaMesActual?.promedio_minutos_habiles)}
          sub={`${filaMesActual?.tramos || 0} conversaciones respondidas`} />
        <TarjetaKpi color="#2F8F5B" label="Mediana del mes" valor={formatoTiempo(filaMesActual?.mediana_minutos_habiles)}
          sub="La mitad se respondió más rápido que esto" />
        <TarjetaKpi color="#C98A2C" label="Peor caso del mes" valor={formatoTiempo(Math.max(...porVendedor.filter(v => v.tramos > 0).map(v => Number(v.peor_minutos_habiles) || 0), 0) || null)}
          sub="Horario hábil, sin contar noches ni fines de semana" />
      </div>

      {/* Gráfico mensual */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5">
        <div className="text-sm font-semibold text-ht-navy mb-3">Promedio de tiempo de respuesta por mes (horario hábil)</div>
        {resumenMensual.length === 0 ? (
          <div className="text-sm text-gray-400">Todavía no hay tramos calculados.</div>
        ) : (
          <div className="flex items-end gap-3 h-40">
            {resumenMensual.map(r => {
              const [a, m2] = r.mes.split('-');
              const valor = Number(r.promedio_minutos_habiles) || 0;
              const alturaPct = Math.max(4, (valor / maxPromedio) * 100);
              return (
                <div key={r.mes} className="flex flex-col items-center flex-1 h-full justify-end group" title={`${MESES[Number(m2) - 1]} ${a}: ${formatoTiempo(valor)}`}>
                  <div className="text-[11px] text-gray-500 mb-1">{formatoTiempo(valor)}</div>
                  <div className={`w-full rounded-t ${r.mes === mes ? 'bg-ht-accent' : 'bg-ht-accent/40'}`} style={{ height: `${alturaPct}%` }} />
                  <div className="text-[11px] text-gray-400 mt-1">{MESES_ABR[Number(m2) - 1]}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Por vendedor */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-ht-navy mb-3">Por vendedor — {(() => { const [a, m2] = mes.split('-'); return `${MESES[Number(m2) - 1]} ${a}`; })()}</div>
          {porVendedor.length === 0 ? (
            <div className="text-sm text-gray-400">Sin datos para este mes.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-200">
                  <th className="pb-2 font-semibold">Vendedor</th>
                  <th className="pb-2 font-semibold text-right">Conversac.</th>
                  <th className="pb-2 font-semibold text-right">Promedio</th>
                  <th className="pb-2 font-semibold text-right">Mediana</th>
                  <th className="pb-2 font-semibold text-right">Peor caso</th>
                </tr>
              </thead>
              <tbody>
                {porVendedor.map(v => (
                  <tr key={v.vendedor_id || 'sin-asignar'} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5">{v.vendedor_nombre || 'Sin asignar'}</td>
                    <td className="py-1.5 text-right">{v.tramos}</td>
                    <td className="py-1.5 text-right">{formatoTiempo(v.promedio_minutos_habiles)}</td>
                    <td className="py-1.5 text-right">{formatoTiempo(v.mediana_minutos_habiles)}</td>
                    <td className="py-1.5 text-right text-gray-500">{formatoTiempo(v.peor_minutos_habiles)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Abiertas ahora */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-ht-navy mb-3">Conversaciones abiertas ahora ({abiertas.length})</div>
          {abiertas.length === 0 ? (
            <div className="text-sm text-gray-400">No hay ningún cliente esperando respuesta.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-200">
                  <th className="pb-2 font-semibold">Contacto</th>
                  <th className="pb-2 font-semibold">Vendedor</th>
                  <th className="pb-2 font-semibold">Esperando desde</th>
                  <th className="pb-2 font-semibold text-right">Tiempo hábil</th>
                </tr>
              </thead>
              <tbody>
                {abiertas.map(c => (
                  <tr key={c.contacto_id} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5">
                      <a href={`/bandeja?contacto_id=${c.contacto_id}`} target="_blank" rel="noopener noreferrer"
                        className="text-ht-accent hover:underline">
                        {[c.contacto_nombre, c.contacto_apellido].filter(Boolean).join(' ')}
                      </a>
                      {c.empresa_nombre ? <span className="text-gray-400"> · {c.empresa_nombre}</span> : ''}
                    </td>
                    <td className="py-1.5">{c.vendedor_nombre || <span className="text-amber-600">Sin asignar</span>}</td>
                    <td className="py-1.5 text-gray-500">{fmtFecha(c.pendiente_desde)}</td>
                    <td className="py-1.5 text-right font-medium text-ht-navy">{formatoTiempo(c.minutos_habiles_transcurridos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
