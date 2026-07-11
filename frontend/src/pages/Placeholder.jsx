export default function Placeholder({ title }) {
  return (
    <div className="p-8 text-center">
      <h2 className="text-2xl font-bold text-ht-navy mb-2">{title}</h2>
      <p className="text-gray-500">En construcción — se habilita en su etapa del plan.</p>
    </div>
  );
}
