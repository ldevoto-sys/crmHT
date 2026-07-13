const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validarRut, validarEmail } = require('../utils/validaciones');
const emailSvc = require('../services/email');

const ROLES = ['administrador', 'jefe_comercial', 'vendedor', 'callcenter', 'gerencia'];

// Todos los endpoints requieren autenticación.
router.use(authenticate);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const users = await db.all(
      `SELECT id, nombre, rut, email, rol, activo, recibe_round_robin, created_at
       FROM users ORDER BY nombre`
    );
    res.json(users);
  } catch (err) {
    console.error('[users/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/users/vendedores — vendedores activos (para asignación y "vendedor de cuenta")
router.get('/vendedores', async (req, res) => {
  try {
    const users = await db.all(
      `SELECT id, nombre, email, recibe_round_robin
       FROM users WHERE activo = true AND rol = 'vendedor' ORDER BY nombre`
    );
    res.json(users);
  } catch (err) {
    console.error('[users/GET /vendedores]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/users
router.post('/', authorize('administrador'), async (req, res) => {
  try {
    const { nombre, rut, email, rol, recibe_round_robin } = req.body;
    if (!nombre || !email || !rol)
      return res.status(400).json({ error: 'Campos requeridos: nombre, email, rol' });

    if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    if (rut && !validarRut(rut)) return res.status(400).json({ error: 'RUT inválido' });
    if (!validarEmail(email)) return res.status(400).json({ error: 'Email inválido' });

    const emailExiste = await db.get('SELECT id FROM users WHERE email = $1', [email]);
    if (emailExiste) return res.status(409).json({ error: 'El email ya está registrado' });

    if (rut) {
      const rutExiste = await db.get('SELECT id FROM users WHERE rut = $1', [rut]);
      if (rutExiste) return res.status(409).json({ error: 'El RUT ya está registrado' });
    }

    // Contraseña temporal; el usuario la cambia al primer ingreso.
    const passwordTemporal = crypto.randomBytes(6).toString('hex') + 'A1!';
    const hash = await bcrypt.hash(passwordTemporal, 10);

    const result = await db.run(
      `INSERT INTO users (nombre, rut, email, password_hash, rol, must_change_password, recibe_round_robin)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, nombre, rut, email, rol, activo, recibe_round_robin`,
      [nombre, rut || null, email, hash, rol, recibe_round_robin !== false]
    );

    await emailSvc.bienvenida({ nombre, email, rol }, passwordTemporal);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[users/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/users/:id
router.put('/:id', authorize('administrador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, rut, email, rol, activo, recibe_round_robin } = req.body;

    if (!nombre || !email || !rol)
      return res.status(400).json({ error: 'Campos requeridos: nombre, email, rol' });

    if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    if (rut && !validarRut(rut)) return res.status(400).json({ error: 'RUT inválido' });
    if (!validarEmail(email)) return res.status(400).json({ error: 'Email inválido' });

    const user = await db.get('SELECT id FROM users WHERE id = $1', [id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const emailExiste = await db.get('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
    if (emailExiste) return res.status(409).json({ error: 'El email ya está registrado por otro usuario' });

    if (rut) {
      const rutExiste = await db.get('SELECT id FROM users WHERE rut = $1 AND id != $2', [rut, id]);
      if (rutExiste) return res.status(409).json({ error: 'El RUT ya está registrado por otro usuario' });
    }

    await db.run(
      `UPDATE users SET nombre = $1, rut = $2, email = $3, rol = $4, activo = $5, recibe_round_robin = $6
       WHERE id = $7`,
      [nombre, rut || null, email, rol, activo !== undefined ? activo : true, recibe_round_robin !== false, id]
    );

    res.json({ message: 'Usuario actualizado correctamente' });
  } catch (err) {
    console.error('[users/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/users/:id (soft delete)
router.delete('/:id', authorize('administrador'), async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id)
      return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });

    const user = await db.get('SELECT id FROM users WHERE id = $1', [id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    await db.run('UPDATE users SET activo = false WHERE id = $1', [id]);
    res.json({ message: 'Usuario desactivado correctamente' });
  } catch (err) {
    console.error('[users/DELETE /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
