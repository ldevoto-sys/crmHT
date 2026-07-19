import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const money = v => `$${Number(v || 0).toLocaleString('es-CL')}`;
const PUEDE_FILTRAR_VENDEDOR = ['administrador', 'jefe_comercial', 'gerencia'];
const PUEDE_VER_COTIZACIONES_DIA = ['administrador', 'jefe_comercial'];
const fecha = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-CL') : '';

export default function Reportes() {
  const { user } = useAuth();
  const [embudo, setEmbudo] = useState([]);
  const [causas, setCausas] = useState([]);
  const [tiempos, setTiempos] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [error, setError] = useState('');

  const [vendedores, setVendedores] = useState([]);
  const [vendedorId, setVendedorId] = useState('');

  // Embudo: filtro por fecha ESTIMADA de cierre (forecast de pipeline abierto).
  const [embudoDesde, setEmbudoDesde] = useState('');
  const [embudoHasta, setEmbudoHasta] = useState('');

  // Causas / ranking: filtro por fecha REAL de cierre (negocios ya cerrados).
  const [cierreDesde, setCierreDesde] = useState('');
  const [cierreHasta, setCierreHasta] = useState('');

  // Árbol: etapa expandida en el embudo + negocios cargados por etapa.
  const [etapaExpandida, setEtapaExpandida] = useState(null);
  const [negociosPorEtapa, setNegociosPorEtapa] = useState({});
  const [cargandoEtapa, setCargandoEtapa] = useState(null);

  const puedeFiltrarVendedor = PUEDE_FILTRAR_VENDEDOR.includes(user?.rol);
  const puedeVerCotizacionesDia = PUEDE_VER_COTIZACIONES_DIA.includes(user?.rol);

  const [cotizacionesDia, setCotizacionesDia] = useState([]);
  const [mostrarCotizacionesDia, setMostrarCotizacionesDia] = useState(false);
  const [cotDiaDesde, setCotDiaDesde] = useState('');
  const [cotDiaHasta, setCotDiaHasta] = useState('');
  const [diaExpandido, setDiaExpandido] = useState(null);
  const [detallePorDia, setDetallePorDia] = useState({});
  const [cargandoDia, setCargandoDia] = useState(null);

  useEffect(() => {
    if (puedeFiltrarVendedor) api.get('/users/vendedores').then(r => setVendedores(r.data)).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const paramsBase = () => (vendedorId ? { vendedor_id: vendedorId } : {});

  const cargarEmbudo = () => api.get('/reportes/embudo', {
    params: { ...paramsBase(), desde: embudoDesde || undefined, hasta: embudoHasta || undefined },
  }).then(r => setEmbudo(r.data));

  const cargarCausasRanking = () => Promise.all([
    api.get('/reportes/causas-no-cierre', { params: { ...paramsBase(), desde: cierreDesde || undefined, hasta: cierreHasta || undefined } }),
    api.get('/reportes/ranking-vendedores', { params: { ...paramsBase(), desde: cierreDesde || undefined, hasta: cierreHasta || undefined } }),
  ]).then(([c, r]) => { setCausas(c.data); setRanking(r.data); });

  const cargarTiempos = () => api.get('/reportes/tiempos-etapa', { params: paramsBase() }).then(r => setTiempos(r.data));

  const cargarCotizacionesDia = () => api.get('/reportes/cotizaciones-por-dia', {
    params: { ...paramsBase(), desde: cotDiaDesde || undefined, hasta: cotDiaHasta || undefined },
  }).then(r => setCotizacionesDia(r.data));

  useEffect(() => {
    cargarEmbudo().catch(() => setError('No se pudieron cargar los reportes.'));
    setEtapaExpandida(null); setNegociosPorEtapa({});
    // eslint-disable-next-line
  }, [vendedorId, embudoDesde, embudoHasta]);

  useEffect(() => {
    cargarCausasRanking().catch(() => setError('No se pudieron cargar los reportes.'));
    // eslint-disable-next-line
  }, [vendedorId, cierreDesde, cierreHasta]);

  useEffect(() => {
    cargarTiempos().catch(() => setError('No se pudieron cargar los reportes.'));
    // eslint-disable-next-line
  }, [vendedorId]);

  useEffect(() => {
    if (!mostrarCotizacionesDia) return;
    cargarCotizacionesDia().catch(() => setError('No se pudieron cargar las cotizaciones por día.'));
    setDiaExpandido(null); setDetallePorDia({});
    // eslint-disable-next-line
  }, [vendedorId, cotDiaDesde, cotDiaHasta, mostrarCotizacionesDia]);

  const exportar = async tipo => {
    try {
      const { data } = await api.get('/reportes/export', { params: { tipo, ...paramsBase() }, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = `reporte_${tipo}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('No se pudo exportar el reporte.'); }
  };

  const toggleDia = async c => {
    if (diaExpandido === c.fecha) { setDiaExpandido(null); return; }
    setDiaExpandido(c.fecha);
    if (!detallePorDia[c.fecha]) {
      setCargandoDia(c.fecha);
      try {
        const { data } = await api.get('/reportes/cotizaciones-por-dia/detalle', { params: { fecha: c.fecha, ...paramsBase() } });
        setDetallePorDia(prev => ({ ...prev, [c.fecha]: data }));
      } catch { setError('No se pudo cargar el detalle por vendedor.'); }
      finally { setCargandoDia(null); }
    }
  };

  const toggleEtapa = async e => {
    if (etapaExpandida === e.etapa_id) { setEtapaExpandida(null); return; }
    setEtapaExpandida(e.etapa_id);
    if (!negociosPorEtapa[e.etapa_id]) {
      setCargandoEtapa(e.etapa_id);
      try {
        const { data } = await api.get('/negocios', {
          params: { etapa_id: e.etapa_id, ...paramsBase(), desde: embudoDesde || undefined, hasta: embudoHasta || undefined },
        });
        setNegociosPorEtapa(prev => ({ ...prev, [e.etapa_id]: data }));
      } catch { setError('No se pudieron cargar los negocios de la etapa.'); }
      finally { setCargandoEtapa(null); }
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-ht-navy">Reportes</h1>
        {puedeVerCotizacionesDia && (
          <button onClick={() => setMostrarCotizacionesDia(v => !v)}
            className="px-4 py-2 rounded text-sm font-medium border border-ht-navy text-ht-navy hover:bg-ht-navy/5">
            {mostrarCotizacionesDia ? 'Ocultar cotizaciones por día' : 'Cotizaciones por día'}
          </button>
        )}
      </div>
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {mostrarCotizacionesDia && puedeVerCotizacionesDia && (
        <Seccion
          titulo="Cotizaciones por día"
          onExportar={() => exportar('cotizaciones_dia')}
          filtros={
            <RangoFechas label="Fecha de creación" desde={cotDiaDesde} hasta={cotDiaHasta}
              onDesde={setCotDiaDesde} onHasta={setCotDiaHasta} />
          }
        >
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 font-medium">Cotizaciones</th>
                <th className="text-right px-4 py-2 font-medium">Monto total</th>
              </tr>
            </thead>
            <tbody>
              {cotizacionesDia.map(c => (
                <Fragment key={c.fecha}>
                  <tr onClick={() => toggleDia(c)} className="border-t border-gray-100 cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-2 text-ht-navy">
                      <span className="inline-block w-3 text-gray-400">{diaExpandido === c.fecha ? '▾' : '▸'}</span>
                      {fecha(c.fecha)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{c.cantidad}</td>
                    <td className="px-4 py-2 text-right text-ht-navy">{money(c.monto_total)}</td>
                  </tr>
                  {diaExpandido === c.fecha && (
                    <tr>
                      <td colSpan={3} className="bg-slate-50 px-4 py-3">
                        {cargandoDia === c.fecha ? (
                          <p className="text-sm text-gray-400">Cargando…</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead className="text-gray-500">
                              <tr>
                                <th className="text-left py-1 font-medium">Vendedor</th>
                                <th className="text-right py-1 font-medium">Contactos asignados</th>
                                <th className="text-right py-1 font-medium">Cotizaciones generadas</th>
                                <th className="text-right py-1 font-medium">Monto generado</th>
                                <th className="text-right py-1 font-medium">Cotizaciones ganadas</th>
                                <th className="text-right py-1 font-medium">Monto ganado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(detallePorDia[c.fecha] || []).map(v => (
                                <tr key={v.vendedor_id} className="border-t border-gray-200 hover:bg-gray-50">
                                  <td className="py-1 text-ht-navy">{v.vendedor_nombre}</td>
                                  <td className="py-1 text-right text-gray-600">{v.contactos_asignados}</td>
                                  <td className="py-1 text-right text-gray-600">{v.cotizaciones_generadas}</td>
                                  <td className="py-1 text-right text-ht-navy">{money(v.cotizaciones_generadas_monto)}</td>
                                  <td className="py-1 text-right text-gray-600">{v.cotizaciones_ganadas}</td>
                                  <td className="py-1 text-right text-ht-navy">{money(v.cotizaciones_ganadas_monto)}</td>
                                </tr>
                              ))}
                              {(detallePorDia[c.fecha] || []).length === 0 && (
                                <tr><td colSpan={6} className="py-3 text-center text-gray-400">Sin actividad por vendedor ese día.</td></tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {cotizacionesDia.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Sin cotizaciones en el rango.</td></tr>}
            </tbody>
          </table>
        </Seccion>
      )}

      {puedeFiltrarVendedor && (
        <div className="mb-6 flex items-center gap-2">
          <label className="text-sm text-gray-700">Vendedor</label>
          <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Todos</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
      )}

      <Seccion
        titulo="Embudo por etapa"
        onExportar={() => exportar('embudo')}
        filtros={
          <RangoFechas label="Fecha estimada de cierre" desde={embudoDesde} hasta={embudoHasta}
            onDesde={setEmbudoDesde} onHasta={setEmbudoHasta} />
        }
      >
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr><th className="text-left px-4 py-2 font-medium">Etapa</th><th className="text-left px-4 py-2 font-medium">Negocios</th><th className="text-right px-4 py-2 font-medium">Monto estimado</th></tr>
          </thead>
          <tbody>
            {embudo.map(e => (
              <Fragment key={e.etapa_id}>
                <tr onClick={() => e.cantidad > 0 && toggleEtapa(e)}
                  className={`border-t border-gray-100 ${e.cantidad > 0 ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                  <td className="px-4 py-2 text-ht-navy">
                    {e.cantidad > 0 && <span className="inline-block w-3 text-gray-400">{etapaExpandida === e.etapa_id ? '▾' : '▸'}</span>}
                    {e.etapa_nombre}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{e.cantidad}</td>
                  <td className="px-4 py-2 text-right text-ht-navy">{money(e.monto_total)}</td>
                </tr>
                {etapaExpandida === e.etapa_id && (
                  <tr>
                    <td colSpan={3} className="bg-slate-50 px-4 py-3">
                      {cargandoEtapa === e.etapa_id ? (
                        <p className="text-sm text-gray-400">Cargando…</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {(negociosPorEtapa[e.etapa_id] || []).map(n => (
                            <li key={n.id} className="text-sm flex justify-between">
                              <Link to={`/negocios/${n.id}`} className="text-ht-navy hover:underline">
                                {n.titulo} <span className="text-gray-400">· {n.contacto_nombre} {n.contacto_apellido || ''}{n.empresa_nombre ? ` · ${n.empresa_nombre}` : ''}{n.vendedor_nombre ? ` · ${n.vendedor_nombre}` : ''}</span>
                              </Link>
                              <span className="text-ht-navy">{money(n.monto_estimado)}</span>
                            </li>
                          ))}
                          {(negociosPorEtapa[e.etapa_id] || []).length === 0 && <li className="text-sm text-gray-400">Sin negocios.</li>}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Seccion>

      <RangoFechas label="Fecha de cierre (negocios ganados/perdidos)" desde={cierreDesde} hasta={cierreHasta}
        onDesde={setCierreDesde} onHasta={setCierreHasta} envoltorio />

      <Seccion titulo="Causas de no cierre" onExportar={() => exportar('causas')}>
        {causas.length === 0 ? <p className="text-sm text-gray-400 px-4 py-4">Sin negocios perdidos en el rango.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr><th className="text-left px-4 py-2 font-medium">Causa</th><th className="text-left px-4 py-2 font-medium">Negocios</th><th className="text-right px-4 py-2 font-medium">Monto perdido</th></tr>
            </thead>
            <tbody>
              {causas.map(c => (
                <tr key={c.causa} className="border-t border-gray-100 hover:bg-gray-50">
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
                <tr key={t.etapa_id} className="border-t border-gray-100 hover:bg-gray-50">
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
              <tr key={r.vendedor_id} className="border-t border-gray-100 hover:bg-gray-50">
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

function RangoFechas({ label, desde, hasta, onDesde, onHasta, envoltorio }) {
  const contenido = (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">{label}:</span>
      <input type="date" value={desde} onChange={e => onDesde(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
      <span className="text-gray-400">a</span>
      <input type="date" value={hasta} onChange={e => onHasta(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
      {(desde || hasta) && <button onClick={() => { onDesde(''); onHasta(''); }} className="text-xs text-ht-accent hover:underline">limpiar</button>}
    </div>
  );
  return envoltorio ? <div className="mb-2">{contenido}</div> : contenido;
}

function Seccion({ titulo, onExportar, filtros, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 className="font-semibold text-ht-navy">{titulo}</h2>
        <div className="flex items-center gap-4">
          {filtros}
          <button onClick={onExportar} className="text-xs text-ht-accent hover:underline">Exportar CSV</button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {children}
      </div>
    </div>
  );
}
