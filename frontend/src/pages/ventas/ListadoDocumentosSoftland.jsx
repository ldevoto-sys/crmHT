import { useEffect, useState } from 'react';
import api from '../../api';

const fmtMoney = v => `$${Math.round(v || 0).toLocaleString('es-CL')}`;
const fmtFecha = iso => (iso ? new Date(iso).toLocaleDateString('es-CL') : '—');
const AREA_LABEL = { meson: 'Ventas Mesón', operaciones: 'Operaciones', vregion: 'V Región', otros: 'Otros' };

const CONFIG = {
  cotizaciones: { titulo: 'Cotizaciones', numeroLabel: 'N° Cotización', numeroCampo: 'cot_num', placeholderBuscar: 'Cliente, vendedor o N° de cotización…' },
  'notas-venta': { titulo: 'Notas de Venta', numeroLabel: 'N° NV', numeroCampo: 'nv_numero', placeholderBuscar: 'Cliente, vendedor, N° NV u O/C…', mostrarOC: true },
  facturas: { titulo: 'Facturas', numeroLabel: 'N° Factura', numeroCampo: 'folio', placeholderBuscar: 'Cliente, vendedor o folio…' },
};

const PAGE_SIZE = 50;

// Listado documento por documento (cotizaciones / notas de venta / facturas)
// — a diferencia del resto de la Reportería Softland, este NO trae todo y
// filtra en el navegador: el histórico completo puede ser varios miles de
// documentos, así que filtra y pagina contra el servidor (nota de cambio
// v1.31). Año/mes/vendedor/área vienen de los filtros compartidos de la
// página; día y texto de búsqueda son propios de este listado.
export default function ListadoDocumentosSoftland({ tipo, anio, mes, vencod, area }) {
  const cfg = CONFIG[tipo];
  const [dia, setDia] = useState('');
  const [buscar, setBuscar] = useState('');
  const [buscarDebounced, setBuscarDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [datos, setDatos] = useState({ rows: [], total: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setBuscarDebounced(buscar), 300);
    return () => clearTimeout(t);
  }, [buscar]);

  useEffect(() => { setPage(1); }, [tipo, anio, mes, vencod, area, dia, buscarDebounced]);

  useEffect(() => {
    setCargando(true); setError('');
    api.get(`/softland/documentos/${tipo}`, {
      params: {
        anio: anio || undefined, mes: mes || undefined, dia: dia || undefined,
        vendedor: vencod || undefined, area: area || undefined, q: buscarDebounced || undefined,
        page, pageSize: PAGE_SIZE,
      },
    }).then(r => setDatos(r.data)).catch(() => setError('No se pudo cargar el listado.')).finally(() => setCargando(false));
  }, [tipo, anio, mes, vencod, area, dia, buscarDebounced, page]);

  const exportar = async () => {
    try {
      const { data } = await api.get(`/softland/documentos/${tipo}/exportar`, {
        params: {
          anio: anio || undefined, mes: mes || undefined, dia: dia || undefined,
          vendedor: vencod || undefined, area: area || undefined, q: buscarDebounced || undefined,
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = `${tipo}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('No se pudo exportar.'); }
  };

  const totalPaginas = Math.max(1, Math.ceil(datos.total / PAGE_SIZE));

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-ht-navy text-sm">{cfg.titulo}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={dia} onChange={e => setDia(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          {dia && <button onClick={() => setDia('')} className="text-xs text-ht-accent hover:underline">limpiar día</button>}
          <input type="text" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder={cfg.placeholderBuscar}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          <button onClick={exportar} className="text-xs text-ht-accent hover:underline whitespace-nowrap">Exportar CSV</button>
        </div>
      </div>
      {error && <div className="px-4 py-2 text-sm text-red-600">{error}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Fecha</th>
              <th className="text-left px-4 py-2 font-medium">{cfg.numeroLabel}</th>
              <th className="text-left px-4 py-2 font-medium">Cliente</th>
              <th className="text-left px-4 py-2 font-medium">Vendedor</th>
              <th className="text-left px-4 py-2 font-medium">Área</th>
              {cfg.mostrarOC && <th className="text-left px-4 py-2 font-medium">O/C</th>}
              <th className="text-right px-4 py-2 font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {datos.rows.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-slate-50">
                <td className="px-4 py-2 text-gray-600">{fmtFecha(r.fecha)}</td>
                <td className="px-4 py-2 text-ht-navy">{r[cfg.numeroCampo]}</td>
                <td className="px-4 py-2 text-gray-600">{r.nombre_cliente || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{r.nombre_vendedor || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{r.area ? AREA_LABEL[r.area] : '—'}</td>
                {cfg.mostrarOC && <td className="px-4 py-2 text-gray-600">{r.num_oc || '—'}</td>}
                <td className="px-4 py-2 text-right text-ht-navy">{fmtMoney(r.monto)}</td>
              </tr>
            ))}
            {!cargando && datos.rows.length === 0 && (
              <tr><td colSpan={cfg.mostrarOC ? 7 : 6} className="px-4 py-6 text-center text-gray-400">Sin documentos para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
        <span>{datos.total} documento{datos.total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40">Anterior</button>
          <span>Página {page} de {totalPaginas}</span>
          <button disabled={page >= totalPaginas} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    </div>
  );
}
