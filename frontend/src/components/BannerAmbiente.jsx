// Aviso visual de "no es producción". Se activa solo si el build define
// VITE_AMBIENTE_LABEL (variable de Railway, distinta por ambiente) — en
// producción se deja sin definir y el banner no aparece.
const LABEL = import.meta.env.VITE_AMBIENTE_LABEL;

export default function BannerAmbiente() {
  if (!LABEL) return null;
  return (
    <div className="bg-amber-400 text-amber-950 text-sm font-semibold text-center py-2 px-4">
      ⚠️ {LABEL}
    </div>
  );
}
