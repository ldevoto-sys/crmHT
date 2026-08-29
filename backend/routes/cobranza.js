const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const TIPOS_AJUSTE = ['anticipo', 'garantia', 'fluctuacion', 'redondeo', 'indemnizacion'];

// === Configuración de cuentas contables (Fase 1 — HT-DO-XX especificación
// módulo Cobranzas, sección 2.4). Solo administrador/jefe comercial: son
// códigos contables reales, no algo que deba tocar cualquier encargado de
// cobranza del día a día. ===

// GET /api/cobranza/config — todo junto: config general + ajustes + cuentas bancarias.
router.get('/config', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const general = await db.get('SELECT * FROM cobranza_config WHERE id = 1');
    const ajustes = await db.all('SELECT * FROM cobranza_config_ajustes ORDER BY tipo');
    const cuentasBancarias = await db.all('SELECT * FROM cobranza_config_cuentas_bancarias ORDER BY banco, cuenta_bancaria');
    res.json({ general, ajustes, cuentas_bancarias: cuentasBancarias });
  } catch (err) {
    console.error('[cobranza/config GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/cobranza/config — actualiza los campos generales (cuentas, códigos, glosas, umbrales, checkboxes).
router.put('/config', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const actual = await db.get('SELECT * FROM cobranza_config WHERE id = 1');
    const campos = [
      'monto_minimo_redondeo', 'monto_minimo_factura', 'cuenta_clientes', 'codigo_clientes',
      'cuenta_facturas_exentas', 'codigo_facturas_exentas', 'codigo_tipo_transferencia', 'codigo_iva',
      'cuenta_ingresos_ventas', 'codigo_tipo_transferencia_documento', 'cuenta_presupuesto_caja',
      'cuenta_flujo_efectivo', 'centro_costos_default', 'glosa_factura_contra_movimiento',
      'glosa_factura_contra_ajuste', 'glosa_movimiento', 'glosa_ajuste',
      'incluir_digito_verificador', 'incluir_guion_codigo_auxiliar', 'usar_slash_fechas',
    ];
    const valores = campos.map(c => (req.body[c] !== undefined ? req.body[c] : actual[c]));
    await db.run(
      `UPDATE cobranza_config SET ${campos.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = 1`,
      valores
    );
    res.json({ message: 'Configuración actualizada' });
  } catch (err) {
    console.error('[cobranza/config PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/cobranza/config/ajustes/:tipo — actualiza un tipo de ajuste contable (anticipo/garantía/etc).
router.put('/config/ajustes/:tipo', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    if (!TIPOS_AJUSTE.includes(req.params.tipo)) return res.status(400).json({ error: 'Tipo de ajuste inválido' });
    const { cuenta_contable, codigo_contra_movimiento, codigo_contra_factura } = req.body;
    await db.run(
      `UPDATE cobranza_config_ajustes SET cuenta_contable = $1, codigo_contra_movimiento = $2, codigo_contra_factura = $3 WHERE tipo = $4`,
      [cuenta_contable || null, codigo_contra_movimiento || null, codigo_contra_factura || null, req.params.tipo]
    );
    res.json({ message: 'Ajuste actualizado' });
  } catch (err) {
    console.error('[cobranza/config/ajustes PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/cobranza/config/cuentas-bancarias — agrega una cuenta bancaria nueva al mapeo.
router.post('/config/cuentas-bancarias', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const { banco, cuenta_bancaria, cuenta_contable } = req.body;
    if (!banco || !cuenta_bancaria) return res.status(400).json({ error: 'Banco y cuenta bancaria son requeridos' });
    const existe = await db.get(
      'SELECT id FROM cobranza_config_cuentas_bancarias WHERE banco = $1 AND cuenta_bancaria = $2',
      [banco, cuenta_bancaria]
    );
    if (existe) return res.status(409).json({ error: 'Esa cuenta ya está registrada' });
    const r = await db.run(
      'INSERT INTO cobranza_config_cuentas_bancarias (banco, cuenta_bancaria, cuenta_contable) VALUES ($1,$2,$3) RETURNING *',
      [banco, cuenta_bancaria, cuenta_contable || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[cobranza/config/cuentas-bancarias POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/cobranza/config/cuentas-bancarias/:id — cambia la cuenta contable asignada.
router.put('/config/cuentas-bancarias/:id', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    const cuenta = await db.get('SELECT id FROM cobranza_config_cuentas_bancarias WHERE id = $1', [req.params.id]);
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    const { cuenta_contable } = req.body;
    await db.run('UPDATE cobranza_config_cuentas_bancarias SET cuenta_contable = $1 WHERE id = $2', [cuenta_contable || null, req.params.id]);
    res.json({ message: 'Cuenta actualizada' });
  } catch (err) {
    console.error('[cobranza/config/cuentas-bancarias PUT]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/cobranza/config/cuentas-bancarias/:id — para cuentas cerradas/que ya no aplican.
router.delete('/config/cuentas-bancarias/:id', authorize('administrador', 'jefe_comercial'), async (req, res) => {
  try {
    await db.run('DELETE FROM cobranza_config_cuentas_bancarias WHERE id = $1', [req.params.id]);
    res.json({ message: 'Cuenta eliminada' });
  } catch (err) {
    console.error('[cobranza/config/cuentas-bancarias DELETE]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
