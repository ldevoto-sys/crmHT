import { Fragment, useEffect, useRef, useState } from 'react';
import api from '../../api';
import { formatFechaHora } from '../../utils/fecha';

const fmtMoney = v => `$${Math.round(v || 0).toLocaleString('es-CL')}`;
// fecha_emision, fecha_vencimiento y el "fecha" de un movimiento bancario son
// columnas DATE (un día calendario, sin hora) — Postgres las serializa como
// medianoche UTC, así que forzar la conversión a America/Santiago (como con
// una fecha-hora real) las corre un día hacia atrás. Se arma la fecha local
// directamente desde los primeros 10 caracteres (YYYY-MM-DD), igual que en
// Pipeline/Reportes/Despacho/Postventa/ServicioTecnico.
const fmtFecha = iso => iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CL') : '—';

const ESTADO_DOC_LABEL = { a_tiempo: 'A tiempo', atrasado: 'Atrasado (<15 días)', vencido: 'Vencido (>15 días)' };
const ESTADO_DOC_COLOR = { a_tiempo: 'bg-ht-accent/15 text-ht-navy', atrasado: 'bg-amber-100 text-amber-700', vencido: 'bg-red-100 text-red-700' };
const ESTADO_MOV_LABEL = { pendiente: 'Pendiente', preconciliado: 'Parcial', conciliado: 'Conciliado', archivado: 'Archivado' };

const DIACRITICOS = new RegExp('[̀-ͯ]', 'g');
const normalizar = s => (s || '').normalize('NFD').replace(DIACRITICOS, '').toLowerCase();

export default function Cobranza() {
  const [tab, setTab] = useState('documentos');
  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-4">Cobranza</h1>
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[['documentos', 'Documentos'], ['movimientos', 'Movimientos bancarios'], ['cuentas', 'Cuentas de cliente'], ['contactos', 'Contactos'], ['reportes', 'Reportes']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-ht-accent text-ht-navy' : 'border-transparent text-gray-500 hover:text-ht-navy'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'documentos' && <TabDocumentos />}
      {tab === 'movimientos' && <TabMovimientos />}
      {tab === 'cuentas' && <TabCuentasCliente />}
      {tab === 'contactos' && <TabContactos />}
      {tab === 'reportes' && <TabReportes />}
    </div>
  );
}

function TarjetaKpi({ color, label, valor }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 relative overflow-hidden pl-5">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />
      <div className="text-xs font-semibold text-gray-400 uppercase mb-1">{label}</div>
      <div className="text-2xl font-bold text-ht-navy">{valor}</div>
    </div>
  );
}

function TabDocumentos() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [actualizando, setActualizando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const cargar = async () => {
    try { setData((await api.get('/cobranza/documentos')).data); }
    catch { setError('No se pudieron cargar los documentos.'); }
  };
  useEffect(() => { cargar(); }, []);

  const actualizar = async () => {
    setError(''); setMsg(''); setActualizando(true);
    try {
      const { data: r } = await api.post('/cobranza/documentos/actualizar');
      setMsg(r.message);
      await cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo actualizar desde Softland.'); }
    finally { setActualizando(false); }
  };

  if (!data) return <div className="text-gray-400 text-sm">Cargando…</div>;

  const termino = normalizar(busqueda.trim());
  const filtrados = termino
    ? data.documentos.filter(d => [d.folio, d.rut_cliente, d.nombre_cliente].some(c => normalizar(c).includes(termino)))
    : data.documentos;

  return (
    <div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs text-gray-400">
          {data.ultima_actualizacion ? `Última actualización: ${formatFechaHora(data.ultima_actualizacion)}` : 'Todavía no se ha sincronizado con Softland.'}
        </p>
        <button onClick={actualizar} disabled={actualizando}
          className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
          {actualizando ? 'Actualizando…' : 'Actualizar desde Softland'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <TarjetaKpi color="#112548" label="Total por cobrar" valor={fmtMoney(data.kpis.total_por_cobrar)} />
        <TarjetaKpi color="#34B3DE" label="A tiempo" valor={fmtMoney(data.kpis.a_tiempo)} />
        <TarjetaKpi color="#d97706" label="Atrasado (<15 días)" valor={fmtMoney(data.kpis.atrasado)} />
        <TarjetaKpi color="#dc2626" label="Vencido (>15 días)" valor={fmtMoney(data.kpis.vencido)} />
      </div>

      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por folio, RUT o cliente…"
        className="mb-3 border border-gray-300 rounded px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-ht-accent" />

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Cliente</th>
              <th className="text-left px-4 py-2 font-medium">Folio</th>
              <th className="text-left px-4 py-2 font-medium">Emisión</th>
              <th className="text-left px-4 py-2 font-medium">Vencimiento</th>
              <th className="text-right px-4 py-2 font-medium">Monto</th>
              <th className="text-right px-4 py-2 font-medium">Saldo</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(d => (
              <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-ht-navy">
                  {d.nombre_cliente}
                  <div className="text-xs text-gray-400">{d.rut_cliente}</div>
                </td>
                <td className="px-4 py-2 text-gray-600">#{d.folio}</td>
                <td className="px-4 py-2 text-gray-600">{fmtFecha(d.fecha_emision)}</td>
                <td className="px-4 py-2 text-gray-600">{fmtFecha(d.fecha_vencimiento)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{fmtMoney(d.monto_total)}</td>
                <td className="px-4 py-2 text-right text-ht-navy font-medium">{fmtMoney(d.saldo_pendiente)}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_DOC_COLOR[d.estado]}`}>{ESTADO_DOC_LABEL[d.estado]}</span>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                {data.documentos.length === 0 ? 'Sin documentos — usa "Actualizar desde Softland" para cargarlos.' : 'Sin resultados para esa búsqueda.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabMovimientos() {
  const [movimientos, setMovimientos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [expandido, setExpandido] = useState(null);
  const [movimientoAConciliar, setMovimientoAConciliar] = useState(null);
  const fileRef = useRef(null);

  const cargar = async () => {
    try {
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      setMovimientos((await api.get('/cobranza/movimientos', { params })).data);
    } catch { setError('No se pudieron cargar los movimientos.'); }
  };
  useEffect(() => { cargar(); }, [filtroEstado]);
  useEffect(() => {
    api.get('/cobranza/documentos').then(({ data }) => setDocumentos(data.documentos)).catch(() => {});
  }, []);

  const subirCartola = async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    setError(''); setMsg(''); setSubiendo(true);
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      const { data } = await api.post('/cobranza/movimientos/importar', form);
      setMsg(data.message);
      await cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo subir el archivo.'); }
    finally { setSubiendo(false); }
  };

  const archivar = async (m) => {
    const motivo = window.prompt(`Motivo para archivar este movimiento de ${fmtMoney(m.monto)} sin conciliar:`);
    if (motivo === null) return;
    if (!motivo.trim()) { setError('El motivo es obligatorio para archivar.'); return; }
    setError(''); setMsg('');
    try {
      const { data } = await api.post(`/cobranza/movimientos/${m.id}/archivar`, { motivo: motivo.trim() });
      setMsg(data.message);
      await cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo archivar.'); }
  };

  const deshacer = async (m) => {
    if (!window.confirm('¿Deshacer la conciliación de este movimiento? Vuelve a quedar pendiente.')) return;
    setError(''); setMsg('');
    try {
      const { data } = await api.post(`/cobranza/movimientos/${m.id}/deshacer`);
      setMsg(data.message);
      setExpandido(null);
      await cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo deshacer.'); }
  };

  const toggleExpandido = (id) => setExpandido(expandido === id ? null : id);

  return (
    <div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1 flex-wrap">
          {['', 'pendiente', 'preconciliado', 'conciliado', 'archivado'].map(e => (
            <button key={e || 'todos'} onClick={() => setFiltroEstado(e)}
              className={`text-sm px-3 py-1.5 rounded ${filtroEstado === e ? 'bg-ht-accent text-ht-navy' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {e ? ESTADO_MOV_LABEL[e] : 'Todos'}
            </button>
          ))}
        </div>
        <label className={`bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 cursor-pointer ${subiendo ? 'opacity-50 pointer-events-none' : ''}`}>
          {subiendo ? 'Subiendo…' : '+ Subir archivo'}
          <input type="file" ref={fileRef} accept=".xls,.xlsx" onChange={subirCartola} className="hidden" disabled={subiendo} />
        </label>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Acepta cartolas de Banco de Chile/Santander, o los dos archivos de Transbank (Cartola de Movimientos y Resumen de abonos) — se detecta el formato automáticamente.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Banco</th>
              <th className="text-left px-4 py-2 font-medium">Cuenta</th>
              <th className="text-left px-4 py-2 font-medium">Fecha</th>
              <th className="text-left px-4 py-2 font-medium">Descripción</th>
              <th className="text-right px-4 py-2 font-medium">Monto</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
              <th className="text-left px-4 py-2 font-medium">Cargado por</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map(m => (
              <Fragment key={m.id}>
                <tr className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-ht-navy">{m.banco}</td>
                  <td className="px-4 py-2 text-gray-600">{m.cuenta_bancaria}</td>
                  <td className="px-4 py-2 text-gray-600">{fmtFecha(m.fecha)}</td>
                  <td className="px-4 py-2 text-gray-600 max-w-xs truncate" title={m.glosa_original}>{m.glosa_original}</td>
                  <td className="px-4 py-2 text-right text-ht-navy font-medium">{fmtMoney(m.monto)}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ESTADO_MOV_LABEL[m.estado] || m.estado}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{m.cargado_por_nombre || '—'}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-xs">
                    {(m.estado === 'pendiente' || m.estado === 'preconciliado') && (
                      <>
                        <button onClick={() => setMovimientoAConciliar(m)} className="text-ht-accent hover:underline mr-3">Conciliar</button>
                        <button onClick={() => archivar(m)} className="text-red-500 hover:underline mr-3">Archivar</button>
                      </>
                    )}
                    {(m.estado === 'preconciliado' || m.estado === 'conciliado') && (
                      <button onClick={() => toggleExpandido(m.id)} className="text-gray-500 hover:underline mr-3">
                        {expandido === m.id ? 'Ocultar' : 'Detalle'}
                      </button>
                    )}
                    {m.estado === 'conciliado' && (
                      <button onClick={() => deshacer(m)} className="text-red-500 hover:underline">Deshacer</button>
                    )}
                  </td>
                </tr>
                {expandido === m.id && (
                  <tr className="border-t border-gray-100 bg-slate-50">
                    <td colSpan={8} className="px-4 py-3">
                      <DetalleMovimiento movimiento={m} onCambio={async () => { setExpandido(null); await cargar(); }} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {movimientos.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Sin movimientos — sube un archivo para empezar.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {movimientoAConciliar && (
        <ModalConciliar
          movimiento={movimientoAConciliar}
          documentos={documentos}
          onClose={() => setMovimientoAConciliar(null)}
          onConciliado={async (mensaje) => { setMsg(mensaje); setMovimientoAConciliar(null); await cargar(); }}
        />
      )}
    </div>
  );
}

// Detalle de un movimiento preconciliado (sugerencia automática) o
// conciliado (ya resuelto) — muestra qué factura(s) se le aplicaron y
// permite aprobar/rechazar una sugerencia automática.
function DetalleMovimiento({ movimiento, onCambio }) {
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/cobranza/movimientos/${movimiento.id}/conciliaciones`)
      .then(({ data }) => setDetalle(data))
      .catch(() => setError('No se pudo cargar el detalle.'));
  }, [movimiento.id]);

  const resolver = async (conciliacionId, accion) => {
    setError('');
    try {
      await api.post(`/cobranza/conciliaciones/${conciliacionId}/${accion}`);
      await onCambio();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo resolver.'); }
  };

  if (error) return <div className="text-red-600 text-xs">{error}</div>;
  if (!detalle) return <div className="text-gray-400 text-xs">Cargando…</div>;

  return (
    <div className="text-xs space-y-2">
      {detalle.conciliaciones.length === 0 && detalle.ajustes.length === 0 && (
        <div className="text-gray-400">Sin conciliaciones registradas.</div>
      )}
      {detalle.conciliaciones.map(c => (
        <div key={c.id} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded px-3 py-2">
          <div>
            Factura #{c.factura_folio} — {c.nombre_cliente || 'cliente no encontrado'}
            <span className="text-gray-400"> · {c.automatica ? 'automático' : 'manual'} · {c.estado}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-medium text-ht-navy">{fmtMoney(c.monto_aplicado)}</span>
            {c.estado === 'propuesta' && (
              <>
                <button onClick={() => resolver(c.id, 'aprobar')} className="text-ht-accent hover:underline">Aprobar</button>
                <button onClick={() => resolver(c.id, 'rechazar')} className="text-red-500 hover:underline">Rechazar</button>
              </>
            )}
          </div>
        </div>
      ))}
      {detalle.ajustes.map(a => (
        <div key={a.id} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded px-3 py-2">
          <div>Ajuste — {a.tipo}</div>
          <span className="font-medium text-ht-navy">{fmtMoney(a.monto)}</span>
        </div>
      ))}
    </div>
  );
}

// Conciliación manual: reparte el movimiento entre una o más facturas
// (de uno o varios códigos de cliente), y clasifica el excedente como
// redondeo automático (bajo el umbral configurado) o anticipo explícito.
function ModalConciliar({ movimiento, documentos, onClose, onConciliado }) {
  const [busqueda, setBusqueda] = useState('');
  const [aplicaciones, setAplicaciones] = useState([]);
  const [tipoExcedente, setTipoExcedente] = useState('redondeo');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const termino = normalizar(busqueda.trim());
  const resultados = termino
    ? documentos
        .filter(d => !aplicaciones.some(a => a.factura_folio === d.folio))
        .filter(d => [d.folio, d.rut_cliente, d.nombre_cliente, d.codigo_cliente].some(c => normalizar(c).includes(termino)))
        .slice(0, 8)
    : [];

  const agregarFactura = (d) => {
    setAplicaciones([...aplicaciones, { factura_folio: d.folio, nombre_cliente: d.nombre_cliente, monto_aplicado: Number(d.saldo_pendiente) }]);
    setBusqueda('');
  };
  const quitarFactura = (folio) => setAplicaciones(aplicaciones.filter(a => a.factura_folio !== folio));
  const cambiarMonto = (folio, monto) => setAplicaciones(aplicaciones.map(a => a.factura_folio === folio ? { ...a, monto_aplicado: monto } : a));

  const sumaAplicada = aplicaciones.reduce((acc, a) => acc + (Number(a.monto_aplicado) || 0), 0);
  const excedente = Number(movimiento.monto) - sumaAplicada;

  const guardar = async () => {
    setError(''); setGuardando(true);
    try {
      const body = {
        aplicaciones: aplicaciones.map(a => ({ factura_folio: a.factura_folio, monto_aplicado: Number(a.monto_aplicado) })),
      };
      if (Math.abs(excedente) > 0.5) body.ajuste = { tipo: tipoExcedente, monto: excedente };
      const { data } = await api.post(`/cobranza/movimientos/${movimiento.id}/conciliar-manual`, body);
      onConciliado(data.message);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo conciliar.'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-ht-navy">Conciliar movimiento — {fmtMoney(movimiento.monto)}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
          <p className="text-xs text-gray-500">{movimiento.glosa_original} · {fmtFecha(movimiento.fecha)}</p>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Buscar factura por folio, RUT, cliente o código de cliente</label>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            {resultados.length > 0 && (
              <div className="border border-gray-200 rounded mt-1 divide-y divide-gray-100">
                {resultados.map(d => (
                  <button key={d.id} onClick={() => agregarFactura(d)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                    <span>#{d.folio} — {d.nombre_cliente}</span>
                    <span className="text-gray-500">{fmtMoney(d.saldo_pendiente)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {aplicaciones.length > 0 && (
            <div className="space-y-2">
              {aplicaciones.map(a => (
                <div key={a.factura_folio} className="flex items-center gap-2">
                  <div className="flex-1 text-sm">#{a.factura_folio} — {a.nombre_cliente}</div>
                  <input type="number" value={a.monto_aplicado}
                    onChange={e => cambiarMonto(a.factura_folio, e.target.value)}
                    className="w-32 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                  <button onClick={() => quitarFactura(a.factura_folio)} className="text-red-500 text-xs hover:underline">Quitar</button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-100 pt-3 text-sm space-y-2">
            <div className="flex justify-between"><span className="text-gray-500">Monto del movimiento</span><span className="font-medium">{fmtMoney(movimiento.monto)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Aplicado a facturas</span><span className="font-medium">{fmtMoney(sumaAplicada)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Excedente</span><span className={`font-medium ${excedente < 0 ? 'text-red-600' : ''}`}>{fmtMoney(excedente)}</span></div>
            {Math.abs(excedente) > 0.5 && excedente > 0 && (
              <div>
                <label className="block text-xs text-gray-600 mb-1">Clasificar el excedente como</label>
                <select value={tipoExcedente} onChange={e => setTipoExcedente(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                  <option value="redondeo">Redondeo</option>
                  <option value="anticipo">Anticipo</option>
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded">Cancelar</button>
          <button onClick={guardar} disabled={guardando || aplicaciones.length === 0 || excedente < 0}
            className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Conciliar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Cuenta de cliente (Fase 4): saldo propio del CRM (saldo_app, calculado a
// partir de facturas y conciliaciones) versus el saldo que informó la
// última sincronización con Softland. Una cuenta de paso todavía no tiene
// empresa vinculada en el CRM — no recibiría recordatorios hasta que se
// registre (ver especificación §9).
function TabCuentasCliente() {
  const [cuentas, setCuentas] = useState([]);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [expandido, setExpandido] = useState(null);
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const cargar = async () => {
    try { setCuentas((await api.get('/cobranza/cuentas-cliente')).data); }
    catch { setError('No se pudieron cargar las cuentas de cliente.'); }
  };
  useEffect(() => { cargar(); }, []);

  const termino = normalizar(busqueda.trim());
  const filtradas = cuentas
    .filter(c => !termino || [c.codigo_cliente, c.nombre_cliente, c.rut_cliente].some(v => normalizar(v).includes(termino)))
    .filter(c => !soloDiferencias || !c.concuerdan);

  return (
    <div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      <p className="text-xs text-gray-400 mb-3">
        saldo_app: monto de las facturas vigentes menos lo conciliado en el CRM. saldo_softland: lo que informó la
        última "Actualizar desde Softland". Si no concuerdan, hay que revisarlo antes de mandar un recordatorio.
      </p>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por código, nombre o RUT…"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={soloDiferencias} onChange={e => setSoloDiferencias(e.target.checked)} />
          Solo con diferencias
        </label>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Cliente</th>
              <th className="text-left px-4 py-2 font-medium">Código</th>
              <th className="text-right px-4 py-2 font-medium">Saldo app</th>
              <th className="text-right px-4 py-2 font-medium">Saldo Softland</th>
              <th className="text-right px-4 py-2 font-medium">Diferencia</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map(c => (
              <Fragment key={c.codigo_cliente}>
                <tr className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-ht-navy">
                    {c.nombre_cliente || '—'}
                    <div className="text-xs text-gray-400">{c.rut_cliente}</div>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{c.codigo_cliente}</td>
                  <td className="px-4 py-2 text-right text-ht-navy font-medium">{fmtMoney(c.saldo_app)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{fmtMoney(c.saldo_softland)}</td>
                  <td className={`px-4 py-2 text-right font-medium ${c.concuerdan ? 'text-gray-400' : 'text-red-600'}`}>{fmtMoney(c.diferencia)}</td>
                  <td className="px-4 py-2">
                    {c.es_cuenta_paso ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">De paso — sin registrar</span>
                    ) : c.concuerdan ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-ht-accent/15 text-ht-navy">OK</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Revisar diferencia</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setExpandido(expandido === c.codigo_cliente ? null : c.codigo_cliente)}
                      className="text-ht-accent hover:underline text-xs">
                      {expandido === c.codigo_cliente ? 'Ocultar' : 'Detalle'}
                    </button>
                  </td>
                </tr>
                {expandido === c.codigo_cliente && (
                  <tr className="border-t border-gray-100 bg-slate-50">
                    <td colSpan={7} className="px-4 py-3">
                      <DetalleFacturasCliente codigoCliente={c.codigo_cliente} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Sin cuentas de cliente.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetalleFacturasCliente({ codigoCliente }) {
  const [facturas, setFacturas] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/cobranza/cuentas-cliente/${codigoCliente}/facturas`)
      .then(({ data }) => setFacturas(data))
      .catch(() => setError('No se pudo cargar el detalle.'));
  }, [codigoCliente]);

  if (error) return <div className="text-red-600 text-xs">{error}</div>;
  if (!facturas) return <div className="text-gray-400 text-xs">Cargando…</div>;
  if (facturas.length === 0) return <div className="text-gray-400 text-xs">Sin facturas vigentes para este cliente.</div>;

  return (
    <table className="w-full text-xs">
      <thead className="text-gray-500">
        <tr>
          <th className="text-left py-1 font-medium">Folio</th>
          <th className="text-left py-1 font-medium">Vencimiento</th>
          <th className="text-right py-1 font-medium">Saldo app</th>
          <th className="text-right py-1 font-medium">Saldo Softland</th>
          <th className="text-right py-1 font-medium">Diferencia</th>
        </tr>
      </thead>
      <tbody>
        {facturas.map(f => (
          <tr key={f.folio} className="border-t border-gray-200">
            <td className="py-1">#{f.folio}</td>
            <td className="py-1">{fmtFecha(f.fecha_vencimiento)}</td>
            <td className="py-1 text-right text-ht-navy font-medium">{fmtMoney(f.saldo_app)}</td>
            <td className="py-1 text-right text-gray-600">{fmtMoney(f.saldo_softland)}</td>
            <td className={`py-1 text-right font-medium ${f.concuerdan ? 'text-gray-400' : 'text-red-600'}`}>{fmtMoney(f.diferencia)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const NIVEL_LABEL = { par: 'Par', jefe: 'Jefe', superior: 'Superior' };

// Contactos de cobranza (Fase 1): independientes de los contactos
// comerciales — quien compra no es necesariamente quien paga. Un mismo
// contacto puede vincularse a varias empresas, cada una con su propio nivel.
function TabContactos() {
  const [contactos, setContactos] = useState([]);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [expandido, setExpandido] = useState(null);
  const [nuevo, setNuevo] = useState(null); // { nombre, email, telefono_e164 } | null
  const [importando, setImportando] = useState(false);

  const cargar = async () => {
    try { setContactos((await api.get('/cobranza/contactos')).data); }
    catch { setError('No se pudieron cargar los contactos.'); }
  };
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      await api.post('/cobranza/contactos', nuevo);
      setNuevo(null);
      await cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear el contacto.'); }
  };

  const eliminar = async (c) => {
    if (!window.confirm(`¿Eliminar el contacto "${c.nombre}"? También se quitan sus vínculos con empresas.`)) return;
    setError(''); setMsg('');
    try { await api.delete(`/cobranza/contactos/${c.id}`); await cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo eliminar.'); }
  };

  return (
    <div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <div className="flex justify-end mb-3 gap-2">
        <button onClick={() => setImportando(true)}
          className="border border-gray-300 text-gray-600 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50">
          Importar CSV
        </button>
        <button onClick={() => setNuevo({ nombre: '', email: '', telefono_e164: '' })}
          className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">
          + Nuevo contacto
        </button>
      </div>

      {importando && (
        <ModalImportarContactos onClose={() => setImportando(false)}
          onImportado={async (mensaje) => { setImportando(false); setMsg(mensaje); await cargar(); }} />
      )}

      {nuevo && (
        <form onSubmit={crear} className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Nombre</label>
            <input required value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Email</label>
            <input type="email" value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Teléfono</label>
            <input value={nuevo.telefono_e164} onChange={e => setNuevo({ ...nuevo, telefono_e164: e.target.value })}
              placeholder="+56912345678"
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Guardar</button>
          <button type="button" onClick={() => setNuevo(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded">Cancelar</button>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Teléfono</th>
              <th className="text-left px-4 py-2 font-medium">Empresas</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {contactos.map(c => (
              <Fragment key={c.id}>
                <tr className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-ht-navy">{c.nombre}</td>
                  <td className="px-4 py-2 text-gray-600">{c.email || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{c.telefono_e164 || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {c.empresas.length === 0 ? '—' : c.empresas.map(e => `${e.razon_social} (${NIVEL_LABEL[e.nivel]})`).join(', ')}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-xs">
                    <button onClick={() => setExpandido(expandido === c.id ? null : c.id)} className="text-ht-accent hover:underline mr-3">
                      {expandido === c.id ? 'Ocultar' : 'Vincular empresa'}
                    </button>
                    <button onClick={() => eliminar(c)} className="text-red-500 hover:underline">Eliminar</button>
                  </td>
                </tr>
                {expandido === c.id && (
                  <tr className="border-t border-gray-100 bg-slate-50">
                    <td colSpan={5} className="px-4 py-3">
                      <VincularEmpresaContacto contacto={c} onCambio={cargar} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {contactos.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin contactos de cobranza — crea el primero.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VincularEmpresaContacto({ contacto, onCambio }) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [nivel, setNivel] = useState('par');
  const [error, setError] = useState('');

  useEffect(() => {
    const termino = busqueda.trim();
    if (!termino) { setResultados([]); return; }
    const t = setTimeout(() => {
      api.get('/empresas', { params: { q: termino } }).then(({ data }) => setResultados(data.slice(0, 8))).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const vincular = async (empresa) => {
    setError('');
    try {
      await api.post(`/cobranza/contactos/${contacto.id}/empresas`, { empresa_id: empresa.id, nivel });
      setBusqueda(''); setResultados([]);
      await onCambio();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo vincular.'); }
  };

  const desvincular = async (empresaId) => {
    setError('');
    try { await api.delete(`/cobranza/contactos/${contacto.id}/empresas/${empresaId}`); await onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo desvincular.'); }
  };

  return (
    <div className="text-sm space-y-3">
      {error && <div className="text-red-600 text-xs">{error}</div>}
      {contacto.empresas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {contacto.empresas.map(e => (
            <span key={e.empresa_id} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs">
              {e.razon_social} · {NIVEL_LABEL[e.nivel]}
              <button onClick={() => desvincular(e.empresa_id)} className="text-red-500 hover:underline">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-600 mb-1">Buscar empresa</label>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Nivel</label>
          <select value={nivel} onChange={e => setNivel(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="par">Par</option>
            <option value="jefe">Jefe</option>
            <option value="superior">Superior</option>
          </select>
        </div>
      </div>
      {resultados.length > 0 && (
        <div className="border border-gray-200 rounded divide-y divide-gray-100 bg-white">
          {resultados.map(e => (
            <button key={e.id} onClick={() => vincular(e)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
              {e.razon_social} <span className="text-gray-400">{e.rut}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TRAMO_COLOR = {
  al_dia: '#34B3DE', '1_15': '#f59e0b', '16_30': '#f97316', '31_60': '#ea580c', '61_90': '#dc2626', mas_90: '#991b1b',
};

// Reporte de antigüedad de saldos: agrupa saldo_app (el saldo propio del
// CRM) por tramo de mora — al día, 1-15, 16-30, 31-60, 61-90, +90 días.
function TabReportes() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tramoFiltro, setTramoFiltro] = useState('');

  useEffect(() => {
    api.get('/cobranza/reportes/antiguedad').then(({ data }) => setData(data)).catch(() => setError('No se pudo cargar el reporte.'));
  }, []);

  if (error) return <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>;
  if (!data) return <div className="text-gray-400 text-sm">Cargando…</div>;

  const filtrados = tramoFiltro ? data.documentos.filter(d => d.tramo === tramoFiltro) : data.documentos;

  const exportarCsv = () => {
    const headers = ['Folio', 'Código cliente', 'Cliente', 'RUT', 'Vencimiento', 'Días atraso', 'Tramo', 'Saldo'];
    const tramoLabel = Object.fromEntries(data.tramos.map(t => [t.clave, t.label]));
    const filas = filtrados.map(d => [
      d.folio, d.codigo_cliente || '', d.nombre_cliente || '', d.rut_cliente || '',
      fmtFecha(d.fecha_vencimiento), d.dias_atraso, tramoLabel[d.tramo], Math.round(d.saldo_app),
    ]);
    const csv = [headers, ...filas].map(fila => fila.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `antiguedad_saldos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        Antigüedad de saldos según saldo_app (facturas vigentes menos lo conciliado en el CRM), no el saldo de Softland.
      </p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-5">
        {data.tramos.map(t => (
          <button key={t.clave} onClick={() => setTramoFiltro(tramoFiltro === t.clave ? '' : t.clave)}
            className={`bg-white border rounded-lg p-3 relative overflow-hidden pl-4 text-left ${tramoFiltro === t.clave ? 'border-ht-navy' : 'border-gray-200'}`}>
            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: TRAMO_COLOR[t.clave] }} />
            <div className="text-xs font-semibold text-gray-400 uppercase mb-1">{t.label}</div>
            <div className="text-lg font-bold text-ht-navy">{fmtMoney(data.resumen[t.clave])}</div>
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-gray-500">{filtrados.length} factura(s){tramoFiltro ? ` en "${data.tramos.find(t => t.clave === tramoFiltro)?.label}"` : ''}</p>
        <button onClick={exportarCsv} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">
          Exportar CSV
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Folio</th>
              <th className="text-left px-4 py-2 font-medium">Cliente</th>
              <th className="text-left px-4 py-2 font-medium">Vencimiento</th>
              <th className="text-right px-4 py-2 font-medium">Días atraso</th>
              <th className="text-right px-4 py-2 font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(d => (
              <tr key={d.folio} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-ht-navy">#{d.folio}</td>
                <td className="px-4 py-2 text-gray-600">
                  {d.nombre_cliente}
                  <div className="text-xs text-gray-400">{d.codigo_cliente}</div>
                </td>
                <td className="px-4 py-2 text-gray-600">{fmtFecha(d.fecha_vencimiento)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{d.dias_atraso}</td>
                <td className="px-4 py-2 text-right text-ht-navy font-medium">{fmtMoney(d.saldo_app)}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin facturas en este tramo.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Importación masiva de contactos de cobranza (hoy viven en Buk Finanzas):
// vista previa antes de confirmar, igual patrón que el importador de
// contactos comerciales. No crea empresas nuevas — si no matchea una ya
// existente (por RUT o razón social), el contacto se crea igual sin
// vínculo, para registrarlo a mano después.
function ModalImportarContactos({ onClose, onImportado }) {
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const descargarPlantilla = async () => {
    const { data } = await api.get('/cobranza/contactos/importar/plantilla', { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'plantilla_contactos_cobranza.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const analizar = async () => {
    if (!archivo) return;
    setError(''); setPreview(null); setCargando(true);
    const fd = new FormData(); fd.append('archivo', archivo);
    try { setPreview((await api.post('/cobranza/contactos/importar/preview', fd)).data); }
    catch (err) { setError(err.response?.data?.error || 'Error al analizar el archivo.'); }
    finally { setCargando(false); }
  };

  const confirmar = async () => {
    setError(''); setCargando(true);
    const fd = new FormData(); fd.append('archivo', archivo);
    try {
      const { data } = await api.post('/cobranza/contactos/importar/confirmar', fd);
      await onImportado(`Importación completada: ${data.insertados} nuevo(s), ${data.actualizados} actualizado(s), ${data.vinculos} vínculo(s) a empresa.`);
    } catch (err) { setError(err.response?.data?.error || 'Error al importar.'); }
    finally { setCargando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-ht-navy">Importar contactos de cobranza (Buk)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
          <p className="text-sm text-gray-500">
            Columnas: nombre, email, telefono, empresa_rut, empresa_nombre, nivel (Partner/Boss/Superior o par/jefe/superior).
            Se matchea por teléfono o email; si la empresa no existe en el CRM, el contacto se crea igual, sin vínculo.
          </p>
          <button onClick={descargarPlantilla} className="text-sm text-ht-accent hover:underline">Descargar plantilla CSV</button>

          <div className="flex items-center gap-3">
            <input type="file" accept=".csv" onChange={e => { setArchivo(e.target.files[0]); setPreview(null); }} className="text-sm" />
            <button onClick={analizar} disabled={!archivo || cargando}
              className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
              {cargando ? 'Procesando…' : 'Previsualizar'}
            </button>
          </div>

          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <TileImport label="Válidas" val={preview.resumen.total_filas_validas} />
                <TileImport label="Nuevos" val={preview.resumen.nuevos} />
                <TileImport label="Actualizar" val={preview.resumen.actualizar} />
                <TileImport label="Sin empresa" val={preview.resumen.sin_empresa} alerta={preview.resumen.sin_empresa > 0} />
                <TileImport label="Rechazos" val={preview.resumen.rechazos} alerta={preview.resumen.rechazos > 0} />
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                <div className="px-3 py-1.5 bg-slate-50 text-xs text-gray-600 font-medium">Muestra (primeras {preview.muestra.length})</div>
                <table className="w-full text-xs">
                  <thead className="text-gray-500"><tr>
                    <th className="text-left px-3 py-1 font-medium">Nombre</th>
                    <th className="text-left px-3 py-1 font-medium">Email</th>
                    <th className="text-left px-3 py-1 font-medium">Empresa</th>
                    <th className="text-left px-3 py-1 font-medium">Nivel</th>
                    <th className="text-left px-3 py-1 font-medium">Advertencias</th>
                  </tr></thead>
                  <tbody>
                    {preview.muestra.map((m, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-1 text-ht-navy">{m.nombre}</td>
                        <td className="px-3 py-1 text-gray-600">{m.email || '—'}</td>
                        <td className={`px-3 py-1 ${m.empresa_encontrada ? 'text-gray-600' : 'text-amber-700'}`}>{m.empresa || '—'}</td>
                        <td className="px-3 py-1 text-gray-600">{NIVEL_LABEL[m.nivel] || m.nivel}</td>
                        <td className="px-3 py-1 text-amber-700">{m.advertencias.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.rechazos.length > 0 && (
                <div className="border border-amber-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-1.5 bg-amber-50 text-xs text-amber-800 font-medium">Rechazos ({preview.rechazos.length})</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {preview.rechazos.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1 text-gray-500 w-16">Fila {r.fila}</td>
                          <td className="px-3 py-1 text-amber-700">{r.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded">Cancelar</button>
          {preview && (
            <button onClick={confirmar} disabled={cargando || preview.resumen.total_filas_validas === 0}
              className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
              {cargando ? 'Importando…' : `Confirmar (${preview.resumen.total_filas_validas})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TileImport({ label, val, alerta }) {
  return (
    <div className={`rounded-lg border p-2.5 ${alerta ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <div className={`text-xl font-bold ${alerta ? 'text-amber-700' : 'text-ht-navy'}`}>{val}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
