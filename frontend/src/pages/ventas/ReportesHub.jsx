import { useState } from 'react';
import Reportes from './Reportes';
import ReporteriaSoftland from './ReporteriaSoftland';

// Antes había dos ítems de navegación separados ("Reportes" y "Reportería
// Softland") — se unifican acá en una sola sección con un selector arriba,
// para que quede un solo lugar de "Reportes" en el menú (nota de cambio
// v1.31). /reportes/softland se mantiene como enlace directo a la vista
// Comercial (Softland) para no romper marcadores/enlaces ya guardados.
export default function ReportesHub({ vistaInicial = 'softland' }) {
  const [vista, setVista] = useState(vistaInicial);

  return (
    <div>
      <div className="inline-flex border border-gray-300 rounded overflow-hidden mb-5">
        <button onClick={() => setVista('softland')}
          className={`text-sm font-medium px-4 py-2 ${vista === 'softland' ? 'bg-ht-accent text-white' : 'bg-white text-gray-600'}`}>
          Comercial (Softland)
        </button>
        <button onClick={() => setVista('pipeline')}
          className={`text-sm font-medium px-4 py-2 border-l border-gray-300 ${vista === 'pipeline' ? 'bg-ht-accent text-white' : 'bg-white text-gray-600'}`}>
          Pipeline
        </button>
      </div>
      {vista === 'pipeline' ? <Reportes /> : <ReporteriaSoftland />}
    </div>
  );
}
