import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BannerAmbiente from './BannerAmbiente';
import api from '../api';

// Beep corto generado con Web Audio (sin archivo de audio que alojar) para
// avisar de mensajes nuevos de WhatsApp sin leer.
function reproducirBeepWhatsApp() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch { /* navegador sin Web Audio, o bloqueado — se ignora */ }
}

// Búsqueda del menú Configuración: sin distinguir mayúsculas ni tildes
// (mismo criterio que el buscador de la Bandeja WhatsApp).
const DIACRITICOS = new RegExp('[̀-ͯ]', 'g');
const normalizar = s => (s || '').normalize('NFD').replace(DIACRITICOS, '').toLowerCase();

// Sidebar operativo por rol (HT-AP-03 §11). La configuración va en el engranaje.
const menuByRole = {
  administrador: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Cotizaciones', to: '/cotizaciones' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Mis Tareas', to: '/tareas' },
    { label: 'Empresas', to: '/empresas' },
    { label: 'Contactos', to: '/contactos' },
    { label: 'Productos', to: '/productos' },
    { label: 'Reportes', to: '/reportes' },
    { label: 'Postventa', to: '/postventa' },
    { label: 'Despacho', to: '/despacho' },
    { label: 'Servicio Técnico', to: '/servicio-tecnico' },
  ],
  jefe_comercial: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Cotizaciones', to: '/cotizaciones' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Mis Tareas', to: '/tareas' },
    { label: 'Empresas', to: '/empresas' },
    { label: 'Contactos', to: '/contactos' },
    { label: 'Productos', to: '/productos' },
    { label: 'Reportes', to: '/reportes' },
    { label: 'Postventa', to: '/postventa' },
    { label: 'Despacho', to: '/despacho' },
    { label: 'Servicio Técnico', to: '/servicio-tecnico' },
  ],
  vendedor: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Cotizaciones', to: '/cotizaciones' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Mis Tareas', to: '/tareas' },
    { label: 'Empresas', to: '/empresas' },
    { label: 'Contactos', to: '/contactos' },
    { label: 'Productos', to: '/productos' },
    { label: 'Reportes', to: '/reportes' },
    { label: 'Postventa', to: '/postventa' },
    { label: 'Despacho', to: '/despacho' },
    { label: 'Servicio Técnico', to: '/servicio-tecnico' },
  ],
  callcenter: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Cotizaciones', to: '/cotizaciones' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Mis Tareas', to: '/tareas' },
    { label: 'Empresas', to: '/empresas' },
    { label: 'Contactos', to: '/contactos' },
    { label: 'Servicio Técnico', to: '/servicio-tecnico' },
  ],
  gerencia: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Reportes', to: '/reportes' },
    { label: 'Servicio Técnico', to: '/servicio-tecnico' },
  ],
  // Rol dedicado: solo ve Servicio Técnico, nada más (HT-AP-03).
  tecnico: [
    { label: 'Servicio Técnico', to: '/servicio-tecnico' },
  ],
};

// Configuración por rol (menú engranaje) — agrupada por sección (14-09-2026,
// la lista había crecido a 17 ítems sueltos sin ningún orden). El orden de
// las secciones sigue al de menuByRole (Pipeline/Ventas primero, luego cada
// módulo en el orden en que aparece en el sidebar); "Empresa y sistema" al
// final agrupa lo transversal, que no pertenece a un módulo específico.
const SECCION_VENTAS = 'Pipeline y Ventas';
const SECCION_OPERACIONES = 'Operaciones';
const SECCION_WHATSAPP = 'WhatsApp';
const SECCION_POSTVENTA = 'Postventa y Servicio Técnico';
const SECCION_DESPACHO = 'Despacho';
const SECCION_EMPRESA = 'Empresa y sistema';
// Orden en que se muestran las secciones en el menú (Object.keys no lo
// garantiza de forma confiable si en algún momento se arma dinámico).
const ORDEN_SECCIONES = [
  SECCION_VENTAS, SECCION_OPERACIONES, SECCION_WHATSAPP, SECCION_POSTVENTA,
  SECCION_DESPACHO, SECCION_EMPRESA,
];

const configByRole = {
  administrador: [
    { label: 'Config pipeline', to: '/config/pipeline', seccion: SECCION_VENTAS },
    { label: 'Reglas de asignación', to: '/config/reglas-asignacion', seccion: SECCION_VENTAS },
    { label: 'Secuencias de seguimiento', to: '/config/secuencias', seccion: SECCION_VENTAS },
    { label: 'Bot de WhatsApp', to: '/config/bot-whatsapp', seccion: SECCION_WHATSAPP },
    { label: 'Datos de empresa', to: '/config/empresa', seccion: SECCION_EMPRESA },
    { label: 'Usuarios', to: '/usuarios', seccion: SECCION_EMPRESA },
  ],
  jefe_comercial: [
    { label: 'Config pipeline', to: '/config/pipeline', seccion: SECCION_VENTAS },
    { label: 'Reglas de asignación', to: '/config/reglas-asignacion', seccion: SECCION_VENTAS },
    { label: 'Secuencias de seguimiento', to: '/config/secuencias', seccion: SECCION_VENTAS },
    { label: 'Bot de WhatsApp', to: '/config/bot-whatsapp', seccion: SECCION_WHATSAPP },
    { label: 'Datos de empresa', to: '/config/empresa', seccion: SECCION_EMPRESA },
  ],
  gerencia: [],
};
// Config Postventa se agrega solo si el usuario está marcado como encargado
// (además de administrador/jefe comercial, que ya la ven de por sí).
configByRole.administrador.push({ label: 'Config Postventa', to: '/config/postventa-etapas', seccion: SECCION_POSTVENTA });
configByRole.jefe_comercial.push({ label: 'Config Postventa', to: '/config/postventa-etapas', seccion: SECCION_POSTVENTA });
configByRole.administrador.push({ label: 'Lugares frecuentes de despacho', to: '/config/lugares-despacho', seccion: SECCION_DESPACHO });
configByRole.jefe_comercial.push({ label: 'Lugares frecuentes de despacho', to: '/config/lugares-despacho', seccion: SECCION_DESPACHO });
configByRole.administrador.push({ label: 'Cotizador Operaciones', to: '/config/operaciones', seccion: SECCION_OPERACIONES });
configByRole.jefe_comercial.push({ label: 'Cotizador Operaciones', to: '/config/operaciones', seccion: SECCION_OPERACIONES });
configByRole.administrador.push({ label: 'Formas de pago', to: '/config/formas-pago', seccion: SECCION_VENTAS });
configByRole.jefe_comercial.push({ label: 'Formas de pago', to: '/config/formas-pago', seccion: SECCION_VENTAS });
configByRole.administrador.push({ label: 'Causas de no cierre', to: '/config/causas-no-cierre', seccion: SECCION_VENTAS });
configByRole.jefe_comercial.push({ label: 'Causas de no cierre', to: '/config/causas-no-cierre', seccion: SECCION_VENTAS });
configByRole.administrador.push({ label: 'Encuesta post-cierre', to: '/config/encuesta', seccion: SECCION_VENTAS });
configByRole.jefe_comercial.push({ label: 'Encuesta post-cierre', to: '/config/encuesta', seccion: SECCION_VENTAS });
configByRole.administrador.push({ label: 'Config Servicio Técnico', to: '/config/servicio-tecnico-etapas', seccion: SECCION_POSTVENTA });
configByRole.jefe_comercial.push({ label: 'Config Servicio Técnico', to: '/config/servicio-tecnico-etapas', seccion: SECCION_POSTVENTA });
configByRole.administrador.push({ label: 'Avisar novedades', to: '/config/novedades', seccion: SECCION_EMPRESA });
configByRole.jefe_comercial.push({ label: 'Avisar novedades', to: '/config/novedades', seccion: SECCION_EMPRESA });
configByRole.administrador.push({ label: 'Solicitudes de eliminación de datos', to: '/config/privacidad', seccion: SECCION_EMPRESA });
configByRole.gerencia.push({ label: 'Solicitudes de eliminación de datos', to: '/config/privacidad', seccion: SECCION_EMPRESA });

function GearIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// Íconos de línea (estilo Feather) para el menú lateral, uno por ruta.
const navIcon = props => ({ className = 'h-4 w-4 flex-shrink-0', ...rest } = {}) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {props}
  </svg>
);

const IconDashboard = navIcon(<>
  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
  <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
</>);
const IconPipeline = navIcon(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />);
const IconCotizaciones = navIcon(<>
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
</>);
const IconTareas = navIcon(<>
  <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
</>);
const IconBandeja = navIcon(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />);
const IconCola = navIcon(<>
  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
  <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
</>);
const IconEmpresas = navIcon(<>
  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
</>);
const IconContactos = navIcon(<>
  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
</>);
const IconProductos = navIcon(<>
  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z" />
  <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
</>);
const IconReportes = navIcon(<>
  <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
</>);
const IconPostventa = navIcon(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />);
const IconDespacho = navIcon(<>
  <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
  <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
</>);
const IconServicioTecnico = navIcon(<>
  <circle cx="12" cy="12" r="3" />
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
</>);

const ICONO_POR_RUTA = {
  '/dashboard': IconDashboard, '/pipeline': IconPipeline, '/cotizaciones': IconCotizaciones,
  '/tareas': IconTareas, '/bandeja': IconBandeja, '/cola': IconCola,
  '/empresas': IconEmpresas, '/contactos': IconContactos, '/productos': IconProductos, '/reportes': IconReportes,
  '/reportes/softland': IconReportes,
  '/postventa': IconPostventa, '/despacho': IconDespacho, '/servicio-tecnico': IconServicioTecnico,
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // Postventa se suma al menú aunque el rol no lo traiga por defecto (ej.
  // call center o gerencia), si el usuario tiene el atributo marcado.
  const tienePostventaEnMenu = (menuByRole[user?.rol] || []).some(i => i.to === '/postventa');
  const tieneDespachoEnMenu = (menuByRole[user?.rol] || []).some(i => i.to === '/despacho');
  const menu = [
    ...(menuByRole[user?.rol] || []),
    ...(user?.es_encargado_postventa && !tienePostventaEnMenu ? [{ label: 'Postventa', to: '/postventa' }] : []),
    ...(user?.es_encargado_despacho && !tieneDespachoEnMenu ? [{ label: 'Despacho', to: '/despacho' }] : []),
  ];
  const tieneConfigPostventa = (configByRole[user?.rol] || []).some(i => i.to === '/config/postventa-etapas');
  const tieneConfigDespacho = (configByRole[user?.rol] || []).some(i => i.to === '/config/lugares-despacho');
  const config = [
    ...(configByRole[user?.rol] || []),
    ...(user?.es_encargado_postventa && !tieneConfigPostventa ? [{ label: 'Config Postventa', to: '/config/postventa-etapas', seccion: SECCION_POSTVENTA }] : []),
    ...(user?.es_encargado_despacho && !tieneConfigDespacho ? [{ label: 'Lugares frecuentes de despacho', to: '/config/lugares-despacho', seccion: SECCION_DESPACHO }] : []),
  ];
  const [open, setOpen] = useState(false);
  const [busquedaConfig, setBusquedaConfig] = useState('');
  // Qué secciones del menú Configuración quedaron colapsadas — se recuerda
  // entre visitas (localStorage) para no tener que volver a cerrarlas cada
  // vez que se entra. Guarda solo las CERRADAS: una sección nueva que se
  // agregue después arranca abierta por default, sin tocar esta lista.
  const [seccionesCerradas, setSeccionesCerradas] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('config_secciones_cerradas') || '[]')); }
    catch { return new Set(); }
  });
  const alternarSeccion = (seccion) => {
    setSeccionesCerradas(prev => {
      const next = new Set(prev);
      next.has(seccion) ? next.delete(seccion) : next.add(seccion);
      try { localStorage.setItem('config_secciones_cerradas', JSON.stringify([...next])); } catch { /* localStorage no disponible */ }
      return next;
    });
  };
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  const [noLeidosWhatsApp, setNoLeidosWhatsApp] = useState(0);
  const ref = useRef(null);
  const noLeidosPrevRef = useRef(0);
  const primeraCargaNoLeidosRef = useRef(true);

  useEffect(() => {
    const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  // Al cerrar el menú (por cualquier vía: click afuera, Escape, navegar) no
  // queda la búsqueda escrita de la próxima vez que se abra.
  useEffect(() => { if (!open) setBusquedaConfig(''); }, [open]);

  // Contador global de conversaciones de WhatsApp sin leer — se consulta
  // periódicamente sin importar en qué pantalla del CRM esté el usuario, para
  // que el badge del menú y el aviso (sonido + notificación de escritorio) no
  // dependan de tener la Bandeja abierta.
  useEffect(() => {
    if (!user || !menu.some(m => m.to === '/bandeja')) return;
    let cancelado = false;
    const consultar = async () => {
      try {
        const { data } = await api.get('/whatsapp/no-leidos/cantidad');
        if (cancelado) return;
        const anterior = noLeidosPrevRef.current;
        setNoLeidosWhatsApp(data.cantidad);
        noLeidosPrevRef.current = data.cantidad;
        // Solo avisa cuando el conteo SUBE (mensaje nuevo), nunca al cargar la
        // página por primera vez (evita ruido con lo que ya estaba pendiente).
        if (!primeraCargaNoLeidosRef.current && data.cantidad > anterior) {
          reproducirBeepWhatsApp();
          if ('Notification' in window) {
            if (Notification.permission === 'default') Notification.requestPermission();
            if (Notification.permission === 'granted' && (document.hidden || window.location.pathname !== '/bandeja')) {
              const n = new Notification('Bandeja WhatsApp', {
                body: `Tienes ${data.cantidad} conversación${data.cantidad === 1 ? '' : 'es'} sin leer.`,
                icon: '/Hidrotecnica.jpg',
              });
              n.onclick = () => { window.focus(); window.location.href = '/bandeja'; };
            }
          }
        }
        primeraCargaNoLeidosRef.current = false;
      } catch { /* silencioso — no bloquea el resto del CRM */ }
    };
    consultar();
    const t = setInterval(consultar, 20000);
    return () => { cancelado = true; clearInterval(t); };
  }, [user]);

  // Título de la pestaña: se ve el aviso aunque el CRM esté en otra pestaña
  // o minimizado, sin depender de que la notificación de escritorio esté
  // permitida.
  useEffect(() => {
    document.title = noLeidosWhatsApp > 0 ? `(${noLeidosWhatsApp > 99 ? '99+' : noLeidosWhatsApp}) Ventas HT` : 'Ventas HT';
  }, [noLeidosWhatsApp]);

  const handleLogout = () => { logout(); navigate('/login'); };
  const go = to => { setOpen(false); navigate(to); };

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarAbierto && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSidebarAbierto(false)} />
      )}
      <aside className={`w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 md:relative md:translate-x-0 ${sidebarAbierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
          <img src="/Hidrotecnica.jpg" alt="HidroTecnica" className="h-7 object-contain" />
          <span className="text-ht-navy font-semibold text-sm">CRM</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {menu.map(item => {
            const Icon = ICONO_POR_RUTA[item.to];
            return (
              <NavLink key={item.to} to={item.to} end={item.to === '/dashboard'} onClick={() => setSidebarAbierto(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-2.5 text-sm font-medium border-l-2 transition-colors ${
                    isActive ? 'bg-ht-accent/10 border-ht-accent text-ht-navy' : 'border-transparent text-gray-600 hover:text-ht-navy hover:bg-gray-50'}`}>
                {Icon && <Icon />}
                <span className="flex-1">{item.label}</span>
                {item.to === '/bandeja' && noLeidosWhatsApp > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[1.25rem] px-1 flex items-center justify-center flex-shrink-0">
                    {noLeidosWhatsApp > 99 ? '99+' : noLeidosWhatsApp}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-5 py-2 text-[10px] text-gray-300 border-t border-gray-100" title={`Build ${__APP_BUILD_FECHA__}`}>
          v{__APP_VERSION__}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
            <button onClick={() => setSidebarAbierto(o => !o)} aria-label="Abrir menú"
              className="md:hidden flex items-center justify-center h-9 w-9 rounded text-gray-500 hover:text-ht-navy hover:bg-gray-100 transition-colors -ml-1">
              <MenuIcon />
            </button>
            <span className="text-ht-navy font-semibold text-sm truncate">
              {user?.nombre || user?.email}
              <span className="ml-2 text-xs text-gray-400 font-normal capitalize hidden sm:inline">({user?.rol?.replace('_', ' ')})</span>
            </span>
          </div>

          <div className="flex items-center gap-2" ref={ref}>
            <div className="relative">
              <button onClick={() => setOpen(o => !o)} aria-label="Configuración"
                className="flex items-center justify-center h-9 w-9 rounded text-gray-500 hover:text-ht-navy hover:bg-slate-100 transition-colors">
                <GearIcon />
              </button>
              {open && (
                <div className="absolute right-0 mt-1 w-72 max-h-[80vh] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Mi cuenta</div>
                  <button onClick={() => go('/cambiar-password')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-slate-50">Cambiar contraseña</button>
                  {config.length > 0 && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <div className="px-3 pt-1.5 pb-2">
                        <input type="text" value={busquedaConfig} onChange={e => setBusquedaConfig(e.target.value)}
                          placeholder="Buscar en Configuración..."
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ht-accent" />
                      </div>
                      {busquedaConfig.trim() ? (
                        // Con búsqueda activa: lista plana de coincidencias, sin
                        // secciones ni colapsar — acá pesa más encontrar rápido
                        // que el agrupamiento.
                        (() => {
                          const termino = normalizar(busquedaConfig);
                          const encontrados = config.filter(c => normalizar(c.label).includes(termino));
                          return encontrados.length > 0
                            ? encontrados.map(c => (
                                <button key={c.to} onClick={() => go(c.to)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-slate-50">{c.label}</button>
                              ))
                            : <div className="px-4 py-2 text-sm text-gray-400">Sin resultados</div>;
                        })()
                      ) : (
                        ORDEN_SECCIONES.filter(seccion => config.some(c => c.seccion === seccion)).map(seccion => {
                          const items = config.filter(c => c.seccion === seccion);
                          const cerrada = seccionesCerradas.has(seccion);
                          return (
                            <div key={seccion}>
                              <button onClick={() => alternarSeccion(seccion)}
                                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-ht-navy">
                                <span>{seccion}</span>
                                <span className="text-xs">{cerrada ? '▸' : '▾'}</span>
                              </button>
                              {!cerrada && items.map(c => (
                                <button key={c.to} onClick={() => go(c.to)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-slate-50">{c.label}</button>
                              ))}
                            </div>
                          );
                        })
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <button onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-ht-navy transition-colors px-3 py-1 border border-gray-200 rounded hover:border-ht-navy">
              Cerrar sesión
            </button>
          </div>
        </header>
        <BannerAmbiente />

        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
