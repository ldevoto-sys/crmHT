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
            <Route path="empresas" element={<Placeholder title="Empresas" />} />
            <Route path="contactos" element={<Placeholder title="Contactos" />} />
            <Route path="duplicados" element={
              <ProtectedRoute roles={['administrador', 'callcenter']}><Placeholder title="Duplicados" /></ProtectedRoute>
            } />
            <Route path="productos" element={<Placeholder title="Productos" />} />

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
