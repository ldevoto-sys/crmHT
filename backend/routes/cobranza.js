const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { actualizarDocumentosPendientes } = require('../services/cobranzaSoftland');
const { detectarYParsear } = require('../services/cobranzaCartolas');
const cobranzaTransbank = require('../services/cobranzaTransbank');
const { fechaChileHoy } = require('../services/informeDiario');

const MARGEN_DIAS_MATCH_TRANSBANK = 5;

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
    const { banco, cuenta_bancaria, cuenta_contable, es_cuenta_transbank } = req.body;
    if (!banco || !cuenta_bancaria) return res.status(400).json({ error: 'Banco y cuenta bancaria son requeridos' });
    const existe = await db.get(
      'SELECT id FROM cobranza_config_cuentas_bancarias WHERE banco = $1 AND cuenta_bancaria = $2',
      [banco, cuenta_bancaria]
    );
    if (existe) return res.status(409).json({ error: 'Esa cuenta ya está registrada' });
    const r = await db.run(
      'INSERT INTO cobranza_config_cuentas_bancarias (banco, cuenta_bancaria, cuenta_contable, es_cuenta_transbank) VALUES ($1,$2,$3,$4) RETURNING *',
      [banco, cuenta_bancaria, cuenta_contable || null, es_cuenta_transbank === true]
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
    const { cuenta_contable, es_cuenta_transbank } = req.body;
    await db.run(
      'UPDATE cobranza_config_cuentas_bancarias SET cuenta_contable = $1, es_cuenta_transbank = $2 WHERE id = $3',
      [cuenta_contable || null, es_cuenta_transbank === true, req.params.id]
    );
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

// === Fase 4 — Cuenta de cliente propia del CRM ===
// saldo_app se calcula al vuelo (nunca se guarda una columna sincronizada):
// monto_total de cada factura del cliente, menos lo conciliado y aprobado en
// cobranza_conciliaciones. Se compara contra saldo_softland (el
// saldo_pendiente que informó la última sincronización) para detectar
// diferencias en cualquier dirección — ver especificación §9.

// GET /api/cobranza/cuentas-cliente — una fila por cuenta de cliente, con
// saldo_app y saldo_softland agregados sobre todas sus facturas vigentes.
router.get('/cuentas-cliente', requiereGestionCobranza, async (req, res) => {
  try {
    const cuentas = await db.all(`
      WITH conciliado AS (
        SELECT factura_folio, SUM(monto_aplicado) AS aplicado
        FROM cobranza_conciliaciones
        WHERE estado IN ('aprobada', 'modificada')
        GROUP BY factura_folio
      ),
      saldo_por_factura AS (
        SELECT d.codigo_cliente, d.saldo_pendiente AS saldo_softland,
               d.monto_total - COALESCE(c.aplicado, 0) AS saldo_app
        FROM cobranza_documentos d
        LEFT JOIN conciliado c ON c.factura_folio = d.folio
      )
      SELECT cc.codigo_cliente, cc.nombre_cliente, cc.rut_cliente, cc.empresa_id, cc.es_cuenta_paso,
             COALESCE(SUM(s.saldo_app), 0) AS saldo_app,
             COALESCE(SUM(s.saldo_softland), 0) AS saldo_softland,
             COUNT(s.saldo_softland) AS facturas_vigentes
      FROM cobranza_cuentas_cliente cc
      LEFT JOIN saldo_por_factura s ON s.codigo_cliente = cc.codigo_cliente
      GROUP BY cc.codigo_cliente, cc.nombre_cliente, cc.rut_cliente, cc.empresa_id, cc.es_cuenta_paso
      ORDER BY cc.nombre_cliente NULLS LAST
    `);
    res.json(cuentas.map(c => ({
      ...c,
      saldo_app: Number(c.saldo_app),
      saldo_softland: Number(c.saldo_softland),
      diferencia: Number(c.saldo_app) - Number(c.saldo_softland),
      concuerdan: (Number(c.saldo_app) > 0) === (Number(c.saldo_softland) > 0),
    })));
  } catch (err) {
    console.error('[cobranza/cuentas-cliente GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/cobranza/cuentas-cliente/:codigo/facturas — detalle factura por
// factura de una cuenta, para explicar de dónde sale la diferencia agregada.
router.get('/cuentas-cliente/:codigo/facturas', requiereGestionCobranza, async (req, res) => {
  try {
    const facturas = await db.all(`
      WITH conciliado AS (
        SELECT factura_folio, SUM(monto_aplicado) AS aplicado
        FROM cobranza_conciliaciones
        WHERE estado IN ('aprobada', 'modificada')
        GROUP BY factura_folio
      )
      SELECT d.folio, d.monto_total, d.saldo_pendiente AS saldo_softland, d.fecha_emision, d.fecha_vencimiento,
             d.monto_total - COALESCE(c.aplicado, 0) AS saldo_app
      FROM cobranza_documentos d
      LEFT JOIN conciliado c ON c.factura_folio = d.folio
      WHERE d.codigo_cliente = $1
      ORDER BY d.fecha_vencimiento ASC
    `, [req.params.codigo]);
    res.json(facturas.map(f => ({
      ...f,
      saldo_app: Number(f.saldo_app),
      saldo_softland: Number(f.saldo_softland),
      diferencia: Number(f.saldo_app) - Number(f.saldo_softland),
      concuerdan: (Number(f.saldo_app) > 0) === (Number(f.saldo_softland) > 0),
    })));
  } catch (err) {
    console.error('[cobranza/cuentas-cliente/:codigo/facturas GET]', err);
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
//
// También reconoce (por la misma detección de forma) los dos archivos de
// Transbank: la Cartola de Movimientos y el Resumen histórico de abonos —
// ver services/cobranzaTransbank.js y processarTransbankMovimientos/
// procesarTransbankAbonos más abajo.
router.post('/movimientos/importar', requiereGestionCobranza, upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Debes adjuntar un archivo' });

    const resultado = detectarYParsear(req.file.buffer);
    if (resultado) return await procesarCartolaBancaria(req, res, resultado);

    let transbank;
    try {
      transbank = cobranzaTransbank.detectar(req.file.buffer);
    } catch (err) {
      console.error('[cobranza/movimientos/importar] Error leyendo el archivo:', err);
      return res.status(400).json({ error: 'No se pudo leer el archivo — ¿es una cartola o un archivo de Transbank válido?' });
    }
    if (!transbank) {
      return res.status(400).json({
        error: 'No se reconoce el formato del archivo (se esperaba una cartola de Banco de Chile, Banco Santander, o los archivos de Transbank de Movimientos/Abonos).',
      });
    }
    if (transbank.tipo === 'movimientos') return await procesarTransbankMovimientos(req, res, transbank.data);
    return await procesarTransbankAbonos(req, res, transbank.data);
  } catch (err) {
    console.error('[cobranza/movimientos/importar POST]', err);
    res.status(500).json({ error: 'Error interno al procesar el archivo' });
  }
});

async function procesarCartolaBancaria(req, res, resultado) {
  const cuentaCfg = await db.get(
    'SELECT es_cuenta_transbank FROM cobranza_config_cuentas_bancarias WHERE banco = $1 AND cuenta_bancaria = $2',
    [resultado.banco, resultado.cuentaBancaria]
  );
  const esCuentaTransbank = cuentaCfg?.es_cuenta_transbank === true;

  let insertados = 0, validadosTransbank = 0;
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

    // Cuenta separada donde Transbank deposita: no se concilia contra una
    // factura puntual (el depósito es neto de muchas ventas a la vez), solo
    // se valida contra lo que ya informó el Resumen de abonos del mismo día.
    let estadoInicial = 'pendiente';
    let validadoEn = null;
    if (esCuentaTransbank) {
      const abonoDia = await db.get(
        'SELECT fecha FROM cobranza_transbank_abonos_dia WHERE fecha = $1 AND total_abono = $2',
        [m.fecha, m.monto]
      );
      if (abonoDia) { estadoInicial = 'conciliado'; validadoEn = new Date(); validadosTransbank++; }
    }

    await db.run(
      `INSERT INTO cobranza_movimientos_bancarios
         (banco, cuenta_bancaria, fecha, monto, glosa_original, numero_documento, referencia_banco, estado, validado_transbank_en, cargado_por_id, archivo_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [resultado.banco, resultado.cuentaBancaria, m.fecha, m.monto, m.glosa_original, m.numero_documento, m.referencia_banco, estadoInicial, validadoEn, req.user.id, req.file.originalname]
    );
    insertados++;
  }
  const nota = esCuentaTransbank ? ` (${validadosTransbank} validado(s) automáticamente contra el Resumen de abonos Transbank)` : '';
  res.status(201).json({
    message: `Cartola de ${resultado.banco} (cuenta ${resultado.cuentaBancaria || '—'}) procesada: ${insertados} movimiento(s) nuevo(s) de ${resultado.movimientos.length} encontrados${nota}.`,
    banco: resultado.banco, cuenta_bancaria: resultado.cuentaBancaria,
    total_encontrados: resultado.movimientos.length, insertados,
  });
}

// Cartola de Movimientos Transbank: cada venta se cruza contra facturas por
// monto+fecha (margen de 5 días); 0 o más de un candidato queda pendiente,
// sin adivinar. Una anulación se carga como su propio movimiento (no borra
// el original) y, si la venta original ya está conciliada, genera
// automáticamente la conciliación espejo (monto en negativo) por el mismo
// "Código de autorización de la venta".
async function procesarTransbankMovimientos(req, res, data) {
  let insertados = 0, conciliadosAuto = 0, anulacionesVinculadas = 0, omitidos = 0;
  for (const m of data.movimientos) {
    if (m.tipo === 'venta') {
      const existe = await db.get(
        `SELECT id FROM cobranza_movimientos_bancarios WHERE banco = 'Transbank' AND numero_documento = $1 AND monto = $2 AND fecha = $3`,
        [m.codigo_autorizacion_venta, m.monto, m.fecha]
      );
      if (existe) { omitidos++; continue; }

      const ins = await db.run(
        `INSERT INTO cobranza_movimientos_bancarios (banco, cuenta_bancaria, fecha, monto, glosa_original, numero_documento, cargado_por_id, archivo_nombre)
         VALUES ('Transbank', 'Transbank', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [m.fecha, m.monto, m.nombre_local, m.codigo_autorizacion_venta, req.user.id, req.file.originalname]
      );
      insertados++;
      const movimientoId = ins.rows[0].id;

      const candidatos = await db.all(
        `SELECT folio FROM cobranza_documentos
         WHERE monto_total = $1
           AND fecha_emision BETWEEN ($2::date - $3::integer) AND ($2::date + $3::integer)`,
        [m.monto, m.fecha, MARGEN_DIAS_MATCH_TRANSBANK]
      );
      if (candidatos.length === 1) {
        await db.run(
          `INSERT INTO cobranza_conciliaciones (movimiento_id, factura_folio, monto_aplicado, automatica) VALUES ($1,$2,$3,true)`,
          [movimientoId, candidatos[0].folio, m.monto]
        );
        await db.run(`UPDATE cobranza_movimientos_bancarios SET estado = 'preconciliado' WHERE id = $1`, [movimientoId]);
        conciliadosAuto++;
      }
    } else {
      const existe = await db.get(
        `SELECT id FROM cobranza_movimientos_bancarios WHERE banco = 'Transbank' AND numero_documento = $1 AND monto = $2 AND fecha = $3`,
        [m.codigo_autorizacion_venta, -m.monto, m.fecha]
      );
      if (existe) { omitidos++; continue; }

      const ins = await db.run(
        `INSERT INTO cobranza_movimientos_bancarios (banco, cuenta_bancaria, fecha, monto, glosa_original, numero_documento, cargado_por_id, archivo_nombre)
         VALUES ('Transbank', 'Transbank', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [m.fecha, -m.monto, `Anulación — ${m.nombre_local}`, m.codigo_autorizacion_venta, req.user.id, req.file.originalname]
      );
      insertados++;
      const anulacionId = ins.rows[0].id;

      const original = await db.get(
        `SELECT id FROM cobranza_movimientos_bancarios WHERE banco = 'Transbank' AND numero_documento = $1 AND monto > 0 ORDER BY id LIMIT 1`,
        [m.codigo_autorizacion_venta]
      );
      const conciliacionOriginal = original && await db.get(
        `SELECT factura_folio FROM cobranza_conciliaciones WHERE movimiento_id = $1 AND estado IN ('propuesta','aprobada','modificada') ORDER BY id DESC LIMIT 1`,
        [original.id]
      );
      if (conciliacionOriginal) {
        await db.run(
          `INSERT INTO cobranza_conciliaciones (movimiento_id, factura_folio, monto_aplicado, automatica) VALUES ($1,$2,$3,true)`,
          [anulacionId, conciliacionOriginal.factura_folio, -m.monto]
        );
        await db.run(`UPDATE cobranza_movimientos_bancarios SET estado = 'preconciliado' WHERE id = $1`, [anulacionId]);
        anulacionesVinculadas++;
      }
    }
  }
  res.status(201).json({
    message: `Cartola de Movimientos Transbank procesada: ${insertados} nuevo(s) de ${data.movimientos.length} encontrados (${omitidos} ya cargados), ${conciliadosAuto} venta(s) con match automático, ${anulacionesVinculadas} anulación(es) vinculada(s) a su venta original.`,
  });
}

// Resumen histórico de abonos Transbank: un ajuste "comision_transbank" por
// día, y validación cruzada de la cartola real de la cuenta separada (en
// cualquiera de los dos órdenes de subida).
async function procesarTransbankAbonos(req, res, data) {
  let dias = 0, ajustes = 0, validados = 0;
  for (const d of data.dias) {
    if (d.total_ventas === 0 && d.total_abono === 0) continue; // día sin actividad

    await db.run(
      `INSERT INTO cobranza_transbank_abonos_dia
         (fecha, cuenta_deposito, total_ventas, comision_transbank_iva, cobros_servicio, ventas_anuladas, devolucion_comision, total_abono, numero_ventas, cargado_por_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (fecha) DO UPDATE SET
         cuenta_deposito = EXCLUDED.cuenta_deposito, total_ventas = EXCLUDED.total_ventas,
         comision_transbank_iva = EXCLUDED.comision_transbank_iva, cobros_servicio = EXCLUDED.cobros_servicio,
         ventas_anuladas = EXCLUDED.ventas_anuladas, devolucion_comision = EXCLUDED.devolucion_comision,
         total_abono = EXCLUDED.total_abono, numero_ventas = EXCLUDED.numero_ventas`,
      [d.fecha, d.cuenta_deposito, d.total_ventas, d.comision_transbank_iva, d.cobros_servicio, d.ventas_anuladas, d.devolucion_comision, d.total_abono, d.numero_ventas, req.user.id]
    );
    dias++;

    if (d.comision_transbank_iva > 0) {
      const existeAjuste = await db.get(`SELECT id FROM cobranza_ajustes WHERE tipo = 'comision_transbank' AND fecha = $1`, [d.fecha]);
      if (existeAjuste) {
        await db.run('UPDATE cobranza_ajustes SET monto = $1 WHERE id = $2', [d.comision_transbank_iva, existeAjuste.id]);
      } else {
        await db.run(`INSERT INTO cobranza_ajustes (tipo, monto, fecha) VALUES ('comision_transbank', $1, $2)`, [d.comision_transbank_iva, d.fecha]);
      }
      ajustes++;
    }

    // Por si la cartola real de la cuenta separada ya se había subido antes
    // que este archivo de abonos: valida ahora los movimientos que quedaron
    // pendientes ese día.
    const r = await db.run(
      `UPDATE cobranza_movimientos_bancarios m
         SET estado = 'conciliado', validado_transbank_en = now()
       WHERE m.estado = 'pendiente' AND m.fecha = $1 AND m.monto = $2
         AND EXISTS (
           SELECT 1 FROM cobranza_config_cuentas_bancarias c
           WHERE c.banco = m.banco AND c.cuenta_bancaria = m.cuenta_bancaria AND c.es_cuenta_transbank = true
         )`,
      [d.fecha, d.total_abono]
    );
    validados += r.rowCount || 0;
  }
  res.status(201).json({
    message: `Resumen de abonos Transbank procesado: ${dias} día(s), ${ajustes} ajuste(s) de comisión Transbank, ${validados} movimiento(s) de la cuenta separada validado(s) automáticamente.`,
  });
}

// === Fase 2 — Conciliación manual y archivado ===

// GET /api/cobranza/movimientos/:id/conciliaciones — detalle de lo ya
// vinculado a un movimiento (facturas aplicadas + ajuste, si hay).
router.get('/movimientos/:id/conciliaciones', requiereGestionCobranza, async (req, res) => {
  try {
    const conciliaciones = await db.all(
      `SELECT c.*, d.nombre_cliente, d.codigo_cliente, u.nombre AS resuelto_por_nombre
       FROM cobranza_conciliaciones c
       LEFT JOIN cobranza_documentos d ON d.folio = c.factura_folio
       LEFT JOIN users u ON u.id = c.resuelto_por_id
       WHERE c.movimiento_id = $1 AND c.estado != 'rechazada'
       ORDER BY c.id`,
      [req.params.id]
    );
    const ajustes = await db.all('SELECT * FROM cobranza_ajustes WHERE movimiento_id = $1 ORDER BY id', [req.params.id]);
    res.json({ conciliaciones, ajustes });
  } catch (err) {
    console.error('[cobranza/movimientos/:id/conciliaciones GET]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/cobranza/movimientos/:id/conciliar-manual — reparte un
// movimiento entre una o más facturas (de uno o varios códigos de cliente,
// ej. "Jardines de Providencia"). Si sobra un monto menor al umbral
// configurado y no se indica un ajuste, se registra como "redondeo"
// automático; si sobra más que eso, hay que indicar explícitamente el
// ajuste (normalmente "anticipo").
// body: { aplicaciones: [{ factura_folio, monto_aplicado }], ajuste?: { tipo, monto } }
router.post('/movimientos/:id/conciliar-manual', requiereGestionCobranza, async (req, res) => {
  try {
    const movimiento = await db.get('SELECT * FROM cobranza_movimientos_bancarios WHERE id = $1', [req.params.id]);
    if (!movimiento) return res.status(404).json({ error: 'Movimiento no encontrado' });
    if (!['pendiente', 'preconciliado'].includes(movimiento.estado)) {
      return res.status(409).json({ error: `El movimiento ya está ${movimiento.estado} — deshazlo primero si necesitas corregirlo.` });
    }

    const aplicaciones = Array.isArray(req.body.aplicaciones) ? req.body.aplicaciones : [];
    if (aplicaciones.length === 0) return res.status(400).json({ error: 'Debes indicar al menos una factura' });
    for (const a of aplicaciones) {
      if (!a.factura_folio || !(Number(a.monto_aplicado) > 0)) {
        return res.status(400).json({ error: 'Cada aplicación necesita un folio de factura y un monto mayor a cero' });
      }
    }

    const sumaAplicado = aplicaciones.reduce((acc, a) => acc + Number(a.monto_aplicado), 0);
    const excedente = Number(movimiento.monto) - sumaAplicado;
    let ajuste = req.body.ajuste || null;

    if (Math.abs(excedente) > 0.5) {
      if (excedente < 0) {
        return res.status(400).json({ error: 'El monto aplicado a las facturas no puede superar el monto del movimiento' });
      }
      if (!ajuste) {
        const cfg = await db.get('SELECT monto_minimo_redondeo FROM cobranza_config WHERE id = 1');
        const umbral = Number(cfg?.monto_minimo_redondeo || 0);
        if (excedente <= umbral) {
          ajuste = { tipo: 'redondeo', monto: excedente };
        } else {
          return res.status(400).json({
            error: `Queda un excedente de $${excedente.toLocaleString('es-CL')} sobre el umbral de redondeo ($${umbral.toLocaleString('es-CL')}) — indica explícitamente a qué ajuste corresponde (ej. anticipo).`,
          });
        }
      } else if (Math.abs(Number(ajuste.monto) - excedente) > 0.5) {
        return res.status(400).json({ error: 'El monto del ajuste no coincide con el excedente del movimiento' });
      }
    }

    // Si el movimiento tenía una sugerencia automática (preconciliado), queda
    // reemplazada por esta resolución manual.
    await db.run(
      `UPDATE cobranza_conciliaciones SET estado = 'rechazada' WHERE movimiento_id = $1 AND estado = 'propuesta'`,
      [movimiento.id]
    );

    for (const a of aplicaciones) {
      await db.run(
        `INSERT INTO cobranza_conciliaciones (movimiento_id, factura_folio, monto_aplicado, estado, automatica, resuelto_por_id, resuelto_en)
         VALUES ($1,$2,$3,'aprobada',false,$4,now())`,
        [movimiento.id, a.factura_folio, a.monto_aplicado, req.user.id]
      );
    }
    if (ajuste) {
      await db.run(
        `INSERT INTO cobranza_ajustes (tipo, monto, movimiento_id) VALUES ($1,$2,$3)`,
        [ajuste.tipo, ajuste.monto, movimiento.id]
      );
    }
    await db.run(`UPDATE cobranza_movimientos_bancarios SET estado = 'conciliado' WHERE id = $1`, [movimiento.id]);

    res.json({ message: 'Movimiento conciliado correctamente.' });
  } catch (err) {
    console.error('[cobranza/movimientos/:id/conciliar-manual POST]', err);
    res.status(500).json({ error: 'Error interno al conciliar' });
  }
});

// POST /api/cobranza/movimientos/:id/deshacer — revierte todo lo conciliado
// para este movimiento (manual o automático) y lo deja pendiente de nuevo.
router.post('/movimientos/:id/deshacer', requiereGestionCobranza, async (req, res) => {
  try {
    const movimiento = await db.get('SELECT * FROM cobranza_movimientos_bancarios WHERE id = $1', [req.params.id]);
    if (!movimiento) return res.status(404).json({ error: 'Movimiento no encontrado' });
    if (!['preconciliado', 'conciliado'].includes(movimiento.estado)) {
      return res.status(409).json({ error: `El movimiento está ${movimiento.estado} — no hay nada que deshacer.` });
    }
    await db.run(
      `UPDATE cobranza_conciliaciones SET estado = 'rechazada', resuelto_por_id = $2, resuelto_en = now()
       WHERE movimiento_id = $1 AND estado != 'rechazada'`,
      [movimiento.id, req.user.id]
    );
    await db.run('DELETE FROM cobranza_ajustes WHERE movimiento_id = $1', [movimiento.id]);
    await db.run(
      `UPDATE cobranza_movimientos_bancarios SET estado = 'pendiente', validado_transbank_en = NULL WHERE id = $1`,
      [movimiento.id]
    );
    res.json({ message: 'Conciliación revertida — el movimiento vuelve a quedar pendiente.' });
  } catch (err) {
    console.error('[cobranza/movimientos/:id/deshacer POST]', err);
    res.status(500).json({ error: 'Error interno al deshacer' });
  }
});

// POST /api/cobranza/movimientos/:id/archivar — para casos que no se van a
// conciliar (ej. un depósito que no corresponde a ninguna factura). Motivo
// obligatorio, según la especificación.
router.post('/movimientos/:id/archivar', requiereGestionCobranza, async (req, res) => {
  try {
    const motivo = String(req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Debes indicar un motivo para archivar' });
    const movimiento = await db.get('SELECT * FROM cobranza_movimientos_bancarios WHERE id = $1', [req.params.id]);
    if (!movimiento) return res.status(404).json({ error: 'Movimiento no encontrado' });
    if (!['pendiente', 'preconciliado'].includes(movimiento.estado)) {
      return res.status(409).json({ error: `El movimiento ya está ${movimiento.estado}.` });
    }
    await db.run(
      `UPDATE cobranza_conciliaciones SET estado = 'rechazada' WHERE movimiento_id = $1 AND estado = 'propuesta'`,
      [movimiento.id]
    );
    await db.run(
      `UPDATE cobranza_movimientos_bancarios SET estado = 'archivado', motivo_archivo = $2 WHERE id = $1`,
      [req.params.id, motivo]
    );
    res.json({ message: 'Movimiento archivado.' });
  } catch (err) {
    console.error('[cobranza/movimientos/:id/archivar POST]', err);
    res.status(500).json({ error: 'Error interno al archivar' });
  }
});

// POST /api/cobranza/conciliaciones/:id/aprobar — confirma una sugerencia
// automática (match por monto+fecha) tal como quedó.
router.post('/conciliaciones/:id/aprobar', requiereGestionCobranza, async (req, res) => {
  try {
    const conciliacion = await db.get(`SELECT * FROM cobranza_conciliaciones WHERE id = $1 AND estado = 'propuesta'`, [req.params.id]);
    if (!conciliacion) return res.status(404).json({ error: 'No hay una sugerencia pendiente con ese id' });
    await db.run(
      `UPDATE cobranza_conciliaciones SET estado = 'aprobada', resuelto_por_id = $2, resuelto_en = now() WHERE id = $1`,
      [conciliacion.id, req.user.id]
    );
    await db.run(`UPDATE cobranza_movimientos_bancarios SET estado = 'conciliado' WHERE id = $1`, [conciliacion.movimiento_id]);
    res.json({ message: 'Sugerencia aprobada.' });
  } catch (err) {
    console.error('[cobranza/conciliaciones/:id/aprobar POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/cobranza/conciliaciones/:id/rechazar — descarta una sugerencia
// automática; el movimiento vuelve a quedar pendiente para resolverlo a mano.
router.post('/conciliaciones/:id/rechazar', requiereGestionCobranza, async (req, res) => {
  try {
    const conciliacion = await db.get(`SELECT * FROM cobranza_conciliaciones WHERE id = $1 AND estado = 'propuesta'`, [req.params.id]);
    if (!conciliacion) return res.status(404).json({ error: 'No hay una sugerencia pendiente con ese id' });
    await db.run(
      `UPDATE cobranza_conciliaciones SET estado = 'rechazada', resuelto_por_id = $2, resuelto_en = now() WHERE id = $1`,
      [conciliacion.id, req.user.id]
    );
    await db.run(`UPDATE cobranza_movimientos_bancarios SET estado = 'pendiente' WHERE id = $1`, [conciliacion.movimiento_id]);
    res.json({ message: 'Sugerencia rechazada — el movimiento vuelve a quedar pendiente.' });
  } catch (err) {
    console.error('[cobranza/conciliaciones/:id/rechazar POST]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
