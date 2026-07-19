import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

export default function ImportarEmpresas() {
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const analizar = async e => {
    e.preventDefault();
    if (!archivo) return;
    setError(''); setResultado(null); setPreview(null); setCargando(true);
    const fd = new FormData(); fd.append('archivo', archivo);
    try {
      const { data } = await api.post('/empresas/importar/preview', fd);
      setPreview(data);
    } catch (err) { setError(err.response?.data?.error || 'Error al analizar el archivo.'); }
    finally { setCargando(false); }
  };

  const confirmar = async () => {
    if (!archivo) return;
    setError(''); setCargando(true);
    const fd = new FormData(); fd.append('archivo', archivo);
    try {
      const { data } = await api.post('/empresas/importar/confirmar', fd);
      setResultado(data); setPreview(null);
    } catch (err) { setError(err.response?.data?.error || 'Error al importar.'); }
    finally { setCargando(false); }
  };

  const descargarPlantilla = async () => {
    const { data } = await api.get('/empresas/importar/plantilla', { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'plantilla_empresas.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Link to="/empresas" className="text-sm text-ht-accent hover:underline">← Empresas</Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-2">Importar empresas</h1>
      <p className="text-gray-500 text-sm mb-4">
        Sube un CSV con las columnas de la plantilla. Se matchea por <strong>RUT</strong> (o razón social si no hay RUT):
        crea las nuevas y completa datos de las existentes.
      </p>
      <button onClick={descargarPlantilla} className="text-sm text-ht-accent hover:underline mb-6 inline-block">
        Descargar plantilla CSV
      </button>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <form onSubmit={analizar} className="bg-white border border-gray-200 rounded-lg p-5 mb-6 flex items-center gap-3">
        <input type="file" accept=".csv" onChange={e => { setArchivo(e.target.files[0]); setPreview(null); setResultado(null); }} className="text-sm" />
        <button type="submit" disabled={!archivo || cargando}
          className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
          {cargando ? 'Procesando…' : 'Previsualizar'}
        </button>
      </form>

      {resultado && (
        <div className="p-4 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
          <p className="font-medium">Importación completada.</p>
          <ul className="list-disc pl-5 mt-1">
            <li>Empresas insertadas: {resultado.insertados}</li>
            <li>Empresas actualizadas: {resultado.actualizados}</li>
          </ul>
          <Link to="/empresas" className="inline-block mt-3 text-ht-navy underline">Ver empresas</Link>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label="Filas válidas" val={preview.resumen.total_filas_validas} />
            <Tile label="Nuevas" val={preview.resumen.nuevos} />
            <Tile label="Actualizar" val={preview.resumen.actualizar} />
            <Tile label="Con advertencia" val={preview.resumen.con_advertencia} alerta={preview.resumen.con_advertencia > 0} />
            <Tile label="Rechazos" val={preview.resumen.rechazos} alerta={preview.resumen.rechazos > 0} />
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 text-sm text-gray-600 font-medium">Muestra (primeras {preview.muestra.length})</div>
            <table className="w-full text-sm">
              <thead className="text-gray-500"><tr>
                <th className="text-left px-4 py-1 font-medium">Razón social</th>
                <th className="text-left px-4 py-1 font-medium">RUT</th>
                <th className="text-left px-4 py-1 font-medium">Dominio</th>
                <th className="text-left px-4 py-1 font-medium">Teléfono</th>
                <th className="text-left px-4 py-1 font-medium">Advertencias</th>
              </tr></thead>
              <tbody>
                {preview.muestra.map((m, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-1 text-ht-navy">{m.razon_social}</td>
                    <td className="px-4 py-1 text-gray-600">{m.rut || '—'}</td>
                    <td className="px-4 py-1 text-gray-600">{m.dominio_correo || '—'}</td>
                    <td className="px-4 py-1 text-gray-600">{m.telefono || '—'}</td>
                    <td className="px-4 py-1 text-amber-700 text-xs">{m.advertencias.join('; ')}</td>
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
                  <th className="text-left px-4 py-1 font-medium">Motivo</th>
                </tr></thead>
                <tbody>
                  {preview.rechazos.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-1 text-gray-500">{r.fila}</td>
                      <td className="px-4 py-1 text-amber-700">{r.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button onClick={confirmar} disabled={cargando || preview.resumen.total_filas_validas === 0}
            className="bg-ht-accent text-ht-navy px-5 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
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
