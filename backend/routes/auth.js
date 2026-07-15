const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { validarPassword } = require('../utils/validaciones');
const email = require('../services/email');
const { JWT_SECRET } = require('../config/jwt');

// Freno a fuerza bruta: por IP, no cuenta los intentos exitosos.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.' },
});
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email: correo, password } = req.body;
    if (!correo || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const user = await db.get('SELECT * FROM users WHERE email = $1 AND activo = true', [correo]);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const payload = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      must_change_password: user.must_change_password,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });

    const user = await db.get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

    if (!validarPassword(newPassword))
      return res.status(400).json({
        error: 'La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un carácter especial',
      });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.run(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hash, req.user.id]
    );

    await email.passwordCambiada(user);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('[auth/change-password]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email: correo } = req.body;
    if (!correo) return res.status(400).json({ error: 'Email requerido' });

    const user = await db.get('SELECT * FROM users WHERE email = $1 AND activo = true', [correo]);

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hora
      await db.run(
        'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
        [token, expires, user.id]
      );
      await email.resetPassword(user, token);
    }

    // Siempre 200 para no revelar si el email existe.
    res.json({ message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña.' });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', resetPasswordLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'Contraseña requerida' });

    const user = await db.get(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > now()',
      [token]
    );
    if (!user) return res.status(400).json({ error: 'Token inválido o expirado' });

    if (!validarPassword(newPassword))
      return res.status(400).json({
        error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un carácter especial',
      });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.run(
      'UPDATE users SET password_hash = $1, must_change_password = false, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hash, user.id]
    );

    res.json({ message: 'Contraseña restablecida correctamente' });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
