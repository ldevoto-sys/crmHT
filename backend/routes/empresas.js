const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validarRut } = require('../utils/validaciones');
const { normalizarTelefono } = require('../services/dedup');

// Roles que pueden crear/editar maestros. Gerencia es solo lectura (§5).
const PUEDE_EDITAR = ['administrador', 'callcenter', 'vendedor'];

router.use(authenticate);

// GET /api/empresas?q=&vendedor_id=
router.get('/', async (req, res) => {
  try {
    const { q, vendedor_id } = req.query;
    const clauses = ['e.activo = true'];
    const params = [];
    let i = 1;
    if (q) {
      clauses.push(`(e.razon_social ILIKE $${i} OR e.rut ILIKE $${i} OR e.dominio_correo ILIKE $${i})`);
      params.push(`%${q}%`); i++;
    }
    if (vendedor_id) { clauses.push(`e.vendedor_id = $${i++}`); params.push(vendedor_id); }

    const empresas = await db.all(
      `SELECT e.id, e.razon_social, e.rut, e.dominio_correo, e.comuna, e.ciudad,
              e.vendedor_id, u.nombre AS vendedor_nombre,
              (SELECT count(*) FROM contactos c WHERE c.empresa_id = e.id AND c.activo = true) AS contactos_count
       FROM empresas e
       LEFT JOIN users u ON u.id = e.vendedor_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY e.razon_social LIMIT 500`,
      params
    );
    res.json(empresas);
  } catch (err) {
    console.error('[empresas/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/empresas/:id — ficha con contactos
router.get('/:id', async (req, res) => {
  try {
    const empresa = await db.get(
      `SELECT e.*, u.nombre AS vendedor_nombre
       FROM empresas e LEFT JOIN users u ON u.id = e.vendedor_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const contactos = await db.all(
      `SELECT id, nombre, apellido, email, telefono_e164, cargo, activo
       FROM contactos WHERE empresa_id = $1 AND activo = true ORDER BY nombre`,
      [req.params.id]
    );
    res.json({ ...empresa, contactos });
  } catch (err) {
    console.error('[empresas/GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/empresas
router.post('/', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    const { razon_social, rut, dominio_correo, giro, direccion, comuna, ciudad, telefono, vendedor_id } = req.body;
    if (!razon_social) return res.status(400).json({ error: 'Razón social requerida' });
    if (rut && !validarRut(rut)) return res.status(400).json({ error: 'RUT inválido' });

    if (rut) {
      const existe = await db.get('SELECT id FROM empresas WHERE rut = $1', [rut]);
      if (existe) return res.status(409).json({ error: 'Ya existe una empresa con ese RUT' });
    }

    const result = await db.run(
      `INSERT INTO empresas (razon_social, rut, dominio_correo, giro, direccion, comuna, ciudad, telefono_e164, vendedor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [razon_social, rut || null, dominio_correo || null, giro || null, direccion || null,
       comuna || null, ciudad || null, normalizarTelefono(telefono), vendedor_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[empresas/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/empresas/:id
router.put('/:id', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    const { id } = req.params;
    const { razon_social, rut, dominio_correo, giro, direccion, comuna, ciudad, telefono, vendedor_id, activo } = req.body;
    if (!razon_social) return res.status(400).json({ error: 'Razón social requerida' });
    if (rut && !validarRut(rut)) return res.status(400).json({ error: 'RUT inválido' });

    const empresa = await db.get('SELECT id FROM empresas WHERE id = $1', [id]);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (rut) {
      const existe = await db.get('SELECT id FROM empresas WHERE rut = $1 AND id != $2', [rut, id]);
      if (existe) return res.status(409).json({ error: 'Otra empresa ya usa ese RUT' });
    }

    await db.run(
      `UPDATE empresas SET razon_social=$1, rut=$2, dominio_correo=$3, giro=$4, direccion=$5,
              comuna=$6, ciudad=$7, telefono_e164=$8, vendedor_id=$9, activo=$10 WHERE id=$11`,
      [razon_social, rut || null, dominio_correo || null, giro || null, direccion || null,
       comuna || null, ciudad || null, normalizarTelefono(telefono), vendedor_id || null,
       activo !== undefined ? activo : true, id]
    );
    res.json({ message: 'Empresa actualizada' });
  } catch (err) {
    console.error('[empresas/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
