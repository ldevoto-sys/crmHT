import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import CambiarPassword from './pages/CambiarPassword';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/admin/Usuarios';
import Empresas from './pages/maestros/Empresas';
import DetalleEmpresa from './pages/maestros/DetalleEmpresa';
import Contactos from './pages/maestros/Contactos';
import Duplicados from './pages/maestros/Duplicados';
import Productos from './pages/maestros/Productos';
import DetalleProducto from './pages/maestros/DetalleProducto';
import ImportarProductos from './pages/maestros/ImportarProductos';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/cambiar-password" element={
            <ProtectedRoute><CambiarPassword /></ProtectedRoute>
          } />

          <Route path="/" element={
            <ProtectedRoute><Layout /></ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />

            {/* Etapa 1 — Maestros */}
            <Route path="empresas" element={<Empresas />} />
            <Route path="empresas/:id" element={<DetalleEmpresa />} />
            <Route path="contactos" element={<Contactos />} />
            <Route path="duplicados" element={
              <ProtectedRoute roles={['administrador', 'callcenter']}><Duplicados /></ProtectedRoute>
            } />
            <Route path="productos" element={<Productos />} />
            <Route path="productos/importar" element={
              <ProtectedRoute roles={['administrador']}><ImportarProductos /></ProtectedRoute>
            } />
            <Route path="productos/:id" element={<DetalleProducto />} />

            {/* Etapa 2 — Cotizador y pipeline */}
            <Route path="pipeline" element={<Placeholder title="Pipeline" />} />
            <Route path="cotizaciones" element={<Placeholder title="Cotizaciones" />} />

            {/* Etapa 3 — Tareas y reportes */}
            <Route path="tareas" element={<Placeholder title="Mis Tareas" />} />
            <Route path="reportes" element={<Placeholder title="Reportes" />} />

            {/* Etapa 4 — WhatsApp */}
            <Route path="bandeja" element={<Placeholder title="Bandeja WhatsApp" />} />
            <Route path="cola" element={
              <ProtectedRoute roles={['administrador', 'callcenter']}><Placeholder title="Cola de asignación" /></ProtectedRoute>
            } />

            {/* Administración */}
            <Route path="usuarios" element={
              <ProtectedRoute roles={['administrador']}><Usuarios /></ProtectedRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
