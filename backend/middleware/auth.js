const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const { db } = require('../db');

// El JWT dura 8 horas y solo se valida su firma: si a alguien se le
// desactiva la cuenta, se le cambia el rol o se le quita un permiso
// (es_encargado_*), seguía operando con el token viejo hasta que expirara.
// Se revisa el estado real en la base en cada request, con un caché corto
// en memoria para no pegarle a la base en cada llamado (auditoría
// 23-09-2026, M-M2). Rotar RAM del proceso (redeploy) limpia el caché solo.
const CACHE_MS = 60 * 1000;
const cacheUsuarios = new Map(); // id -> { datos, expira }

async function datosVigentes(id) {
  const entrada = cacheUsuarios.get(id);
  if (entrada && entrada.expira > Date.now()) return entrada.datos;
  const fila = await db.get(
    'SELECT rol, activo, must_change_password, es_encargado_postventa, es_encargado_despacho FROM users WHERE id = $1',
    [id]
  );
  cacheUsuarios.set(id, { datos: fila || null, expira: Date.now() + CACHE_MS });
  return fila || null;
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  let payload;
  try {
    payload = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
  try {
    const vigente = await datosVigentes(payload.id);
    if (!vigente || !vigente.activo) return res.status(401).json({ error: 'No autorizado' });
    req.user = {
      ...payload,
      rol: vigente.rol,
      must_change_password: vigente.must_change_password,
      es_encargado_postventa: vigente.es_encargado_postventa,
      es_encargado_despacho: vigente.es_encargado_despacho,
    };
    // Con contraseña por cambiar obligatoriamente, solo se permite esa
    // acción — hasta ahora era solo una redirección del frontend, así que
    // la contraseña temporal servía para usar toda la API igual (M-B3).
    const esCambioDePassword = req.method === 'POST' && req.path === '/change-password' && req.baseUrl === '/api/auth';
    if (vigente.must_change_password && !esCambioDePassword) {
      return res.status(403).json({ error: 'Debes cambiar tu contraseña antes de continuar', code: 'must_change_password' });
    }
    next();
  } catch (err) {
    console.error('[auth middleware] Error al verificar estado del usuario:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'Sin permiso' });
    next();
  };
}

module.exports = { authenticate, authorize };
