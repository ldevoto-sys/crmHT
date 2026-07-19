import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';
import NotasYTareas from '../../components/NotasYTareas';

export default function DetalleEmpresa() {
  const { id } = useParams();
  const [empresa, setEmpresa] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/empresas/${id}`).then(r => setEmpresa(r.data)).catch(() => setError('No se pudo cargar la empresa.'));
  }, [id]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!empresa) return <div className="p-6 text-gray-400">Cargando…</div>;

  const dato = (label, valor) => (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-ht-navy">{valor || '—'}</dd>
    </div>
  );

  return (
    <div>
      <Link to="/empresas" className="text-sm text-ht-accent hover:underline">← Empresas</Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-6">{empresa.razon_social}</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {dato('RUT', empresa.rut)}
          {dato('Dominio correo', empresa.dominio_correo)}
          {dato('Teléfono', empresa.telefono_e164)}
          {dato('Giro', empresa.giro)}
          {dato('Dirección', empresa.direccion)}
          {dato('Comuna', empresa.comuna)}
          {dato('Ciudad', empresa.ciudad)}
          {dato('Vendedor de cuenta', empresa.vendedor_nombre)}
        </dl>
      </div>

      <h2 className="text-lg font-semibold text-ht-navy mb-3">Contactos ({empresa.contactos.length})</h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Cargo</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Teléfono</th>
            </tr>
          </thead>
          <tbody>
            {empresa.contactos.map(c => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-ht-navy">{c.nombre} {c.apellido}</td>
                <td className="px-4 py-2 text-gray-600">{c.cargo || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{c.email || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{c.telefono_e164 || '—'}</td>
              </tr>
            ))}
            {empresa.contactos.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Sin contactos.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      <div className="mt-6">
        <NotasYTareas empresaId={Number(id)} vendedorId={empresa.vendedor_id} />
      </div>
    </div>
  );
}
