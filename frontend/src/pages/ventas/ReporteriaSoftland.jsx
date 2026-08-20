import { useEffect, useState } from 'react';
import api from '../../api';

const fmtFecha = iso => iso ? new Date(iso).toLocaleString('es-CL') : '—';

export default function ReporteriaSoftland() {
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState('');

  const cargarEstado = () => {
    setCargando(true);
    api.get('/softland/sync/estado')
      .then(r => setEstado(r.data))
      .catch(() => setError('No se pudo consultar el estado de la sincronización.'))
      .finally(() => setCargando(false));
  };

  useEffect(cargarEstado, []);

  const actualizar = async () => {
    setActualizando(true); setError('');
    try {
      const { data } = await api.post('/softland/sync');
      setEstado({ ok: true, ejecutado_en: new Date().toISOString(), filas_mensual: data.filas_mensual, filas_pendientes: data.filas_pendientes });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar — revisa la conexión a Softland.');
      cargarEstado();
    } finally {
      setActualizando(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
        <h1 className="text-2xl font-bold text-ht-navy">Reportería Comercial + Softland</h1>
        <button onClick={actualizar} disabled={actualizando}
          className="bg-ht-accent text-white text-sm font-medium px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Cotizado: Softland hasta jul-2026 (estático) · CRM en vivo desde ago-2026.
        Cerrado y Facturado: siempre Softland, sin cruce con el pipeline del CRM.
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 text-sm">
        {cargando ? (
          <span className="text-gray-400">Consultando estado…</span>
        ) : !estado ? (
          <span className="text-gray-500">Todavía no se ha ejecutado ninguna sincronización. Presiona "Actualizar" para cargar los datos de Softland por primera vez.</span>
        ) : estado.ok ? (
          <span className="text-gray-600">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" />
            Última actualización: <b className="text-ht-navy">{fmtFecha(estado.ejecutado_en)}</b>
            {' — '}{estado.filas_mensual ?? '—'} filas mensuales, {estado.filas_pendientes ?? '—'} NV pendientes.
          </span>
        ) : (
          <span className="text-red-600">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2" />
            La última actualización ({fmtFecha(estado.ejecutado_en)}) falló: {estado.error || 'error desconocido'}.
          </span>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
        El reporte (mensual, comparación anual, por vendedor, por área, NV sin facturar) se agrega en el siguiente paso —
        esta pantalla por ahora solo prueba la conexión y la carga de datos desde Softland.
      </div>
    </div>
  );
}
