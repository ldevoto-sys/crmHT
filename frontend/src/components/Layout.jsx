import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Menús por rol (HT-AP-03 §11). Las pantallas aún no construidas apuntan a
// rutas placeholder; se irán habilitando por etapa.
const menuByRole = {
  administrador: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Pipeline', to: '/pipeline' },
    { label: 'Cotizaciones', to: '/cotizaciones' },
    { label: 'Bandeja WhatsApp', to: '/bandeja' },
    { label: 'Cola de asignación', to: '/cola' },
    { label: 'Empresas', to: '/empresas' },
    { label: 'Contactos', to: '/contactos' },
    { label: 'Duplicados', to: '/duplicados' },
    { label: 'Productos', to: '/productos' },
    { label: 'Reportes', to: '/reportes' },
    { label: 'Config pipeline', to: '/config/pipeline' },
    { label: 'Usuarios', to: '/usuarios' },
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
  ],
  callcenter: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Cola de asignación', to: '/cola' },
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

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menu = menuByRole[user?.rol] || [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-ht-navy flex flex-col">
        <div className="px-5 py-4 border-b border-white/10">
          <span className="text-white font-bold text-base">HidroTecnica</span>
          <span className="text-ht-accent font-semibold text-sm ml-1">| CRM</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {menu.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                `block px-5 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-ht-accent text-ht-navy'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Área principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <img src="/Hidrotecnica.jpg" alt="HidroTecnica" className="h-8 object-contain" />
            <span className="text-ht-navy font-semibold text-sm">
              {user?.nombre || user?.email}
              <span className="ml-2 text-xs text-gray-400 font-normal capitalize">({user?.rol})</span>
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-ht-navy transition-colors px-3 py-1 border border-gray-200 rounded hover:border-ht-navy"
          >
            Cerrar sesión
          </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
