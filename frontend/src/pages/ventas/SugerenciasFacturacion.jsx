import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

const fmtMoney = v => `$${Math.round(v || 0).toLocaleString('es-CL')}`;
const fmtFecha = iso => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

// Pestaña de Reportería Softland (nota de cambio v1.33) — vista global de
// todas las facturas sin resolver con candidato, sin importar el pipeline.
// El mismo cruce se ofrece también dentro de la tarjeta del negocio en el
// Pipeline (backend/services/sugerenciasFacturacion.js es la única fuente
// de la lógica de matching) — acá se ve todo junto, para revisarlo de una.
export default function SugerenciasFacturacion() {
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState({}); // folio -> negocio_id elegido
  const [procesando, setProcesando] = useState(''); // folio en curso

  const cargar = () => {
    setCargando(true); setError('');
    api.get('/softland/sugerencias-facturacion')
      .then(r => setFacturas(r.data))
      .catch(() => setError('No se pudo cargar las sugerencias.'))
      .finally(() => setCargando(false));
  };
  useEffect(() => { cargar(); }, []);

  const confirmar = async folio => {
    const negocioId = seleccion[folio];
    if (!negocioId) return;
    setProcesando(folio);
    try {
      await api.post(`/softland/sugerencias-facturacion/${folio}/confirmar`, { negocio_id: Number(negocioId) });
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo confirmar.');
    } finally {
      setProcesando('');
    }
  };

  const descartar = async folio => {
    setProcesando(folio);
    try { await api.post(`/softland/sugerencias-facturacion/${folio}/descartar`); cargar(); }
    catch { setError('No se pudo descartar.'); }
    finally { setProcesando(''); }
  };

  if (cargando) return <div className="text-gray-400 text-sm">Cargando sugerencias…</div>;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-ht-navy text-sm">Sugerencias de facturación</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Facturas de Softland que calzan por RUT de cliente + monto exacto con algún negocio del pipeline aún no marcado "Facturado".
          Nunca se mueve nada solo: elige el negocio correcto y confirma, o descarta si ninguno aplica.
        </p>
      </div>
      {error && <div className="px-4 py-2 text-sm text-red-600">{error}</div>}
      {!facturas.length && (
        <p className="px-4 py-6 text-center text-gray-400 text-sm">Sin sugerencias pendientes.</p>
      )}
      <div className="divide-y divide-gray-100">
        {facturas.map(f => (
          <div key={f.folio} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-sm">
                <span className="font-medium text-ht-navy">Folio {f.folio}</span>
                <span className="text-gray-400 mx-1.5">·</span>
                <span className="text-gray-600">{f.nombre_cliente}</span>
                <span className="text-gray-400 mx-1.5">·</span>
                <span className="text-gray-500">{fmtFecha(f.fecha)}</span>
              </div>
              <span className="text-ht-navy font-semibold">{fmtMoney(f.monto)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={seleccion[f.folio] || ''} onChange={e => setSeleccion(s => ({ ...s, [f.folio]: e.target.value }))}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm flex-1 min-w-[240px] focus:outline-none focus:ring-2 focus:ring-ht-accent">
                <option value="">— Elige el negocio que corresponde ({f.negocios.length} candidato{f.negocios.length === 1 ? '' : 's'}) —</option>
                {f.negocios.map(n => (
                  <option key={n.id} value={n.id}>{n.titulo} · {n.etapa_nombre} · {n.vendedor_nombre || 'sin vendedor'}</option>
                ))}
              </select>
              <button disabled={!seleccion[f.folio] || procesando === f.folio} onClick={() => confirmar(f.folio)}
                className="bg-ht-accent text-ht-navy px-3 py-1.5 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-50">
                Confirmar
              </button>
              <button disabled={procesando === f.folio} onClick={() => descartar(f.folio)}
                className="px-3 py-1.5 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Descartar
              </button>
            </div>
            {seleccion[f.folio] && (
              <Link to={`/negocios/${seleccion[f.folio]}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-ht-accent hover:underline mt-1 inline-block">Ver negocio ↗</Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
