import { useEffect, useState } from 'react';
import api from '../../api';

const LABEL_AJUSTE = { anticipo: 'Anticipo', garantia: 'Garantía', fluctuacion: 'Fluctuación', redondeo: 'Redondeo', indemnizacion: 'Indemnización' };

const cuentaVacia = { banco: '', cuenta_bancaria: '', cuenta_contable: '' };

// Pantalla de configuración de cuentas contables para el archivo de carga a
// Softland (módulo Cobranzas, Fase 1 — HT-DO-XX especificación sección 2.4).
// Mismo criterio que config_empresa: esto no queda fijo en el código porque
// son datos propios de la empresa (pueden cambiar banco, cuenta, convención
// contable) — los edita un administrador acá, el generador del archivo los
// lee de esta tabla.
export default function ConfigCobranza() {
  const [general, setGeneral] = useState(null);
  const [ajustes, setAjustes] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [nuevaCuenta, setNuevaCuenta] = useState(cuentaVacia);
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    try {
      const { data } = await api.get('/cobranza/config');
      setGeneral(data.general);
      setAjustes(data.ajustes);
      setCuentas(data.cuentas_bancarias);
    } catch { setError('No se pudo cargar la configuración.'); }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  const guardarGeneral = async e => {
    e.preventDefault(); setError(''); setMsg('');
    try { await api.put('/cobranza/config', general); setMsg('Configuración guardada.'); }
    catch (err) { setError(err.response?.data?.error || 'Error al guardar.'); }
  };

  const cambiarAjuste = (tipo, campo, valor) => {
    setAjustes(ajustes.map(a => a.tipo === tipo ? { ...a, [campo]: valor } : a));
  };
  const guardarAjustes = async () => {
    setError(''); setMsg('');
    try {
      await Promise.all(ajustes.map(a => api.put(`/cobranza/config/ajustes/${a.tipo}`, a)));
      setMsg('Ajustes contables guardados.');
    } catch (err) { setError(err.response?.data?.error || 'Error al guardar los ajustes.'); }
  };

  const agregarCuenta = async e => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      const { data } = await api.post('/cobranza/config/cuentas-bancarias', nuevaCuenta);
      setCuentas([...cuentas, data]); setNuevaCuenta(cuentaVacia);
    } catch (err) { setError(err.response?.data?.error || 'Error al agregar la cuenta.'); }
  };
  const cambiarCuentaContable = (id, cuenta_contable) => {
    setCuentas(cuentas.map(c => c.id === id ? { ...c, cuenta_contable } : c));
  };
  const guardarCuenta = async c => {
    setError(''); setMsg('');
    try { await api.put(`/cobranza/config/cuentas-bancarias/${c.id}`, { cuenta_contable: c.cuenta_contable }); setMsg('Cuenta actualizada.'); }
    catch (err) { setError(err.response?.data?.error || 'Error al guardar la cuenta.'); }
  };
  const eliminarCuenta = async id => {
    if (!window.confirm('¿Eliminar esta cuenta bancaria del mapeo?')) return;
    setError(''); setMsg('');
    try { await api.delete(`/cobranza/config/cuentas-bancarias/${id}`); setCuentas(cuentas.filter(c => c.id !== id)); }
    catch (err) { setError(err.response?.data?.error || 'Error al eliminar.'); }
  };

  if (cargando || !general) return <div className="text-gray-400 text-sm">Cargando…</div>;

  const campoTexto = (label, campo, ancho = '') => (
    <div className={ancho}>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input value={general[campo] || ''} onChange={e => setGeneral({ ...general, [campo]: e.target.value })}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-ht-navy mb-1">Cobranza — Cuentas contables</h1>
      <p className="text-gray-500 text-sm mb-6">
        Catálogo de cuentas y códigos usados al generar el archivo de carga a Softland. Cambiar esto no afecta nada
        hasta que el módulo empiece a generar ese archivo (Fase 4) — por ahora queda guardado para cuando corresponda.
      </p>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}

      <form onSubmit={guardarGeneral} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-ht-navy mb-3">Umbrales de cobranza</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Monto mínimo de redondeo automático</label>
              <input type="number" min="0" value={general.monto_minimo_redondeo}
                onChange={e => setGeneral({ ...general, monto_minimo_redondeo: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              <p className="text-xs text-gray-400 mt-1">Diferencias entre pago y factura menores o iguales a esto se clasifican solas como Redondeo.</p>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Monto mínimo de factura para enviar recordatorios</label>
              <input type="number" min="0" value={general.monto_minimo_factura}
                onChange={e => setGeneral({ ...general, monto_minimo_factura: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
              <p className="text-xs text-gray-400 mt-1">Facturas por debajo de esto no entran al flujo de recordatorios (0 = sin mínimo).</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-ht-navy mb-3">Cuentas por cobrar</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {campoTexto('Clientes — cuenta contable', 'cuenta_clientes')}
            {campoTexto('Clientes — código', 'codigo_clientes')}
            {campoTexto('Facturas exentas — cuenta contable', 'cuenta_facturas_exentas')}
            {campoTexto('Facturas exentas — código', 'codigo_facturas_exentas')}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-ht-navy mb-3">Códigos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {campoTexto('Tipo de transferencia', 'codigo_tipo_transferencia')}
            {campoTexto('Código de IVA', 'codigo_iva')}
            {campoTexto('Ingresos por ventas', 'cuenta_ingresos_ventas')}
            {campoTexto('Tipo de transferencia (Documento)', 'codigo_tipo_transferencia_documento')}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-ht-navy mb-3">Otros</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {campoTexto('Centro de costos por defecto', 'centro_costos_default')}
            {campoTexto('Presupuesto de caja', 'cuenta_presupuesto_caja')}
            {campoTexto('Flujo de efectivo', 'cuenta_flujo_efectivo')}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-ht-navy mb-3">Glosa</h2>
          <p className="text-xs text-gray-400 mb-3">Variables disponibles: {'{CODIGO_DOCUMENTO}'} {'{FOLIO}'} {'{NOMBRE_CLIENTE}'} {'{TIPO_DOCUMENTO}'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {campoTexto('Glosa de la factura contra movimiento', 'glosa_factura_contra_movimiento')}
            {campoTexto('Glosa de la factura contra ajustes contables', 'glosa_factura_contra_ajuste')}
            {campoTexto('Glosa del movimiento', 'glosa_movimiento')}
            {campoTexto('Glosa del ajuste contable', 'glosa_ajuste')}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-ht-navy mb-3">Formato</h2>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={general.incluir_digito_verificador}
                onChange={e => setGeneral({ ...general, incluir_digito_verificador: e.target.checked })} />
              Incluir dígito verificador en el código auxiliar (RUT)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={general.incluir_guion_codigo_auxiliar}
                onChange={e => setGeneral({ ...general, incluir_guion_codigo_auxiliar: e.target.checked })} />
              Incluir guión en el código auxiliar (RUT)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={general.usar_slash_fechas}
                onChange={e => setGeneral({ ...general, usar_slash_fechas: e.target.checked })} />
              Usar slash (/) como separador de fechas — desmarcado usa guión (DD-MM-AAAA)
            </label>
          </div>
        </div>

        <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">
          Guardar configuración general
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-6">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-ht-navy">Ajustes contables</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Tipo</th>
                <th className="text-left px-4 py-2 font-medium">Cuenta contable</th>
                <th className="text-left px-4 py-2 font-medium">Código contra movimiento</th>
                <th className="text-left px-4 py-2 font-medium">Código contra factura</th>
              </tr>
            </thead>
            <tbody>
              {ajustes.map(a => (
                <tr key={a.tipo} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-ht-navy font-medium">{LABEL_AJUSTE[a.tipo] || a.tipo}</td>
                  <td className="px-4 py-2">
                    <input value={a.cuenta_contable || ''} onChange={e => cambiarAjuste(a.tipo, 'cuenta_contable', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={a.codigo_contra_movimiento || ''} onChange={e => cambiarAjuste(a.tipo, 'codigo_contra_movimiento', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={a.codigo_contra_factura || ''} onChange={e => cambiarAjuste(a.tipo, 'codigo_contra_factura', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100">
          <button onClick={guardarAjustes} className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">
            Guardar ajustes contables
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-6">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-ht-navy">Cuentas bancarias</h2>
          <p className="text-xs text-gray-400 mt-1">Una cuenta sin cuenta contable asignada no genera movimientos exportables.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Banco</th>
                <th className="text-left px-4 py-2 font-medium">Cuenta bancaria</th>
                <th className="text-left px-4 py-2 font-medium">Cuenta contable</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map(c => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-600">{c.banco}</td>
                  <td className="px-4 py-2 text-gray-600">{c.cuenta_bancaria}</td>
                  <td className="px-4 py-2">
                    <input value={c.cuenta_contable || ''} onChange={e => cambiarCuentaContable(c.id, e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => guardarCuenta(c)} className="text-ht-accent hover:underline mr-3">Guardar</button>
                    <button onClick={() => eliminarCuenta(c.id)} className="text-red-500 hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))}
              {cuentas.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Sin cuentas bancarias cargadas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <form onSubmit={agregarCuenta} className="flex flex-wrap items-end gap-2 px-5 py-3 border-t border-gray-100">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Banco</label>
            <input required value={nuevaCuenta.banco} onChange={e => setNuevaCuenta({ ...nuevaCuenta, banco: e.target.value })}
              placeholder="Ej: Banco de Chile"
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Cuenta bancaria</label>
            <input required value={nuevaCuenta.cuenta_bancaria} onChange={e => setNuevaCuenta({ ...nuevaCuenta, cuenta_bancaria: e.target.value })}
              placeholder="Ej: ****3209"
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Cuenta contable <span className="text-gray-400">(opcional)</span></label>
            <input value={nuevaCuenta.cuenta_contable} onChange={e => setNuevaCuenta({ ...nuevaCuenta, cuenta_contable: e.target.value })}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ht-accent" />
          </div>
          <button type="submit" className="bg-ht-accent text-ht-navy px-4 py-2 rounded text-sm font-medium hover:bg-ht-accent/90">
            + Agregar cuenta
          </button>
        </form>
      </div>
    </div>
  );
}
