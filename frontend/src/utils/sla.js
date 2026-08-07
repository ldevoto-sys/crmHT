// Estado de una fecha límite/compromiso respecto de hoy: vencido (ya pasó),
// próximo (3 días o menos por delante) o normal. En días de calendario, sin
// horas. Compartido entre Postventa (fecha_limite_respuesta), Pipeline
// (fecha_compromiso) y Servicio Técnico.
export function slaEstado(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const limite = new Date(fecha.slice(0, 10) + 'T00:00:00');
  const dias = Math.round((limite - hoy) / 86400000);
  if (dias < 0) return 'vencido';
  if (dias <= 3) return 'proximo';
  return 'normal';
}

export const ESTILO_SLA = {
  vencido: { borde: 'border-l-4 border-l-red-500', texto: 'text-red-700 font-semibold', label: 'Vencido' },
  proximo: { borde: 'border-l-4 border-l-amber-400', texto: 'text-amber-700 font-semibold', label: 'Por vencer' },
  normal: { borde: '', texto: 'text-gray-400', label: '' },
};
