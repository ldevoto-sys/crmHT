import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

// Pestaña "OT's" de Reportes (v1.40). Las definiciones (qué es programada,
// ejecutada, pendiente, horas-hombre y valor de venta) están documentadas
// en backend/services/reportesOT.js y en la nota de cambio v1.40.

const NAVY = '#112548';
const CELESTE = '#34B3DE';
const PUEDE_FILTRAR_VENDEDOR = ['administrador', 'jefe_comercial', 'gerencia'];
const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const TIPOS_TRABAJO = {
  mantenimiento_preventivo: 'Mantenimiento preventivo', lavado: 'Lavado de estanque', impermeabilizado: 'Impermeabilizado',
  mantenimiento_correctivo: 'Mantenimiento correctivo', otro: 'Otro', sin_tipo: 'Sin tipo',
};
const ETAPA_LABEL = { aceptado: 'Aceptado', programado: 'Programado', ejecutado: 'Ejecutado' };

// Brecha = fecha de ejecución − fecha programada (positiva: se ejecutó después de lo programado).
const brecha = d => (d === null || d === undefined ? '—' : d > 0 ? `+${num(d)} d` : d < 0 ? `−${num(-d)} d` : '0 d');
const pct = v => (v === null || v === undefined ? '—' : `${Math.round(Number(v))}%`);
const money = v => `$${Math.round(Number(v) || 0).toLocaleString('es-CL')}`;
const num = v => (Number(v) || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 });
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hace6Meses = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5); return isoLocal(d); };
const etiquetaMes = mes => { const [a, m] = mes.split('-'); return `${MESES_ABR[Number(m) - 1]} ${a.slice(2)}`; };

function Kpi({ label, valor, sub, oscuro }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 relative overflow-hidden pl-5">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: oscuro ? NAVY : CELESTE }} />
      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</div>
      <div className="text-2xl font-bold text-ht-navy">{valor}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function TooltipMes({ active, payload, label, formato }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded shadow px-3 py-2 text-xs">
      <div className="font-semibold text-ht-navy mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 text-gray-600">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-ht-navy">{formato(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function GraficoMensual({ datos, claveProg, claveEjec, formato, titulo }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-sm font-semibold text-ht-navy mb-3">{titulo}</div>
      {datos.length === 0 ? <div className="text-sm text-gray-400">Sin datos en el período.</div> : (
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: '#555555' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#555555' }} axisLine={false} tickLine={false} tickFormatter={formato === money ? v => `$${(v / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M` : undefined} width={formato === money ? 64 : 36} />
              <RTooltip content={<TooltipMes formato={formato} />} cursor={{ fill: 'rgba(17,37,72,0.05)' }} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={v => <span style={{ color: '#555555' }}>{v}</span>} />
              <Bar dataKey={claveProg} name="Programadas" fill={CELESTE} radius={[4, 4, 0, 0]} />
              <Bar dataKey={claveEjec} name="Ejecutadas" fill={NAVY} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const Th = ({ children, der }) => <th className={`pb-2 font-semibold ${der ? 'text-right' : ''}`}>{children}</th>;
const encabezado = 'text-left text-xs text-gray-500 uppercase border-b border-gray-200';

export default function ReporteriaOTs() {
  const { user } = useAuth();
  const puedeFiltrarVendedor = PUEDE_FILTRAR_VENDEDOR.includes(user?.rol);

  const [desde, setDesde] = useState(hace6Meses());
  const [hasta, setHasta] = useState(isoLocal(new Date()));
  const [tecnicoId, setTecnicoId] = useState('');
  const [tipoTrabajo, setTipoTrabajo] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [tecnicos, setTecnicos] = useState([]);
  const [vendedores, setVendedores] = useState([]);

  const [kpis, setKpis] = useState(null);
  const [mensual, setMensual] = useState([]);
  const [porTipo, setPorTipo] = useState([]);
  const [porTecnico, setPorTecnico] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [detalle, setDetalle] = useState([]);
  const [alerta, setAlerta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/users/tecnicos').then(r => setTecnicos(r.data)).catch(() => {});
    if (puedeFiltrarVendedor) api.get('/users/con-cotizaciones').then(r => setVendedores(r.data)).catch(() => {});
    api.get('/reportes/ots/alertas-config').then(r => setAlerta(r.data)).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const params = useMemo(() => ({
    desde: desde || undefined, hasta: hasta || undefined, tecnico_id: tecnicoId || undefined,
    tipo_trabajo: tipoTrabajo || undefined, vendedor_id: vendedorId || undefined,
  }), [desde, hasta, tecnicoId, tipoTrabajo, vendedorId]);

  useEffect(() => {
    setCargando(true); setError('');
    Promise.all(['kpis', 'mensual', 'por-tipo', 'por-tecnico', 'pendientes', 'detalle'].map(r => api.get(`/reportes/ots/${r}`, { params })))
      .then(([k, m, t, tec, p, d]) => {
        setKpis(k.data[0] || null); setMensual(m.data); setPorTipo(t.data); setPorTecnico(tec.data); setPendientes(p.data); setDetalle(d.data);
      })
      .catch(() => setError("No se pudieron cargar los reportes de OT's."))
      .finally(() => setCargando(false));
  }, [params]);

  const datosMensual = useMemo(() => mensual.map(r => ({ ...r, etiqueta: etiquetaMes(r.mes) })), [mensual]);

  const exportarCSV = async () => {
    try {
      const { data } = await api.get('/reportes/export', { params: { tipo: 'ots_detalle', ...params }, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = 'ots_detalle.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('No se pudo exportar.'); }
  };

  const select = 'border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent';
  const etiquetaFiltro = 'block text-xs font-semibold text-gray-500 uppercase mb-1';

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Órdenes de Trabajo</h1>
      <p className="text-xs text-gray-500 mb-4">
        Valor de venta = neto de la cotización vigente (o el monto del negocio si no tiene cotización). Horas-hombre = horas por técnico × cantidad de técnicos; en las ejecutadas se usan las horas ejecutadas registradas (en OT anteriores, que no las tienen, se estiman con las programadas).
        Programadas se cuentan por su fecha programada; ejecutadas, por su fecha de ejecución. Brecha = fecha de ejecución − fecha programada (positiva: se ejecutó después de lo programado; "a tiempo" = brecha de 0 o menos).
        La brecha solo existe para OT con fecha programada. {kpis?.sin_cotizacion_cantidad > 0 && `${kpis.sin_cotizacion_cantidad} OT del período no tienen cotización: su valor es el monto del negocio.`}
        {(kpis?.incompletas_cantidad > 0 || kpis?.ejecutadas_sin_hh_cantidad > 0) && (
          <span className="block mt-1 text-red-600 font-medium">
            {kpis.incompletas_cantidad > 0 && `${kpis.incompletas_cantidad} OT en Programado/Ejecutado tienen datos sin completar (sin fecha, horas o técnicos): no entran en las fechas o las horas-hombre de este reporte. `}
            {kpis.ejecutadas_sin_hh_cantidad > 0 && `${kpis.ejecutadas_sin_hh_cantidad} OT ejecutadas del período suman 0 horas-hombre por falta de horas o técnicos.`}
          </span>
        )}
      </p>

      {alerta && (!alerta.pipeline_encontrado || alerta.faltantes.length > 0) && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded text-sm">
          {alerta.pipeline_encontrado
            ? <>El pipeline Operaciones no tiene la etapa {alerta.faltantes.map(f => `"${ETAPA_LABEL[f] || f}"`).join(', ')}: sus reglas (horas, técnicos, fecha de ejecución) y este reporte no funcionan hasta que exista con ese nombre. Revisa Configuración → Pipeline.</>
            : <>No se encontró el pipeline "Operaciones" (¿fue renombrado?): las reglas de OT y este reporte no funcionan. Revisa Configuración → Pipeline.</>}
        </div>
      )}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-lg p-4 mb-5">
        <div><label className={etiquetaFiltro}>Desde</label><input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={select} /></div>
        <div><label className={etiquetaFiltro}>Hasta</label><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={select} /></div>
        <div>
          <label className={etiquetaFiltro}>Técnico</label>
          <select value={tecnicoId} onChange={e => setTecnicoId(e.target.value)} className={select}>
            <option value="">Todos</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className={etiquetaFiltro}>Tipo de trabajo</label>
          <select value={tipoTrabajo} onChange={e => setTipoTrabajo(e.target.value)} className={select}>
            <option value="">Todos</option>
            {Object.entries(TIPOS_TRABAJO).filter(([k]) => k !== 'sin_tipo').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {puedeFiltrarVendedor && (
          <div>
            <label className={etiquetaFiltro}>Vendedor</label>
            <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} className={select}>
              <option value="">Todos</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </div>
        )}
        <button onClick={exportarCSV} className="ml-auto text-sm border border-ht-navy text-ht-navy px-3 py-1.5 rounded hover:bg-ht-navy/5">Exportar detalle (CSV)</button>
      </div>

      {cargando && !kpis ? <div className="text-gray-400 text-sm">Cargando reporte…</div> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
            <Kpi label="Ejecutadas" valor={kpis?.ejecutadas_cantidad ?? 0} sub={`${money(kpis?.ejecutadas_valor)} en venta · ${num(kpis?.horas_hombre_ejecutadas)} horas-hombre (programadas: ${num(kpis?.horas_hombre_programadas_de_ejecutadas)})`} oscuro />
            <Kpi label="Programadas en el período" valor={kpis?.programadas_cantidad ?? 0} sub={`${money(kpis?.programadas_valor)} en venta`} />
            <Kpi label="Pendientes de ejecución hoy" valor={kpis?.pendientes_cantidad ?? 0}
              sub={`${kpis?.atrasadas_cantidad ?? 0} atrasadas (${money(kpis?.atrasadas_valor)}) · ${num(kpis?.horas_hombre_pendientes)} horas-hombre`} oscuro />
            <Kpi label="Cumplimiento de la fecha programada" valor={kpis?.con_brecha_cantidad ? pct(100 * kpis.a_tiempo_cantidad / kpis.con_brecha_cantidad) : '—'}
              sub={kpis?.con_brecha_cantidad ? `${kpis.a_tiempo_cantidad} de ${kpis.con_brecha_cantidad} a tiempo · brecha promedio ${brecha(kpis.brecha_promedio_dias)}` : 'Sin OT ejecutadas con fecha programada'} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2 mb-5">
            <GraficoMensual datos={datosMensual} claveProg="programadas_cantidad" claveEjec="ejecutadas_cantidad" formato={num} titulo="OT por mes — cantidad" />
            <GraficoMensual datos={datosMensual} claveProg="programadas_valor" claveEjec="ejecutadas_valor" formato={money} titulo="OT por mes — valor de venta" />
          </div>

          <div className="grid gap-5 mb-5">
            <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
              <div className="text-sm font-semibold text-ht-navy mb-1">Por técnico</div>
              <p className="text-xs text-gray-500 mb-3">Cada técnico suma las horas completas de la OT; el valor de venta se reparte en partes iguales entre sus técnicos.</p>
              {porTecnico.length === 0 ? <div className="text-sm text-gray-400">Sin OT con técnicos en el período.</div> : (
                <table className="w-full text-sm">
                  <thead><tr className={encabezado}><Th>Técnico</Th><Th der>Ejecutadas</Th><Th der>Horas programadas</Th><Th der>Horas ejecutadas</Th><Th der>Venta (prorrateada)</Th><Th der>Brecha promedio</Th><Th der>A tiempo</Th><Th der>Programadas</Th><Th der>Pendientes (atrasadas)</Th></tr></thead>
                  <tbody>
                    {porTecnico.map(t => (
                      <tr key={t.tecnico_id} className="border-b border-gray-100 last:border-0">
                        <td className="py-1.5">{t.tecnico_nombre}</td>
                        <td className="py-1.5 text-right font-medium text-ht-navy">{t.ejecutadas_cantidad}</td>
                        <td className="py-1.5 text-right">{num(t.horas_programadas_de_ejecutadas)}</td>
                        <td className="py-1.5 text-right">{num(t.horas_ejecutadas)}</td>
                        <td className="py-1.5 text-right">{money(t.ejecutadas_valor_prorrateado)}</td>
                        <td className="py-1.5 text-right">{brecha(t.brecha_promedio_dias)}</td>
                        <td className="py-1.5 text-right">{pct(t.a_tiempo_pct)}</td>
                        <td className="py-1.5 text-right">{t.programadas_cantidad}</td>
                        <td className="py-1.5 text-right text-gray-500">{t.pendientes_cantidad} ({t.atrasadas_cantidad}) · {num(t.horas_pendientes)} h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
              <div className="text-sm font-semibold text-ht-navy mb-3">Por tipo de trabajo</div>
              {porTipo.length === 0 ? <div className="text-sm text-gray-400">Sin datos en el período.</div> : (
                <table className="w-full text-sm">
                  <thead><tr className={encabezado}><Th>Tipo</Th><Th der>Ejecutadas</Th><Th der>Venta ejecutada</Th><Th der>Horas-hombre (programadas)</Th><Th der>Brecha promedio</Th><Th der>A tiempo</Th><Th der>Programadas</Th><Th der>Venta programada</Th></tr></thead>
                  <tbody>
                    {porTipo.map(t => (
                      <tr key={t.tipo_trabajo} className="border-b border-gray-100 last:border-0">
                        <td className="py-1.5">{TIPOS_TRABAJO[t.tipo_trabajo] || t.tipo_trabajo}</td>
                        <td className="py-1.5 text-right font-medium text-ht-navy">{t.ejecutadas_cantidad}</td>
                        <td className="py-1.5 text-right">{money(t.ejecutadas_valor)}</td>
                        <td className="py-1.5 text-right">{num(t.horas_hombre_ejecutadas)} <span className="text-gray-400">({num(t.horas_hombre_programadas_de_ejecutadas)})</span></td>
                        <td className="py-1.5 text-right">{brecha(t.brecha_promedio_dias)}</td>
                        <td className="py-1.5 text-right">{pct(t.a_tiempo_pct)}</td>
                        <td className="py-1.5 text-right">{t.programadas_cantidad}</td>
                        <td className="py-1.5 text-right">{money(t.programadas_valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5 overflow-x-auto">
            <div className="text-sm font-semibold text-ht-navy mb-1">Programadas pendientes de ejecución ({pendientes.length})</div>
            <p className="text-xs text-gray-500 mb-3">Hoy en la etapa "Programado" sin fecha de ejecución, las de fecha programada más antigua primero. No depende del rango de fechas.</p>
            {pendientes.length === 0 ? <div className="text-sm text-gray-400">No hay OT programadas pendientes.</div> : (
              <table className="w-full text-sm min-w-[720px]">
                <thead><tr className={encabezado}><Th>OT</Th><Th>Cliente</Th><Th>Tipo</Th><Th>Técnicos</Th><Th der>Horas</Th><Th der>Venta</Th><Th>Fecha programada</Th><Th der>Días de atraso</Th></tr></thead>
                <tbody>
                  {pendientes.map(o => (
                    <tr key={o.negocio_id} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5"><a href={`/negocios/${o.negocio_id}/ot`} className="text-ht-accent hover:underline">{o.ot}</a></td>
                      <td className="py-1.5">{o.cliente || '—'}<span className="text-gray-400"> · {o.titulo}</span></td>
                      <td className="py-1.5">{TIPOS_TRABAJO[o.tipo_trabajo] || o.tipo_trabajo}</td>
                      <td className="py-1.5">{o.tecnicos || '—'}</td>
                      <td className="py-1.5 text-right">{num(o.horas_programadas)}</td>
                      <td className="py-1.5 text-right">{money(o.valor)}</td>
                      <td className="py-1.5">{o.fecha_programada || <span className="text-gray-400">sin fecha</span>}</td>
                      <td className="py-1.5 text-right font-medium text-ht-navy">{o.dias_atraso === null ? '—' : o.dias_atraso > 0 ? `${o.dias_atraso} d` : 'al día'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
            <div className="text-sm font-semibold text-ht-navy mb-3">Detalle ({detalle.length}{detalle.length >= 5000 ? '+' : ''})</div>
            {detalle.length === 0 ? <div className="text-sm text-gray-400">Sin OT programadas ni ejecutadas en el período.</div> : (
              <table className="w-full text-sm min-w-[900px]">
                <thead><tr className={encabezado}><Th>OT</Th><Th>Cliente</Th><Th>Tipo</Th><Th>Etapa</Th><Th>Técnicos</Th><Th der>Horas programadas</Th><Th der>Horas ejecutadas</Th><Th>Programada</Th><Th>Ejecutada</Th><Th der>Brecha</Th><Th der>Venta</Th><Th>ID Fracttal</Th></tr></thead>
                <tbody>
                  {detalle.slice(0, 200).map(o => (
                    <tr key={o.negocio_id} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5"><a href={`/negocios/${o.negocio_id}/ot`} className="text-ht-accent hover:underline">{o.ot}</a></td>
                      <td className="py-1.5">{o.cliente || '—'}</td>
                      <td className="py-1.5">{TIPOS_TRABAJO[o.tipo_trabajo] || o.tipo_trabajo}</td>
                      <td className="py-1.5">{o.etapa_actual}</td>
                      <td className="py-1.5">{o.tecnicos || '—'}</td>
                      <td className="py-1.5 text-right">{o.horas_programadas === null ? '—' : num(o.horas_programadas)}</td>
                      <td className="py-1.5 text-right" title={o.horas_origen || ''}>
                        {o.horas_ejecutadas === null ? (o.horas_origen ? <span className="text-gray-400">sin registro</span> : '—') : num(o.horas_ejecutadas)}
                      </td>
                      <td className="py-1.5">{o.fecha_programada || '—'}</td>
                      <td className="py-1.5">{o.fecha_ejecucion || '—'}</td>
                      <td className="py-1.5 text-right">{brecha(o.brecha_dias)}</td>
                      <td className="py-1.5 text-right">{money(o.valor)}{o.origen_valor === 'monto del negocio' && <span className="text-gray-400" title="Sin cotización: monto del negocio"> *</span>}</td>
                      <td className="py-1.5">{o.id_fracttal || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {detalle.length > 200 && <p className="text-xs text-gray-500 mt-2">Se muestran las primeras 200; el CSV trae todas.</p>}
            <p className="text-xs text-gray-500 mt-2">* Sin cotización: el valor es el monto del negocio.</p>
          </div>
        </>
      )}
    </div>
  );
}
