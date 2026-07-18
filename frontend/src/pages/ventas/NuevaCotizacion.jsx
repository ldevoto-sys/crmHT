import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../../api';

const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const enUnaSemana = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

// Autocompletado de producto propio de cada línea: cada fila puede buscar
// en el maestro de forma independiente (antes solo existía un buscador
// arriba, y agregar una segunda línea sin volver a esa barra dejaba la
// línea sin datos del catálogo).
function BuscadorProducto({ value, onChange, onElegir, categoria, marca }) {
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);

  const buscar = async val => {
    onChange(val);
    if (val.length < 2 && !categoria && !marca) { setResultados([]); return; }
    try {
      const params = {};
      if (val.length >= 2) params.q = val;
      if (categoria) params.categoria = categoria;
      if (marca) params.marca = marca;
      setResultados((await api.get('/productos', { params })).data.slice(0, 15));
    } catch { /* */ }
  };

  return (
    <div className="relative">
      <input value={value} onChange={e => buscar(e.target.value)}
        onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Nombre, código, marca o categoría…"
        className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ht-accent" />
      {abierto && resultados.length > 0 && (
        <div className="absolute z-10 bg-white border border-gray-200 rounded mt-1 w-full max-h-64 overflow-y-auto shadow">
          {resultados.map(p => (
            <button key={p.id} type="button" onMouseDown={() => { onElegir(p); setResultados([]); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
              {p.url_imagen && <img src={p.url_imagen} alt="" className="h-8 w-8 object-contain flex-shrink-0" />}
              <span>
                <span className="text-ht-navy">{p.nombre}</span>
                <span className="text-gray-400"> · {p.sku}{p.marca ? ` · ${p.marca}` : ''}{p.categoria ? ` · ${p.categoria}` : ''} · {money(p.precio_lista)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NuevaCotizacion() {
  const { negocioId, cotizacionId } = useParams();
  const [searchParams] = useSearchParams();
  const contactoIdNuevo = searchParams.get('contacto_id');
  const productosPreseleccionados = searchParams.get('productos');
  const modoEdicion = !!cotizacionId;
  const modoNegocioNuevo = !modoEdicion && !negocioId && !!contactoIdNuevo;
  const navigate = useNavigate();
  const [negocio, setNegocio] = useState(null);
  const [negocioIdReal, setNegocioIdReal] = useState(negocioId ? Number(negocioId) : null);
  const [titulo, setTitulo] = useState('');
  const [fechaCierreEstimada, setFechaCierreEstimada] = useState(enUnaSemana());
  const [items, setItems] = useState([]);
  const [descuento, setDescuento] = useState(0);
  const [iva, setIva] = useState(19);
  const [validez, setValidez] = useState(15);
  const [condiciones, setCondiciones] = useState('');
  const [categoria, setCategoria] = useState(''); const [marca, setMarca] = useState('');
  const [facetas, setFacetas] = useState({ categorias: [], marcas: [] });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(modoEdicion);

  useEffect(() => { api.get('/productos/facetas').then(r => setFacetas(r.data)).catch(() => {}); }, []);

  // Líneas precargadas desde la Búsqueda de equivalentes (productos maestros).
  useEffect(() => {
    if (!productosPreseleccionados || modoEdicion) return;
    api.get('/productos', { params: { ids: productosPreseleccionados } }).then(r => {
      setItems(r.data.map(p => ({
        producto_id: p.id, descripcion: p.nombre, cantidad: 1, precio_unitario: Number(p.precio_lista) || 0,
        mostrar_imagen: true, mostrar_descripcion: true, mostrar_ficha: true,
        producto_meta: {
          sku: p.sku, marca: p.marca, categoria: p.categoria, url_imagen: p.url_imagen,
          descripcion_completa: p.descripcion_completa, ficha_tecnica_url: p.ficha_tecnica_url,
        },
      })));
    }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (modoEdicion) {
      api.get(`/cotizaciones/${cotizacionId}`).then(r => {
        const c = r.data;
        if (c.estado !== 'borrador') { setError('Solo se puede editar una cotización en borrador.'); setCargando(false); return; }
        setNegocioIdReal(c.negocio_id);
        setTitulo(c.titulo || ''); setDescuento(c.descuento_pct); setIva(c.iva_pct);
        setValidez(c.validez_dias); setCondiciones(c.condiciones || '');
        setItems(c.items.map(it => ({
          producto_id: it.producto_id, descripcion: it.descripcion || it.producto_nombre,
          cantidad: it.cantidad, precio_unitario: it.precio_unitario,
          mostrar_imagen: it.mostrar_imagen !== false, mostrar_descripcion: it.mostrar_descripcion !== false,
          mostrar_ficha: it.mostrar_ficha !== false,
          producto_meta: it.producto_id
            ? {
                sku: it.sku, marca: it.marca, categoria: it.categoria, url_imagen: it.url_imagen,
                descripcion_completa: it.descripcion_completa, ficha_tecnica_url: it.ficha_tecnica_url,
              }
            : null,
        })));
        api.get(`/negocios/${c.negocio_id}`).then(rn => setNegocio(rn.data)).finally(() => setCargando(false));
      }).catch(() => { setError('No se pudo cargar la cotización.'); setCargando(false); });
    } else if (modoNegocioNuevo) {
      api.get(`/contactos/${contactoIdNuevo}`).then(r => {
        const c = r.data;
        setNegocio({ contacto_nombre: c.nombre, contacto_apellido: c.apellido, empresa_nombre: c.empresa_nombre });
        setCargando(false);
      }).catch(() => { setError('No se pudo cargar el contacto.'); setCargando(false); });
    } else {
      api.get(`/negocios/${negocioId}`).then(r => { setNegocio(r.data); setCargando(false); })
        .catch(() => { setError('No se pudo cargar el negocio.'); setCargando(false); });
    }
  }, [negocioId, cotizacionId, modoEdicion, modoNegocioNuevo, contactoIdNuevo]);

  const agregarProducto = (i, p) => {
    setItems(is => is.map((it, idx) => idx === i ? {
      ...it, producto_id: p.id, descripcion: p.nombre, precio_unitario: Number(p.precio_lista) || 0,
      producto_meta: {
        sku: p.sku, marca: p.marca, categoria: p.categoria, url_imagen: p.url_imagen,
        descripcion_completa: p.descripcion_completa, ficha_tecnica_url: p.ficha_tecnica_url,
      },
    } : it));
  };
  const agregarLibre = () => setItems(is => [...is, {
    producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0,
    mostrar_imagen: true, mostrar_descripcion: true, mostrar_ficha: true, producto_meta: null,
  }]);
  const setItem = (i, campo, val) => setItems(is => is.map((it, idx) => idx === i ? { ...it, [campo]: val } : it));
  const quitar = i => setItems(is => is.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, it) => s + Number(it.cantidad || 0) * Number(it.precio_unitario || 0), 0);
  const descMonto = Math.round(subtotal * (Number(descuento) || 0) / 100);
  const neto = subtotal - descMonto;
  const ivaMonto = Math.round(neto * (Number(iva) || 0) / 100);
  const total = neto + ivaMonto;

  const guardar = async () => {
    setError('');
    if (items.length === 0) { setError('Agrega al menos un ítem.'); return; }
    try {
      let negocioDestino = negocioIdReal;
      if (modoNegocioNuevo) {
        const tituloNegocio = titulo.trim() ||
          `Cotización para ${negocio.empresa_nombre || `${negocio.contacto_nombre} ${negocio.contacto_apellido || ''}`.trim()}`;
        const { data: nuevoNegocio } = await api.post('/negocios', {
          contacto_id: Number(contactoIdNuevo), titulo: tituloNegocio,
          monto_estimado: total, fecha_cierre_estimada: fechaCierreEstimada || null,
        });
        negocioDestino = nuevoNegocio.id;
      }

      const payload = {
        negocio_id: negocioDestino, descuento_pct: Number(descuento) || 0, iva_pct: Number(iva) || 0,
        validez_dias: Number(validez) || 15, condiciones, titulo,
        items: items.map(it => ({
          producto_id: it.producto_id, descripcion: it.descripcion, cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario),
          mostrar_imagen: it.mostrar_imagen !== false, mostrar_descripcion: it.mostrar_descripcion !== false,
          mostrar_ficha: it.mostrar_ficha !== false,
        })),
      };
      if (modoEdicion) {
        await api.put(`/cotizaciones/${cotizacionId}`, payload);
        navigate(`/cotizaciones/${cotizacionId}`);
      } else {
        const { data } = await api.post('/cotizaciones', payload);
        navigate(`/cotizaciones/${data.id}`);
      }
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar la cotización.'); }
  };

  if (cargando) return <div className="p-6 text-gray-400">Cargando…</div>;
  if (error && !negocio) return <div className="p-6 text-red-600">{error}</div>;
  if (!negocio) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <Link to={modoEdicion ? `/cotizaciones/${cotizacionId}` : modoNegocioNuevo ? '/cotizaciones' : `/negocios/${negocioId}`} className="text-sm text-ht-accent hover:underline">
        ← {modoEdicion ? 'Volver a la cotización' : modoNegocioNuevo ? 'Cotizaciones' : negocio.titulo}
      </Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-1">{modoEdicion ? 'Editar cotización' : 'Nueva cotización'}</h1>
      <p className="text-gray-500 text-sm mb-1">{negocio.contacto_nombre} {negocio.contacto_apellido} {negocio.empresa_nombre ? `· ${negocio.empresa_nombre}` : ''}</p>
      {modoNegocioNuevo && <p className="text-xs text-gray-400 mb-6">El negocio se creará automáticamente al guardar, con los datos de esta cotización.</p>}
      {!modoNegocioNuevo && <div className="mb-6" />}

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <div className="mb-4">
          <label className="block text-sm text-gray-700 mb-1">Título / descripción general</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Sistema hidroneumático Edificio Energy Lord Cochrane"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>

        {modoNegocioNuevo && (
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">Fecha estimada de cierre del negocio</label>
            <input type="date" value={fechaCierreEstimada} onChange={e => setFechaCierreEstimada(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            <p className="text-xs text-gray-400 mt-1">Por defecto, una semana desde hoy. Puedes ajustarla.</p>
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <select value={categoria} onChange={e => setCategoria(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Categoría (filtro)</option>
            {facetas.categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={marca} onChange={e => setMarca(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            <option value="">Marca (filtro)</option>
            {facetas.marcas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <table className="w-full text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 font-medium">Descripción</th>
              <th className="text-right py-1 font-medium w-20">Cant.</th>
              <th className="text-right py-1 font-medium w-32">P. unitario</th>
              <th className="text-right py-1 font-medium w-28">Total</th>
              <th className="text-center py-1 font-medium w-16">Imagen</th>
              <th className="text-center py-1 font-medium w-16">Descripción completa</th>
              <th className="text-center py-1 font-medium w-16">Ficha técnica</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-gray-100 align-top">
                <td className="py-2 pr-2">
                  <BuscadorProducto value={it.descripcion} onChange={val => setItem(i, 'descripcion', val)}
                    onElegir={p => agregarProducto(i, p)} categoria={categoria} marca={marca} />
                  {it.producto_meta && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {it.producto_meta.url_imagen && <img src={it.producto_meta.url_imagen} alt="" className="h-6 w-6 object-contain" />}
                      <span>{it.producto_meta.sku}{it.producto_meta.marca ? ` · ${it.producto_meta.marca}` : ''}</span>
                    </div>
                  )}
                </td>
                <td className="py-2">
                  <input type="number" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                </td>
                <td className="py-2 pl-2">
                  <input type="number" value={it.precio_unitario} onChange={e => setItem(i, 'precio_unitario', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                </td>
                <td className="py-2 text-right text-ht-navy">{money(Number(it.cantidad || 0) * Number(it.precio_unitario || 0))}</td>
                <td className="py-2 text-center">
                  {(() => {
                    const tieneImagen = !!(it.producto_id && it.producto_meta?.url_imagen);
                    return (
                      <input type="checkbox" checked={tieneImagen && it.mostrar_imagen !== false}
                        disabled={!tieneImagen}
                        onChange={e => setItem(i, 'mostrar_imagen', e.target.checked)}
                        title={tieneImagen ? 'Incluir la imagen del producto en el PDF y la vista del cliente' : 'Sin efecto: la línea no tiene producto o imagen cargada'} />
                    );
                  })()}
                </td>
                <td className="py-2 text-center">
                  {(() => {
                    const tieneDescripcion = !!(it.producto_id && it.producto_meta?.descripcion_completa);
                    return (
                      <input type="checkbox" checked={tieneDescripcion && it.mostrar_descripcion !== false}
                        disabled={!tieneDescripcion}
                        onChange={e => setItem(i, 'mostrar_descripcion', e.target.checked)}
                        title={tieneDescripcion ? 'Incluir la descripción completa del producto en el PDF y la vista del cliente' : 'Sin efecto: la línea no tiene producto o descripción cargada'} />
                    );
                  })()}
                </td>
                <td className="py-2 text-center">
                  {(() => {
                    const tieneFicha = !!(it.producto_id && it.producto_meta?.ficha_tecnica_url);
                    return (
                      <input type="checkbox" checked={tieneFicha && it.mostrar_ficha !== false}
                        disabled={!tieneFicha}
                        onChange={e => setItem(i, 'mostrar_ficha', e.target.checked)}
                        title={tieneFicha ? 'Incluir el link de la ficha técnica en el PDF y la vista del cliente' : 'Sin efecto: la línea no tiene producto o ficha cargada'} />
                    );
                  })()}
                </td>
                <td className="py-2 text-right"><button onClick={() => quitar(i)} className="text-red-400 hover:text-red-600">✕</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-gray-400">Agrega una línea y busca el producto en el maestro.</td></tr>}
          </tbody>
        </table>
        <button onClick={agregarLibre} className="mt-2 text-sm text-ht-accent hover:underline">+ Agregar línea</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-32">Descuento (%)</label>
            <input type="number" min="0" max="100" value={descuento} onChange={e => setDescuento(e.target.value)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            {Number(descuento) > 10 && <span className="text-xs text-amber-600">requiere aprobación admin</span>}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-32">IVA (%)</label>
            <input type="number" min="0" max="100" value={iva} onChange={e => setIva(e.target.value)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-32">Validez (días)</label>
            <input type="number" value={validez} onChange={e => setValidez(e.target.value)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Condiciones comerciales</label>
            <textarea value={condiciones} onChange={e => setCondiciones(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Subtotal neto</span><span>{money(subtotal)}</span></div>
          {Number(descuento) > 0 && <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Descuento ({descuento}%)</span><span>−{money(descMonto)}</span></div>}
          {Number(iva) > 0 && <div className="flex justify-between text-sm text-gray-600 mb-1"><span>IVA ({iva}%)</span><span>{money(ivaMonto)}</span></div>}
          <div className="flex justify-between text-lg font-bold text-ht-navy border-t border-gray-200 pt-2 mt-2"><span>Total</span><span>{money(total)}</span></div>
          <button onClick={guardar} className="w-full mt-4 bg-ht-navy text-white py-2 rounded text-sm font-medium hover:bg-ht-navy/90">
            {modoEdicion ? 'Guardar cambios' : 'Crear cotización'}
          </button>
        </div>
      </div>
    </div>
  );
}
