import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// flag: nombre de un atributo adicional en el usuario (ej. "es_encargado_postventa")
// que también da acceso, sin importar el rol — para permisos que se suman al
// rol en vez de reemplazarlo.
export default function ProtectedRoute({ children, roles, flag }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  // Forzar cambio de contraseña, salvo que ya estemos en esa pantalla (evita bucle).
  if (user.must_change_password && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />;
  }
  const tieneRol = !roles || roles.includes(user.rol);
  const tieneFlag = flag && user[flag] === true;
  if (roles && !tieneRol && !tieneFlag) return <Navigate to="/dashboard" replace />;
  return children;
}
