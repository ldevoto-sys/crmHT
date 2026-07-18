import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';

const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const fecha = d => d ? new Date(d).toLocaleDateString('es-CL') : '';
const numeroCompleto = (numero, version) => `${numero}-${String(version).padStart(2, '0')}`;

const NAVY = '#112548', CYAN = '#34B3DE';

export default function CotizacionPublica() {
  const { token } = useParams();
  const [cot, setCot] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/public/cotizacion/${token}`).then(r => setCot(r.data)).catch(() => setError('Cotización no encontrada o link inválido.'));
  }, [token]);

  if (error) return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-gray-500">{error}</div>;
  if (!cot) return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-gray-400">Cargando…</div>;

  const em = cot.emisor || {};
  const desc = Number(cot.descuento_pct) || 0, iva = Number(cot.iva_pct) || 0;
  const descMonto = Math.round(Number(cot.subtotal) * desc / 100);
  const neto = Number(cot.subtotal) - descMonto;
  const ivaMonto = Math.round(neto * iva / 100);
  const waBadge = <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full" style={{ background: '#25D366' }}>WhatsApp</span>;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-3">
      <div className="max-w-3xl mx-auto bg-white rounded shadow-sm overflow-hidden">
        {/* Header */}
        <div style={{ background: NAVY }} className="px-8 pt-6">
          <div className="flex justify-between items-start pb-4">
            <img src="/Hidrotecnica.jpg" alt="HidroTécnica" className="h-11 bg-white rounded px-2 py-1 object-contain" />
            <div className="text-right">
              <div className="text-2xl font-bold tracking-wide uppercase" style={{ color: CYAN }}>Cotización</div>
              <div className="text-white text-sm font-bold opacity-90 mt-1">N° {numeroCompleto(cot.numero, cot.version)}</div>
            </div>
          </div>
          <div className="border-t border-white/15 py-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/75">
            {em.direccion && <span><strong className="text-white">{em.direccion}</strong>, {em.comuna}</span>}
            {em.rut && <span className="opacity-60">|</span>}{em.rut && <span>RUT <strong className="text-white">{em.rut}</strong></span>}
            {em.telefono && <span className="opacity-60">|</span>}{em.telefono && <span>T <strong className="text-white">{em.telefono}</strong></span>}
            {em.whatsapp && <span className="opacity-60">|</span>}{em.whatsapp && <span>{waBadge} <strong className="text-white">{em.whatsapp}</strong></span>}
            {em.email_ventas && <span className="opacity-60">|</span>}{em.email_ventas && <span><strong className="text-white">{em.email_ventas}</strong></span>}
          </div>
        </div>
        <div style={{ background: CYAN }} className="h-1" />

        {cot.titulo && (
          <div className="px-8 py-3 border-b border-gray-200 font-semibold" style={{ color: NAVY }}>{cot.titulo}</div>
        )}

        {/* Cliente */}
        <div className="px-8 py-5 border-b border-gray-200">
          <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: CYAN }}>Cliente</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-base font-bold" style={{ color: NAVY }}>{cot.cliente.empresa_nombre || `${cot.cliente.contacto_nombre || ''} ${cot.cliente.contacto_apellido || ''}`}</div>
              <p className="text-xs text-gray-500 leading-relaxed mt-1">
                {cot.cliente.empresa_direccion && <>{cot.cliente.empresa_direccion}<br /></>}
                {cot.cliente.empresa_comuna && <>{cot.cliente.empresa_comuna}<br /></>}
                {cot.cliente.empresa_rut && <>RUT: {cot.cliente.empresa_rut}<br /></>}
                {cot.cliente.empresa_giro && <>Giro: {cot.cliente.empresa_giro}</>}
              </p>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: CYAN }}>Contacto</div>
              <p className="text-xs text-gray-600">{cot.cliente.contacto_nombre} {cot.cliente.contacto_apellido}<br />{cot.cliente.contacto_email}</p>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: CYAN }}>Información</div>
              <p className="text-xs text-gray-600">Fecha: {fecha(cot.created_at)}<br />Válida: {cot.validez_dias} días</p>
            </div>
          </div>
        </div>

        {/* Vendedor */}
        <div className="px-8 py-4 border-b border-gray-200 text-xs">
          <span className="text-gray-500">Ejecutivo: </span>
          <span className="font-bold" style={{ color: NAVY }}>{cot.vendedor.nombre}</span>
          {cot.vendedor.email && <span className="text-gray-500"> · {cot.vendedor.email}</span>}
        </div>

        {/* Items */}
        <div className="px-8 py-6">
          <h3 className="text-[10px] font-bold uppercase tracking-wider mb-4" style={{ color: CYAN }}>Detalle de productos</h3>
          <div className="space-y-3">
            {cot.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr] border border-gray-200 rounded overflow-hidden">
                <div className="bg-slate-50 border-r border-gray-200 flex items-center justify-center p-3">
                  {it.imagen
                    ? <img src={it.imagen} alt={it.descripcion} className="w-full h-20 object-contain" />
                    : <div className="w-full h-20 flex items-center justify-center text-[10px] text-gray-300 text-center">sin imagen</div>}
                </div>
                <div className="p-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="text-sm font-bold leading-snug" style={{ color: NAVY }}>{it.descripcion}{it.marca && <span className="block text-[11px] font-normal text-gray-400">{it.marca}</span>}</div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-base font-bold" style={{ color: NAVY }}>{money(it.total_linea)}</div>
                      <div className="text-[10px] text-gray-500">Total neto</div>
                    </div>
                  </div>
                  <div className="flex gap-6 mt-2 text-[11px]">
                    <div><span className="text-gray-500">Cantidad: </span><span className="font-bold" style={{ color: NAVY }}>{Number(it.cantidad)}</span></div>
                    <div><span className="text-gray-500">P. Unit.: </span><span className="font-bold" style={{ color: NAVY }}>{money(it.precio_unitario)}</span></div>
                  </div>
                  {it.descripcion_completa && (
                    <p className="mt-2 text-[11px] text-gray-600 leading-snug">{it.descripcion_completa}</p>
                  )}
                  {it.ficha && (
                    <a href={it.ficha} target="_blank" rel="noreferrer" className="inline-block mt-2 text-[11px]" style={{ color: CYAN }}>Ficha técnica (PDF) ↗</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totales */}
        <div className="px-8 pb-6 flex justify-end border-t border-gray-200 pt-4">
          <div className="w-72 text-sm">
            <div className="flex justify-between py-1.5 border-b border-gray-100 text-gray-500"><span>Subtotal neto</span><span>{money(cot.subtotal)}</span></div>
            {desc > 0 && <div className="flex justify-between py-1.5 border-b border-gray-100 text-gray-500"><span>Descuento ({desc}%)</span><span>−{money(descMonto)}</span></div>}
            {iva > 0 && <div className="flex justify-between py-1.5 border-b border-gray-100 text-gray-500"><span>IVA ({iva}%)</span><span>{money(ivaMonto)}</span></div>}
            <div className="flex justify-between pt-2 mt-1 text-lg font-bold" style={{ color: NAVY, borderTop: `2px solid ${NAVY}` }}>
              <span>Total</span><span style={{ color: CYAN }}>{money(cot.total)}</span>
            </div>
          </div>
        </div>

        {/* Condiciones + banco */}
        <div className="grid grid-cols-1 md:grid-cols-2 border-t border-gray-200 bg-slate-50">
          <div className="p-6 border-r border-gray-200">
            <h3 className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: CYAN }}>Condiciones comerciales</h3>
            <p className="text-xs text-gray-600 whitespace-pre-wrap">{cot.condiciones || 'Precios en pesos chilenos (CLP). Validez según lo indicado. Garantía según fabricante.'}</p>
          </div>
          <div className="p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: CYAN }}>Datos bancarios</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              {em.banco && <><strong style={{ color: NAVY }}>{em.banco}</strong><br /></>}
              {em.cuenta_numero && <>{em.cuenta_tipo} N° <strong style={{ color: NAVY }}>{em.cuenta_numero}</strong><br /></>}
              {em.razon_social && <>{em.razon_social} · RUT {em.rut}<br /></>}
              {em.email_cobranzas && <>Email: <strong style={{ color: NAVY }}>{em.email_cobranzas}</strong></>}
            </p>
          </div>
        </div>

        {/* Footer + PDF */}
        <div style={{ background: NAVY }} className="px-8 py-4 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] text-white/60">{em.razon_social} · RUT {em.rut} · {em.telefono}</p>
          <a href={`/api/public/cotizacion/${token}/pdf`} target="_blank" rel="noreferrer"
            className="text-sm font-medium px-4 py-2 rounded" style={{ background: CYAN, color: NAVY }}>Descargar PDF</a>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-4">{em.sitio_web || 'www.hidrotecnica.cl'}</p>
    </div>
  );
}
