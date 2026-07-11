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

  // === Etapa 1 — Maestros ===

  await db.run(`
    CREATE TABLE IF NOT EXISTS empresas (
      id SERIAL PRIMARY KEY,
      razon_social TEXT NOT NULL,
      rut TEXT UNIQUE,
      dominio_correo TEXT,
      giro TEXT, direccion TEXT, comuna TEXT, ciudad TEXT,
      telefono_e164 TEXT,
      vendedor_id INTEGER REFERENCES users(id),
      hubspot_id TEXT,
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS contactos (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      apellido TEXT,
      telefono_e164 TEXT UNIQUE,
      email TEXT,
      empresa_id INTEGER REFERENCES empresas(id),
      rut_comprador TEXT,
      cargo TEXT,
      origen TEXT NOT NULL DEFAULT 'manual'
        CHECK (origen IN ('manual','whatsapp','web','migracion_hubspot','importacion_csv')),
      revisar_duplicado BOOLEAN DEFAULT false,
      hubspot_id TEXT,
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      sku TEXT UNIQUE,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      marca TEXT,
      categoria TEXT,
      imagen_path TEXT,
      url_imagen TEXT,
      ficha_tecnica_url TEXT,
      precio_lista NUMERIC(12,2),
      atributos JSONB DEFAULT '{}'::jsonb,
      stock_gestionado_por_proveedor BOOLEAN DEFAULT false,
      proveedor TEXT,
      hubspot_id TEXT,
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  // Columnas agregadas después de la definición inicial (idempotente).
  await db.run(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS marca TEXT`);
  await db.run(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS url_imagen TEXT`);
  await db.run(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS atributos JSONB DEFAULT '{}'::jsonb`);

  await db.run(`
    CREATE TABLE IF NOT EXISTS stock_proveedor (
      id SERIAL PRIMARY KEY,
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      stock INTEGER,
      precio NUMERIC(12,2),
      fecha_carga TIMESTAMP DEFAULT now(),
      archivo_origen TEXT,
      cargado_por_id INTEGER REFERENCES users(id)
    )
  `);

  // Índices para dedup y búsquedas frecuentes.
  await db.run(`CREATE INDEX IF NOT EXISTS idx_contactos_email ON contactos (lower(email))`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_contactos_telefono ON contactos (telefono_e164)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_contactos_empresa ON contactos (empresa_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_empresas_dominio ON empresas (lower(dominio_correo))`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_stock_proveedor_producto ON stock_proveedor (producto_id, fecha_carga DESC)`);

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
