import { useEffect, useState } from 'react';
import api from '../../api';

const CANALES = ['correo', 'whatsapp', 'llamada', 'tarea', 'cambiar_etapa'];
const CANAL_LABEL = { correo: 'correo', whatsapp: 'whatsapp', llamada: 'llamada', tarea: 'tarea', cambiar_etapa: 'cambiar etapa' };
// Plantillas de WhatsApp aprobadas por Meta — deben coincidir exactamente
// con el nombre en el Administrador de WhatsApp (ver backend
// services/secuencias.js#PLANTILLAS_WHATSAPP).
const PLANTILLAS_WHATSAPP = {
  envio_cotizacion: 'Envío de cotización',
  vencimiento_coti: 'Vencimiento de cotización',
  seguimiento_coti: 'Seguimiento de cotización',
};
const pasoVacio = () => ({ dias_espera: 1, horas_espera: 0, canal: 'correo', asunto: '', mensaje: '', etapa_destino_id: '', causa_no_cierre_id: '', whatsapp_template: '' });

export default function ConfigSecuencias() {
  const [secuencias, setSecuencias] = useState([]);
  const [etapas, setEtapas] = useState([]); // todas las etapas de todos los pipelines, para el paso "cambiar etapa"
  const [causas, setCausas] = useState([]);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [editId, setEditId] = useState(null);
  const [nombre, setNombre] = useState(''); const [descripcion, setDescripcion] = useState('');
  const [respetarHorario, setRespetarHorario] = useState(false);
  const [pasos, setPasos] = useState([pasoVacio()]);
  const [showForm, setShowForm] = useState(false);

  const cargar = async () => {
    try { setSecuencias((await api.get('/secuencias')).data); }
    catch { setError('No se pudieron cargar las secuencias.'); }
  };
  useEffect(() => {
    cargar();
    api.get('/config/causas-no-cierre').then(r => setCausas(r.data.filter(c => c.activo))).catch(() => {});
    api.get('/config/pipelines').then(async r => {
      const porPipeline = await Promise.all(
        r.data.map(pl => api.get('/config/pipeline-etapas', { params: { pipeline_id: pl.id } })
          .then(res => res.data.map(e => ({ ...e, pipeline_nombre: pl.nombre }))))
      );
      setEtapas(porPipeline.flat());
    }).catch(() => {});
  }, []);

  const nueva = () => { setEditId(null); setNombre(''); setDescripcion(''); setRespetarHorario(false); setPasos([pasoVacio()]); setShowForm(true); };
  const editar = async s => {
    try {
      const { data } = await api.get(`/secuencias/${s.id}`);
      setEditId(s.id); setNombre(data.nombre); setDescripcion(data.descripcion || '');
      setRespetarHorario(!!data.respetar_horario);
      setPasos(data.pasos.map(p => ({
        dias_espera: p.dias_espera, horas_espera: p.horas_espera || 0, canal: p.canal,
        asunto: p.asunto || '', mensaje: p.mensaje || '',
        etapa_destino_id: p.etapa_destino_id || '', causa_no_cierre_id: p.causa_no_cierre_id || '',
        whatsapp_template: p.whatsapp_template || '',
      })));
      setShowForm(true);
    } catch { setError('No se pudo cargar la secuencia.'); }
  };

  const agregarPaso = () => setPasos([...pasos, pasoVacio()]);
  const quitarPaso = i => setPasos(pasos.filter((_, idx) => idx !== i));
  const cambiarPaso = (i, campo, val) => setPasos(pasos.map((p, idx) => idx === i ? { ...p, [campo]: val } : p));

  const guardar = async e => {
    e.preventDefault(); setError(''); setMsg('');
    const body = { nombre, descripcion, respetar_horario: respetarHorario, pasos };
    try {
      if (editId) await api.put(`/secuencias/${editId}`, body);
      else await api.post('/secuencias', body);
      setMsg('Secuencia guardada.'); setShowForm(false); cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar la secuencia.'); }
  };

  const toggleActivo = async s => {
    try { await api.put(`/secuencias/${s.id}/activo`, { activo: !s.activo }); cargar(); }
    catch { setError('No se pudo actualizar.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Secuencias de seguimiento</h1>
      <p className="text-gray-500 text-sm mb-4">
        Los pasos de canal "correo" y "whatsapp" se envían solos, sin que nadie los redacte a mano (si el contacto no
        tiene correo/teléfono o el envío falla, caen a una tarea para el vendedor). WhatsApp exige elegir una
        plantilla aprobada por Meta — no admite texto libre para mensajes que inicia la empresa. Los canales
        "llamada" y "tarea" siguen generando una tarea para que el vendedor lo ejecute a mano. El canal
        "cambiar etapa" no envía nada: mueve el negocio a la etapa que elijas (ej. Perdido, con causa "Sin respuesta")
        — útil como último paso de una secuencia, si el cliente no respondió a ninguno de los anteriores.
        Para que una secuencia se inicie sola al entrar un negocio a una etapa del pipeline (ej. Cotizado), asígnala
        en Configuración → Pipeline. Se detiene al salir de esa etapa hacia otra sin secuencia asignada, o manualmente.
        Puedes editar una secuencia aunque tenga negocios en curso: siguen avanzando, solo que con la versión nueva.
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <button onClick={nueva} className="mb-4 bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">+ Nueva secuencia</button>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Etapa que la activa</th>
              <th className="text-left px-4 py-2 font-medium">Pasos</th>
              <th className="text-left px-4 py-2 font-medium">Horario hábil</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {secuencias.map(s => (
              <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-ht-navy">{s.nombre}</td>
                <td className="px-4 py-2 text-gray-600">
                  {s.etapas?.length
                    ? s.etapas.map(e => `${e.etapa_nombre} (${e.pipeline_nombre})`).join(', ')
                    : <span className="text-gray-400 italic">Sin asignar — Configuración → Pipeline</span>}
                </td>
                <td className="px-4 py-2 text-gray-600">{s.total_pasos}</td>
                <td className="px-4 py-2 text-gray-600">{s.respetar_horario ? 'Sí' : 'No'}</td>
                <td className="px-4 py-2 text-gray-600">{s.activo ? 'Activa' : 'Inactiva'}</td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button onClick={() => editar(s)} className="text-ht-accent hover:underline">Editar</button>
                  <button onClick={() => toggleActivo(s)} className="text-gray-500 hover:underline">{s.activo ? 'Desactivar' : 'Activar'}</button>
                </td>
              </tr>
            ))}
            {secuencias.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin secuencias.</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <form onSubmit={guardar} className="bg-white border border-gray-200 rounded-lg p-5 max-w-3xl space-y-4">
          <h2 className="font-semibold text-ht-navy">{editId ? 'Editar secuencia' : 'Nueva secuencia'}</h2>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input required value={nombre} onChange={e => setNombre(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Descripción (opcional)</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={respetarHorario} onChange={e => setRespetarHorario(e.target.checked)} />
            Respetar horario hábil (un paso vencido fuera de horario espera a que abra)
          </label>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-ht-navy">Pasos (en orden)</label>
            {pasos.map((p, i) => (
              <div key={i} className="border border-gray-200 rounded p-4 flex flex-wrap gap-3 items-start">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Días de espera</label>
                  <input type="number" min="0" value={p.dias_espera}
                    onChange={e => cambiarPaso(i, 'dias_espera', Number(e.target.value))}
                    className="w-24 border border-gray-300 rounded px-3 py-2 text-base" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Horas de espera</label>
                  <input type="number" min="0" max="23" value={p.horas_espera}
                    onChange={e => cambiarPaso(i, 'horas_espera', Number(e.target.value))}
                    className="w-24 border border-gray-300 rounded px-3 py-2 text-base" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Canal</label>
                  <select value={p.canal} onChange={e => cambiarPaso(i, 'canal', e.target.value)}
                    className="border border-gray-300 rounded px-3 py-2 text-base">
                    {CANALES.map(c => <option key={c} value={c}>{CANAL_LABEL[c]}</option>)}
                  </select>
                </div>
                {p.canal === 'correo' && (
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-xs text-gray-500 mb-1">Asunto</label>
                    <input value={p.asunto} onChange={e => cambiarPaso(i, 'asunto', e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-base" />
                  </div>
                )}
                {p.canal === 'cambiar_etapa' ? (
                  <>
                    <div className="flex-1 min-w-[220px]">
                      <label className="block text-xs text-gray-500 mb-1">Etapa destino</label>
                      <select required value={p.etapa_destino_id} onChange={e => cambiarPaso(i, 'etapa_destino_id', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-base">
                        <option value="">Selecciona una etapa…</option>
                        {etapas.map(e => <option key={e.id} value={e.id}>{e.nombre} ({e.pipeline_nombre})</option>)}
                      </select>
                    </div>
                    {etapas.find(e => String(e.id) === String(p.etapa_destino_id))?.tipo === 'perdida' && (
                      <div className="flex-1 min-w-[220px]">
                        <label className="block text-xs text-gray-500 mb-1">Causa de no cierre</label>
                        <select required value={p.causa_no_cierre_id} onChange={e => cambiarPaso(i, 'causa_no_cierre_id', e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-base">
                          <option value="">Selecciona una causa…</option>
                          {causas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </div>
                    )}
                  </>
                ) : p.canal === 'whatsapp' ? (
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-xs text-gray-500 mb-1">Plantilla aprobada</label>
                    <select required value={p.whatsapp_template} onChange={e => cambiarPaso(i, 'whatsapp_template', e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-base">
                      <option value="">Selecciona una plantilla…</option>
                      {Object.entries(PLANTILLAS_WHATSAPP).map(([nombre, label]) => (
                        <option key={nombre} value={nombre}>{label} ({nombre})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex-1 min-w-[280px] basis-full">
                    <label className="block text-xs text-gray-500 mb-1">
                      {p.canal === 'correo' ? 'Mensaje (se envía tal cual, sin editar)' : 'Mensaje / guion'}
                    </label>
                    <textarea required rows={5} value={p.mensaje} onChange={e => cambiarPaso(i, 'mensaje', e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-base" />
                  </div>
                )}
                {pasos.length > 1 && (
                  <button type="button" onClick={() => quitarPaso(i)} className="text-red-500 hover:underline text-xs">Quitar</button>
                )}
              </div>
            ))}
            <button type="button" onClick={agregarPaso} className="text-sm text-ht-accent hover:underline">+ Agregar paso</button>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">Guardar</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
