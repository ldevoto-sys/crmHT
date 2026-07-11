const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Railway inyecta DATABASE_URL. En desarrollo local puede apuntarse a un
// Postgres propio. No usamos SQLite: es un sistema multi-usuario con
// webhooks concurrentes (ver documento HT-AP-03 §3).
if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL no está definida. Configúrala antes de iniciar.');
}

// SSL: las conexiones internas de Railway (*.railway.internal) y localhost no
// requieren SSL; las públicas sí. rejectUnauthorized:false porque Railway usa
// certificados autofirmados en el proxy público.
function sslConfig(url) {
  if (!url) return false;
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('.railway.internal')) {
    return false;
  }
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(process.env.DATABASE_URL),
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool de conexiones:', err.message);
});

// Helpers con la misma forma que usábamos en las apps hermanas, pero sobre pg.
// Placeholders posicionales de Postgres: $1, $2, ...
const db = {
  // Una fila o null
  get: async (text, params = []) => {
    const { rows } = await pool.query(text, params);
    return rows[0] || null;
  },
  // Todas las filas
  all: async (text, params = []) => {
    const { rows } = await pool.query(text, params);
    return rows;
  },
  // Ejecuta y devuelve el result completo (rowCount, rows con RETURNING, etc.)
  run: async (text, params = []) => pool.query(text, params),
  pool,
};

async function initDb() {
  // Bloque A (andamiaje): solo la tabla de usuarios y el seed del administrador.
  // Los maestros (empresas, contactos, productos, ...) se agregan en la Etapa 1.
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      rut TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('administrador','vendedor','callcenter','gerencia')),
      activo BOOLEAN DEFAULT true,
      must_change_password BOOLEAN DEFAULT true,
      reset_token TEXT,
      reset_token_expires TIMESTAMP,
      graph_token_data JSONB,
      recibe_round_robin BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  // Seed: administrador. must_change_password=false según HT-AP-03 §16.
  // La contraseña por defecto DEBE cambiarse tras el primer despliegue.
  const adminExiste = await db.get('SELECT id FROM users LIMIT 1');
  if (!adminExiste) {
    const passwordInicial = process.env.ADMIN_PASSWORD || 'Admin2024!';
    const hash = await bcrypt.hash(passwordInicial, 10);
    await db.run(
      `INSERT INTO users (nombre, rut, email, password_hash, rol, must_change_password, recibe_round_robin)
       VALUES ($1, $2, $3, $4, $5, false, false)`,
      ['Administrador', '11.111.111-1', 'admin@hidrotecnica.cl', hash, 'administrador']
    );
    console.log('[DB] Usuario administrador creado (admin@hidrotecnica.cl).');
  }

  console.log('[DB] Base de datos lista.');
}

module.exports = { db, initDb };
