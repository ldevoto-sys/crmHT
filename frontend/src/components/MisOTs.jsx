import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

// Sección "Órdenes de trabajo" de Tareas (v1.40). Solo lectura.
// - Técnico: sus OT programadas y el histórico de las ejecutadas.
// - Administrador, jefe comercial y gerencia: las de todos los técnicos, con
//   selector para revisar a uno puntual.
// Nunca muestra valores de venta.

const PUEDE_VER_TECNICOS = ['administrador', 'jefe_comercial', 'gerencia'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TIPOS_TRABAJO = {
  mantenimiento_preventivo: 'Mantenimiento preventivo', lavado: 'Lavado de estanque', impermeabilizado: 'Impermeabilizado',
  mantenimiento_correctivo: 'Mantenimiento correctivo', otro: 'Otro',
};
const etiquetaMes = m => { const [a, mm] = m.split('-'); return `${MESES[Number(mm) - 1]} ${a}`; };
const fechaCL = iso => (iso ? iso.slice(0, 10).split('-').reverse().join('-') : '—');
const num = v => (Number(v) || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 });

function textoPlazo(dias) {
  if (dias === null || dias === undefined) return null;
  if (dias < 0) return { texto: `Atrasada ${-dias} día(s)`, atrasada: true };
  if (dias === 0) return { texto: 'Hoy', atrasada: false };
  return { texto: `En ${dias} día(s)`, atrasada: false };
}
function textoBrecha(d) {
  if (d === null || d === undefined) return null;
  if (d === 0) return 'Ejecutada el día programado';
  return d > 0 ? `${d} día(s) después de lo programado` : `${-d} día(s) antes de lo programado`;
}

function TarjetaOT({ ot, ejecutada, mostrarTecnicos }) {
  const plazo = ejecutada ? null : textoPlazo(ot.dias_para_programada);
  const direccion = [ot.direccion, ot.comuna].filter(Boolean).join(', ');
  return (
    <div className={`bg-white border rounded-lg p-4 ${plazo?.atrasada ? 'border-ht-navy' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/negocios/${ot.negocio_id}/ot`} className="font-semibold text-ht-navy hover:underline">{ot.ot}</Link>
        {plazo && (
          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${plazo.atrasada ? 'bg-ht-navy text-white' : 'bg-ht-accent/15 text-ht-navy'}`}>{plazo.texto}</span>
        )}
        {ejecutada && ot.etapa_actual && <span className="text-xs text-gray-500">{ot.etapa_actual}</span>}
      </div>
      <div className="text-sm text-ht-navy mt-1">{ot.cliente || `${ot.contacto_nombre} ${ot.contacto_apellido || ''}`.trim()}</div>
      <div className="text-xs text-gray-500">{ot.titulo}</div>
      {direccion && <div className="text-xs text-gray-500 mt-1">📍 {direccion}</div>}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-3">
        <div><dt className="text-gray-500">Tipo de trabajo</dt><dd className="text-ht-navy">{TIPOS_TRABAJO[ot.tipo_trabajo] || '—'}</dd></div>
        <div><dt className="text-gray-500">Fecha programada</dt><dd className="text-ht-navy">{fechaCL(ot.fecha_programada)}</dd></div>
        <div><dt className="text-gray-500">Horas programadas</dt><dd className="text-ht-navy">{ot.horas_programadas === null ? '—' : `${num(ot.horas_programadas)} h`}</dd></div>
        {ejecutada ? (
          <>
            <div><dt className="text-gray-500">Fecha de ejecución</dt><dd className="text-ht-navy">{fechaCL(ot.fecha_ejecucion)}</dd></div>
            <div><dt className="text-gray-500">Horas ejecutadas</dt><dd className="text-ht-navy">{ot.horas_ejecutadas === null ? '—' : `${num(ot.horas_ejecutadas)} h`}</dd></div>
          </>
        ) : null}
        {ot.id_fracttal && <div><dt className="text-gray-500">ID Fracttal</dt><dd className="text-ht-navy">{ot.id_fracttal}</dd></div>}
      </dl>
      {ejecutada && textoBrecha(ot.brecha_dias) && <div className="text-xs text-gray-500 mt-2">{textoBrecha(ot.brecha_dias)}.</div>}
      {mostrarTecnicos && ot.tecnicos && <div className="text-xs text-gray-500 mt-2">Técnicos: <span className="text-ht-navy">{ot.tecnicos}</span></div>}
    </div>
  );
}

export default function MisOTs() {
  const { user } = useAuth();
  const esTecnico = user?.rol === 'tecnico';
  const veTodos = PUEDE_VER_TECNICOS.includes(user?.rol);

  const [vista, setVista] = useState('programadas');
  const [mes, setMes] = useState('todos');
  const [tecnicoId, setTecnicoId] = useState('');
  const [tecnicos, setTecnicos] = useState([]);
  const [filas, setFilas] = useState([]);
  const [meses, setMeses] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (veTodos) api.get('/users/tecnicos').then(r => setTecnicos(r.data)).catch(() => {});
  }, [veTodos]);

  useEffect(() => {
    setCargando(true); setError('');
    api.get('/ordenes-trabajo/mis-ots', {
      params: { estado: vista, mes: vista === 'ejecutadas' ? mes : undefined, tecnico_id: veTodos && tecnicoId ? tecnicoId : undefined },
    })
      .then(({ data }) => { setFilas(data.filas); setMeses(data.meses); })
      .catch(() => setError('No se pudieron cargar las órdenes de trabajo.'))
      .finally(() => setCargando(false));
  }, [vista, mes, tecnicoId, veTodos]);

  if (!esTecnico && !veTodos) return null;

  const boton = activo => `text-sm font-medium px-4 py-2 ${activo ? 'bg-ht-accent text-white' : 'bg-white text-gray-600'}`;
  const select = 'border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent';

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-ht-navy mb-3">{esTecnico ? 'Mis órdenes de trabajo' : 'Órdenes de trabajo por técnico'}</h2>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex border border-gray-300 rounded overflow-hidden">
          <button onClick={() => setVista('programadas')} className={boton(vista === 'programadas')}>Programadas</button>
          <button onClick={() => setVista('ejecutadas')} className={`${boton(vista === 'ejecutadas')} border-l border-gray-300`}>Ejecutadas</button>
        </div>
        {vista === 'ejecutadas' && (
          <select value={mes} onChange={e => setMes(e.target.value)} className={select} aria-label="Mes de ejecución">
            <option value="todos">Todo el histórico</option>
            {meses.map(m => <option key={m} value={m}>{etiquetaMes(m)}</option>)}
          </select>
        )}
        {veTodos && (
          <select value={tecnicoId} onChange={e => setTecnicoId(e.target.value)} className={select} aria-label="Técnico">
            <option value="">Todos los técnicos</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-500">{cargando ? 'Cargando…' : `${filas.length} OT${filas.length === 500 ? ' (máximo mostrado)' : ''}`}</span>
      </div>

      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

      {!cargando && filas.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400">
          {vista === 'programadas' ? 'No hay órdenes de trabajo programadas.' : 'No hay órdenes de trabajo ejecutadas en este período.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map(ot => <TarjetaOT key={ot.ot_id} ot={ot} ejecutada={vista === 'ejecutadas'} mostrarTecnicos={veTodos || ot.tecnicos?.includes(',')} />)}
        </div>
      )}
    </section>
  );
}
