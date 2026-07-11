const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validarRut } = require('../utils/validaciones');
const { normalizarTelefono, buscarDuplicados, sugerirEmpresaPorEmail } = require('../services/dedup');

const PUEDE_EDITAR = ['administrador', 'callcenter', 'vendedor'];

router.use(authenticate);

// GET /api/contactos?q=&empresa_id=&revisar=1
router.get('/', async (req, res) => {
  try {
    const { q, empresa_id, revisar } = req.query;
    const clauses = ['c.activo = true'];
    const params = [];
    let i = 1;
    if (q) {
      clauses.push(`(c.nombre ILIKE $${i} OR c.apellido ILIKE $${i} OR c.email ILIKE $${i} OR c.telefono_e164 ILIKE $${i})`);
      params.push(`%${q}%`); i++;
    }
    if (empresa_id) { clauses.push(`c.empresa_id = $${i++}`); params.push(empresa_id); }
    if (revisar === '1') { clauses.push('c.revisar_duplicado = true'); }

    const contactos = await db.all(
      `SELECT c.id, c.nombre, c.apellido, c.email, c.telefono_e164, c.cargo, c.origen,
              c.revisar_duplicado, c.empresa_id, e.razon_social AS empresa_nombre
       FROM contactos c LEFT JOIN empresas e ON e.id = c.empresa_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY c.nombre LIMIT 500`,
      params
    );
    res.json(contactos);
  } catch (err) {
    console.error('[contactos/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/contactos/duplicados — grupos de posibles duplicados (email o nombre+empresa).
// El teléfono es UNIQUE en la tabla, así que no puede duplicarse a nivel de datos.
router.get('/duplicados', async (req, res) => {
  try {
    const porEmail = await db.all(
      `SELECT lower(email) AS clave, array_agg(id ORDER BY created_at) AS ids
       FROM contactos WHERE activo = true AND email IS NOT NULL AND email <> ''
       GROUP BY lower(email) HAVING count(*) > 1`
    );
    const porNombre = await db.all(
      `SELECT lower(nombre)||'|'||lower(coalesce(apellido,''))||'|'||empresa_id AS clave,
              array_agg(id ORDER BY created_at) AS ids
       FROM contactos WHERE activo = true AND empresa_id IS NOT NULL
       GROUP BY lower(nombre), lower(coalesce(apellido,'')), empresa_id HAVING count(*) > 1`
    );

    const grupos = [];
    for (const g of porEmail) grupos.push({ motivo: 'email', clave: g.clave, ids: g.ids });
    for (const g of porNombre) grupos.push({ motivo: 'nombre', clave: g.clave, ids: g.ids });

    // Traer detalle de los contactos involucrados.
    const allIds = [...new Set(grupos.flatMap(g => g.ids))];
    let detalle = {};
    if (allIds.length) {
      const rows = await db.all(
        `SELECT c.id, c.nombre, c.apellido, c.email, c.telefono_e164, c.origen, c.created_at,
                e.razon_social AS empresa_nombre
         FROM contactos c LEFT JOIN empresas e ON e.id = c.empresa_id
         WHERE c.id = ANY($1)`,
        [allIds]
      );
      detalle = Object.fromEntries(rows.map(r => [r.id, r]));
    }
    res.json(grupos.map(g => ({ ...g, contactos: g.ids.map(id => detalle[id]).filter(Boolean) })));
  } catch (err) {
    console.error('[contactos/GET /duplicados]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/contactos/verificar — chequeo previo de duplicados y sugerencia de empresa.
router.post('/verificar', async (req, res) => {
  try {
    const { nombre, apellido, email, telefono, empresa_id, id } = req.body;
    const telefono_e164 = normalizarTelefono(telefono);
    const candidatos = await buscarDuplicados(
      { email, telefono_e164, nombre, apellido, empresa_id }, id || null
    );
    const empresa_sugerida = empresa_id ? null : await sugerirEmpresaPorEmail(email);
    res.json({ candidatos, empresa_sugerida, telefono_e164 });
  } catch (err) {
    console.error('[contactos/POST /verificar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/contactos/:id
router.get('/:id', async (req, res) => {
  try {
    const contacto = await db.get(
      `SELECT c.*, e.razon_social AS empresa_nombre
       FROM contactos c LEFT JOIN empresas e ON e.id = c.empresa_id WHERE c.id = $1`,
      [req.params.id]
    );
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });
    res.json(contacto);
  } catch (err) {
    console.error('[contactos/GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/contactos
router.post('/', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    const { nombre, apellido, email, telefono, empresa_id, rut_comprador, cargo, origen } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    if (rut_comprador && !validarRut(rut_comprador)) return res.status(400).json({ error: 'RUT inválido' });

    const telefono_e164 = normalizarTelefono(telefono);

    // Teléfono es UNIQUE: si ya existe, es el mismo contacto → 409 con el existente.
    if (telefono_e164) {
      const existe = await db.get(
        'SELECT id, nombre, apellido FROM contactos WHERE telefono_e164 = $1',
        [telefono_e164]
      );
      if (existe) return res.status(409).json({ error: 'Ya existe un contacto con ese teléfono', contacto_existente: existe });
    }

    // Duplicado por email o nombre+empresa: se permite crear, pero se marca para revisión.
    const candidatos = await buscarDuplicados({ email, telefono_e164, nombre, apellido, empresa_id });
    const revisar = candidatos.length > 0;

    const result = await db.run(
      `INSERT INTO contactos (nombre, apellido, email, telefono_e164, empresa_id, rut_comprador, cargo, origen, revisar_duplicado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [nombre, apellido || null, email || null, telefono_e164, empresa_id || null,
       rut_comprador || null, cargo || null, origen || 'manual', revisar]
    );
    res.status(201).json({ contacto: result.rows[0], duplicados_detectados: candidatos });
  } catch (err) {
    console.error('[contactos/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/contactos/:id
router.put('/:id', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, email, telefono, empresa_id, rut_comprador, cargo, activo, revisar_duplicado } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    if (rut_comprador && !validarRut(rut_comprador)) return res.status(400).json({ error: 'RUT inválido' });

    const contacto = await db.get('SELECT id FROM contactos WHERE id = $1', [id]);
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });

    const telefono_e164 = normalizarTelefono(telefono);
    if (telefono_e164) {
      const existe = await db.get('SELECT id FROM contactos WHERE telefono_e164 = $1 AND id != $2', [telefono_e164, id]);
      if (existe) return res.status(409).json({ error: 'Otro contacto ya usa ese teléfono' });
    }

    await db.run(
      `UPDATE contactos SET nombre=$1, apellido=$2, email=$3, telefono_e164=$4, empresa_id=$5,
              rut_comprador=$6, cargo=$7, activo=$8, revisar_duplicado=$9 WHERE id=$10`,
      [nombre, apellido || null, email || null, telefono_e164, empresa_id || null,
       rut_comprador || null, cargo || null, activo !== undefined ? activo : true,
       revisar_duplicado !== undefined ? revisar_duplicado : false, id]
    );
    res.json({ message: 'Contacto actualizado' });
  } catch (err) {
    console.error('[contactos/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/contactos/fusionar — {master_id, duplicado_ids:[...]}
// Completa datos faltantes del maestro con los de los duplicados y desactiva estos.
router.post('/fusionar', authorize('administrador', 'callcenter'), async (req, res) => {
  const { master_id, duplicado_ids } = req.body;
  if (!master_id || !Array.isArray(duplicado_ids) || duplicado_ids.length === 0) {
    return res.status(400).json({ error: 'master_id y duplicado_ids requeridos' });
  }
  if (duplicado_ids.includes(master_id)) {
    return res.status(400).json({ error: 'El maestro no puede estar en la lista de duplicados' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const master = (await client.query('SELECT * FROM contactos WHERE id = $1 FOR UPDATE', [master_id])).rows[0];
    if (!master) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Maestro no encontrado' }); }

    const dups = (await client.query(
      'SELECT * FROM contactos WHERE id = ANY($1) FOR UPDATE', [duplicado_ids]
    )).rows;

    // Completar campos faltantes del maestro con el primer duplicado que los tenga.
    const merged = { ...master };
    const campos = ['apellido', 'email', 'telefono_e164', 'empresa_id', 'rut_comprador', 'cargo'];
    for (const dup of dups) {
      for (const campo of campos) {
        if ((merged[campo] === null || merged[campo] === '') && dup[campo]) merged[campo] = dup[campo];
      }
    }

    // Liberar el teléfono (UNIQUE) de los duplicados antes de asignarlo al maestro.
    if (duplicado_ids.length) {
      await client.query('UPDATE contactos SET telefono_e164 = NULL WHERE id = ANY($1)', [duplicado_ids]);
    }

    await client.query(
      `UPDATE contactos SET apellido=$1, email=$2, telefono_e164=$3, empresa_id=$4,
              rut_comprador=$5, cargo=$6, revisar_duplicado=false WHERE id=$7`,
      [merged.apellido, merged.email, merged.telefono_e164, merged.empresa_id,
       merged.rut_comprador, merged.cargo, master_id]
    );

    // Desactivar los duplicados. (Cuando existan negocios/cotizaciones/conversaciones
    // se repuntarán aquí sus FKs hacia el maestro.)
    await client.query('UPDATE contactos SET activo = false WHERE id = ANY($1)', [duplicado_ids]);

    await client.query('COMMIT');
    res.json({ message: 'Contactos fusionados', master_id, fusionados: duplicado_ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[contactos/POST /fusionar]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

module.exports = router;
