import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import { formatFechaHora } from '../../utils/fecha';

const fmtMoney = v => `$${Math.round(v || 0).toLocaleString('es-CL')}`;
const fmtFecha = iso => iso ? new Date(iso).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : '—';

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
        {[['documentos', 'Documentos'], ['movimientos', 'Movimientos bancarios']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-ht-accent text-ht-navy' : 'border-transparent text-gray-500 hover:text-ht-navy'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'documentos' && <TabDocumentos />}
      {tab === 'movimientos' && <TabMovimientos />}
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
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('');
  const fileRef = useRef(null);

  const cargar = async () => {
    try {
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      setMovimientos((await api.get('/cobranza/movimientos', { params })).data);
    } catch { setError('No se pudieron cargar los movimientos.'); }
  };
  useEffect(() => { cargar(); }, [filtroEstado]);

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
    } catch (err) { setError(err.response?.data?.error || 'No se pudo subir la cartola.'); }
    finally { setSubiendo(false); }
  };

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
          {subiendo ? 'Subiendo…' : '+ Subir cartola'}
          <input type="file" ref={fileRef} accept=".xls,.xlsx" onChange={subirCartola} className="hidden" disabled={subiendo} />
        </label>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {movimientos.map(m => (
              <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-ht-navy">{m.banco}</td>
                <td className="px-4 py-2 text-gray-600">{m.cuenta_bancaria}</td>
                <td className="px-4 py-2 text-gray-600">{fmtFecha(m.fecha)}</td>
                <td className="px-4 py-2 text-gray-600 max-w-xs truncate" title={m.glosa_original}>{m.glosa_original}</td>
                <td className="px-4 py-2 text-right text-ht-navy font-medium">{fmtMoney(m.monto)}</td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ESTADO_MOV_LABEL[m.estado] || m.estado}</span>
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs">{m.cargado_por_nombre || '—'}</td>
              </tr>
            ))}
            {movimientos.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Sin movimientos — sube una cartola para empezar.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
