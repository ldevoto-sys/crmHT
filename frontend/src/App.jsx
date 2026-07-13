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
import ConfigPipeline from './pages/admin/ConfigPipeline';
import ReglasAsignacion from './pages/admin/ReglasAsignacion';
import ConfigEmpresa from './pages/admin/ConfigEmpresa';
import ConfigSecuencias from './pages/admin/ConfigSecuencias';
import ConfigEncuesta from './pages/admin/ConfigEncuesta';
import ColaAsignacion from './pages/bandeja/ColaAsignacion';
import Empresas from './pages/maestros/Empresas';
import ImportarEmpresas from './pages/maestros/ImportarEmpresas';
import DetalleEmpresa from './pages/maestros/DetalleEmpresa';
import Contactos from './pages/maestros/Contactos';
import DetalleContacto from './pages/maestros/DetalleContacto';
import ImportarContactos from './pages/maestros/ImportarContactos';
import Duplicados from './pages/maestros/Duplicados';
import Productos from './pages/maestros/Productos';
import DetalleProducto from './pages/maestros/DetalleProducto';
import ImportarProductos from './pages/maestros/ImportarProductos';
import Pipeline from './pages/ventas/Pipeline';
import DetalleNegocio from './pages/ventas/DetalleNegocio';
import Cotizaciones from './pages/ventas/Cotizaciones';
import NuevaCotizacion from './pages/ventas/NuevaCotizacion';
import DetalleCotizacion from './pages/ventas/DetalleCotizacion';
import CotizacionPublica from './pages/publico/CotizacionPublica';
import EncuestaPublica from './pages/publico/EncuestaPublica';
import MisTareas from './pages/ventas/MisTareas';
import Reportes from './pages/ventas/Reportes';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/c/:token" element={<CotizacionPublica />} />
          <Route path="/encuesta/:token" element={<EncuestaPublica />} />
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
            <Route path="empresas/importar" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial']}><ImportarEmpresas /></ProtectedRoute>
            } />
            <Route path="empresas/:id" element={<DetalleEmpresa />} />
            <Route path="contactos" element={<Contactos />} />
            <Route path="contactos/:id" element={<DetalleContacto />} />
            <Route path="contactos/importar" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial']}><ImportarContactos /></ProtectedRoute>
            } />
            <Route path="duplicados" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial', 'callcenter']}><Duplicados /></ProtectedRoute>
            } />
            <Route path="productos" element={<Productos />} />
            <Route path="productos/importar" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial']}><ImportarProductos /></ProtectedRoute>
            } />
            <Route path="productos/:id" element={<DetalleProducto />} />

            {/* Etapa 2 — Cotizador y pipeline */}
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="negocios/:id" element={<DetalleNegocio />} />
            <Route path="negocios/:negocioId/cotizar" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial', 'vendedor']}><NuevaCotizacion /></ProtectedRoute>
            } />
            <Route path="cotizaciones" element={<Cotizaciones />} />
            <Route path="cotizaciones/:id" element={<DetalleCotizacion />} />

            {/* Etapa 3 — Tareas y reportes */}
            <Route path="tareas" element={<MisTareas />} />
            <Route path="reportes" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial', 'vendedor', 'gerencia']}><Reportes /></ProtectedRoute>
            } />

            {/* Etapa 4 — WhatsApp */}
            <Route path="bandeja" element={<Placeholder title="Bandeja WhatsApp" />} />
            <Route path="cola" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial', 'callcenter']}><ColaAsignacion /></ProtectedRoute>
            } />

            {/* Administración */}
            <Route path="usuarios" element={
              <ProtectedRoute roles={['administrador']}><Usuarios /></ProtectedRoute>
            } />
            <Route path="config/pipeline" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial']}><ConfigPipeline /></ProtectedRoute>
            } />
            <Route path="config/reglas-asignacion" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial']}><ReglasAsignacion /></ProtectedRoute>
            } />
            <Route path="config/empresa" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial']}><ConfigEmpresa /></ProtectedRoute>
            } />
            <Route path="config/secuencias" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial']}><ConfigSecuencias /></ProtectedRoute>
            } />
            <Route path="config/encuesta" element={
              <ProtectedRoute roles={['administrador', 'jefe_comercial']}><ConfigEncuesta /></ProtectedRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
