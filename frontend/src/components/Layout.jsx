import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Sidebar operativo por rol (HT-AP-03 §11). La configuración va en el engranaje.
const menuByRole = {
  administrador: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Cotizaciones', to: '/cotizaciones' },
    { label: 'Mis Tareas', to: '/tareas' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Cola de asignación', to: '/cola' },
    { label: 'Empresas', to: '/empresas' },
    { label: 'Contactos', to: '/contactos' },
    { label: 'Productos', to: '/productos' },
    { label: 'Reportes', to: '/reportes' },
  ],
  jefe_comercial: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Cotizaciones', to: '/cotizaciones' },
    { label: 'Mis Tareas', to: '/tareas' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Cola de asignación', to: '/cola' },
    { label: 'Empresas', to: '/empresas' },
    { label: 'Contactos', to: '/contactos' },
    { label: 'Productos', to: '/productos' },
    { label: 'Reportes', to: '/reportes' },
  ],
  vendedor: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Cotizaciones', to: '/cotizaciones' },
    { label: 'Mis Tareas', to: '/tareas' },
    { label: 'Empresas', to: '/empresas' },
    { label: 'Contactos', to: '/contactos' },
    { label: 'Productos', to: '/productos' },
    { label: 'Reportes', to: '/reportes' },
  ],
  callcenter: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Cola de asignación', to: '/cola' },
    { label: 'Mis Tareas', to: '/tareas' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Empresas', to: '/empresas' },
    { label: 'Contactos', to: '/contactos' },
  ],
  gerencia: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Reportes', to: '/reportes' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
  ],
};

// Configuración por rol (menú engranaje).
const configByRole = {
  administrador: [
    { label: 'Config pipeline', to: '/config/pipeline' },
    { label: 'Reglas de asignación', to: '/config/reglas-asignacion' },
    { label: 'Secuencias de seguimiento', to: '/config/secuencias' },
    { label: 'Bot de WhatsApp', to: '/config/bot-whatsapp' },
    { label: 'Encuesta post-cierre', to: '/config/encuesta' },
    { label: 'Datos de empresa', to: '/config/empresa' },
    { label: 'Usuarios', to: '/usuarios' },
  ],
  jefe_comercial: [
    { label: 'Config pipeline', to: '/config/pipeline' },
    { label: 'Reglas de asignación', to: '/config/reglas-asignacion' },
    { label: 'Secuencias de seguimiento', to: '/config/secuencias' },
    { label: 'Bot de WhatsApp', to: '/config/bot-whatsapp' },
    { label: 'Encuesta post-cierre', to: '/config/encuesta' },
    { label: 'Datos de empresa', to: '/config/empresa' },
  ],
};

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

const ICONO_POR_RUTA = {
  '/dashboard': IconDashboard, '/pipeline': IconPipeline, '/cotizaciones': IconCotizaciones,
  '/tareas': IconTareas, '/bandeja': IconBandeja, '/cola': IconCola,
  '/empresas': IconEmpresas, '/contactos': IconContactos, '/productos': IconProductos, '/reportes': IconReportes,
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menu = menuByRole[user?.rol] || [];
  const config = configByRole[user?.rol] || [];
  const [open, setOpen] = useState(false);
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

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
                {item.label}
              </NavLink>
            );
          })}
        </nav>
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
                <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Mi cuenta</div>
                  <button onClick={() => go('/cambiar-password')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-slate-50">Cambiar contraseña</button>
                  {config.length > 0 && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Configuración</div>
                      {config.map(c => (
                        <button key={c.to} onClick={() => go(c.to)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-slate-50">{c.label}</button>
                      ))}
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

        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
