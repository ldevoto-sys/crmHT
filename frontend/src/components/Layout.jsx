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
    { label: 'Duplicados', to: '/duplicados' },
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
    { label: 'Duplicados', to: '/duplicados' },
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
    { label: 'Duplicados', to: '/duplicados' },
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
    { label: 'Datos de empresa', to: '/config/empresa' },
    { label: 'Usuarios', to: '/usuarios' },
  ],
  jefe_comercial: [
    { label: 'Config pipeline', to: '/config/pipeline' },
    { label: 'Reglas de asignación', to: '/config/reglas-asignacion' },
    { label: 'Secuencias de seguimiento', to: '/config/secuencias' },
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

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menu = menuByRole[user?.rol] || [];
  const config = configByRole[user?.rol] || [];
  const [open, setOpen] = useState(false);
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
      <aside className="w-60 flex-shrink-0 bg-ht-navy flex flex-col">
        <div className="px-5 py-4 border-b border-white/10">
          <span className="text-white font-bold text-base">HidroTecnica</span>
          <span className="text-ht-accent font-semibold text-sm ml-1">| CRM</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {menu.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/dashboard'}
              className={({ isActive }) =>
                `block px-5 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-ht-accent text-ht-navy' : 'text-white/80 hover:text-white hover:bg-white/10'}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <img src="/Hidrotecnica.jpg" alt="HidroTecnica" className="h-8 object-contain" />
            <span className="text-ht-navy font-semibold text-sm">
              {user?.nombre || user?.email}
              <span className="ml-2 text-xs text-gray-400 font-normal capitalize">({user?.rol?.replace('_', ' ')})</span>
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
