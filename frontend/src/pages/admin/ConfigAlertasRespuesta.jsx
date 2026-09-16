import { useEffect, useState } from 'react';
import api from '../../api';

export default function ConfigAlertasRespuesta() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [activo, setActivo] = useState(true);
  const [minVendedor, setMinVendedor] = useState(15);
  const [minCallcenter, setMinCallcenter] = useState(60);
  const [minJefe, setMinJefe] = useState(120);
  const [minGerencia, setMinGerencia] = useState(240);
  const [teamsConfigurado, setTeamsConfigurado] = useState(false);

  const [probando, setProbando] = useState(false);
  const [resultadoPrueba, setResultadoPrueba] = useState(null);

  useEffect(() => {
    api.get('/config/alertas-respuesta').then(r => {
      setActivo(r.data.activo);
      setMinVendedor(r.data.minutos_vendedor);
      setMinCallcenter(r.data.minutos_callcenter);
      setMinJefe(r.data.minutos_jefe_comercial);
      setMinGerencia(r.data.minutos_gerencia);
      setTeamsConfigurado(r.data.teams_configurado);
    }).catch(() => setError('No se pudo cargar la configuración.'))
      .finally(() => setCargando(false));
  }, []);

  const guardar = async e => {
    e.preventDefault(); setError(''); setMsg(''); setGuardando(true);
    try {
      await api.put('/config/alertas-respuesta', {
        activo, minutos_vendedor: minVendedor, minutos_callcenter: minCallcenter,
        minutos_jefe_comercial: minJefe, minutos_gerencia: minGerencia,
      });
      setMsg('Configuración guardada.');
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar.'); }
    finally { setGuardando(false); }
  };

  const probarAhora = async () => {
    setError(''); setResultadoPrueba(null); setProbando(true);
    try {
      const { data } = await api.post('/config/alertas-respuesta/probar-ahora');
      setResultadoPrueba(data);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo probar.'); }
    finally { setProbando(false); }
  };

  const formatoHoras = min => {
    const h = Math.floor(min / 60); const m = min % 60;
    return h > 0 ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  };

  if (cargando) return <div className="p-6 text-gray-400">Cargando…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Alertas de respuesta WhatsApp</h1>
      <p className="text-gray-500 text-sm mb-4">
        Cuando un cliente ya derivado a un vendedor queda sin responder, se avisa por correo y Teams, escalando en
        4 niveles acumulativos — cada nivel nuevo se suma a los anteriores, nadie deja de estar en copia. Los
        tiempos son de <strong>horario hábil acumulado</strong> (se pausan fuera de horario y en los feriados/
        excepciones de la sección de arriba), no tiempo corrido.
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      {!teamsConfigurado && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-sm">
          Teams no está configurado (falta <code>TEAMS_WEBHOOK_URL</code> en las variables de entorno) — por ahora
          las alertas solo salen por correo.
        </div>
      )}

      <form onSubmit={guardar} className="space-y-4 max-w-xl">
        <label className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-4">
          <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
          Activar alertas de respuesta
        </label>

        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          {[
            { label: 'Nivel 1 — Vendedor asignado', val: minVendedor, set: setMinVendedor },
            { label: 'Nivel 2 — + Callcenter', val: minCallcenter, set: setMinCallcenter },
            { label: 'Nivel 3 — + Jefe comercial', val: minJefe, set: setMinJefe },
            { label: 'Nivel 4 — + Gerencia', val: minGerencia, set: setMinGerencia },
          ].map((n, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <label className="text-sm text-gray-700">{n.label}</label>
              <div className="flex items-center gap-2">
                <input type="number" min="1" value={n.val} onChange={e => n.set(Number(e.target.value))}
                  className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                <span className="text-xs text-gray-400 w-20">min hábiles</span>
                <span className="text-xs text-gray-400 w-16">({formatoHoras(n.val)})</span>
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">Cada nivel debe tener un umbral mayor que el anterior.</p>
        </div>

        <button type="submit" disabled={guardando}
          className="bg-ht-accent text-ht-navy px-5 py-2 rounded text-sm font-medium hover:bg-ht-accent/90 disabled:opacity-40">
          {guardando ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg p-5 max-w-xl mt-6">
        <h2 className="font-semibold text-ht-navy mb-1">Probar ahora</h2>
        <p className="text-gray-500 text-sm mb-3">
          El chequeo normal corre cada 15 minutos, pero recién empieza a contar desde el último reinicio del
          servidor (no es inmediato al desplegar) — este botón lo dispara al toque, para probar sin esperar.
        </p>
        <button type="button" onClick={probarAhora} disabled={probando}
          className="border border-ht-navy text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-navy/5 disabled:opacity-40">
          {probando ? 'Revisando…' : 'Probar ahora'}
        </button>

        {resultadoPrueba && (
          <div className="mt-4">
            {resultadoPrueba.activo === false ? (
              <p className="text-sm text-amber-700">Las alertas están desactivadas — no se revisó nada.</p>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-2">
                  {resultadoPrueba.evaluadas} conversación{resultadoPrueba.evaluadas === 1 ? '' : 'es'} evaluada{resultadoPrueba.evaluadas === 1 ? '' : 's'},
                  {' '}{resultadoPrueba.alertadas} alerta{resultadoPrueba.alertadas === 1 ? '' : 's'} enviada{resultadoPrueba.alertadas === 1 ? '' : 's'}.
                </p>
                {resultadoPrueba.detalle.length > 0 && (
                  <table className="w-full text-xs">
                    <thead className="text-gray-500">
                      <tr>
                        <th className="text-left py-1 font-medium">Contacto</th>
                        <th className="text-left py-1 font-medium">Min. hábiles</th>
                        <th className="text-left py-1 font-medium">Nivel</th>
                        <th className="text-left py-1 font-medium">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoPrueba.detalle.map((d, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1.5 text-ht-navy">{d.contacto}</td>
                          <td className="py-1.5 text-gray-500">{d.minutosHabiles}</td>
                          <td className="py-1.5 text-gray-500">{d.nivel || '—'}</td>
                          <td className={`py-1.5 ${d.enviado ? 'text-green-700' : 'text-gray-400'}`}>{d.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
