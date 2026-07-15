import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

export default function ImportarProductos() {
  const [archivo, setArchivo] = useState(null);
  const [sincronizar, setSincronizar] = useState(false);
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const analizar = async e => {
    e.preventDefault();
    if (!archivo) return;
    setError(''); setResultado(null); setPreview(null); setCargando(true);
    const fd = new FormData(); fd.append('archivo', archivo); fd.append('sincronizar', sincronizar);
    try {
      const { data } = await api.post('/productos/importar/preview', fd);
      setPreview(data);
    } catch (err) { setError(err.response?.data?.error || 'Error al analizar el archivo.'); }
    finally { setCargando(false); }
  };

  const confirmar = async () => {
    if (!archivo) return;
    setError(''); setCargando(true);
    const fd = new FormData(); fd.append('archivo', archivo); fd.append('sincronizar', sincronizar);
    try {
      const { data } = await api.post('/productos/importar/confirmar', fd);
      setResultado(data); setPreview(null);
    } catch (err) { setError(err.response?.data?.error || 'Error al importar.'); }
    finally { setCargando(false); }
  };

  const descargarPlantilla = async (tipo, archivo) => {
    const { data } = await api.get('/productos/importar/plantilla', { params: { tipo }, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = archivo; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Link to="/productos" className="text-sm text-ht-accent hover:underline">← Productos</Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-2">Importar catálogo de productos</h1>
      <p className="text-gray-500 text-sm mb-4">
        Exporta a CSV la hoja "Catálogo" (bombas), "Hidroneumáticos" o "Filtros Piscina" del Excel y súbela — se
        detecta automáticamente. Se matchea por <strong>Código</strong>: crea los nuevos y actualiza los existentes.
        Si el archivo trae columna de stock del proveedor, se registra.
      </p>
      <div className="flex gap-4 mb-6">
        <button onClick={() => descargarPlantilla('bombas', 'plantilla_bombas.csv')} className="text-sm text-ht-accent hover:underline">
          Plantilla: Bombas
        </button>
        <button onClick={() => descargarPlantilla('hidroneumatico', 'plantilla_hidroneumaticos.csv')} className="text-sm text-ht-accent hover:underline">
          Plantilla: Hidroneumáticos
        </button>
        <button onClick={() => descargarPlantilla('filtro_arena', 'plantilla_filtros_piscina.csv')} className="text-sm text-ht-accent hover:underline">
          Plantilla: Filtros de piscina
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <form onSubmit={analizar} className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <input type="file" accept=".csv" onChange={e => { setArchivo(e.target.files[0]); setPreview(null); setResultado(null); }}
            className="text-sm" />
          <button type="submit" disabled={!archivo || cargando}
            className="bg-ht-navy text-white px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/90 disabled:opacity-50">
            {cargando ? 'Procesando…' : 'Previsualizar'}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={sincronizar}
            onChange={e => { setSincronizar(e.target.checked); setPreview(null); setResultado(null); }} />
          Este archivo es el catálogo completo (desactivar productos activos que no estén incluidos)
        </label>
      </form>

      {resultado && (
        <div className="p-4 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
          <p className="font-medium">Importación completada.</p>
          <ul className="list-disc pl-5 mt-1">
            <li>Insertados: {resultado.insertados}</li>
            <li>Actualizados: {resultado.actualizados}</li>
            <li>Stock de proveedor cargado: {resultado.stock_cargado}</li>
            {sincronizar && <li>Desactivados (no estaban en el archivo): {resultado.desactivados}</li>}
          </ul>
          <Link to="/productos" className="inline-block mt-3 text-ht-navy underline">Ver productos</Link>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label="Filas válidas" val={preview.resumen.total_filas_validas} />
            <Tile label="Nuevos" val={preview.resumen.nuevos} />
            <Tile label="Actualizar" val={preview.resumen.actualizar} />
            <Tile label="Con stock prov." val={preview.resumen.con_stock_proveedor} />
            <Tile label="Rechazos" val={preview.resumen.rechazos} alerta={preview.resumen.rechazos > 0} />
          </div>

          {sincronizar && (
            <div className={`p-3 rounded-lg border text-sm ${preview.resumen.a_desactivar > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
              <p className="font-medium">{preview.resumen.a_desactivar} producto(s) activos se desactivarán por no estar en este archivo.</p>
              {preview.a_desactivar.length > 0 && (
                <ul className="list-disc pl-5 mt-1 max-h-32 overflow-y-auto">
                  {preview.a_desactivar.map(p => <li key={p.sku}>{p.sku} — {p.nombre}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 text-sm text-gray-600 font-medium">Muestra (primeras {preview.muestra.length})</div>
            <table className="w-full text-sm">
              <thead className="text-gray-500"><tr>
                <th className="text-left px-4 py-1 font-medium">Código</th>
                <th className="text-left px-4 py-1 font-medium">Nombre</th>
                <th className="text-left px-4 py-1 font-medium">Marca</th>
                <th className="text-right px-4 py-1 font-medium">Precio</th>
                <th className="text-left px-4 py-1 font-medium">Estado</th>
              </tr></thead>
              <tbody>
                {preview.muestra.map((m, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-4 py-1 text-gray-500">{m.sku}</td>
                    <td className="px-4 py-1 text-ht-navy">{m.nombre}</td>
                    <td className="px-4 py-1 text-gray-600">{m.marca || '—'}</td>
                    <td className="px-4 py-1 text-right">{m.precio_lista ? `$${Number(m.precio_lista).toLocaleString('es-CL')}` : '—'}</td>
                    <td className="px-4 py-1">{m.existe ? <span className="text-gray-500">actualiza</span> : <span className="text-green-700">nuevo</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.rechazos.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-amber-50 text-sm text-amber-800 font-medium">Rechazos ({preview.rechazos.length})</div>
              <table className="w-full text-sm">
                <thead className="text-gray-500"><tr>
                  <th className="text-left px-4 py-1 font-medium">Fila</th>
                  <th className="text-left px-4 py-1 font-medium">Código</th>
                  <th className="text-left px-4 py-1 font-medium">Motivo</th>
                </tr></thead>
                <tbody>
                  {preview.rechazos.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-4 py-1 text-gray-500">{r.fila}</td>
                      <td className="px-4 py-1 text-gray-600">{r.sku || '—'}</td>
                      <td className="px-4 py-1 text-amber-700">{r.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button onClick={confirmar} disabled={cargando || preview.resumen.total_filas_validas === 0}
            className="bg-ht-navy text-white px-5 py-2 rounded text-sm font-medium hover:bg-ht-navy/90 disabled:opacity-50">
            {cargando ? 'Importando…' : `Confirmar importación (${preview.resumen.total_filas_validas})`}
          </button>
        </div>
      )}
    </div>
  );
}

function Tile({ label, val, alerta }) {
  return (
    <div className={`rounded-lg border p-3 ${alerta ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <div className={`text-2xl font-bold ${alerta ? 'text-amber-700' : 'text-ht-navy'}`}>{val}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
