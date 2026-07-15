import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';
import NotasYTareas from '../../components/NotasYTareas';

const money = v => v ? `$${Number(v).toLocaleString('es-CL')}` : '—';
const fecha = d => d ? new Date(d).toLocaleString('es-CL') : '';

export default function DetalleContacto() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [showNuevoNegocio, setShowNuevoNegocio] = useState(false);
  const [titulo, setTitulo] = useState(''); const [monto, setMonto] = useState('');

  const cargar = () => api.get(`/contactos/${id}`).then(r => setC(r.data)).catch(() => setError('No se pudo cargar el contacto.'));
  useEffect(() => { cargar(); }, [id]);

  const crearNegocio = async e => {
    e.preventDefault(); setError('');
    try {
      await api.post('/negocios', { contacto_id: Number(id), titulo, monto_estimado: monto || null });
      setShowNuevoNegocio(false); setTitulo(''); setMonto(''); cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear el negocio.'); }
  };

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!c) return <div className="p-6 text-gray-400">Cargando…</div>;

  const dato = (label, valor) => (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-ht-navy">{valor || '—'}</dd>
    </div>
  );

  return (
    <div>
      <Link to="/contactos" className="text-sm text-ht-accent hover:underline">← Contactos</Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-6">{c.nombre} {c.apellido}</h1>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <dl className="grid grid-cols-2 gap-4">
              {dato('Empresa', c.empresa_nombre)}
              {dato('Cargo', c.cargo)}
              {dato('Email', c.email)}
              {dato('Teléfono', c.telefono_e164)}
              {dato('RUT comprador', c.rut_comprador)}
              {dato('Origen', c.origen)}
              {dato('Vendedor asignado', c.vendedor_nombre)}
            </dl>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-ht-navy">Negocios ({c.negocios.length})</h2>
              <button onClick={() => setShowNuevoNegocio(true)} className="text-sm bg-ht-navy text-white px-3 py-1.5 rounded hover:bg-ht-navy/90">+ Nuevo negocio</button>
            </div>
            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            {showNuevoNegocio && (
              <form onSubmit={crearNegocio} className="flex flex-wrap gap-2 mb-3 p-3 border border-gray-200 rounded">
                <input required value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título del negocio"
                  className="flex-1 min-w-[160px] border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                <input value={monto} onChange={e => setMonto(e.target.value)} type="number" min="0" placeholder="Monto estimado"
                  className="w-40 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                <button type="submit" className="bg-ht-navy text-white px-3 py-2 rounded text-sm hover:bg-ht-navy/90">Crear</button>
                <button type="button" onClick={() => setShowNuevoNegocio(false)} className="px-3 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
              </form>
            )}
            {c.negocios.length === 0 ? <p className="text-sm text-gray-400">Sin negocios.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {c.negocios.map(n => (
                    <tr key={n.id} className="border-t border-gray-100">
                      <td className="py-1.5"><Link to={`/negocios/${n.id}`} className="text-ht-navy hover:underline">{n.titulo}</Link></td>
                      <td className="py-1.5 text-gray-500">{n.etapa_nombre}</td>
                      <td className="py-1.5 text-right text-ht-navy">{money(n.monto_estimado)}</td>
                      <td className="py-1.5 text-right">
                        {n.etapa_tipo === 'abierta' && <Link to={`/negocios/${n.id}/cotizar`} className="text-ht-accent hover:underline">Cotizar</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <NotasYTareas contactoId={Number(id)} />

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-3">Línea de tiempo</h2>
            {c.timeline.length === 0 ? <p className="text-sm text-gray-400">Sin eventos.</p> : (
              <ul className="space-y-3">
                {c.timeline.map(t => (
                  <li key={t.id} className="text-sm border-l-2 border-ht-accent/40 pl-3">
                    <div className="text-ht-navy">{t.descripcion}</div>
                    <div className="text-xs text-gray-400">{fecha(t.created_at)} · {t.usuario_nombre || 'sistema'} · {t.tipo}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
