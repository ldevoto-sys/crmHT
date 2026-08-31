const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { actualizarDocumentosPendientes } = require('../services/cobranzaSoftland');
const { detectarYParsear } = require('../services/cobranzaCartolas');
const { fechaChileHoy } = require('../services/informeDiario');

router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

const TIPOS_AJUSTE = ['anticipo', 'garantia', 'fluctuacion', 'redondeo', 'indemnizacion'];

// === Fase 2 — operación del día a día (documentos pendientes, cartolas).
// Distinto del permiso de configuración de arriba (administrador/jefe
// comercial): acá es administrador, gerencia, o el encargado de cobranza. ===
function puedeGestionar(user) {
  return user.rol === 'administrador' || user.rol === 'gerencia' || user.es_encargado_cobranza === true;
}
function requiereGestionCobranza(req, res, next) {
  if (!puedeGestionar(req.user)) return res.status(403).json({ error: 'Sin permiso' });
  next();
}

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

// === Fase 2 — Documentos (facturas con saldo pendiente, sincronizadas desde
// Softland) ===

// GET /api/cobranza/documentos — listado + KPIs (total por cobrar, a
// tiempo, atrasado <15 días, vencido >15 días, hora de Chile).
router.get('/documentos', requiereGestionCobranza, async (req, res) => {
  try {
    const hoy = fechaChileHoy();
    const documentos = await db.all(
      `SELECT *,
              CASE
                WHEN fecha_vencimiento >= $1::date THEN 'a_tiempo'
                WHEN $1::date - fecha_vencimiento <= 15 THEN 'atrasado'
                ELSE 'vencido'
              END AS estado
       FROM cobranza_documentos
       ORDER BY fecha_vencimiento ASC`,
      [hoy]
    );
    const kpis = documentos.reduce(
      (acc, d) => {
        const saldo = Number(d.saldo_pendiente);
        acc.total_por_cobrar += saldo;
        acc[d.estado] += saldo;
        return acc;
      },
      { total_por_cobrar: 0, a_tiempo: 0, atrasado: 0, vencido: 0 }
    );
    const ultima = await db.get('SELECT MAX(actualizado_en) AS ultima FROM cobranza_documentos');
    res.json({ documentos, kpis, ultima_actualizacion: ultima?.ultima || null });
  } catch (err) {
    console.error('[cobranza/documentos GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/cobranza/documentos/actualizar — corre la consulta validada
// contra Softland (skill HT-IN-01 §4.7) y reemplaza la tabla completa.
router.post('/documentos/actualizar', requiereGestionCobranza, async (req, res) => {
  try {
    const resultado = await actualizarDocumentosPendientes();
    res.json({ message: `Documentos actualizados desde Softland (${resultado.total}).`, total: resultado.total });
  } catch (err) {
    console.error('[cobranza/documentos/actualizar POST]', err);
    res.status(502).json({ error: `No se pudo actualizar desde Softland: ${err.message || 'error desconocido'}` });
  }
});

// === Fase 2 — Movimientos bancarios (cartolas subidas) ===

// GET /api/cobranza/movimientos?estado=pendiente|preconciliado|conciliado|archivado
router.get('/movimientos', requiereGestionCobranza, async (req, res) => {
  try {
    const { estado } = req.query;
    const params = [];
    let where = '';
    if (estado) { params.push(estado); where = 'WHERE m.estado = $1'; }
    const movimientos = await db.all(
      `SELECT m.*, u.nombre AS cargado_por_nombre
       FROM cobranza_movimientos_bancarios m
       LEFT JOIN users u ON u.id = m.cargado_por_id
       ${where}
       ORDER BY m.fecha DESC, m.id DESC`,
      params
    );
    res.json(movimientos);
  } catch (err) {
    console.error('[cobranza/movimientos GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/cobranza/movimientos/importar (multipart, campo "archivo") —
// sube una cartola (Banco de Chile .xls o Banco Santander .xlsx, detectado
// por la forma del contenido) y registra sus abonos como movimientos
// pendientes. Si la misma cartola se sube dos veces, no duplica: se
// considera el mismo movimiento si banco+cuenta+fecha+monto+glosa calzan.
router.post('/movimientos/importar', requiereGestionCobranza, upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Debes adjuntar un archivo' });
    let resultado;
    try {
      resultado = detectarYParsear(req.file.buffer);
    } catch (err) {
      console.error('[cobranza/movimientos/importar] Error leyendo el archivo:', err);
      return res.status(400).json({ error: 'No se pudo leer el archivo — ¿es una cartola bancaria válida?' });
    }
    if (!resultado) {
      return res.status(400).json({ error: 'No se reconoce el formato del archivo (se esperaba una cartola de Banco de Chile o Banco Santander).' });
    }

    let insertados = 0;
    for (const m of resultado.movimientos) {
      // La referencia del banco (saldo resultante en Banco de Chile, N° de
      // movimiento en Santander) es lo que distingue dos movimientos
      // idénticos en monto/glosa/fecha (ej. 3 transferencias iguales el
      // mismo día) — sin ella, reimportar la misma cartola los colapsaría.
      const existe = await db.get(
        `SELECT id FROM cobranza_movimientos_bancarios
         WHERE banco = $1 AND cuenta_bancaria = $2 AND fecha = $3 AND monto = $4 AND glosa_original = $5
           AND referencia_banco IS NOT DISTINCT FROM $6`,
        [resultado.banco, resultado.cuentaBancaria, m.fecha, m.monto, m.glosa_original, m.referencia_banco]
      );
      if (existe) continue;
      await db.run(
        `INSERT INTO cobranza_movimientos_bancarios
           (banco, cuenta_bancaria, fecha, monto, glosa_original, numero_documento, referencia_banco, cargado_por_id, archivo_nombre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [resultado.banco, resultado.cuentaBancaria, m.fecha, m.monto, m.glosa_original, m.numero_documento, m.referencia_banco, req.user.id, req.file.originalname]
      );
      insertados++;
    }
    res.status(201).json({
      message: `Cartola de ${resultado.banco} (cuenta ${resultado.cuentaBancaria || '—'}) procesada: ${insertados} movimiento(s) nuevo(s) de ${resultado.movimientos.length} encontrados.`,
      banco: resultado.banco, cuenta_bancaria: resultado.cuentaBancaria,
      total_encontrados: resultado.movimientos.length, insertados,
    });
  } catch (err) {
    console.error('[cobranza/movimientos/importar POST]', err);
    res.status(500).json({ error: 'Error interno al procesar la cartola' });
  }
});

module.exports = router;
