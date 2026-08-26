import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../../api';

const money = v => '$' + Number(v || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const moneyUF = v => 'UF ' + Number(v || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const TIPOS_PLANTILLA = [
  { value: 'ninguna', label: 'Ninguna (solo PDF de ítems)' },
  { value: 'simple_suministro', label: 'Simple Suministro' },
  { value: 'estandar_suministro_montaje', label: 'Estándar Suministro y Montaje' },
  { value: 'llave_en_mano_regulado', label: 'Llave en Mano Regulado' },
  { value: 'lavado_sanitizacion', label: 'Lavado y Sanitización de Estanques' },
];

export default function NuevaCotizacion() {
  const { negocioId, cotizacionId } = useParams();
  const [searchParams] = useSearchParams();
  const contactoIdNuevo = searchParams.get('contacto_id');
  const productosPreseleccionados = searchParams.get('productos');
  const modoEdicion = !!cotizacionId;
  // Un negocio solo puede tener un hilo de cotización (26-08-2026, ver nota
  // de cambio): crear una cotización SIEMPRE crea su propio negocio nuevo,
  // nunca se cuelga de uno existente — evita que dos cotizaciones
  // independientes terminen compartiendo etapa/resultado sin que nadie lo
  // haya elegido a propósito. negocioId en la URL, cuando viene, es solo el
  // origen del contacto para precargar los datos (ej. desde la ficha de un
  // negocio ya cotizado) — nunca el destino.
  const modoNegocioNuevo = !modoEdicion;
  // Autoguardado de borrador (HT-AP-03 nota v1.25): una sesión larga
  // armando una cotización se pierde por completo si algo interrumpe la
  // página (sesión expirada, refresh, cierre accidental) antes de apretar
  // "Guardar" — no había ninguna persistencia local. La key identifica la
  // cotización en curso: editar una existente, o crear una nueva (a partir
  // de un contacto, o del contacto de un negocio ya existente).
  const borradorKey = modoEdicion
    ? `cotizacion_borrador_editar_${cotizacionId}`
    : contactoIdNuevo
    ? `cotizacion_borrador_negocio_nuevo_${contactoIdNuevo}`
    : `cotizacion_borrador_negocio_${negocioId}`;
  const restauradoRef = useRef(false);
  const [listoAutoguardar, setListoAutoguardar] = useState(false);
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

  // --- Cotizador Operaciones (HT-AP-03 nota v1.18) ---
  const [origen, setOrigen] = useState('venta_directa');
  // Moneda (nota v1.27 §1): 'UF' no tiene buscador de catálogo (el maestro
  // solo tiene precio en CLP) — los ítems se escriben a mano. Al cambiar a
  // UF se limpia cualquier producto_id ya cargado, para no dejar una línea
  // "de catálogo" con precio tecleado en otra unidad.
  const [moneda, setMoneda] = useState('CLP');
  const cambiarMoneda = m => {
    setMoneda(m);
    if (m === 'UF') setItems(is => is.map(it => ({ ...it, producto_id: null, producto_meta: null })));
  };
  const [fracttalTexto, setFracttalTexto] = useState('');
  const [fracttalPreview, setFracttalPreview] = useState(null);
  const [fracttalError, setFracttalError] = useState('');
  const [fracttalNumero, setFracttalNumero] = useState('');
  const [hallazgo, setHallazgo] = useState('');
  const [justificacionTecnica, setJustificacionTecnica] = useState('');
  const [modalidadPrecio, setModalidadPrecio] = useState('desglosado');
  const [comunas, setComunas] = useState([]);
  const [comunaId, setComunaId] = useState('');
  const [formasPago, setFormasPago] = useState([]);
  const [formaPagoId, setFormaPagoId] = useState('');
  const [horasNormales, setHorasNormales] = useState(0);
  const [horasExtra, setHorasExtra] = useState(0);
  const [tipoPlantilla, setTipoPlantilla] = useState('ninguna');
  const [plantillasDefaults, setPlantillasDefaults] = useState({});
  const [objetoPropuesta, setObjetoPropuesta] = useState('');
  const [alcancesTexto, setAlcancesTexto] = useState('');
  const [exclusionesTexto, setExclusionesTexto] = useState('');
  const [condicionesEjecucionTexto, setCondicionesEjecucionTexto] = useState('');
  const [otrasConsideracionesTexto, setOtrasConsideracionesTexto] = useState('');

  useEffect(() => { api.get('/productos/facetas').then(r => setFacetas(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get('/config/comunas-operaciones').then(r => setComunas(r.data.filter(c => c.activo))).catch(() => {}); }, []);
  useEffect(() => { api.get('/config/formas-pago').then(r => setFormasPago(r.data.filter(f => f.activo))).catch(() => {}); }, []);
  useEffect(() => { api.get('/cotizaciones/plantillas-defaults').then(r => setPlantillasDefaults(r.data)).catch(() => {}); }, []);

  // Al elegir una plantilla, precarga sus textos por defecto — solo si el
  // operador todavía no escribió nada (no pisa lo ya editado).
  const elegirPlantilla = (tipo) => {
    setTipoPlantilla(tipo);
    const d = plantillasDefaults[tipo];
    if (!d) return;
    if (!objetoPropuesta.trim()) setObjetoPropuesta(d.objeto_propuesta);
    if (!alcancesTexto.trim()) setAlcancesTexto(d.alcances_texto);
    if (!exclusionesTexto.trim()) setExclusionesTexto(d.exclusiones_texto);
    if (!condicionesEjecucionTexto.trim()) setCondicionesEjecucionTexto(d.condiciones_ejecucion_texto);
    if (!otrasConsideracionesTexto.trim()) setOtrasConsideracionesTexto(d.otras_consideraciones_texto);
  };

  const extraerFracttal = async () => {
    setFracttalError(''); setFracttalPreview(null);
    if (!fracttalTexto.trim()) { setFracttalError('Pega el correo de Fracttal primero.'); return; }
    try {
      const { data } = await api.post('/cotizaciones/parse-fracttal', { texto: fracttalTexto });
      setFracttalPreview(data);
    } catch (err) { setFracttalError(err.response?.data?.error || 'No se pudo extraer los datos.'); }
  };
  const aplicarFracttal = () => {
    if (!fracttalPreview) return;
    const d = fracttalPreview;
    setFracttalNumero(d.num || '');
    if (d.hallazgo) setHallazgo(d.hallazgo);
    if (d.labor?.horas) setHorasNormales(Number(d.labor.horas) || 0);
    if (d.items?.length) {
      setItems(d.items.map(it => ({
        producto_id: it.producto_id, descripcion: it.descripcion, cantidad: it.cantidad,
        precio_unitario: it.precio_unitario, factor: 1,
        mostrar_imagen: true, mostrar_descripcion: true, mostrar_ficha: true,
        producto_meta: it.producto_id ? { sku: null, marca: null } : null,
      })));
    }
    setFracttalPreview(null); setFracttalTexto('');
  };

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
          cantidad: it.cantidad, precio_unitario: it.precio_unitario, factor: it.factor ?? 1,
          mostrar_imagen: it.mostrar_imagen !== false, mostrar_descripcion: it.mostrar_descripcion !== false,
          mostrar_ficha: it.mostrar_ficha !== false,
          producto_meta: it.producto_id
            ? {
                sku: it.sku, marca: it.marca, categoria: it.categoria, url_imagen: it.url_imagen,
                descripcion_completa: it.descripcion_completa, ficha_tecnica_url: it.ficha_tecnica_url,
              }
            : null,
        })));
        setOrigen(c.origen || 'venta_directa');
        setMoneda(c.moneda || 'CLP');
        setFracttalNumero(c.fracttal_numero || '');
        setHallazgo(c.hallazgo || ''); setJustificacionTecnica(c.justificacion_tecnica || '');
        setModalidadPrecio(c.modalidad_precio || 'desglosado');
        setComunaId(c.comuna_id || ''); setHorasNormales(c.horas_normales || 0); setHorasExtra(c.horas_extra || 0);
        setFormaPagoId(c.forma_pago_id || '');
        setTipoPlantilla(c.tipo_plantilla || 'ninguna');
        setObjetoPropuesta(c.objeto_propuesta || ''); setAlcancesTexto(c.alcances_texto || '');
        setExclusionesTexto(c.exclusiones_texto || ''); setCondicionesEjecucionTexto(c.condiciones_ejecucion_texto || '');
        setOtrasConsideracionesTexto(c.otras_consideraciones_texto || '');
        api.get(`/negocios/${c.negocio_id}`).then(rn => setNegocio(rn.data)).finally(() => setCargando(false));
      }).catch(() => { setError('No se pudo cargar la cotización.'); setCargando(false); });
    } else {
      const cargarDatosContacto = c => setNegocio({
        contacto_id: c.id, contacto_nombre: c.nombre, contacto_apellido: c.apellido,
        contacto_email: c.email, contacto_telefono: c.telefono_e164, empresa_nombre: c.empresa_nombre,
      });
      if (contactoIdNuevo) {
        api.get(`/contactos/${contactoIdNuevo}`).then(r => { cargarDatosContacto(r.data); setCargando(false); })
          .catch(() => { setError('No se pudo cargar el contacto.'); setCargando(false); });
      } else {
        // Origen = un negocio ya existente: se usa solo para saber de qué
        // contacto se trata, nunca como destino de la cotización.
        api.get(`/negocios/${negocioId}`)
          .then(rn => api.get(`/contactos/${rn.data.contacto_id}`))
          .then(r => { cargarDatosContacto(r.data); setCargando(false); })
          .catch(() => { setError('No se pudo cargar el negocio.'); setCargando(false); });
      }
    }
  }, [negocioId, cotizacionId, modoEdicion, contactoIdNuevo]);

  // Al terminar de cargar los datos del servidor, si hay un borrador local
  // más reciente lo ofrece recuperar (sobrescribiendo lo recién cargado,
  // solo si el usuario confirma). Corre una sola vez por montaje.
  useEffect(() => {
    if (cargando || restauradoRef.current) return;
    restauradoRef.current = true;
    try {
      const raw = localStorage.getItem(borradorKey);
      if (raw) {
        const { guardadoEn, datos } = JSON.parse(raw);
        const fecha = new Date(guardadoEn).toLocaleString('es-CL');
        if (window.confirm(`Se encontró un borrador sin guardar de esta cotización (${fecha}). ¿Quieres recuperarlo?`)) {
          setTitulo(datos.titulo ?? '');
          setFechaCierreEstimada(datos.fechaCierreEstimada ?? enUnaSemana());
          setItems(datos.items ?? []);
          setDescuento(datos.descuento ?? 0);
          setIva(datos.iva ?? 19);
          setValidez(datos.validez ?? 15);
          setCondiciones(datos.condiciones ?? '');
          setCategoria(datos.categoria ?? '');
          setMarca(datos.marca ?? '');
          setOrigen(datos.origen ?? 'venta_directa');
          setMoneda(datos.moneda ?? 'CLP');
          setFracttalNumero(datos.fracttalNumero ?? '');
          setHallazgo(datos.hallazgo ?? '');
          setJustificacionTecnica(datos.justificacionTecnica ?? '');
          setModalidadPrecio(datos.modalidadPrecio ?? 'desglosado');
          setComunaId(datos.comunaId ?? '');
          setFormaPagoId(datos.formaPagoId ?? '');
          setHorasNormales(datos.horasNormales ?? 0);
          setHorasExtra(datos.horasExtra ?? 0);
          setTipoPlantilla(datos.tipoPlantilla ?? 'ninguna');
          setObjetoPropuesta(datos.objetoPropuesta ?? '');
          setAlcancesTexto(datos.alcancesTexto ?? '');
          setExclusionesTexto(datos.exclusionesTexto ?? '');
          setCondicionesEjecucionTexto(datos.condicionesEjecucionTexto ?? '');
          setOtrasConsideracionesTexto(datos.otrasConsideracionesTexto ?? '');
        } else {
          localStorage.removeItem(borradorKey);
        }
      }
    } catch { localStorage.removeItem(borradorKey); }
    setListoAutoguardar(true);
  }, [cargando, borradorKey]);

  // Autoguardado: cada cambio relevante se persiste en localStorage (con
  // un pequeño debounce) hasta que la cotización se guarde de verdad en el
  // servidor. Recién arranca después de la restauración de arriba, para no
  // sobrescribir un borrador guardado con los datos apenas cargados del
  // servidor.
  useEffect(() => {
    if (!listoAutoguardar) return;
    const id = setTimeout(() => {
      localStorage.setItem(borradorKey, JSON.stringify({
        guardadoEn: Date.now(),
        datos: {
          titulo, fechaCierreEstimada, items, descuento, iva, validez, condiciones, categoria, marca, origen, moneda,
          fracttalNumero, hallazgo, justificacionTecnica, modalidadPrecio, comunaId, formaPagoId,
          horasNormales, horasExtra, tipoPlantilla, objetoPropuesta, alcancesTexto, exclusionesTexto,
          condicionesEjecucionTexto, otrasConsideracionesTexto,
        },
      }));
    }, 800);
    return () => clearTimeout(id);
  }, [
    listoAutoguardar, borradorKey, titulo, fechaCierreEstimada, items, descuento, iva, validez, condiciones,
    categoria, marca, origen, moneda, fracttalNumero, hallazgo, justificacionTecnica, modalidadPrecio, comunaId,
    formaPagoId, horasNormales, horasExtra, tipoPlantilla, objetoPropuesta, alcancesTexto, exclusionesTexto,
    condicionesEjecucionTexto, otrasConsideracionesTexto,
  ]);

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
    producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0, factor: 1,
    mostrar_imagen: true, mostrar_descripcion: true, mostrar_ficha: true, producto_meta: null,
  }]);
  const setItem = (i, campo, val) => setItems(is => is.map((it, idx) => idx === i ? { ...it, [campo]: val } : it));
  const quitar = i => setItems(is => is.filter((_, idx) => idx !== i));

  const esOperaciones = origen === 'operaciones';
  const esUF = moneda === 'UF';
  const moneyCot = esUF ? moneyUF : money;
  const redondear = v => (esUF ? Math.round(v * 100) / 100 : Math.round(v));
  // El total de Operaciones incluye markup + mano de obra (services/operacionesCalculo.js):
  // este cálculo simple de Ventas Directas no aplica, se muestra el resultado real recién al guardar.
  const subtotal = items.reduce((s, it) => s + Number(it.cantidad || 0) * Number(it.precio_unitario || 0) * Number(it.factor ?? 1), 0);
  const descMonto = redondear(subtotal * (Number(descuento) || 0) / 100);
  const neto = subtotal - descMonto;
  const ivaMonto = redondear(neto * (Number(iva) || 0) / 100);
  const total = neto + ivaMonto;

  const guardar = async () => {
    setError('');
    if (items.length === 0) { setError('Agrega al menos un ítem.'); return; }
    try {
      let negocioDestino = negocioIdReal;
      if (modoNegocioNuevo) {
        const tituloNegocio = titulo.trim() ||
          `Cotización para ${negocio.empresa_nombre || `${negocio.contacto_nombre} ${negocio.contacto_apellido || ''}`.trim()}`;
        // En UF, "neto" está en UF, no en CLP — no sirve como monto_estimado
        // (que es siempre CLP). Se deja sin estimar; la propia cotización lo
        // fija segundos después, ya convertido, vía sincronizarMontoEstimado.
        const { data: nuevoNegocio } = await api.post('/negocios', {
          contacto_id: Number(negocio.contacto_id), titulo: tituloNegocio,
          monto_estimado: esUF ? null : neto, fecha_cierre_estimada: fechaCierreEstimada || null,
        });
        negocioDestino = nuevoNegocio.id;
      }

      const payload = {
        negocio_id: negocioDestino, descuento_pct: Number(descuento) || 0, iva_pct: Number(iva) || 0,
        validez_dias: Number(validez) || 15, condiciones, titulo,
        origen, moneda,
        fracttal_numero: fracttalNumero || null,
        hallazgo: hallazgo || null, justificacion_tecnica: justificacionTecnica || null,
        modalidad_precio: modalidadPrecio, comuna_id: comunaId || null, forma_pago_id: formaPagoId || null,
        horas_normales: Number(horasNormales) || 0, horas_extra: Number(horasExtra) || 0,
        tipo_plantilla: tipoPlantilla,
        objeto_propuesta: objetoPropuesta || null, alcances_texto: alcancesTexto || null,
        exclusiones_texto: exclusionesTexto || null, condiciones_ejecucion_texto: condicionesEjecucionTexto || null,
        otras_consideraciones_texto: otrasConsideracionesTexto || null,
        items: items.map(it => ({
          producto_id: it.producto_id, descripcion: it.descripcion, cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario), factor: Number(it.factor ?? 1),
          mostrar_imagen: it.mostrar_imagen !== false, mostrar_descripcion: it.mostrar_descripcion !== false,
          mostrar_ficha: it.mostrar_ficha !== false,
        })),
      };
      if (modoEdicion) {
        await api.put(`/cotizaciones/${cotizacionId}`, payload);
        localStorage.removeItem(borradorKey);
        navigate(`/cotizaciones/${cotizacionId}`);
      } else {
        const { data } = await api.post('/cotizaciones', payload);
        localStorage.removeItem(borradorKey);
        navigate(`/cotizaciones/${data.id}`);
      }
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar la cotización.'); }
  };

  if (cargando) return <div className="p-6 text-gray-400">Cargando…</div>;
  if (error && !negocio) return <div className="p-6 text-red-600">{error}</div>;
  if (!negocio) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <Link to={modoEdicion ? `/cotizaciones/${cotizacionId}` : '/cotizaciones'} className="text-sm text-ht-accent hover:underline">
        ← {modoEdicion ? 'Volver a la cotización' : 'Cotizaciones'}
      </Link>
      <h1 className="text-2xl font-bold text-ht-navy mt-2 mb-1">{modoEdicion ? 'Editar cotización' : 'Nueva cotización'}</h1>
      <p className="text-gray-500 text-sm mb-1">{negocio.contacto_nombre} {negocio.contacto_apellido}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 mb-1">
        <span>Tel: {negocio.contacto_telefono || '—'}</span>
        <span>Correo: {negocio.contacto_email || '—'}</span>
        <span>Empresa: {negocio.empresa_nombre || '—'}</span>
        {negocio.contacto_id && (
          <Link to={`/contactos/${negocio.contacto_id}`} target="_blank" rel="noopener" className="text-ht-accent hover:underline">
            Editar contacto ↗
          </Link>
        )}
      </div>
      {modoNegocioNuevo && <p className="text-xs text-gray-400 mb-6">El negocio se creará automáticamente al guardar, con los datos de esta cotización.</p>}
      {!modoNegocioNuevo && <div className="mb-6" />}

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <div className="mb-4">
          <label className="block text-sm text-gray-700 mb-1">Título / descripción general</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Sistema hidroneumático Edificio Energy Lord Cochrane"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
        </div>

        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm text-gray-700">Origen</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOrigen('venta_directa')}
              className={`px-3 py-1.5 rounded text-sm font-medium border ${!esOperaciones ? 'bg-ht-navy text-white border-ht-navy' : 'border-gray-300 text-gray-600'}`}>
              Ventas Directas
            </button>
            <button type="button" onClick={() => setOrigen('operaciones')}
              className={`px-3 py-1.5 rounded text-sm font-medium border ${esOperaciones ? 'bg-ht-navy text-white border-ht-navy' : 'border-gray-300 text-gray-600'}`}>
              Operaciones
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm text-gray-700">Moneda</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => cambiarMoneda('CLP')}
              className={`px-3 py-1.5 rounded text-sm font-medium border ${!esUF ? 'bg-ht-navy text-white border-ht-navy' : 'border-gray-300 text-gray-600'}`}>
              CLP
            </button>
            <button type="button" onClick={() => cambiarMoneda('UF')}
              className={`px-3 py-1.5 rounded text-sm font-medium border ${esUF ? 'bg-ht-navy text-white border-ht-navy' : 'border-gray-300 text-gray-600'}`}>
              UF
            </button>
          </div>
          {esUF && <span className="text-xs text-gray-500">El cliente ve todo en UF, sin equivalencia en pesos. Sin buscador de catálogo: los ítems se escriben a mano.</span>}
        </div>

        {esOperaciones && (
          <div className="mb-4 border border-dashed border-ht-accent rounded-lg p-4 bg-[#F0F7F7] space-y-3">
            <div>
              <div className="text-sm font-semibold text-ht-navy mb-1">Importar desde Fracttal</div>
              <p className="text-xs text-gray-500 mb-2">Pega el correo de la solicitud y los datos se extraen automáticamente.</p>
              <textarea value={fracttalTexto} onChange={e => setFracttalTexto(e.target.value)} rows={4}
                placeholder="Pega aquí el correo de Fracttal…"
                className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              <div className="flex items-center gap-2 mt-2">
                <button type="button" onClick={extraerFracttal} className="bg-ht-navy text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-ht-navy/90">Extraer datos</button>
                {fracttalError && <span className="text-xs text-red-600">{fracttalError}</span>}
              </div>
              {fracttalPreview && (
                <div className="mt-3 bg-white border border-gray-200 rounded p-3 text-sm">
                  <p><strong>N° solicitud:</strong> {fracttalPreview.num || '—'} · <strong>Cliente:</strong> {fracttalPreview.cliente || '—'}</p>
                  {fracttalPreview.hallazgo && <p className="italic text-gray-600 mt-1">"{fracttalPreview.hallazgo}"</p>}
                  <p className="mt-1">{fracttalPreview.items?.length || 0} ítems detectados ({fracttalPreview.items?.filter(i => i.producto_id).length || 0} con precio en el maestro)</p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={aplicarFracttal} className="bg-ht-accent text-ht-navy px-3 py-1 rounded text-xs font-medium hover:bg-ht-accent/90">Aplicar al formulario</button>
                    <button type="button" onClick={() => setFracttalPreview(null)} className="border border-gray-300 text-gray-600 px-3 py-1 rounded text-xs">Cancelar</button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hallazgo (va entre comillas en el correo)</label>
                <input value={hallazgo} onChange={e => setHallazgo(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">N° solicitud Fracttal</label>
                <input value={fracttalNumero} onChange={e => setFracttalNumero(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Justificación técnica / observaciones</label>
                <textarea value={justificacionTecnica} onChange={e => setJustificacionTecnica(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Modalidad de precio</label>
              <button type="button" onClick={() => setModalidadPrecio('desglosado')}
                className={`px-3 py-1 rounded text-xs font-medium border ${modalidadPrecio === 'desglosado' ? 'bg-ht-navy text-white border-ht-navy' : 'border-gray-300 text-gray-600'}`}>Con desglose</button>
              <button type="button" onClick={() => setModalidadPrecio('alzada')}
                className={`px-3 py-1 rounded text-xs font-medium border ${modalidadPrecio === 'alzada' ? 'bg-ht-navy text-white border-ht-navy' : 'border-gray-300 text-gray-600'}`}>Suma alzada</button>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Comuna</label>
                <select value={comunaId} onChange={e => setComunaId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
                  <option value="">— Sin visita a terreno —</option>
                  {comunas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">HH normales</label>
                <input type="number" min="0" value={horasNormales} onChange={e => setHorasNormales(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">HH fuera de horario (×1.5)</label>
                <input type="number" min="0" value={horasExtra} onChange={e => setHorasExtra(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              </div>
            </div>
            <p className="text-xs text-gray-500">Sin horas ni comuna, no se cobra mano de obra ni traslado. El subtotal y total reales (con markup y MO) se calculan al guardar.</p>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm text-gray-700 mb-1">Plantilla de propuesta (Word)</label>
          <select value={tipoPlantilla} onChange={e => elegirPlantilla(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
            {TIPOS_PLANTILLA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {tipoPlantilla !== 'ninguna' && (
          <div className="mb-4 space-y-3 border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">Estos textos se usan al descargar el Word de la propuesta. Parten con el texto tipo de la plantilla — edítalos para el proyecto específico.</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Objeto de la propuesta</label>
              <textarea value={objetoPropuesta} onChange={e => setObjetoPropuesta(e.target.value)} rows={2}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alcances</label>
              <textarea value={alcancesTexto} onChange={e => setAlcancesTexto(e.target.value)} rows={4}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Exclusiones</label>
              <textarea value={exclusionesTexto} onChange={e => setExclusionesTexto(e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Condiciones de ejecución</label>
              <textarea value={condicionesEjecucionTexto} onChange={e => setCondicionesEjecucionTexto(e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Otras consideraciones</label>
              <textarea value={otrasConsideracionesTexto} onChange={e => setOtrasConsideracionesTexto(e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            </div>
          </div>
        )}

        {modoNegocioNuevo && (
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">Fecha estimada de cierre del negocio</label>
            <input type="date" value={fechaCierreEstimada} onChange={e => setFechaCierreEstimada(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
            <p className="text-xs text-gray-400 mt-1">Por defecto, una semana desde hoy. Puedes ajustarla.</p>
          </div>
        )}

        {!esUF && (
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
        )}

        <table className="w-full text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left py-1 font-medium">Descripción</th>
              <th className="text-right py-1 font-medium w-20">Cant.</th>
              <th className="text-right py-1 font-medium w-32">P. unitario {esUF && '(UF)'}</th>
              {esOperaciones && <th className="text-right py-1 font-medium w-20">Factor</th>}
              <th className="text-right py-1 font-medium w-28">Total</th>
              <th className="text-center py-1 font-medium w-16">Imagen</th>
              <th className="text-center py-1 font-medium w-16">Descripción completa</th>
              <th className="text-center py-1 font-medium w-16">Ficha técnica</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-gray-100 align-top hover:bg-gray-50">
                <td className="py-2 pr-2">
                  {esUF ? (
                    <input value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)}
                      placeholder="Descripción del ítem…"
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                  ) : (
                    <>
                      <BuscadorProducto value={it.descripcion} onChange={val => setItem(i, 'descripcion', val)}
                        onElegir={p => agregarProducto(i, p)} categoria={categoria} marca={marca} />
                      {it.producto_meta && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          {it.producto_meta.url_imagen && <img src={it.producto_meta.url_imagen} alt="" className="h-6 w-6 object-contain" />}
                          <span>{it.producto_meta.sku}{it.producto_meta.marca ? ` · ${it.producto_meta.marca}` : ''}</span>
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className="py-2">
                  <input type="number" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                </td>
                <td className="py-2 pl-2">
                  <input type="number" step={esUF ? '0.01' : '1'} value={it.precio_unitario} onChange={e => setItem(i, 'precio_unitario', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                </td>
                {esOperaciones && (
                  <td className="py-2 pl-2">
                    <input type="number" step="0.05" min="0" value={it.factor ?? 1} onChange={e => setItem(i, 'factor', e.target.value)}
                      title="Multiplicador de línea (ej. 0.5 para media unidad)"
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                  </td>
                )}
                <td className="py-2 text-right text-ht-navy">{moneyCot(Number(it.cantidad || 0) * Number(it.precio_unitario || 0) * Number(it.factor ?? 1))}</td>
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
            {items.length === 0 && <tr><td colSpan={esOperaciones ? 9 : 8} className="py-4 text-center text-gray-400">Agrega una línea y busca el producto en el maestro.</td></tr>}
          </tbody>
        </table>
        <button onClick={agregarLibre} className="mt-2 text-sm text-ht-accent hover:underline">+ Agregar línea</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          {!esOperaciones && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700 w-32">Descuento (%)</label>
              <input type="number" min="0" max="100" value={descuento} onChange={e => setDescuento(e.target.value)}
                className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              {Number(descuento) > 10 && <span className="text-xs text-amber-600">requiere aprobación admin</span>}
            </div>
          )}
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
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 w-32">Forma de pago</label>
            <select value={formaPagoId} onChange={e => setFormaPagoId(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent">
              <option value="">Sin especificar</option>
              {formasPago.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Condiciones comerciales</label>
            <textarea value={condiciones} onChange={e => setCondiciones(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          {esOperaciones ? (
            <div className="text-sm text-gray-500 mb-2">
              <p>Subtotal de materiales: {moneyCot(subtotal)}</p>
              <p className="mt-1">
                El total real (materiales + elementos menores + markup + mano de obra + IVA) se calcula al guardar, con la UF del día.
                {esUF && ' El cliente lo ve en UF; internamente queda también en CLP para reportes.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Subtotal neto</span><span>{moneyCot(subtotal)}</span></div>
              {Number(descuento) > 0 && <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Descuento ({descuento}%)</span><span>−{moneyCot(descMonto)}</span></div>}
              {Number(iva) > 0 && <div className="flex justify-between text-sm text-gray-600 mb-1"><span>IVA ({iva}%)</span><span>{moneyCot(ivaMonto)}</span></div>}
              <div className="flex justify-between text-lg font-bold text-ht-navy border-t border-gray-200 pt-2 mt-2"><span>Total</span><span>{moneyCot(total)}</span></div>
            </>
          )}
          <button onClick={guardar} className="w-full mt-4 bg-ht-accent text-ht-navy py-2 rounded text-sm font-medium hover:bg-ht-accent/90">
            {modoEdicion ? 'Guardar cambios' : 'Crear cotización'}
          </button>
        </div>
      </div>
    </div>
  );
}
