const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validarRut, validarEmail, validarPassword } = require('../utils/validaciones');
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

// POST /api/users {password?} — si no se indica password, se genera una temporal.
// Mientras el envío de correo no esté configurado (SMTP_USER/SMTP_PASS), la
// respuesta siempre incluye password_temporal para que el administrador la
// pueda copiar y entregar a mano.
router.post('/', authorize('administrador'), async (req, res) => {
  try {
    const { nombre, rut, email, rol, recibe_round_robin, password } = req.body;
    if (!nombre || !email || !rol)
      return res.status(400).json({ error: 'Campos requeridos: nombre, email, rol' });

    if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    if (rut && !validarRut(rut)) return res.status(400).json({ error: 'RUT inválido' });
    if (!validarEmail(email)) return res.status(400).json({ error: 'Email inválido' });
    if (password && !validarPassword(password))
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un carácter especial' });

    const emailExiste = await db.get('SELECT id FROM users WHERE email = $1', [email]);
    if (emailExiste) return res.status(409).json({ error: 'El email ya está registrado' });

    if (rut) {
      const rutExiste = await db.get('SELECT id FROM users WHERE rut = $1', [rut]);
      if (rutExiste) return res.status(409).json({ error: 'El RUT ya está registrado' });
    }

    // Contraseña definida por el admin, o temporal generada; el usuario la
    // cambia al primer ingreso en cualquiera de los dos casos.
    const passwordTemporal = password || (crypto.randomBytes(6).toString('hex') + 'A1!');
    const hash = await bcrypt.hash(passwordTemporal, 10);

    const result = await db.run(
      `INSERT INTO users (nombre, rut, email, password_hash, rol, must_change_password, recibe_round_robin)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, nombre, rut, email, rol, activo, recibe_round_robin`,
      [nombre, rut || null, email, hash, rol, recibe_round_robin !== false]
    );

    await emailSvc.bienvenida({ nombre, email, rol }, passwordTemporal);

    res.status(201).json({ ...result.rows[0], password_temporal: passwordTemporal });
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

// POST /api/users/:id/reset-password {password?} — igual que en la creación:
// mientras no haya correo configurado, la respuesta trae password_temporal.
router.post('/:id/reset-password', authorize('administrador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (password && !validarPassword(password))
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un carácter especial' });

    const user = await db.get('SELECT nombre, email, rol FROM users WHERE id = $1', [id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const passwordTemporal = password || (crypto.randomBytes(6).toString('hex') + 'A1!');
    const hash = await bcrypt.hash(passwordTemporal, 10);
    await db.run('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [hash, id]);

    await emailSvc.contrasenaAsignada(user, passwordTemporal);

    res.json({ message: 'Contraseña restablecida', password_temporal: passwordTemporal });
  } catch (err) {
    console.error('[users/reset-password]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Cuánto queda "huérfano" si se desactiva a este usuario: contactos y
// empresas que le pertenecen, y negocios abiertos (los cerrados conservan
// su vendedor original para no distorsionar el histórico/comisiones).
async function calcularImpacto(id) {
  const [contactos, empresas, negociosAbiertos, negociosTotales] = await Promise.all([
    db.get('SELECT count(*)::int AS n FROM contactos WHERE vendedor_id = $1 AND activo = true', [id]),
    db.get('SELECT count(*)::int AS n FROM empresas WHERE vendedor_id = $1 AND activo = true', [id]),
    db.get(
      `SELECT count(*)::int AS n FROM negocios n JOIN pipeline_etapas pe ON pe.id = n.etapa_id
       WHERE n.vendedor_id = $1 AND pe.tipo = 'abierta'`, [id]
    ),
    db.get('SELECT count(*)::int AS n FROM negocios WHERE vendedor_id = $1', [id]),
  ]);
  return {
    contactos: contactos.n, empresas: empresas.n,
    negocios_abiertos: negociosAbiertos.n, negocios_totales: negociosTotales.n,
  };
}

// GET /api/users/:id/impacto — para mostrar antes de inhabilitar/eliminar
router.get('/:id/impacto', authorize('administrador'), async (req, res) => {
  try {
    const user = await db.get('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(await calcularImpacto(req.params.id));
  } catch (err) {
    console.error('[users/impacto]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/users/:id (soft delete) {reasignar_a?}
// Si el usuario tiene contactos, empresas o negocios abiertos, es obligatorio
// indicar a qué vendedor se reasignan antes de poder inhabilitarlo. Los
// negocios ya cerrados (ganados/perdidos) NO se reasignan: quedan con el
// vendedor original para no alterar el histórico de cierres/comisiones.
router.delete('/:id', authorize('administrador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reasignar_a } = req.body || {};
    if (parseInt(id) === req.user.id)
      return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });

    const user = await db.get('SELECT id FROM users WHERE id = $1', [id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const impacto = await calcularImpacto(id);
    const tieneDatos = impacto.contactos > 0 || impacto.empresas > 0 || impacto.negocios_abiertos > 0;

    if (tieneDatos) {
      if (!reasignar_a) {
        return res.status(409).json({
          error: 'Este usuario tiene contactos, empresas o negocios abiertos asignados. Indica a qué vendedor se reasignan.',
          impacto,
        });
      }
      if (parseInt(reasignar_a) === parseInt(id)) {
        return res.status(400).json({ error: 'No puedes reasignar al mismo usuario que estás inhabilitando' });
      }
      const nuevo = await db.get(`SELECT id FROM users WHERE id = $1 AND activo = true`, [reasignar_a]);
      if (!nuevo) return res.status(400).json({ error: 'Vendedor de reasignación inválido o inactivo' });

      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE contactos SET vendedor_id = $1, vendedor_asignado_en = now() WHERE vendedor_id = $2', [reasignar_a, id]);
        await client.query('UPDATE empresas SET vendedor_id = $1 WHERE vendedor_id = $2', [reasignar_a, id]);
        await client.query(
          `UPDATE negocios n SET vendedor_id = $1
           WHERE n.vendedor_id = $2 AND n.etapa_id IN (SELECT id FROM pipeline_etapas WHERE tipo = 'abierta')`,
          [reasignar_a, id]
        );
        await client.query('UPDATE users SET activo = false WHERE id = $1', [id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return res.json({ message: 'Usuario inhabilitado y datos reasignados', reasignados: impacto });
    }

    await db.run('UPDATE users SET activo = false WHERE id = $1', [id]);
    res.json({ message: 'Usuario desactivado correctamente' });
  } catch (err) {
    console.error('[users/DELETE /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
