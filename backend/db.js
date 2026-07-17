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
      rol TEXT NOT NULL CHECK (rol IN ('administrador','jefe_comercial','vendedor','callcenter','gerencia')),
      activo BOOLEAN DEFAULT true,
      must_change_password BOOLEAN DEFAULT true,
      reset_token TEXT,
      reset_token_expires TIMESTAMP,
      graph_token_data JSONB,
      recibe_round_robin BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  // Ampliar el CHECK del rol para incluir jefe_comercial (bases existentes).
  await db.run(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check`);
  await db.run(`ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('administrador','jefe_comercial','vendedor','callcenter','gerencia'))`);

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
  // Vendedor asignado directamente al contacto (independiente del vendedor de
  // cuenta de la empresa, para contactos sin empresa o con dueño propio).
  await db.run(`ALTER TABLE contactos ADD COLUMN IF NOT EXISTS vendedor_id INTEGER REFERENCES users(id)`);
  // Fecha de la última asignación de vendedor (para medir actividad diaria de
  // asignación). No se rellena retroactivamente: para contactos ya asignados
  // antes de este cambio queda NULL, porque no hay forma de saber cuándo ocurrió.
  await db.run(`ALTER TABLE contactos ADD COLUMN IF NOT EXISTS vendedor_asignado_en TIMESTAMP`);

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

  // Fecha estimada de cierre (forecast), editable por el vendedor mientras el
  // negocio está abierto. Distinta de fecha_cierre (real, se fija sola al cerrar).
  await db.run(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS fecha_cierre_estimada DATE`);

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
  // Título/descripción general de la cotización (ej. "Sistema hidroneumático Edificio X").
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS titulo TEXT`);

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

  // === Etapa 3A — Notas y tareas ===

  await db.run(`
    CREATE TABLE IF NOT EXISTS notas (
      id SERIAL PRIMARY KEY,
      contacto_id INTEGER REFERENCES contactos(id),
      empresa_id INTEGER REFERENCES empresas(id),
      negocio_id INTEGER REFERENCES negocios(id),
      texto TEXT NOT NULL,
      usuario_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS tareas (
      id SERIAL PRIMARY KEY,
      contacto_id INTEGER REFERENCES contactos(id),
      empresa_id INTEGER REFERENCES empresas(id),
      negocio_id INTEGER REFERENCES negocios(id),
      titulo TEXT NOT NULL,
      descripcion TEXT,
      fecha_vencimiento TIMESTAMP,
      asignado_a_id INTEGER NOT NULL REFERENCES users(id),
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','cumplida','cancelada')),
      creado_por_id INTEGER NOT NULL REFERENCES users(id),
      cumplida_en TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_notas_negocio ON notas (negocio_id, created_at DESC)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_notas_contacto ON notas (contacto_id, created_at DESC)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_tareas_asignado ON tareas (asignado_a_id, estado, fecha_vencimiento)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_tareas_negocio ON tareas (negocio_id, created_at DESC)`);

  // Historial de etapas por negocio (para reportería de tiempos por etapa, Etapa 3E).
  // Se completa hacia adelante desde que existe esta tabla; los negocios creados
  // antes no tienen su primer tramo registrado.
  await db.run(`
    CREATE TABLE IF NOT EXISTS negocio_etapa_historial (
      id SERIAL PRIMARY KEY,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id),
      etapa_id INTEGER REFERENCES pipeline_etapas(id),
      entro_en TIMESTAMP NOT NULL DEFAULT now(),
      salio_en TIMESTAMP
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_etapa_historial_negocio ON negocio_etapa_historial (negocio_id, entro_en)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_etapa_historial_etapa ON negocio_etapa_historial (etapa_id, salio_en)`);

  // === Etapa 3B — Motor de secuencias de seguimiento ===
  // Nota: mientras Graph (correo) y WhatsApp (Etapa 4) no estén conectados,
  // cada paso que vence genera una TAREA para que el vendedor lo ejecute a
  // mano, en vez de enviar automáticamente. El motor y el enganche manual
  // (pausar/reactivar/marcar respondido/seguimiento manual) sí quedan
  // operativos ahora; el envío automático se conecta cuando el canal exista.

  await db.run(`
    CREATE TABLE IF NOT EXISTS secuencias (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      activo BOOLEAN DEFAULT true,
      creado_por_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS secuencia_pasos (
      id SERIAL PRIMARY KEY,
      secuencia_id INTEGER NOT NULL REFERENCES secuencias(id) ON DELETE CASCADE,
      orden INTEGER NOT NULL,
      dias_espera INTEGER NOT NULL DEFAULT 1 CHECK (dias_espera >= 0),
      canal TEXT NOT NULL CHECK (canal IN ('correo','whatsapp','llamada','tarea')),
      asunto TEXT,
      mensaje TEXT NOT NULL,
      UNIQUE (secuencia_id, orden)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS negocio_secuencias (
      id SERIAL PRIMARY KEY,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id),
      secuencia_id INTEGER NOT NULL REFERENCES secuencias(id),
      paso_actual INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','pausada','completada','cancelada')),
      proxima_ejecucion TIMESTAMP,
      pausada_motivo TEXT,
      iniciado_por_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )
  `);
  // Solo una secuencia activa o pausada por negocio a la vez.
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_negocio_secuencia_activa
    ON negocio_secuencias (negocio_id) WHERE estado IN ('activa','pausada')
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS secuencia_ejecuciones (
      id SERIAL PRIMARY KEY,
      negocio_secuencia_id INTEGER NOT NULL REFERENCES negocio_secuencias(id) ON DELETE CASCADE,
      paso_id INTEGER NOT NULL REFERENCES secuencia_pasos(id),
      tarea_id INTEGER REFERENCES tareas(id),
      ejecutado_en TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_secuencia_pasos_secuencia ON secuencia_pasos (secuencia_id, orden)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_negocio_secuencias_pendientes ON negocio_secuencias (estado, proxima_ejecucion)`);

  // Si está marcada, un paso vencido fuera del horario de atención espera a
  // que abra en vez de generarse a cualquier hora (ver config_horario_atencion).
  await db.run(`ALTER TABLE secuencias ADD COLUMN IF NOT EXISTS respetar_horario BOOLEAN NOT NULL DEFAULT false`);

  // === Etapa 4 (preparación) — Bot de WhatsApp: horario, categorización y recontacto ===
  // El canal de WhatsApp en sí depende de credenciales de Meta (pendientes de
  // IT, nota de cambio v1.8 §7); esta configuración es independiente de eso.

  await db.run(`
    CREATE TABLE IF NOT EXISTS config_horario_atencion (
      id INTEGER PRIMARY KEY DEFAULT 1,
      dias_habiles INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
      hora_inicio TIME NOT NULL DEFAULT '09:15',
      hora_fin TIME NOT NULL DEFAULT '17:15',
      CONSTRAINT config_horario_atencion_unica CHECK (id = 1)
    )
  `);
  const horarioExiste = await db.get('SELECT id FROM config_horario_atencion WHERE id = 1');
  if (!horarioExiste) {
    await db.run('INSERT INTO config_horario_atencion (id) VALUES (1)');
    console.log('[DB] Horario de atención creado (L-V 09:15-17:15).');
  }

  await db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_bot_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      mensaje_fuera_horario TEXT NOT NULL,
      mensaje_categorizacion TEXT NOT NULL,
      opciones_categorizacion JSONB NOT NULL DEFAULT '[]'::jsonb,
      recontacto_respeta_horario BOOLEAN NOT NULL DEFAULT true,
      mensaje_confirmacion TEXT NOT NULL DEFAULT '',
      bandeja_acceso TEXT NOT NULL DEFAULT 'todos' CHECK (bandeja_acceso IN ('todos','asignado')),
      CONSTRAINT whatsapp_bot_config_unica CHECK (id = 1)
    )
  `);
  const whatsappCfgExiste = await db.get('SELECT id FROM whatsapp_bot_config WHERE id = 1');
  if (!whatsappCfgExiste) {
    await db.run(
      `INSERT INTO whatsapp_bot_config (id, mensaje_fuera_horario, mensaje_categorizacion, opciones_categorizacion, mensaje_confirmacion)
       VALUES (1, $1, $2, $3, $4)`,
      [
        '¡Hola! Gracias por escribir a HidroTecnica 👋. En este momento estamos fuera de nuestro horario de atención (Lunes a Viernes, 9:15 a 17:15 hrs). Registramos tu mensaje y uno de nuestros ejecutivos te contactará apenas abramos.',
        '¡Hola! Para ayudarte más rápido, cuéntanos qué necesitas:',
        JSON.stringify([
          { label: 'Cotizar un producto', categoria: 'cotizacion' },
          { label: 'Consulta técnica o soporte', categoria: 'soporte' },
          { label: 'Otro', categoria: 'otro' },
        ]),
        'Te estamos asignando un ejecutivo, por favor espéranos un momento 🙂',
      ]
    );
    console.log('[DB] Config del bot de WhatsApp creada.');
  }
  await db.run(`ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS mensaje_confirmacion TEXT NOT NULL DEFAULT ''`);
  await db.run(`ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS bandeja_acceso TEXT NOT NULL DEFAULT 'todos'`);
  await db.run(
    `UPDATE whatsapp_bot_config SET mensaje_confirmacion=$1 WHERE id=1 AND mensaje_confirmacion=''`,
    ['Te estamos asignando un ejecutivo, por favor espéranos un momento 🙂']
  );

  await db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_recontacto_pasos (
      id SERIAL PRIMARY KEY,
      orden INTEGER NOT NULL UNIQUE,
      tiempo_espera_horas INTEGER NOT NULL CHECK (tiempo_espera_horas > 0),
      mensaje TEXT NOT NULL
    )
  `);
  const recontactoExiste = await db.get('SELECT id FROM whatsapp_recontacto_pasos LIMIT 1');
  if (!recontactoExiste) {
    const pasosRecontacto = [
      [1, 1, '¡Hola de nuevo! ¿Sigues ahí? Cuéntanos qué necesitas y te ayudamos enseguida 🙂'],
      [2, 8, 'Hola, seguimos atentos a tu consulta. Si nos cuentas qué producto o servicio te interesa, te contactamos con la información que necesitas.'],
      [3, 24, 'No hemos tenido noticias tuyas, así que por ahora cerraremos esta conversación. Si más adelante necesitas algo, escríbenos de nuevo — ¡con gusto te ayudamos! 👋'],
    ];
    for (const [orden, horas, mensaje] of pasosRecontacto) {
      await db.run('INSERT INTO whatsapp_recontacto_pasos (orden, tiempo_espera_horas, mensaje) VALUES ($1,$2,$3)', [orden, horas, mensaje]);
    }
    console.log('[DB] Pasos de recontacto de WhatsApp creados (1h/8h/24h).');
  }

  // leads: seguimiento del bot de categorización/recontacto (independiente del
  // estado nuevo/asignado/convertido/descartado ya existente).
  await db.run(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS causa_descarte TEXT`);
  await db.run(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_estado TEXT CHECK (bot_estado IN ('esperando_categoria','recontactando','derivado','cerrado'))`);
  await db.run(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_paso_recontacto INTEGER NOT NULL DEFAULT 0`);
  await db.run(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_proxima_accion TIMESTAMP`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_leads_bot_pendientes ON leads (bot_estado, bot_proxima_accion)`);

  // Historial completo de mensajes de WhatsApp (Bandeja WhatsApp): tanto los
  // del bot de categorización/recontacto como los que escriba el cliente o un
  // vendedor una vez asignado. lead_id queda fijo al lead vigente al momento
  // del mensaje (no se reescribe si después se crea un lead nuevo).
  await db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
      id SERIAL PRIMARY KEY,
      contacto_id INTEGER NOT NULL REFERENCES contactos(id),
      lead_id INTEGER REFERENCES leads(id),
      direccion TEXT NOT NULL CHECK (direccion IN ('entrante','saliente')),
      texto TEXT NOT NULL,
      enviado_por_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_mensajes_contacto ON whatsapp_mensajes (contacto_id, created_at)`);

  // Cierre manual de conversación (además del cierre automático por 24h sin
  // actividad, que se calcula al vuelo). Se reabre solo si el cliente vuelve a
  // escribir (ver services/whatsapp_mensajes.js).
  await db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_conversaciones (
      contacto_id INTEGER PRIMARY KEY REFERENCES contactos(id),
      cerrada_manual BOOLEAN NOT NULL DEFAULT false,
      cerrada_en TIMESTAMP,
      cerrada_por_id INTEGER REFERENCES users(id)
    )
  `);

  // === Etapa 3C — Encuesta post-cierre ===
  // Supuesto de alcance (a validar con Gerencia, nota de cambio v1.7): encuesta
  // simple de una pregunta (puntaje 0-10, estilo NPS) + comentario libre. Como
  // el envío de correo al cliente depende de Graph (bloqueado), se genera una
  // tarea para que el vendedor comparta el link con el cliente por su canal.

  await db.run(`
    CREATE TABLE IF NOT EXISTS encuestas (
      id SERIAL PRIMARY KEY,
      negocio_id INTEGER NOT NULL UNIQUE REFERENCES negocios(id),
      token_publico TEXT UNIQUE NOT NULL,
      recordatorio_enviado_en TIMESTAMP,
      respondida_en TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS encuesta_respuestas (
      id SERIAL PRIMARY KEY,
      encuesta_id INTEGER NOT NULL REFERENCES encuestas(id),
      puntaje INTEGER NOT NULL CHECK (puntaje BETWEEN 0 AND 10),
      comentario TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_encuestas_pendiente_recordatorio ON encuestas (respondida_en, recordatorio_enviado_en, created_at)`);

  // Pregunta de la encuesta, editable por admin/jefe comercial (fila única id=1).
  await db.run(`
    CREATE TABLE IF NOT EXISTS encuesta_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      pregunta TEXT NOT NULL,
      CONSTRAINT encuesta_config_unica CHECK (id = 1)
    )
  `);
  const encuestaCfgExiste = await db.get('SELECT id FROM encuesta_config WHERE id = 1');
  if (!encuestaCfgExiste) {
    await db.run(
      `INSERT INTO encuesta_config (id, pregunta) VALUES (1, $1)`,
      ['¿Qué tan probable es que recomiendes a HidroTecnica? (0 = nada probable, 10 = muy probable)']
    );
    console.log('[DB] Config de encuesta creada.');
  }

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

  // === Rol de solo lectura para BI externo (Power BI, Looker Studio, etc.) ===
  // Se provisiona solo si BI_READONLY_PASSWORD está definida (variable de
  // entorno en Railway). La contraseña se resincroniza en cada arranque: para
  // rotarla basta con cambiar la variable y volver a desplegar.
  if (process.env.BI_READONLY_PASSWORD) {
    const rolBI = process.env.BI_READONLY_USER || 'bi_readonly';
    if (!/^[a-z_][a-z0-9_]*$/i.test(rolBI)) {
      console.error(`[DB] BI_READONLY_USER "${rolBI}" no es un nombre de rol válido; se omite el aprovisionamiento.`);
    } else {
      try {
        const password = process.env.BI_READONLY_PASSWORD.replace(/'/g, "''");
        const existe = await db.get('SELECT 1 FROM pg_roles WHERE rolname = $1', [rolBI]);
        if (!existe) {
          await db.run(`CREATE ROLE ${rolBI} WITH LOGIN PASSWORD '${password}'`);
          console.log(`[DB] Rol de solo lectura "${rolBI}" creado.`);
        } else {
          await db.run(`ALTER ROLE ${rolBI} WITH LOGIN PASSWORD '${password}'`);
        }
        const { db_name: dbName } = await db.get('SELECT current_database() AS db_name');
        await db.run(`GRANT CONNECT ON DATABASE ${dbName} TO ${rolBI}`);
        await db.run(`GRANT USAGE ON SCHEMA public TO ${rolBI}`);
        await db.run(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${rolBI}`);
        await db.run(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${rolBI}`);
        console.log(`[DB] Permisos de solo lectura sincronizados para "${rolBI}" (incluye tablas futuras).`);
      } catch (err) {
        console.error(`[DB] No se pudo aprovisionar el rol de solo lectura "${rolBI}": ${err.message}`);
      }
    }
  }

  console.log('[DB] Base de datos lista.');
}

module.exports = { db, initDb };
