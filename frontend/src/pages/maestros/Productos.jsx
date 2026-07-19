import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import BusquedaEquivalentes from './BusquedaEquivalentes';

function StockBadge({ p }) {
  if (p.stock_gestionado_por_proveedor && p.stock_prov !== null && p.stock_prov !== undefined) {
    const fecha = p.stock_fecha ? new Date(p.stock_fecha) : null;
    const dias = fecha ? Math.floor((Date.now() - fecha.getTime()) / 86400000) : null;
    const viejo = dias !== null && dias > 10;
    const fstr = fecha ? fecha.toLocaleDateString('es-CL') : '';
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${viejo ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
        Stock: {p.stock_prov} — {fstr}{viejo ? ' ⚠' : ''}
      </span>
    );
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">verificar con proveedor</span>;
}

export default function Productos() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'administrador' || user?.rol === 'jefe_comercial';
  const [tab, setTab] = useState('catalogo');
  const [productos, setProductos] = useState([]);
  const [facetas, setFacetas] = useState({ marcas: [], categorias: [] });
  const [q, setQ] = useState('');
  const [marca, setMarca] = useState('');
  const [categoria, setCategoria] = useState('');

  const cargar = async () => {
    const params = {};
    if (q) params.q = q;
    if (marca) params.marca = marca;
    if (categoria) params.categoria = categoria;
    const { data } = await api.get('/productos', { params });
    setProductos(data);
  };
  useEffect(() => { if (tab === 'catalogo') cargar(); }, [marca, categoria, tab]);
  useEffect(() => { api.get('/productos/facetas').then(r => setFacetas(r.data)).catch(() => {}); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-ht-navy">Productos</h1>
        {esAdmin && tab === 'catalogo' && (
          <Link to="/productos/importar" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">
            Importar catálogo (CSV)
          </Link>
        )}
      </div>

      <div className="flex gap-1 mb-6 border border-gray-200 rounded p-1 bg-slate-50 w-fit">
        <button onClick={() => setTab('catalogo')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'catalogo' ? 'bg-white text-ht-navy shadow-sm' : 'text-gray-500'}`}>
          Catálogo
        </button>
        <button onClick={() => setTab('equivalencias')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'equivalencias' ? 'bg-white text-ht-navy shadow-sm' : 'text-gray-500'}`}>
          Búsqueda de equivalentes
        </button>
      </div>

      {tab === 'equivalencias' ? <BusquedaEquivalentes /> : <>
      <div className="mb-4 flex gap-2 flex-wrap items-center">
        <form onSubmit={e => { e.preventDefault(); cargar(); }} className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o código…"
            className="border border-gray-300 rounded px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <button className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Buscar</button>
        </form>
        <select value={marca} onChange={e => setMarca(e.target.value)} className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
          <option value="">Todas las marcas</option>
          {facetas.marcas.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={categoria} onChange={e => setCategoria(e.target.value)} className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
          <option value="">Todas las categorías</option>
          {facetas.categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Código</th>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Marca</th>
              <th className="text-left px-4 py-2 font-medium">Categoría</th>
              <th className="text-right px-4 py-2 font-medium">Precio neto</th>
              <th className="text-left px-4 py-2 font-medium">Stock</th>
            </tr>
          </thead>
          <tbody>
            {productos.map(p => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-500">{p.sku}</td>
                <td className="px-4 py-2 text-ht-navy font-medium">
                  <Link to={`/productos/${p.id}`} className="hover:underline">{p.nombre}</Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{p.marca || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{p.categoria || '—'}</td>
                <td className="px-4 py-2 text-right text-gray-700">{p.precio_lista ? `$${Number(p.precio_lista).toLocaleString('es-CL')}` : '—'}</td>
                <td className="px-4 py-2"><StockBadge p={p} /></td>
              </tr>
            ))}
            {productos.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin productos.</td></tr>}
          </tbody>
        </table>
      </div>
      {productos.length === 500 && <p className="text-xs text-gray-400 mt-2">Mostrando los primeros 500. Afina la búsqueda o los filtros.</p>}
      </>}
    </div>
  );
}
