// Orden de Trabajo (Arranque de Trabajos, Ventas → Operaciones, HT-AP-03
// pendiente 06-09-2026). Se crea sola al entrar a "Aceptado" (ver
// services/ot.js, routes/negocios.js) — acá solo se lee/edita/exporta.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { generarOTPDF } = require('../services/pdf');
const otSvc = require('../services/ot');
const { cargarOTCompleta } = otSvc;
const timeline = require('../services/timeline');

router.use(authenticate);

const PUEDE_VER_TODAS = ['administrador', 'jefe_comercial', 'gerencia', 'callcenter'];
function puedeVer(negocio, user) {
  return PUEDE_VER_TODAS.includes(user.rol) || (user.rol === 'vendedor' && negocio && negocio.vendedor_id === user.id);
}
// Lectura (v1.40): además de los roles de siempre, un técnico puede ver las
// OT en las que está asignado — solo lectura y sin precios.
async function puedeVerOT(negocio, user) {
  if (puedeVer(negocio, user)) return true;
  if (user.rol !== 'tecnico' || !negocio) return false;
  const asignado = await db.get(
    `SELECT 1 AS ok FROM ordenes_trabajo o JOIN ot_tecnicos t ON t.ot_id = o.id WHERE o.negocio_id = $1 AND t.user_id = $2`,
    [negocio.id, user.id]
  );
  return !!asignado;
}
// El técnico no ve precios: ni de los ítems de la OT ni en su PDF.
const sinPrecios = items => items.map(({ precio_unitario, total_linea, ...resto }) => resto);

function puedeEditar(negocio, user) {
  return negocio && (user.rol === 'administrador' || user.rol === 'jefe_comercial' || negocio.vendedor_id === user.id);
}

// Cada línea necesita tipo válido, cantidad > 0, precio (si viene) >= 0, y
// un producto del catálogo o una descripción libre — igual criterio que
// itemsValidos() en routes/cotizaciones.js, salvo que el precio es opcional
// (la OT nace "sin precios").
function itemsValidos(items) {
  if (!Array.isArray(items)) return false;
  return items.every(it =>
    ['material', 'herramienta'].includes(it.tipo) &&
    Number(it.cantidad) > 0 &&
    (it.precio_unitario === undefined || it.precio_unitario === null || it.precio_unitario === '' || Number(it.precio_unitario) >= 0) &&
    (it.producto_id || (it.descripcion && it.descripcion.trim()))
  );
}

async function negocioDeOT(otId) {
  return db.get(
    `SELECT n.* FROM negocios n JOIN ordenes_trabajo o ON o.negocio_id = n.id WHERE o.id = $1`, [otId]
  );
}

// GET /api/ordenes-trabajo/mis-ots?estado=programadas|ejecutadas&mes=YYYY-MM|todos&tecnico_id=
// Pestaña "OTs" de Tareas (v1.40). Un técnico ve solo las suyas; administrador,
// jefe comercial y gerencia ven las de todos los técnicos (o la de uno, con
// tecnico_id). Nunca devuelve valores de venta.
//   programadas: OT en la etapa "Programado" sin fecha de ejecución.
//   ejecutadas:  OT con fecha de ejecución (histórico; incluye las que ya
//                pasaron a Facturado), filtradas por mes de ejecución.
const PUEDE_VER_TECNICOS = ['administrador', 'jefe_comercial', 'gerencia'];
router.get('/mis-ots', async (req, res) => {
  try {
    const esTecnico = req.user.rol === 'tecnico';
    if (!esTecnico && !PUEDE_VER_TECNICOS.includes(req.user.rol)) return res.status(403).json({ error: 'Sin permiso' });

    const estado = req.query.estado === 'ejecutadas' ? 'ejecutadas' : 'programadas';
    const params = [];
    const p = v => { params.push(v); return `$${params.length}`; };
    const tecnicoId = esTecnico ? req.user.id : (req.query.tecnico_id ? Number(req.query.tecnico_id) : null);
    if (tecnicoId !== null && !Number.isInteger(tecnicoId)) return res.status(400).json({ error: 'tecnico_id inválido' });
    const alcance = tecnicoId !== null
      ? `EXISTS (SELECT 1 FROM ot_tecnicos tf WHERE tf.ot_id = o.id AND tf.user_id = ${p(tecnicoId)})`
      : `EXISTS (SELECT 1 FROM ot_tecnicos tf WHERE tf.ot_id = o.id)`;

    const base = `
      FROM ordenes_trabajo o
      JOIN negocios n ON n.id = o.negocio_id
      JOIN contactos ct ON ct.id = n.contacto_id
      LEFT JOIN empresas e ON e.id = n.empresa_id
      LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id`;
    const hoy = `(now() AT TIME ZONE 'America/Santiago')::date`;

    let condicion, orden;
    if (estado === 'programadas') {
      condicion = `lower(pe.nombre) = 'programado' AND o.fecha_ejecucion IS NULL`;
      orden = 'o.fecha_programada NULLS LAST, o.negocio_id';
    } else {
      condicion = 'o.fecha_ejecucion IS NOT NULL';
      const mes = req.query.mes;
      if (mes && mes !== 'todos') {
        if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'mes inválido (AAAA-MM)' });
        condicion += ` AND to_char(o.fecha_ejecucion, 'YYYY-MM') = ${p(mes)}`;
      }
      orden = 'o.fecha_ejecucion DESC, o.negocio_id DESC';
    }

    const filas = await db.all(
      `SELECT o.id AS ot_id, o.negocio_id, 'OT-' || o.negocio_id AS ot, n.titulo, n.tipo_trabajo,
              e.razon_social AS cliente, e.direccion, e.comuna, ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido,
              o.fecha_programada::text AS fecha_programada, o.fecha_ejecucion::text AS fecha_ejecucion,
              o.horas_programadas::float8 AS horas_programadas, o.horas_ejecutadas::float8 AS horas_ejecutadas,
              o.id_fracttal, pe.nombre AS etapa_actual,
              (SELECT string_agg(u.nombre, ', ' ORDER BY u.nombre) FROM ot_tecnicos t2 JOIN users u ON u.id = t2.user_id WHERE t2.ot_id = o.id) AS tecnicos,
              CASE WHEN o.fecha_ejecucion IS NULL AND o.fecha_programada IS NOT NULL THEN (o.fecha_programada - ${hoy}) END::int AS dias_para_programada,
              CASE WHEN o.fecha_ejecucion IS NOT NULL AND o.fecha_programada IS NOT NULL THEN (o.fecha_ejecucion - o.fecha_programada) END::int AS brecha_dias
       ${base}
       WHERE ${alcance} AND ${condicion}
       ORDER BY ${orden} LIMIT 500`,
      params
    );

    // Meses con OT ejecutadas dentro del mismo alcance (para el selector).
    const paramsMeses = tecnicoId !== null ? [tecnicoId] : [];
    const meses = (await db.all(
      `SELECT DISTINCT to_char(o.fecha_ejecucion, 'YYYY-MM') AS mes
       ${base}
       WHERE ${tecnicoId !== null ? 'EXISTS (SELECT 1 FROM ot_tecnicos tf WHERE tf.ot_id = o.id AND tf.user_id = $1)' : 'EXISTS (SELECT 1 FROM ot_tecnicos tf WHERE tf.ot_id = o.id)'}
         AND o.fecha_ejecucion IS NOT NULL
       ORDER BY mes DESC`,
      paramsMeses
    )).map(r => r.mes);

    res.json({ filas, meses });
  } catch (err) {
    console.error('[ordenes_trabajo/GET /mis-ots]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/ordenes-trabajo/negocio/:negocioId — la vista de detalle de
// negocio no conoce el id de la OT de antemano, solo el del negocio.
router.get('/negocio/:negocioId', async (req, res) => {
  try {
    const negocio = await db.get('SELECT id, vendedor_id FROM negocios WHERE id = $1', [req.params.negocioId]);
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    if (!(await puedeVerOT(negocio, req.user))) return res.status(403).json({ error: 'Sin permiso' });

    const completa = await cargarOTCompleta('o.negocio_id', req.params.negocioId);
    if (!completa) return res.status(404).json({ error: 'Este negocio todavía no tiene Orden de Trabajo (se genera al entrar a "Aceptado")' });
    res.json({
      ...completa.ot, numero: `OT-${completa.ot.negocio_id}`, tecnicos: completa.tecnicos,
      items: req.user.rol === 'tecnico' ? sinPrecios(completa.items) : completa.items,
      puede_editar: puedeEditar(negocio, req.user),
    });
  } catch (err) {
    console.error('[ordenes_trabajo/GET /negocio/:negocioId]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/ordenes-trabajo/:id/programacion — horas programadas, técnicos,
// fecha de ejecución e ID de Fracttal. Es la edición posterior a la entrada
// a "Programado"/"Ejecutado" (ahí se piden por el Pipeline). Solo se tocan
// las claves que vienen en el body. Si el negocio está hoy en Programado o
// Ejecutado, no se puede dejar la OT sin lo que esa etapa exige.
router.put('/:id/programacion', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Orden de Trabajo no encontrada' });
  try {
    const negocio = await negocioDeOT(req.params.id);
    if (!negocio) return res.status(404).json({ error: 'Orden de Trabajo no encontrada' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });

    const { horas_programadas, horas_ejecutadas, tecnico_ids, fecha_programada, fecha_ejecucion, id_fracttal } = req.body;
    const normalizados = otSvc.normalizarDatosProgramacion({ horas_programadas, horas_ejecutadas, tecnico_ids, fecha_programada, fecha_ejecucion, id_fracttal });
    if (normalizados.tecnico_ids) await otSvc.validarTecnicos(normalizados.tecnico_ids);

    const actual = await db.get('SELECT * FROM ordenes_trabajo WHERE id = $1', [req.params.id]);
    const etapa = await db.get('SELECT nombre FROM pipeline_etapas WHERE id = $1', [negocio.etapa_id]);
    if (actual.exige_programacion && etapa && otSvc.requiereDatosOT(etapa.nombre)) {
      const tecnicoIdsAntes = await otSvc.tecnicoIdsDe(actual.id);
      const faltan = otSvc.faltantesParaEtapa(etapa.nombre, {
        horas: normalizados.horas_programadas !== undefined ? normalizados.horas_programadas : actual.horas_programadas,
        tecnicoIds: normalizados.tecnico_ids ?? tecnicoIdsAntes,
        fechaEjecucion: normalizados.fecha_ejecucion !== undefined ? normalizados.fecha_ejecucion : actual.fecha_ejecucion,
        fechaProgramada: normalizados.fecha_programada !== undefined ? normalizados.fecha_programada : actual.fecha_programada,
        horasEjecutadas: normalizados.horas_ejecutadas !== undefined ? normalizados.horas_ejecutadas : actual.horas_ejecutadas,
      });
      if (faltan.length) return res.status(400).json({ error: `La OT está en "${etapa.nombre}": no puede quedar sin ${faltan.join(', ')}` });
    }

    const tecnicosAntes = normalizados.tecnico_ids ? await db.all(
      `SELECT u.nombre FROM ot_tecnicos t JOIN users u ON u.id = t.user_id WHERE t.ot_id = $1 ORDER BY u.nombre`, [actual.id]) : null;

    await otSvc.guardarProgramacion(actual.id, normalizados);

    if (normalizados.tecnico_ids) {
      const despues = normalizados.tecnico_ids.length
        ? (await db.all('SELECT nombre FROM users WHERE id = ANY($1) ORDER BY nombre', [normalizados.tecnico_ids])).map(u => u.nombre)
        : [];
      const antes = tecnicosAntes.map(u => u.nombre);
      if (antes.join('|') !== despues.join('|')) {
        await timeline.registrar({
          contacto_id: negocio.contacto_id, empresa_id: negocio.empresa_id, negocio_id: negocio.id, tipo: 'nota',
          descripcion: `OT-${negocio.id}: técnicos ${antes.length ? antes.join(', ') : '—'} → ${despues.length ? despues.join(', ') : '—'}`,
          usuario_id: req.user.id,
        });
      }
    }
    res.json({ message: 'Programación de la OT actualizada' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[ordenes_trabajo/PUT /:id/programacion]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/ordenes-trabajo/:id/items — reemplaza la lista completa de
// materiales/herramientas, igual patrón que PUT /cotizaciones/:id.
router.put('/:id/items', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Orden de Trabajo no encontrada' });
  let items, observaciones, negocio;
  try {
    ({ items, observaciones } = req.body);
    if (!itemsValidos(items)) return res.status(400).json({ error: 'Ítems inválidos: cada línea necesita tipo, cantidad > 0 y producto o descripción' });

    negocio = await negocioDeOT(req.params.id);
    if (!negocio) return res.status(404).json({ error: 'Orden de Trabajo no encontrada' });
    if (!puedeEditar(negocio, req.user)) return res.status(403).json({ error: 'Solo el vendedor dueño puede editar' });
  } catch (err) {
    console.error('[ordenes_trabajo/PUT /:id/items] Error antes de guardar', err);
    return res.status(500).json({ error: 'Error interno' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (observaciones !== undefined) {
      await client.query('UPDATE ordenes_trabajo SET observaciones = $1 WHERE id = $2', [observaciones || null, req.params.id]);
    }
    await client.query('DELETE FROM ot_items WHERE ot_id = $1', [req.params.id]);
    for (const it of items) {
      const precio = it.precio_unitario === undefined || it.precio_unitario === null || it.precio_unitario === '' ? null : Number(it.precio_unitario);
      const total = precio !== null ? Math.round(Number(it.cantidad) * precio) : null;
      // Código manual solo aplica a ítems sin producto_id — con producto del
      // catálogo, el código a mostrar es el SKU de `productos` (join en
      // cargarOTCompleta), no se guarda uno propio para no duplicar fuente.
      const codigo = it.producto_id ? null : (it.codigo || null);
      await client.query(
        `INSERT INTO ot_items (ot_id, tipo, producto_id, descripcion, cantidad, precio_unitario, total_linea, codigo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [req.params.id, it.tipo, it.producto_id || null, it.descripcion || null, it.cantidad, precio, total, codigo]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Orden de Trabajo actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ordenes_trabajo/PUT /:id/items]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// GET /api/ordenes-trabajo/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  try {
    const negocio = await negocioDeOT(req.params.id);
    if (!negocio) return res.status(404).json({ error: 'Orden de Trabajo no encontrada' });
    if (!(await puedeVerOT(negocio, req.user))) return res.status(403).json({ error: 'Sin permiso' });

    const completa = await cargarOTCompleta('o.id', req.params.id);
    const emisor = await db.get('SELECT * FROM config_empresa WHERE id = 1') || {};
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="OT-${completa.ot.negocio_id}.pdf"`);
    await generarOTPDF({
      ot: completa.ot,
      items: req.user.rol === 'tecnico' ? sinPrecios(completa.items) : completa.items,
      tecnicos: completa.tecnicos,
      cliente: {
        contacto_nombre: completa.ot.contacto_nombre, contacto_apellido: completa.ot.contacto_apellido,
        contacto_email: completa.ot.contacto_email, empresa_nombre: completa.ot.empresa_nombre,
        empresa_direccion: completa.ot.empresa_direccion, empresa_comuna: completa.ot.empresa_comuna,
      },
      emisor,
    }, res);
  } catch (err) {
    console.error('[ordenes_trabajo/:id/pdf]', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

module.exports = router;
