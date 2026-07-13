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

  useEffect(() => {
    api.get(`/contactos/${id}`).then(r => setC(r.data)).catch(() => setError('No se pudo cargar el contacto.'));
  }, [id]);

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
            </dl>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-ht-navy mb-3">Negocios ({c.negocios.length})</h2>
            {c.negocios.length === 0 ? <p className="text-sm text-gray-400">Sin negocios.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {c.negocios.map(n => (
                    <tr key={n.id} className="border-t border-gray-100">
                      <td className="py-1.5"><Link to={`/negocios/${n.id}`} className="text-ht-navy hover:underline">{n.titulo}</Link></td>
                      <td className="py-1.5 text-gray-500">{n.etapa_nombre}</td>
                      <td className="py-1.5 text-right text-ht-navy">{money(n.monto_estimado)}</td>
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
