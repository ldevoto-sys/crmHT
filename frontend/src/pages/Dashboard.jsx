import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Dashboard</h1>
      <p className="text-gray-500 mb-6">
        Bienvenido, {user?.nombre}. Rol: <span className="capitalize font-medium text-ht-navy">{user?.rol}</span>.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-ht-navy mb-2">CRM Comercial — Bloque A (andamiaje)</h2>
        <p className="text-sm text-gray-600 mb-4">
          Fundación del sistema en producción: autenticación, roles y estructura base.
          Los módulos comerciales se habilitan por etapa según el plan HT-AP-03 §13.
        </p>
        <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
          <li>Etapa 1 — Maestros: empresas, contactos, productos, carga de stock, migración HubSpot.</li>
          <li>Etapa 2 — Cotizador + canal web y motor de asignación.</li>
          <li>Etapa 3 — Seguimiento, cierre y reportería.</li>
          <li>Etapa 4 — WhatsApp humano.</li>
          <li>Etapa 5 — Bot fuera de horario.</li>
        </ul>
      </div>
    </div>
  );
}
