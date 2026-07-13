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

  // === Etapa 2 — Pipeline de negocios (etapas configurables, v1.4) ===

  // Etapas configurables del pipeline. tipo: 'abierta' | 'ganada' | 'perdida'.
  // Las terminales (ganada/perdida) están protegidas: no se borran.
  await db.run(`
    CREATE TABLE IF NOT EXISTS pipeline_etapas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0,
      probabilidad_cierre INTEGER NOT NULL DEFAULT 0 CHECK (probabilidad_cierre BETWEEN 0 AND 100),
      tipo TEXT NOT NULL DEFAULT 'abierta' CHECK (tipo IN ('abierta','ganada','perdida')),
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS causas_no_cierre (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE,
      activo BOOLEAN DEFAULT true
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS negocios (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER REFERENCES empresas(id),
      contacto_id INTEGER NOT NULL REFERENCES contactos(id),
      vendedor_id INTEGER NOT NULL REFERENCES users(id),
      titulo TEXT NOT NULL,
      etapa_id INTEGER REFERENCES pipeline_etapas(id),
      probabilidad_cierre INTEGER CHECK (probabilidad_cierre BETWEEN 0 AND 100),
      monto_estimado NUMERIC(12,2),
      causa_no_cierre_id INTEGER REFERENCES causas_no_cierre(id),
      causa_no_cierre_detalle TEXT,
      fecha_cierre TIMESTAMP,
      ultima_actividad TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  // Línea de tiempo unificada. cotizacion_id sin FK todavía (la tabla llega en 2B).
  await db.run(`
    CREATE TABLE IF NOT EXISTS timeline (
      id SERIAL PRIMARY KEY,
      contacto_id INTEGER REFERENCES contactos(id),
      empresa_id INTEGER REFERENCES empresas(id),
      negocio_id INTEGER REFERENCES negocios(id),
      cotizacion_id INTEGER,
      tipo TEXT NOT NULL CHECK (tipo IN (
        'wa_mensaje','correo_enviado','correo_respuesta','cotizacion_enviada',
        'cotizacion_vista','seguimiento_auto','seguimiento_manual','nota','tarea',
        'llamada','cambio_etapa','asignacion','encuesta_respondida'
      )),
      descripcion TEXT NOT NULL,
      usuario_id INTEGER REFERENCES users(id),
      referencia_id INTEGER,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_negocios_vendedor ON negocios (vendedor_id, etapa_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_timeline_negocio ON timeline (negocio_id, created_at DESC)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_timeline_contacto ON timeline (contacto_id, created_at DESC)`);

  // Seed: etapas del pipeline por defecto (configurables luego por el admin).
  const etapaExiste = await db.get('SELECT id FROM pipeline_etapas LIMIT 1');
  if (!etapaExiste) {
    const etapas = [
      ['Lead', 1, 10, 'abierta'],
      ['Calificado', 2, 25, 'abierta'],
      ['Cotizado', 3, 50, 'abierta'],
      ['Negociación', 4, 75, 'abierta'],
      ['Ganado', 5, 100, 'ganada'],
      ['Perdido', 6, 0, 'perdida'],
    ];
    for (const [nombre, orden, prob, tipo] of etapas) {
      await db.run('INSERT INTO pipeline_etapas (nombre, orden, probabilidad_cierre, tipo) VALUES ($1,$2,$3,$4)', [nombre, orden, prob, tipo]);
    }
    console.log('[DB] Etapas de pipeline creadas.');
  }

  // Seed: causas de no cierre por defecto (§6).
  const causaExiste = await db.get('SELECT id FROM causas_no_cierre LIMIT 1');
  if (!causaExiste) {
    const causas = ['Precio', 'Plazo de entrega', 'Sin stock', 'Compró a competencia', 'Proyecto cancelado', 'Sin respuesta', 'Otro'];
    for (const c of causas) await db.run('INSERT INTO causas_no_cierre (nombre) VALUES ($1)', [c]);
    console.log('[DB] Causas de no cierre creadas.');
  }

  // === Etapa 2B — Cotizaciones ===

  // Correlativo global por año: COT-AAAA-NNNNN.
  await db.run(`
    CREATE TABLE IF NOT EXISTS cotizacion_correlativo (
      anio INTEGER PRIMARY KEY,
      ultimo INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS cotizaciones (
      id SERIAL PRIMARY KEY,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id),
      numero TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      estado TEXT NOT NULL DEFAULT 'borrador'
        CHECK (estado IN ('borrador','enviada','vista','aceptada','rechazada','vencida','reemplazada')),
      subtotal NUMERIC(12,2) DEFAULT 0,
      descuento_pct NUMERIC(5,2) DEFAULT 0,
      total NUMERIC(12,2) DEFAULT 0,
      descuento_aprobado_por_id INTEGER REFERENCES users(id),
      descuento_solicitado BOOLEAN DEFAULT false,
      validez_dias INTEGER DEFAULT 15,
      condiciones TEXT,
      token_publico TEXT UNIQUE,
      pdf_path TEXT,
      fecha_envio TIMESTAMP,
      creado_por_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE (negocio_id, numero, version)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS cotizacion_items (
      id SERIAL PRIMARY KEY,
      cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
      producto_id INTEGER REFERENCES productos(id),
      descripcion TEXT,
      cantidad NUMERIC(10,2) NOT NULL DEFAULT 1,
      precio_unitario NUMERIC(12,2) NOT NULL,
      total_linea NUMERIC(12,2) NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS cotizacion_envios (
      id SERIAL PRIMARY KEY,
      cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id),
      canal TEXT NOT NULL CHECK (canal IN ('correo','whatsapp')),
      destinatario TEXT NOT NULL,
      graph_message_id TEXT,
      graph_conversation_id TEXT,
      wa_message_id TEXT,
      enviado_por_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS cotizacion_vistas (
      id SERIAL PRIMARY KEY,
      cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id),
      ip TEXT, user_agent TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_cotizaciones_negocio ON cotizaciones (negocio_id, version DESC)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_cotizacion_items_cot ON cotizacion_items (cotizacion_id)`);
  // IVA en la cotización (default 19%, configurable por cotización; 0 = exento).
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS iva_pct NUMERIC(5,2) DEFAULT 19`);

  // Datos del emisor y banco para el documento de cotización (fila única id=1).
  await db.run(`
    CREATE TABLE IF NOT EXISTS config_empresa (
      id INTEGER PRIMARY KEY DEFAULT 1,
      razon_social TEXT, rut TEXT, direccion TEXT, comuna TEXT, ciudad TEXT,
      telefono TEXT, whatsapp TEXT, email_ventas TEXT, email_cobranzas TEXT,
      sitio_web TEXT, banco TEXT, cuenta_tipo TEXT, cuenta_numero TEXT,
      CONSTRAINT config_empresa_unica CHECK (id = 1)
    )
  `);
  const cfgExiste = await db.get('SELECT id FROM config_empresa WHERE id = 1');
  if (!cfgExiste) {
    await db.run(
      `INSERT INTO config_empresa (id, razon_social, rut, direccion, comuna, ciudad, telefono, whatsapp, email_ventas, email_cobranzas, sitio_web, banco, cuenta_tipo, cuenta_numero)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      ['HidroTécnica SpA', '80.463.600-5', 'Manuel Tocornal 1906', 'Santiago', 'Santiago',
       '(56 2) 2327 6000', '+56 9 8106 2974', 'ventas@hidrotecnica.cl', 'cobranzas@hidrotecnica.cl',
       'www.hidrotecnica.cl', 'Banco de Chile', 'Cuenta Corriente', '1510143209']
    );
    console.log('[DB] Config de empresa (emisor) creada.');
  }

  // === Etapa 2E — Leads y motor de asignación (§7.1, §9.4) ===

  await db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      contacto_id INTEGER REFERENCES contactos(id),
      conversacion_id INTEGER,
      origen TEXT NOT NULL DEFAULT 'web' CHECK (origen IN ('whatsapp','web','manual','correo','telefono')),
      creado_por TEXT NOT NULL DEFAULT 'web' CHECK (creado_por IN ('bot','callcenter','vendedor','web')),
      estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo','asignado','convertido','descartado')),
      vendedor_id INTEGER REFERENCES users(id),
      vendedor_sugerido_id INTEGER REFERENCES users(id),
      asignacion_modo TEXT CHECK (asignacion_modo IN ('sugerida_confirmada','sugerida_cambiada','automatica_apertura','manual')),
      negocio_id INTEGER REFERENCES negocios(id),
      producto_interes_id INTEGER REFERENCES productos(id),
      pagina_origen TEXT,
      mensaje_formulario TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS lead_respuestas (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      campo TEXT NOT NULL,
      valor TEXT NOT NULL,
      capturado_por TEXT NOT NULL DEFAULT 'bot' CHECK (capturado_por IN ('bot','humano')),
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS reglas_asignacion (
      id SERIAL PRIMARY KEY,
      prioridad INTEGER NOT NULL DEFAULT 100,
      tipo TEXT NOT NULL CHECK (tipo IN ('vendedor_de_cuenta','por_categoria','round_robin')),
      parametro TEXT,
      vendedor_id INTEGER REFERENCES users(id),
      activo BOOLEAN DEFAULT true
    )
  `);

  await db.run(`CREATE TABLE IF NOT EXISTS round_robin_estado (id INTEGER PRIMARY KEY DEFAULT 1, ultimo_vendedor_id INTEGER, CONSTRAINT rr_unica CHECK (id = 1))`);
  const rrExiste = await db.get('SELECT id FROM round_robin_estado WHERE id = 1');
  if (!rrExiste) await db.run('INSERT INTO round_robin_estado (id, ultimo_vendedor_id) VALUES (1, NULL)');
  await db.run(`CREATE INDEX IF NOT EXISTS idx_leads_estado ON leads (estado, created_at DESC)`);

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
