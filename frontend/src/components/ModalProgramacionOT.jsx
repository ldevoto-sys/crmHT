import { useEffect, useState } from 'react';
import api from '../api';

// Datos de la Orden de Trabajo que pide el paso a "Programado" y a
// "Ejecutado" del pipeline Operaciones (v1.40). Lo usan el kanban
// (Pipeline.jsx) y la ficha del negocio (DetalleNegocio.jsx). Desde v1.44 solo
// el tipo de trabajo bloquea; lo demás se puede dejar en blanco y queda como
// alerta en rojo en la tarjeta (services/ot.js#alertasOT).

const TIPOS_TRABAJO = [
  ['mantenimiento_preventivo', 'Mantenimiento preventivo'],
  ['lavado', 'Lavado de estanque'],
  ['impermeabilizado', 'Impermeabilizado'],
  ['mantenimiento_correctivo', 'Mantenimiento correctivo'],
  ['otro', 'Otro'],
];

// ¿Esta etapa pide datos de OT? (nombre + pipeline Operaciones)
export const pideDatosOT = etapa =>
  etapa?.pipeline_nombre === 'Operaciones' && ['programado', 'ejecutado'].includes((etapa.nombre || '').trim().toLowerCase());

export default function ModalProgramacionOT({ negocio, etapa, onConfirmar, onCancelar }) {
  const esEjecutado = etapa.nombre.trim().toLowerCase() === 'ejecutado';
  const [tecnicos, setTecnicos] = useState([]);
  const [ot, setOt] = useState(undefined); // undefined = cargando, null = sin OT todavía
  const [horas, setHoras] = useState('');
  const [tecnicoIds, setTecnicoIds] = useState([]);
  const [fechaProgramada, setFechaProgramada] = useState('');
  const [fechaEjecucion, setFechaEjecucion] = useState('');
  const [horasEjecutadas, setHorasEjecutadas] = useState(''); // en blanco por defecto, aunque la OT ya traiga un valor se muestra para poder corregirlo
  const [idFracttal, setIdFracttal] = useState('');
  const [tipoTrabajo, setTipoTrabajo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get('/users/tecnicos').then(r => setTecnicos(r.data)).catch(() => setError('No se pudo cargar la lista de técnicos.'));
    api.get(`/ordenes-trabajo/negocio/${negocio.id}`)
      .then(({ data }) => {
        setOt(data);
        setHoras(data.horas_programadas ? String(Number(data.horas_programadas)) : '');
        setTecnicoIds((data.tecnicos || []).map(t => t.id));
        setFechaProgramada(data.fecha_programada || '');
        setFechaEjecucion(data.fecha_ejecucion || '');
        setHorasEjecutadas(data.horas_ejecutadas ? String(Number(data.horas_ejecutadas)) : '');
        setIdFracttal(data.id_fracttal || '');
      })
      .catch(() => setOt(null));
  }, [negocio.id]);

  // OT anteriores a v1.40 (exige_programacion=false) no generan alerta.
  const exige = ot === null || ot?.exige_programacion !== false;
  const necesitaTipo = ot === null && !negocio.tipo_trabajo;
  const faltaTipo = necesitaTipo && !tipoTrabajo;
  const faltan = []; // no bloquean: se avisa que quedarán como alerta
  if (exige && !fechaProgramada) faltan.push('fecha programada');
  if (exige && !(Number(horas) > 0)) faltan.push('horas de trabajo');
  if (exige && tecnicoIds.length === 0) faltan.push('técnicos');
  if (exige && esEjecutado && !fechaEjecucion) faltan.push('fecha de ejecución');
  if (exige && esEjecutado && !(Number(horasEjecutadas) > 0)) faltan.push('horas ejecutadas');

  const alternar = id => setTecnicoIds(ids => (ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]));

  const confirmar = async () => {
    setGuardando(true); setError('');
    const extra = {
      horas_programadas: horas === '' ? undefined : Number(horas),
      tecnico_ids: tecnicoIds,
      id_fracttal: idFracttal,
    };
    if (fechaProgramada) extra.fecha_programada = fechaProgramada;
    if (esEjecutado && fechaEjecucion) extra.fecha_ejecucion = fechaEjecucion;
    if (esEjecutado && horasEjecutadas !== '') extra.horas_ejecutadas = Number(horasEjecutadas);
    if (necesitaTipo) extra.tipo_trabajo = tipoTrabajo;
    const msg = await onConfirmar(extra);
    if (msg) { setError(msg); setGuardando(false); }
  };

  const campo = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent';
  const label = 'block text-xs font-semibold text-gray-500 uppercase mb-1';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onCancelar}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="font-semibold text-ht-navy text-lg mb-1">Pasar a "{etapa.nombre}"</h2>
        <p className="text-sm text-gray-500 mb-4">
          {esEjecutado
            ? 'Se piden: fecha de ejecución (la real), horas ejecutadas, fecha programada, horas programadas y técnicos.'
            : 'Se piden: fecha programada para ejecutar, horas de trabajo programadas y los técnicos que ejecutan la tarea.'}
          {exige && ' Si algo no está disponible, puedes continuar: quedará una alerta en rojo hasta completarlo.'}
          {!exige && ' Esta OT es anterior a esta regla: los datos son opcionales.'}
        </p>

        {ot === undefined ? <div className="text-sm text-gray-400">Cargando…</div> : (
          <div className="space-y-4">
            {necesitaTipo && (
              <div>
                <label className={label}>Tipo de trabajo</label>
                <select value={tipoTrabajo} onChange={e => setTipoTrabajo(e.target.value)} className={campo}>
                  <option value="">— Selecciona —</option>
                  {TIPOS_TRABAJO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">Este negocio todavía no tiene Orden de Trabajo: se crea al confirmar.</p>
              </div>
            )}
            <div>
              <label className={label}>Fecha programada para ejecutar</label>
              <input type="date" value={fechaProgramada} onChange={e => setFechaProgramada(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={label}>Horas de trabajo programadas (por técnico)</label>
              <input type="number" min="0" step="0.5" value={horas} onChange={e => setHoras(e.target.value)} className={campo} />
              {tecnicoIds.length > 1 && Number(horas) > 0 && (
                <p className="text-xs text-gray-500 mt-1">{tecnicoIds.length} técnicos × {horas} h = {tecnicoIds.length * Number(horas)} horas-hombre.</p>
              )}
            </div>
            <div>
              <label className={label}>Técnicos que ejecutan la tarea</label>
              {tecnicos.length === 0 ? (
                <p className="text-sm text-gray-500">No hay usuarios con perfil técnico activos.</p>
              ) : (
                <div className="border border-gray-300 rounded max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {tecnicos.map(t => (
                    <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={tecnicoIds.includes(t.id)} onChange={() => alternar(t.id)} />
                      {t.nombre}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {esEjecutado && (
              <div>
                <label className={label}>Fecha de ejecución (real)</label>
                <input type="date" value={fechaEjecucion} onChange={e => setFechaEjecucion(e.target.value)} className={campo} />
                {fechaProgramada && fechaEjecucion && fechaProgramada !== fechaEjecucion && (
                  <p className="text-xs text-gray-500 mt-1">
                    {(() => { const d = Math.round((new Date(fechaEjecucion) - new Date(fechaProgramada)) / 86400000); return d > 0 ? `${d} día(s) después de lo programado.` : `${-d} día(s) antes de lo programado.`; })()}
                  </p>
                )}
              </div>
            )}
            {esEjecutado && (
              <div>
                <label className={label}>Horas ejecutadas (por técnico)</label>
                <input type="number" min="0" step="0.5" value={horasEjecutadas} onChange={e => setHorasEjecutadas(e.target.value)} className={campo} />
                {Number(horasEjecutadas) > 0 && tecnicoIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {tecnicoIds.length} técnico(s) × {horasEjecutadas} h = {tecnicoIds.length * Number(horasEjecutadas)} horas-hombre
                    {Number(horas) > 0 && ` (programadas: ${tecnicoIds.length * Number(horas)})`}.
                  </p>
                )}
              </div>
            )}
            <div>
              <label className={label}>ID Fracttal (opcional)</label>
              <input value={idFracttal} onChange={e => setIdFracttal(e.target.value)} maxLength={100} className={campo} />
            </div>
          </div>
        )}

        {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
        {faltaTipo && ot !== undefined && <p className="text-xs text-gray-500 mt-4">Falta el tipo de trabajo: es obligatorio para crear la OT.</p>}
        {faltan.length > 0 && ot !== undefined && <p className="text-xs text-red-600 font-medium mt-4">Quedará pendiente: {faltan.join(', ')}.</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={confirmar} disabled={ot === undefined || faltaTipo || guardando}
            className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
            {guardando ? 'Guardando…' : (faltan.length > 0 ? 'Mover sin completar' : 'Confirmar')}
          </button>
          <button onClick={onCancelar} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
