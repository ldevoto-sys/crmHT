import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api';
import ListadoDocumentosSoftland from './ListadoDocumentosSoftland';

const AREA_LABEL = { meson: 'Ventas Mesón', operaciones: 'Operaciones', vregion: 'V Región', otros: 'Otros' };
const AREA_BADGE = {
  meson: 'bg-indigo-50 text-indigo-600',
  operaciones: 'bg-emerald-50 text-emerald-600',
  vregion: 'bg-amber-50 text-amber-700',
  otros: 'bg-gray-100 text-gray-500',
};
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const AÑO_COLOR = { 2023: '#94A3B8', 2024: '#4C5FD5', 2025: '#34B3DE', 2026: '#2F8F5B', 2027: '#C98A2C' };
const COLOR_COTIZADO = '#34B3DE', COLOR_CERRADO = '#C98A2C', COLOR_FACTURADO = '#2F8F5B';

const fmtMoney = v => `$${Math.round(v || 0).toLocaleString('es-CL')}`;
const fmtCant = v => `${Math.round(v || 0).toLocaleString('es-CL')} doc${Math.round(v) === 1 ? '.' : 's.'}`;
const fmtPct = v => (isFinite(v) && v !== null ? `${(v * 100).toFixed(0)}%` : '—');
const fmtFecha = iso => (iso ? new Date(iso).toLocaleString('es-CL') : '—');

export default function ReporteriaSoftland() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [syncEstado, setSyncEstado] = useState(null);
  const [actualizando, setActualizando] = useState(false);

  const [anio, setAnio] = useState('');
  const [mes, setMes] = useState('');
  const [vencod, setVencod] = useState('');
  const [area, setArea] = useState('');
  const [unidad, setUnidad] = useState('monto');
  const [tab, setTab] = useState('mensual');
  const [metricaAnual, setMetricaAnual] = useState('cotizado');
  const [buscarNv, setBuscarNv] = useState('');

  const cargarDatos = () => {
    setCargando(true); setError('');
    api.get('/softland/reporte')
      .then(r => setDatos(r.data))
      .catch(() => setError('No se pudo cargar el reporte.'))
      .finally(() => setCargando(false));
  };
  const cargarSyncEstado = () => api.get('/softland/sync/estado').then(r => setSyncEstado(r.data)).catch(() => {});

  useEffect(() => { cargarDatos(); cargarSyncEstado(); }, []);

  const actualizar = async () => {
    setActualizando(true); setError('');
    try {
      await api.post('/softland/sync');
      await Promise.all([cargarDatos(), cargarSyncEstado()]);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar — revisa la conexión a Softland.');
      cargarSyncEstado();
    } finally {
      setActualizando(false);
    }
  };

  // Normaliza el shape de la API (campos _monto/_cant) a uno más liviano
  // para todo el resto del componente.
  const mensual = useMemo(() => {
    if (!datos) return [];
    return datos.mensual.map(r => ({
      anio: r.anio, mes: r.mes, vencod: r.vencod, nombre: r.nombre_vendedor || 'Sin nombre', area: r.area || null,
      cotizado: r.cotizado_monto, cant_cotizado: r.cotizado_cant,
      cerrado: r.cerrado_monto, cant_cerrado: r.cerrado_cant,
      facturado: r.facturado_monto, cant_facturado: r.facturado_cant,
    }));
  }, [datos]);

  const vendedores = useMemo(() => {
    const m = new Map();
    mensual.forEach(r => { if (!m.has(r.vencod)) m.set(r.vencod, { vencod: r.vencod, nombre: r.nombre, area: r.area }); });
    return Array.from(m.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [mensual]);

  const años = useMemo(() => Array.from(new Set(mensual.map(r => r.anio))).sort(), [mensual]);

  const campo = base => (unidad === 'monto' ? base : `cant_${base}`);
  const fmtUnidad = v => (unidad === 'monto' ? fmtMoney(v) : fmtCant(v));

  const coincide = (r, ignorarPeriodo) => {
    if (vencod && r.vencod !== vencod) return false;
    if (area && r.area !== area) return false;
    if (!ignorarPeriodo) {
      if (anio && String(r.anio) !== anio) return false;
      if (mes && String(r.mes) !== mes) return false;
    }
    return true;
  };
  const sum = (rows, c) => rows.reduce((a, r) => a + (r[c] || 0), 0);

  const rowsPeriodo = useMemo(() => mensual.filter(r => coincide(r, false)), [mensual, anio, mes, vencod, area]);
  const rowsSerie = useMemo(() => mensual.filter(r => coincide(r, true)), [mensual, vencod, area]);

  const kpis = useMemo(() => {
    const cot = sum(rowsPeriodo, campo('cotizado')), cer = sum(rowsPeriodo, campo('cerrado')), fac = sum(rowsPeriodo, campo('facturado'));
    const cotM = sum(rowsPeriodo, 'cotizado'), cerM = sum(rowsPeriodo, 'cerrado'), facM = sum(rowsPeriodo, 'facturado');
    const cotC = sum(rowsPeriodo, 'cant_cotizado'), cerC = sum(rowsPeriodo, 'cant_cerrado'), facC = sum(rowsPeriodo, 'cant_facturado');
    return { cot, cer, fac, cotM, cerM, facM, cotC, cerC, facC, convCotCer: cer / cot, convCerFac: fac / cer };
  }, [rowsPeriodo, unidad]);

  const porVendedor = useMemo(() => {
    const m = new Map();
    rowsPeriodo.forEach(r => {
      if (!m.has(r.vencod)) m.set(r.vencod, { nombre: r.nombre, area: r.area, cotizado: 0, cerrado: 0, facturado: 0, cant_cotizado: 0, cant_cerrado: 0, cant_facturado: 0 });
      const acc = m.get(r.vencod);
      acc.cotizado += r.cotizado; acc.cerrado += r.cerrado; acc.facturado += r.facturado;
      acc.cant_cotizado += r.cant_cotizado; acc.cant_cerrado += r.cant_cerrado; acc.cant_facturado += r.cant_facturado;
    });
    return Array.from(m.values()).sort((a, b) => b[campo('facturado')] - a[campo('facturado')]);
  }, [rowsPeriodo, unidad]);

  const porArea = useMemo(() => {
    const m = {};
    Object.keys(AREA_LABEL).forEach(k => { m[k] = { cotizado: 0, cerrado: 0, facturado: 0, cant_cotizado: 0, cant_cerrado: 0, cant_facturado: 0 }; });
    rowsPeriodo.forEach(r => {
      if (!r.area || !m[r.area]) return;
      const d = m[r.area];
      d.cotizado += r.cotizado; d.cerrado += r.cerrado; d.facturado += r.facturado;
      d.cant_cotizado += r.cant_cotizado; d.cant_cerrado += r.cant_cerrado; d.cant_facturado += r.cant_facturado;
    });
    return m;
  }, [rowsPeriodo, unidad]);

  const sinArea = useMemo(() => rowsPeriodo.filter(r => !r.area).length > 0, [rowsPeriodo]);

  const nvPendientes = useMemo(() => {
    if (!datos) return [];
    const q = buscarNv.trim().toLowerCase();
    return datos.nv_pendientes.filter(r => {
      if (vencod && r.vencod !== vencod) return false;
      if (area) { const v = vendedores.find(v => v.vencod === r.vencod); if (!v || v.area !== area) return false; }
      if (q) {
        const campos = [r.nv_numero, r.nombre_vendedor, r.nombre_cliente, r.cod_cliente, r.num_oc];
        if (!campos.some(c => String(c || '').toLowerCase().includes(q))) return false;
      }
      return true;
    }).map(r => ({ ...r, dias: Math.floor((Date.now() - new Date(r.fecha_nv).getTime()) / 86400000) }))
      .sort((a, b) => b.dias - a.dias);
  }, [datos, vencod, area, vendedores, buscarNv]);

  // --- Gráfico "Evolución" (reacciona a los filtros de Año/Mes) ---
  // Sin año ni mes: serie corrida 2023-hoy (comportamiento original).
  // Con mes (sin año): un punto por año — compara ese mes entre años.
  // Con año (con o sin mes): un punto por mes — Ene-Dic de ese año.
  const modoMensual = anio ? 'anio' : (mes ? 'mes' : 'trend');
  const tituloMensual = modoMensual === 'anio' ? `Meses de ${anio}` : modoMensual === 'mes' ? `${MESES[mes - 1]} — comparación entre años` : 'Evolución mensual';
  const puntosMensual = useMemo(() => construirPuntosMensual(años, anio, mes), [años, anio, mes]);
  const serieMensual = useMemo(() => agregarPorPunto(rowsSerie, puntosMensual), [rowsSerie, puntosMensual]);
  const canvasMensualRef = useRef(null);
  const layoutMensualRef = useRef(null);
  const [tooltipMensual, setTooltipMensual] = useState(null);
  useEffect(() => {
    layoutMensualRef.current = dibujarMensual(canvasMensualRef.current, serieMensual, unidad, { dividers: modoMensual === 'trend' });
  }, [serieMensual, unidad, tab, modoMensual]);

  function hoverMensual(e) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const layout = layoutMensualRef.current;
    if (!layout || y < layout.padT || y > layout.padT + layout.plotH) { setTooltipMensual(null); return; }
    const i = Math.floor((x - layout.padL) / layout.stepX);
    const s = layout.serie[i];
    if (!s) { setTooltipMensual(null); return; }
    setTooltipMensual({
      x, y, titulo: `${MESES[s.mes - 1]} ${s.anio}`,
      lineas: [
        { color: COLOR_COTIZADO, texto: `Cotizado: ${fmtUnidad(s[campo('cotizado')])}` },
        { color: COLOR_CERRADO, texto: `Cerrado: ${fmtUnidad(s[campo('cerrado')])}` },
        { color: COLOR_FACTURADO, texto: `Facturado: ${fmtUnidad(s[campo('facturado')])}` },
      ],
    });
  }

  // --- Gráfico "Comparación anual" (barras por mes + versión acumulada) ---
  const canvasAnualRef = useRef(null);
  const canvasAnualAcumRef = useRef(null);
  const layoutAnualRef = useRef(null);
  const layoutAnualAcumRef = useRef(null);
  const [tooltipAnual, setTooltipAnual] = useState(null); // {x, y, titulo, valor}
  const [tooltipAnualAcum, setTooltipAnualAcum] = useState(null);

  const matrizAnual = useMemo(() => matrizPorAnioMes(rowsSerie, años, metricaAnual, unidad), [rowsSerie, años, metricaAnual, unidad]);
  const matrizAnualAcum = useMemo(() => acumularPorAnio(matrizAnual, años), [matrizAnual, años]);

  useEffect(() => {
    layoutAnualRef.current = dibujarBarrasPorAnio(canvasAnualRef.current, matrizAnual, años, unidad);
  }, [matrizAnual, años, unidad, tab]);
  useEffect(() => {
    layoutAnualAcumRef.current = dibujarBarrasPorAnio(canvasAnualAcumRef.current, matrizAnualAcum, años, unidad);
  }, [matrizAnualAcum, años, unidad, tab]);

  function hoverAnual(e, layoutRef, matriz, setTooltip) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const celda = celdaEnPosicion(layoutRef.current, años, e.clientX - rect.left, e.clientY - rect.top);
    if (!celda) { setTooltip(null); return; }
    const valor = matriz[celda.anio]?.[celda.mes] ?? 0;
    setTooltip({
      x: e.clientX - rect.left, y: e.clientY - rect.top,
      titulo: `${MESES[celda.mes]} ${celda.anio}`,
      valor: unidad === 'monto' ? fmtMoney(valor) : fmtCant(valor),
    });
  }

  const limpiarFiltros = () => { setAnio(''); setMes(''); setVencod(''); setArea(''); };

  if (cargando) return <div className="text-gray-400 text-sm">Cargando reporte…</div>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <h1 className="text-2xl font-bold text-ht-navy">Reportería Comercial + Softland</h1>
        <button onClick={actualizar} disabled={actualizando}
          className="bg-ht-accent text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-1">
        Cotizado: Softland hasta jul-2026 (estático) · CRM en vivo desde ago-2026.
        Cerrado y Facturado: siempre Softland, sin cruce con el pipeline del CRM.
      </p>
      <p className="text-xs text-gray-400 mb-4">
        {syncEstado?.ok
          ? `Última actualización de Softland: ${fmtFecha(syncEstado.ejecutado_en)}`
          : syncEstado === null
            ? 'Todavía no se ha sincronizado con Softland.'
            : <span className="text-red-500">La última sincronización falló ({fmtFecha(syncEstado?.ejecutado_en)}): {syncEstado?.error}</span>}
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {sinArea && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-sm">
          Hay vendedores sin Área asignada — no aparecen en "Por área". Cárgala en Usuarios.
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-lg p-4 mb-5">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Año</label>
          <select value={anio} onChange={e => setAnio(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Todos</option>
            {años.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Mes</label>
          <select value={mes} onChange={e => setMes(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Todos los meses</option>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Vendedor</label>
          <select value={vencod} onChange={e => setVencod(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => <option key={v.vencod} value={v.vencod}>{v.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Área</label>
          <select value={area} onChange={e => setArea(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Todas</option>
            {Object.entries(AREA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Ver</label>
          <div className="inline-flex border border-gray-300 rounded overflow-hidden">
            <button onClick={() => setUnidad('monto')}
              className={`text-sm font-medium px-3 py-1.5 ${unidad === 'monto' ? 'bg-ht-accent text-white' : 'bg-white text-gray-600'}`}>Montos</button>
            <button onClick={() => setUnidad('cantidad')}
              className={`text-sm font-medium px-3 py-1.5 border-l border-gray-300 ${unidad === 'cantidad' ? 'bg-ht-accent text-white' : 'bg-white text-gray-600'}`}>Cantidad</button>
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={limpiarFiltros} className="text-xs text-ht-accent hover:underline px-1 py-2">Limpiar filtros</button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <TarjetaKpi color={COLOR_COTIZADO} label="Cotizado" valor={fmtUnidad(kpis.cot)}
          sub={unidad === 'monto' ? `${fmtCant(kpis.cotC)} cotizadas` : `${fmtMoney(kpis.cotM)} cotizado`} />
        <TarjetaKpi color={COLOR_CERRADO} label="Cerrado (NV emitidas)" valor={fmtUnidad(kpis.cer)}
          sub={unidad === 'monto' ? `${fmtCant(kpis.cerC)} NV emitidas` : `${fmtMoney(kpis.cerM)} en NV`} />
        <TarjetaKpi color={COLOR_FACTURADO} label="Facturado" valor={fmtUnidad(kpis.fac)}
          sub={unidad === 'monto' ? `${fmtCant(kpis.facC)} facturas` : `${fmtMoney(kpis.facM)} facturado`} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 items-center bg-white border border-gray-200 rounded-lg px-4 py-3 mb-5 text-sm">
        <span className="text-gray-600">Cotizado → Cerrado <b className="text-ht-navy ml-1">{fmtPct(kpis.convCotCer)}</b></span>
        <span className="text-gray-600">Cerrado → Facturado <b className="text-ht-navy ml-1">{fmtPct(kpis.convCerFac)}</b></span>
        <span className="ml-auto text-xs text-gray-400">{mes ? MESES[mes - 1] : 'todo el año'} · {anio || (años[0] && `${años[0]}–${años[años.length - 1]}`)}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {[['mensual', 'Mensual (2023–hoy)'], ['anual', 'Comparación anual'], ['vendedor', 'Por vendedor'], ['area', 'Por área'], ['nvpend', 'NV sin facturar'], ['cotizaciones_doc', 'Cotizaciones'], ['nv_doc', 'Notas de Venta'], ['facturas_doc', 'Facturas']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-sm font-medium px-3 py-2 border-b-2 -mb-px ${tab === k ? 'text-ht-navy border-ht-accent' : 'text-gray-500 border-transparent hover:text-ht-navy'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'mensual' && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-ht-navy text-sm">{tituloMensual}</h2>
            <Leyenda />
          </div>
          <div className="overflow-x-auto relative">
            <canvas ref={canvasMensualRef} height={280} onMouseMove={hoverMensual} onMouseLeave={() => setTooltipMensual(null)} />
            <GraficoTooltip t={tooltipMensual} />
          </div>
        </div>
      )}

      {tab === 'anual' && (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold text-ht-navy text-sm">Ene–Dic por año, una métrica a la vez</h2>
              <div className="inline-flex border border-gray-300 rounded overflow-hidden text-xs">
                {[['cotizado', 'Cotizado'], ['cerrado', 'Cerrado (NV)'], ['facturado', 'Facturado']].map(([k, l]) => (
                  <button key={k} onClick={() => setMetricaAnual(k)}
                    className={`px-3 py-1.5 font-semibold ${metricaAnual === k ? '' : 'bg-white text-gray-500'}`}
                    style={metricaAnual === k ? { background: k === 'cotizado' ? '#E8F7FC' : k === 'cerrado' ? '#FBF1E1' : '#E7F5EC', color: k === 'cotizado' ? COLOR_COTIZADO : k === 'cerrado' ? COLOR_CERRADO : COLOR_FACTURADO } : {}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-4 text-xs text-gray-500 mb-2">
              {años.map(a => <span key={a}><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: AÑO_COLOR[a] || '#999' }} />{a}</span>)}
            </div>
            <div className="overflow-x-auto relative">
              <canvas ref={canvasAnualRef} height={300}
                onMouseMove={e => hoverAnual(e, layoutAnualRef, matrizAnual, setTooltipAnual)}
                onMouseLeave={() => setTooltipAnual(null)} />
              <GraficoTooltip t={tooltipAnual} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy text-sm mb-3">Ene–Dic acumulado por año</h2>
            <div className="flex gap-4 text-xs text-gray-500 mb-2">
              {años.map(a => <span key={a}><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: AÑO_COLOR[a] || '#999' }} />{a}</span>)}
            </div>
            <div className="overflow-x-auto relative">
              <canvas ref={canvasAnualAcumRef} height={300}
                onMouseMove={e => hoverAnual(e, layoutAnualAcumRef, matrizAnualAcum, setTooltipAnualAcum)}
                onMouseLeave={() => setTooltipAnualAcum(null)} />
              <GraficoTooltip t={tooltipAnualAcum} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-ht-navy text-sm">Detalle por año — {{ cotizado: 'Cotizado', cerrado: 'Cerrado (NV)', facturado: 'Facturado' }[metricaAnual]}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Año</th>
                    {MESES_ABR.map(m => <th key={m} className="text-right px-3 py-2 font-medium">{m}</th>)}
                    <th className="text-right px-4 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {años.map(a => (
                    <tr key={a} className="border-t border-gray-100 hover:bg-slate-50">
                      <td className="px-4 py-2 text-ht-navy font-medium">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-[-1px]" style={{ background: AÑO_COLOR[a] || '#999' }} />{a}
                      </td>
                      {matrizAnual[a].map((v, i) => <td key={i} className="px-3 py-2 text-right num">{fmtUnidad(v)}</td>)}
                      <td className="px-4 py-2 text-right text-ht-navy font-semibold num">{fmtUnidad(matrizAnual[a].reduce((s, v) => s + v, 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'vendedor' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-ht-navy text-sm">Vendedores</h2>
            <span className="text-xs text-gray-400">{porVendedor.length} vendedor{porVendedor.length === 1 ? '' : 'es'} · viendo {unidad === 'monto' ? 'montos' : 'cantidad de documentos'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Vendedor</th>
                  <th className="text-left px-4 py-2 font-medium">Área</th>
                  <th className="text-right px-4 py-2 font-medium">Cotizado</th>
                  <th className="text-right px-4 py-2 font-medium">Cerrado</th>
                  <th className="text-right px-4 py-2 font-medium">Facturado</th>
                  <th className="text-right px-4 py-2 font-medium">Cot→Cer</th>
                  <th className="text-right px-4 py-2 font-medium">Cer→Fact</th>
                </tr>
              </thead>
              <tbody>
                {porVendedor.map((v, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-ht-navy">{v.nombre}</td>
                    <td className="px-4 py-2">{v.area ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${AREA_BADGE[v.area]}`}>{AREA_LABEL[v.area]}</span> : <span className="text-xs text-gray-300">Sin área</span>}</td>
                    <td className="px-4 py-2 text-right">{fmtUnidad(v[campo('cotizado')])}</td>
                    <td className="px-4 py-2 text-right">{fmtUnidad(v[campo('cerrado')])}</td>
                    <td className="px-4 py-2 text-right">{fmtUnidad(v[campo('facturado')])}</td>
                    <td className="px-4 py-2 text-right">{fmtPct(v[campo('cerrado')] / v[campo('cotizado')])}</td>
                    <td className="px-4 py-2 text-right">{fmtPct(v[campo('facturado')] / v[campo('cerrado')])}</td>
                  </tr>
                ))}
                {!porVendedor.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Sin datos para este filtro.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'area' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.keys(AREA_LABEL).map(k => {
            const d = porArea[k];
            const max = Math.max(1, ...Object.values(porArea).map(x => x[campo('cotizado')]));
            const barra = (c, label, color) => {
              const v = d[campo(c)];
              return (
                <div key={c} className="grid grid-cols-[60px_1fr_auto] items-center gap-2 text-xs text-gray-500 mb-1.5">
                  <span>{label}</span>
                  <span className="h-1.5 rounded bg-gray-100 overflow-hidden"><span className="block h-full rounded" style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: color }} /></span>
                  <span className="text-right">{fmtUnidad(v)}</span>
                </div>
              );
            };
            return (
              <div key={k} className="bg-white border border-gray-200 rounded-lg p-4">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${AREA_BADGE[k]}`}>{AREA_LABEL[k]}</span>
                <div className="text-lg font-bold text-ht-navy mt-2 mb-3">{fmtUnidad(d[campo('cotizado')])} <span className="text-xs font-normal text-gray-400">cotizado</span></div>
                {barra('cotizado', 'Cotizado', COLOR_COTIZADO)}
                {barra('cerrado', 'Cerrado', COLOR_CERRADO)}
                {barra('facturado', 'Facturado', COLOR_FACTURADO)}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'nvpend' && (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <TarjetaKpi color={COLOR_CERRADO} label="NV sin facturar" valor={nvPendientes.length} />
            <TarjetaKpi color="#C6473F" label="Monto pendiente" valor={fmtMoney(sum(nvPendientes, 'monto_pendiente'))} />
            <TarjetaKpi color="#94A3B8" label="Días máx. sin facturar" valor={nvPendientes.length ? `${Math.max(...nvPendientes.map(r => r.dias))} días` : '—'} />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-ht-navy text-sm">Notas de venta pendientes de facturación</h2>
              <input value={buscarNv} onChange={e => setBuscarNv(e.target.value)}
                placeholder="Buscar por NV, cliente, vendedor u O/C…"
                className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">NV</th>
                    <th className="text-left px-4 py-2 font-medium">Fecha</th>
                    <th className="text-left px-4 py-2 font-medium">Días</th>
                    <th className="text-left px-4 py-2 font-medium">Vendedor</th>
                    <th className="text-left px-4 py-2 font-medium">Cliente</th>
                    <th className="text-right px-4 py-2 font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {nvPendientes.map(r => (
                    <tr key={r.nv_numero} className="border-t border-gray-100 hover:bg-slate-50">
                      <td className="px-4 py-2 text-ht-navy">{r.nv_numero}</td>
                      <td className="px-4 py-2 text-gray-600">{new Date(r.fecha_nv).toLocaleDateString('es-CL')}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.dias > 30 ? 'bg-red-50 text-red-600' : r.dias > 14 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{r.dias} d</span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{r.nombre_vendedor}</td>
                      <td className="px-4 py-2 text-gray-600">{r.nombre_cliente}</td>
                      <td className="px-4 py-2 text-right text-ht-navy">{fmtMoney(r.monto_pendiente)}</td>
                    </tr>
                  ))}
                  {!nvPendientes.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin NV pendientes para este filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'cotizaciones_doc' && (
        <ListadoDocumentosSoftland tipo="cotizaciones" anio={anio} mes={mes} vencod={vencod} area={area} />
      )}
      {tab === 'nv_doc' && (
        <ListadoDocumentosSoftland tipo="notas-venta" anio={anio} mes={mes} vencod={vencod} area={area} />
      )}
      {tab === 'facturas_doc' && (
        <ListadoDocumentosSoftland tipo="facturas" anio={anio} mes={mes} vencod={vencod} area={area} />
      )}
    </div>
  );
}

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

function GraficoTooltip({ t }) {
  if (!t) return null;
  return (
    <div className="absolute z-10 pointer-events-none bg-ht-navy text-white text-xs rounded px-2.5 py-1.5 shadow-lg -translate-x-1/2 -translate-y-full"
      style={{ left: t.x, top: t.y - 8 }}>
      <div className="font-semibold mb-0.5">{t.titulo}</div>
      {t.lineas
        ? t.lineas.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: l.color }} />{l.texto}
          </div>
        ))
        : <div>{t.valor}</div>}
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex gap-4 text-xs text-gray-500">
      <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: COLOR_COTIZADO }} />Cotizado</span>
      <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: COLOR_CERRADO }} />Cerrado</span>
      <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: COLOR_FACTURADO }} />Facturado</span>
    </div>
  );
}

// --- Dibujo de canvas (imperativo, fuera del árbol de React) ---

function mesesDesde2023() {
  const hoy = new Date();
  const lista = [];
  for (let a = 2023; a <= hoy.getFullYear(); a++) {
    for (let m = 1; m <= 12; m++) {
      if (a === hoy.getFullYear() && m > hoy.getMonth() + 1) break;
      lista.push({ anio: a, mes: m });
    }
  }
  return lista;
}

function prepararCanvas(canvas, wCss, hCss) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${wCss}px`; canvas.style.height = `${hCss}px`;
  canvas.width = wCss * dpr; canvas.height = hCss * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, wCss, hCss);
  return ctx;
}

// Puntos del eje X del gráfico "Evolución" según los filtros de Año/Mes:
// - ninguno de los dos: serie corrida 2023-hoy (un punto por mes, todos los años).
// - mes fijado (sin año): un punto por año — compara ese mes entre años.
// - año fijado (con o sin mes): un punto por mes de ese año (Ene-Dic).
function construirPuntosMensual(años, anio, mes) {
  if (anio) {
    return Array.from({ length: 12 }, (_, i) => ({ anio: Number(anio), mes: i + 1, ejeLabel: MESES_ABR[i] }));
  }
  if (mes) {
    return años.map(a => ({ anio: a, mes: Number(mes), ejeLabel: String(a) }));
  }
  return mesesDesde2023().map(p => ({ anio: p.anio, mes: p.mes, ejeLabel: p.mes === 1 ? String(p.anio) : '' }));
}

// Suma cotizado/cerrado/facturado (monto y cantidad) de `rows` para cada
// punto (anio, mes) — mismo criterio para el dibujo y para el hover.
function agregarPorPunto(rows, puntos) {
  return puntos.map(p => {
    const acc = { ...p, cotizado: 0, cerrado: 0, facturado: 0, cant_cotizado: 0, cant_cerrado: 0, cant_facturado: 0 };
    rows.forEach(r => {
      if (r.anio !== p.anio || r.mes !== p.mes) return;
      acc.cotizado += r.cotizado; acc.cerrado += r.cerrado; acc.facturado += r.facturado;
      acc.cant_cotizado += r.cant_cotizado; acc.cant_cerrado += r.cant_cerrado; acc.cant_facturado += r.cant_facturado;
    });
    return acc;
  });
}

// Dibuja el gráfico "Evolución" ya con los puntos agregados (uno por
// año-mes, según construirPuntosMensual) y devuelve la geometría para que
// el hover (afuera, en el componente) sepa qué punto está bajo el mouse —
// mismo patrón que layoutBarrasPorAnio/celdaEnPosicion.
function dibujarMensual(canvas, serie, unidad, { dividers = false } = {}) {
  if (!canvas || !serie.length) return null;
  const campo = base => (unidad === 'monto' ? base : `cant_${base}`);
  const anchoPunto = serie.length <= 15 ? 60 : 20;
  const wCss = Math.max(480, serie.length * anchoPunto), hCss = 280;
  const ctx = prepararCanvas(canvas, wCss, hCss);
  if (!ctx) return null;

  const padL = 60, padB = 26, padT = 10, padR = 10;
  const plotW = wCss - padL - padR, plotH = hCss - padT - padB;
  const maxV = Math.max(1, ...serie.map(s => s[campo('cotizado')])) * 1.12;

  ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1; ctx.font = '10px -apple-system, sans-serif'; ctx.fillStyle = '#94A3B8';
  for (let g = 0; g <= 4; g++) {
    const y = padT + plotH - (g / 4) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(wCss - padR, y); ctx.stroke();
    const val = (maxV * g) / 4;
    ctx.textAlign = 'right';
    ctx.fillText(unidad === 'monto' ? `${(val / 1e6).toFixed(0)}M` : Math.round(val).toLocaleString('es-CL'), padL - 8, y + 3);
  }

  const stepX = plotW / serie.length, barW = Math.max(3, stepX * 0.55);
  ctx.fillStyle = COLOR_COTIZADO;
  serie.forEach((s, i) => {
    const x = padL + i * stepX + (stepX - barW) / 2;
    const h = (s[campo('cotizado')] / maxV) * plotH;
    ctx.fillRect(x, padT + plotH - h, barW, h);
  });
  const linea = (campoBase, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    serie.forEach((s, i) => {
      const x = padL + i * stepX + stepX / 2, y = padT + plotH - (s[campo(campoBase)] / maxV) * plotH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  linea('cerrado', COLOR_CERRADO);
  linea('facturado', COLOR_FACTURADO);

  ctx.fillStyle = '#94A3B8'; ctx.textAlign = 'center';
  serie.forEach((s, i) => {
    if (!s.ejeLabel) return;
    const x = padL + i * stepX + stepX / 2;
    ctx.fillText(s.ejeLabel, x, hCss - 8);
    if (dividers) {
      ctx.strokeStyle = '#E2E8F0';
      ctx.beginPath(); ctx.moveTo(padL + i * stepX, padT); ctx.lineTo(padL + i * stepX, padT + plotH); ctx.stroke();
    }
  });

  return { padL, padT, padB, padR, plotW, plotH, maxV, stepX, wCss, hCss, serie };
}

// Matriz {año: [valor_ene..valor_dic]} para la métrica/unidad elegidas.
function matrizPorAnioMes(rows, años, metrica, unidad) {
  const campo = unidad === 'monto' ? metrica : `cant_${metrica}`;
  const porAnioMes = {};
  años.forEach(a => { porAnioMes[a] = Array(12).fill(0); });
  rows.forEach(r => { if (porAnioMes[r.anio]) porAnioMes[r.anio][r.mes - 1] += r[campo] || 0; });
  return porAnioMes;
}

// Misma matriz, pero acumulada mes a mes dentro de cada año (Ene, Ene+Feb, ...).
function acumularPorAnio(porAnioMes, años) {
  const acum = {};
  años.forEach(a => {
    let corrido = 0;
    acum[a] = porAnioMes[a].map(v => (corrido += v));
  });
  return acum;
}

// Geometría del gráfico de barras agrupadas por año — se calcula una vez y
// la usan tanto el dibujo en canvas como la detección de hover (mismos
// números en los dos, no se puede permitir que se desalineen).
function layoutBarrasPorAnio(porAnioMes, años, wCss, hCss) {
  const padL = 60, padB = 30, padT = 12, padR = 10;
  const plotW = wCss - padL - padR, plotH = hCss - padT - padB;
  let maxV = 1;
  años.forEach(a => { maxV = Math.max(maxV, ...porAnioMes[a]); });
  maxV *= 1.12;
  const stepMes = plotW / 12, grupoW = stepMes * 0.72, barW = grupoW / Math.max(1, años.length);
  return { padL, padT, padR, padB, plotW, plotH, maxV, stepMes, grupoW, barW, wCss, hCss };
}

function dibujarBarrasPorAnio(canvas, porAnioMes, años, unidad) {
  if (!canvas) return null;
  const wCss = Math.max(760, 12 * Math.max(años.length, 1) * 22), hCss = 300;
  const layout = layoutBarrasPorAnio(porAnioMes, años, wCss, hCss);
  const { padL, padT, padR, plotW, plotH, maxV, stepMes, grupoW, barW } = layout;
  const ctx = prepararCanvas(canvas, wCss, hCss);
  if (!ctx) return layout;

  ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1; ctx.font = '10px -apple-system, sans-serif'; ctx.fillStyle = '#94A3B8';
  for (let g = 0; g <= 4; g++) {
    const y = padT + plotH - (g / 4) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(wCss - padR, y); ctx.stroke();
    const val = (maxV * g) / 4;
    ctx.textAlign = 'right';
    ctx.fillText(unidad === 'monto' ? `${(val / 1e6).toFixed(0)}M` : Math.round(val).toLocaleString('es-CL'), padL - 8, y + 3);
  }

  ctx.textAlign = 'center';
  for (let m = 0; m < 12; m++) {
    const gx = padL + m * stepMes + (stepMes - grupoW) / 2;
    años.forEach((a, ai) => {
      const v = porAnioMes[a][m], h = plotW ? (v / maxV) * plotH : 0;
      ctx.fillStyle = AÑO_COLOR[a] || '#999';
      ctx.fillRect(gx + ai * barW + 1, padT + plotH - h, barW - 2, h);
    });
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(MESES_ABR[m], padL + m * stepMes + stepMes / 2, hCss - 10);
  }
  return layout;
}

// Dado un evento de mouse sobre el canvas y la geometría ya calculada,
// determina qué (año, mes) está bajo el cursor — o null si está fuera del
// área de las barras. No exige acertar el pixel exacto de la barra: alcanza
// con estar en la columna del mes y dentro del alto del gráfico, como
// cualquier tooltip de gráfico de barras.
function celdaEnPosicion(layout, años, xCss, yCss) {
  if (!layout) return null;
  const { padL, padT, plotH, stepMes, grupoW, barW } = layout;
  if (yCss < padT || yCss > padT + plotH) return null;
  const mes = Math.floor((xCss - padL) / stepMes);
  if (mes < 0 || mes > 11) return null;
  const inicioGrupo = padL + mes * stepMes + (stepMes - grupoW) / 2;
  const offset = xCss - inicioGrupo;
  if (offset < 0 || offset > grupoW) return null;
  const ai = Math.floor(offset / barW);
  if (ai < 0 || ai >= años.length) return null;
  return { anio: años[ai], mes };
}
