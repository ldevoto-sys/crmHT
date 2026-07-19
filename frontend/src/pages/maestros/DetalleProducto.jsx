import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';

export default function DetalleProducto() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/productos/${id}`).then(r => setP(r.data)).catch(() => setError('No se pudo cargar el producto.'));
  }, [id]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!p) return <div className="p-6 text-gray-400">Cargando…</div>;

  const atributos = p.atributos || {};
  const curva = atributos.curva;
  const otros = Object.entries(atributos).filter(([k]) => k !== 'curva');

  return (
    <div>
      <Link to="/productos" className="text-sm text-ht-accent hover:underline">← Productos</Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-1">{p.nombre}</h1>
      <p className="text-gray-500 text-sm mb-6">{p.sku} · {p.marca || '—'} · {p.categoria || '—'}</p>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-ht-navy mb-3">Datos comerciales</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Precio neto" val={p.precio_lista ? `$${Number(p.precio_lista).toLocaleString('es-CL')}` : '—'} />
            <Row label="Proveedor" val={p.proveedor || '—'} />
            <Row label="Ficha técnica" val={p.ficha_tecnica_url ? <a href={p.ficha_tecnica_url} target="_blank" rel="noreferrer" className="text-ht-accent hover:underline">Ver PDF</a> : '—'} />
            <Row label="Imagen" val={p.url_imagen ? <a href={p.url_imagen} target="_blank" rel="noreferrer" className="text-ht-accent hover:underline">Ver imagen</a> : '—'} />
          </dl>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-ht-navy mb-3">Atributos técnicos</h2>
          {otros.length === 0 ? <p className="text-sm text-gray-400">Sin atributos.</p> : (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {otros.map(([k, v]) => <Row key={k} label={k.replace(/_/g, ' ')} val={String(v)} />)}
            </dl>
          )}
        </div>
      </div>

      {Array.isArray(curva) && curva.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mt-6 max-w-md">
          <h2 className="font-semibold text-ht-navy mb-3">Curva Q/H</h2>
          <table className="text-sm w-full">
            <thead className="text-gray-500"><tr><th className="text-left py-1">Caudal (Q)</th><th className="text-left py-1">Altura (H)</th></tr></thead>
            <tbody>
              {curva.map((pt, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50"><td className="py-1">{pt.q ?? '—'}</td><td className="py-1">{pt.h ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ label, val }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500 capitalize">{label}</dt>
      <dd className="text-ht-navy text-right">{val}</dd>
    </div>
  );
}
