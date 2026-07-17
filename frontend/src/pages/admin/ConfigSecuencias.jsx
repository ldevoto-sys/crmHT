import { useEffect, useState } from 'react';
import api from '../../api';

const CANALES = ['correo', 'whatsapp', 'llamada', 'tarea'];
const pasoVacio = () => ({ dias_espera: 1, canal: 'correo', asunto: '', mensaje: '' });

export default function ConfigSecuencias() {
  const [secuencias, setSecuencias] = useState([]);
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
  useEffect(() => { cargar(); }, []);

  const nueva = () => { setEditId(null); setNombre(''); setDescripcion(''); setRespetarHorario(false); setPasos([pasoVacio()]); setShowForm(true); };
  const editar = async s => {
    try {
      const { data } = await api.get(`/secuencias/${s.id}`);
      setEditId(s.id); setNombre(data.nombre); setDescripcion(data.descripcion || '');
      setRespetarHorario(!!data.respetar_horario);
      setPasos(data.pasos.map(p => ({ dias_espera: p.dias_espera, canal: p.canal, asunto: p.asunto || '', mensaje: p.mensaje })));
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

  const toggleDefaultPostCotizacion = async s => {
    try { await api.put(`/secuencias/${s.id}/post-cotizacion-default`, { activo: !s.es_default_post_cotizacion }); cargar(); }
    catch { setError('No se pudo actualizar.'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Secuencias de seguimiento</h1>
      <p className="text-gray-500 text-sm mb-4">
        Cada paso vencido genera una tarea para el vendedor (llamar, escribir el correo, enviar el WhatsApp).
        La secuencia marcada como "Predeterminada" se inicia sola al enviar una cotización (por correo o WhatsApp) y
        reemplaza a cualquier otra secuencia que estuviera activa en ese negocio.
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <button onClick={nueva} className="mb-4 bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90">+ Nueva secuencia</button>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Pasos</th>
              <th className="text-left px-4 py-2 font-medium">Horario hábil</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
              <th className="text-left px-4 py-2 font-medium">Post-cotización</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {secuencias.map(s => (
              <tr key={s.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-ht-navy">{s.nombre}</td>
                <td className="px-4 py-2 text-gray-600">{s.total_pasos}</td>
                <td className="px-4 py-2 text-gray-600">{s.respetar_horario ? 'Sí' : 'No'}</td>
                <td className="px-4 py-2 text-gray-600">{s.activo ? 'Activa' : 'Inactiva'}</td>
                <td className="px-4 py-2">
                  {s.es_default_post_cotizacion
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-ht-accent/15 text-ht-navy">Predeterminada</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button onClick={() => editar(s)} className="text-ht-accent hover:underline">Editar</button>
                  <button onClick={() => toggleActivo(s)} className="text-gray-500 hover:underline">{s.activo ? 'Desactivar' : 'Activar'}</button>
                  <button onClick={() => toggleDefaultPostCotizacion(s)} className="text-gray-500 hover:underline">
                    {s.es_default_post_cotizacion ? 'Quitar predeterminada' : 'Usar al enviar cotización'}
                  </button>
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
              <div key={i} className="border border-gray-200 rounded p-3 flex flex-wrap gap-2 items-start">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Días de espera</label>
                  <input type="number" min="0" value={p.dias_espera}
                    onChange={e => cambiarPaso(i, 'dias_espera', Number(e.target.value))}
                    className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Canal</label>
                  <select value={p.canal} onChange={e => cambiarPaso(i, 'canal', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                    {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {p.canal === 'correo' && (
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-gray-500 mb-1">Asunto</label>
                    <input value={p.asunto} onChange={e => cambiarPaso(i, 'asunto', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                  </div>
                )}
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-500 mb-1">Mensaje / guion</label>
                  <textarea required rows={2} value={p.mensaje} onChange={e => cambiarPaso(i, 'mensaje', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                {pasos.length > 1 && (
                  <button type="button" onClick={() => quitarPaso(i)} className="text-red-500 hover:underline text-xs self-center">Quitar</button>
                )}
              </div>
            ))}
            <button type="button" onClick={agregarPaso} className="text-sm text-ht-accent hover:underline">+ Agregar paso</button>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90">Guardar</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
