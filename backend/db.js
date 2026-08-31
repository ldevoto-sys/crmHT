const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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
  // Ampliar el CHECK del rol para incluir jefe_comercial (bases existentes) y,
  // más tarde, tecnico (rol restringido solo a Servicio Técnico — HT-AP-03).
  await db.run(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check`);
  await db.run(`ALTER TABLE users ADD CONSTRAINT users_rol_check CHECK (rol IN ('administrador','jefe_comercial','vendedor','callcenter','gerencia','tecnico','integrador'))`);

  // Atribución adicional, independiente del rol: quien la tenga puede
  // gestionar el tablero de Postventa (mover etapas, asignar técnico),
  // sin importar cuál sea su rol normal — permite que, por ejemplo, un jefe
  // comercial cubra Postventa durante una licencia sin cambiarle el rol.
  await db.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS es_encargado_postventa BOOLEAN NOT NULL DEFAULT false`);

  // Teléfono directo del usuario — se muestra en la firma de los correos de
  // seguimiento automático junto al correo del vendedor.
  await db.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telefono TEXT`);

  // Código de vendedor en Softland (VenCod) — carga manual, uno por usuario.
  // Cruce simple 1:1; si en el futuro un vendedor necesita más de un código
  // o la relación deja de ser directa, esto pasa a una tabla de mapeo aparte
  // (decisión tomada así el 18-08-2026, ver HT-DO-XX).
  await db.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_softland TEXT`);

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
  // Contacto dado de alta por la API de integración (Cowork) — HT-DO-XX.
  await db.run(`ALTER TABLE contactos DROP CONSTRAINT IF EXISTS contactos_origen_check`);
  await db.run(`ALTER TABLE contactos ADD CONSTRAINT contactos_origen_check CHECK (origen IN ('manual','whatsapp','web','migracion_hubspot','importacion_csv','api'))`);
  // Vendedor asignado directamente al contacto (independiente del vendedor de
  // cuenta de la empresa, para contactos sin empresa o con dueño propio).
  await db.run(`ALTER TABLE contactos ADD COLUMN IF NOT EXISTS vendedor_id INTEGER REFERENCES users(id)`);
  // Fecha de la última asignación de vendedor (para medir actividad diaria de
  // asignación). No se rellena retroactivamente: para contactos ya asignados
  // antes de este cambio queda NULL, porque no hay forma de saber cuándo ocurrió.
  await db.run(`ALTER TABLE contactos ADD COLUMN IF NOT EXISTS vendedor_asignado_en TIMESTAMP`);
  // Estandariza a mayúsculas nombre/apellido cargados antes de este cambio
  // (los vendedores suelen tipearlos en minúscula). Idempotente: solo toca
  // las filas que todavía no estén en mayúsculas.
  await db.run(`UPDATE contactos SET nombre = UPPER(TRIM(nombre)) WHERE nombre <> UPPER(TRIM(nombre))`);
  await db.run(`UPDATE contactos SET apellido = UPPER(TRIM(apellido)) WHERE apellido IS NOT NULL AND apellido <> UPPER(TRIM(apellido))`);

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
  // Descripción larga (marketing) del catálogo técnico, para mostrar al
  // cliente en la cotización si el vendedor lo pide. Distinta de
  // "descripcion" (campo interno, sin uso en pantalla hoy).
  await db.run(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS descripcion_completa TEXT`);

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

  // Pipelines múltiples (v1.9 §pipelines-multiples): cada área comercial puede
  // tener su propio tablero con sus propias etapas (ej. Ventas Directas vs.
  // Operaciones, con un flujo más largo). Se siembran los 2 iniciales con id
  // fijo para que el resto de las migraciones de esta sección puedan referenciar
  // "Ventas Directas" (id=1) como default sin depender del orden de inserción.
  await db.run(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0,
      activo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  const pipelineExiste = await db.get('SELECT id FROM pipelines LIMIT 1');
  if (!pipelineExiste) {
    await db.run(`INSERT INTO pipelines (id, nombre, orden) VALUES (1, 'Ventas Directas', 1), (2, 'Operaciones', 2)`);
    await db.run(`SELECT setval(pg_get_serial_sequence('pipelines','id'), (SELECT MAX(id) FROM pipelines))`);
    console.log('[DB] Pipelines creados (Ventas Directas, Operaciones).');
  }

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
  // Toda etapa ya existente queda en "Ventas Directas" (id=1) — nada cambia
  // para quienes ya usaban el pipeline único.
  await db.run(`ALTER TABLE pipeline_etapas ADD COLUMN IF NOT EXISTS pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) DEFAULT 1`);

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

  // Origen del requerimiento y clave de idempotencia para negocios creados por
  // integración (HT-DO-XX, API Cowork) — evita duplicar el mismo negocio si
  // el integrador reintenta el mismo POST. Los negocios creados a mano en el
  // CRM quedan con origen 'crm' y sin referencia_externa.
  await db.run(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'crm' CHECK (origen IN ('crm','fracttal','correo','whatsapp','otro'))`);
  await db.run(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS referencia_externa TEXT`);
  await db.run(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS urgencia BOOLEAN NOT NULL DEFAULT false`);
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_negocios_referencia_externa
    ON negocios (origen, referencia_externa) WHERE referencia_externa IS NOT NULL
  `);

  // Pipeline al que pertenece el negocio. Todo lo existente queda en "Ventas
  // Directas" (id=1); se puede mover a otro pipeline a mano (endpoint aparte,
  // no simplemente cambiando de etapa, porque las etapas destino son otras).
  await db.run(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) DEFAULT 1`);

  // Pipeline por defecto de cada usuario: donde caen los negocios que cree.
  // Todos parten en "Ventas Directas" (id=1); se cambia desde Configuración → Usuarios.
  await db.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pipeline_default_id INTEGER NOT NULL REFERENCES pipelines(id) DEFAULT 1`);

  // N° de orden de compra del cliente (Cencosud, Sodimac, etc.), para negocios
  // que nacen de una O/C contra un contrato en vez de una cotización propia
  // (importador masivo de oportunidades — HT-AP-03).
  await db.run(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS n_oc TEXT`);

  // Fecha de compromiso con el cliente (ej. fecha de entrega pactada) — mismo
  // concepto que fecha_limite_respuesta en Postventa, mostrado en el Pipeline
  // con la misma alerta de SLA (vencido/próximo/normal). Distinta de
  // fecha_cierre_estimada (forecast de venta, no compromiso operativo).
  await db.run(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS fecha_compromiso DATE`);

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

  // Seed: etapas del pipeline "Ventas Directas" (id=1) por defecto (configurables luego por el admin).
  const etapaExiste = await db.get('SELECT id FROM pipeline_etapas WHERE pipeline_id = 1 LIMIT 1');
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
      await db.run('INSERT INTO pipeline_etapas (nombre, orden, probabilidad_cierre, tipo, pipeline_id) VALUES ($1,$2,$3,$4,1)', [nombre, orden, prob, tipo]);
    }
    console.log('[DB] Etapas de "Ventas Directas" creadas.');
  }

  // Seed: solo las etapas terminales del pipeline "Operaciones" (id=2). Las
  // etapas intermedias (más largas que las de Ventas Directas, por eso no se
  // asumen aquí) las define el administrador en Config Pipeline antes de
  // asignarle vendedores a este pipeline.
  const etapaOperacionesExiste = await db.get('SELECT id FROM pipeline_etapas WHERE pipeline_id = 2 LIMIT 1');
  if (!etapaOperacionesExiste) {
    await db.run(`INSERT INTO pipeline_etapas (nombre, orden, probabilidad_cierre, tipo, pipeline_id) VALUES ('Ganado', 1, 100, 'ganada', 2)`);
    await db.run(`INSERT INTO pipeline_etapas (nombre, orden, probabilidad_cierre, tipo, pipeline_id) VALUES ('Perdido', 2, 0, 'perdida', 2)`);
    console.log('[DB] Etapas terminales de "Operaciones" creadas (faltan las intermedias, a definir por el administrador).');
  }

  // Seed: causas de no cierre por defecto (§6).
  const causaExiste = await db.get('SELECT id FROM causas_no_cierre LIMIT 1');
  if (!causaExiste) {
    const causas = ['Precio', 'Plazo de entrega', 'Sin stock', 'Compró a competencia', 'Proyecto cancelado', 'Sin respuesta', 'Otro'];
    for (const c of causas) await db.run('INSERT INTO causas_no_cierre (nombre) VALUES ($1)', [c]);
    console.log('[DB] Causas de no cierre creadas.');
  }

  // === Módulo Postventa (v1.10) ===
  // Casos de garantía/reclamo técnico. No reutiliza el pipeline de ventas: es
  // un objeto distinto (no tiene monto ni probabilidad de cierre, sí SLA,
  // prioridad, técnico asignado y el equipo reclamado). Como solo existe un
  // flujo de Postventa (no varias áreas en paralelo, a diferencia de
  // Ventas Directas/Operaciones), sus etapas van en su propia tabla simple,
  // sin pasar por "pipelines".
  await db.run(`
    CREATE TABLE IF NOT EXISTS postventa_etapas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'abierta' CHECK (tipo IN ('abierta','resuelto','rechazado')),
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  const etapaPostventaExiste = await db.get('SELECT id FROM postventa_etapas LIMIT 1');
  if (!etapaPostventaExiste) {
    await db.run(`INSERT INTO postventa_etapas (nombre, orden, tipo) VALUES ('Resuelto', 1, 'resuelto')`);
    await db.run(`INSERT INTO postventa_etapas (nombre, orden, tipo) VALUES ('Rechazado', 2, 'rechazado')`);
    console.log('[DB] Etapas terminales de Postventa creadas (faltan las intermedias, a definir por el encargado).');
  }

  await db.run(`
    CREATE TABLE IF NOT EXISTS casos_postventa (
      id SERIAL PRIMARY KEY,
      negocio_id INTEGER REFERENCES negocios(id),
      contacto_id INTEGER NOT NULL REFERENCES contactos(id),
      empresa_id INTEGER REFERENCES empresas(id),
      producto_id INTEGER REFERENCES productos(id),
      detalle_equipo TEXT,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta','urgente')),
      fecha_limite_respuesta DATE,
      tecnico_asignado_id INTEGER REFERENCES users(id),
      creado_por_id INTEGER NOT NULL REFERENCES users(id),
      etapa_id INTEGER REFERENCES postventa_etapas(id),
      fecha_cierre TIMESTAMP,
      ultima_actividad TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  // Un caso puede originarse en una venta cerrada o crearse directo desde un
  // cliente sin venta previa (ej. reclamo de garantía de un equipo de otro
  // canal) — por eso negocio_id es opcional. En instalaciones creadas antes
  // de esta versión la columna quedó NOT NULL; DROP NOT NULL es un no-op si
  // ya es nullable, así que corre seguro en cualquier caso.
  await db.run(`ALTER TABLE casos_postventa ALTER COLUMN negocio_id DROP NOT NULL`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_casos_postventa_etapa ON casos_postventa (etapa_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_casos_postventa_creador ON casos_postventa (creado_por_id)`);

  // Historial de adjuntos de un caso de postventa (fotos/videos del cliente,
  // informes técnicos, otros documentos) — una fila por archivo, mismo patrón
  // que whatsapp_mensajes: la key de R2 no se expone directa al frontend, se
  // sirve vía un endpoint autenticado propio.
  await db.run(`
    CREATE TABLE IF NOT EXISTS postventa_adjuntos (
      id SERIAL PRIMARY KEY,
      caso_id INTEGER NOT NULL REFERENCES casos_postventa(id),
      tipo TEXT NOT NULL DEFAULT 'otro' CHECK (tipo IN ('foto_cliente','video_cliente','informe_tecnico','otro')),
      descripcion TEXT,
      archivo_key TEXT NOT NULL,
      archivo_nombre TEXT,
      archivo_mime TEXT,
      subido_por_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_postventa_adjuntos_caso ON postventa_adjuntos (caso_id, created_at)`);

  // === Servicio Técnico de bombas ===
  // Calcado de Postventa (mismo patrón de tablero por etapas + adjuntos),
  // pero abierto a todos los roles (no hay restricción de "solo veo lo que
  // creé" — no existe aquí el concepto de vendedor dueño del caso) y con
  // fecha_compromiso en vez de fecha_limite_respuesta, para reusar el mismo
  // nombre de campo y el mismo helper de alerta SLA que Pipeline.
  await db.run(`
    CREATE TABLE IF NOT EXISTS servicio_tecnico_etapas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'abierta' CHECK (tipo IN ('abierta','resuelto','rechazado')),
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  const etapaServicioTecnicoExiste = await db.get('SELECT id FROM servicio_tecnico_etapas LIMIT 1');
  if (!etapaServicioTecnicoExiste) {
    await db.run(`INSERT INTO servicio_tecnico_etapas (nombre, orden, tipo) VALUES ('Resuelto', 1, 'resuelto')`);
    await db.run(`INSERT INTO servicio_tecnico_etapas (nombre, orden, tipo) VALUES ('Rechazado', 2, 'rechazado')`);
    console.log('[DB] Etapas terminales de Servicio Técnico creadas (faltan las intermedias, a definir por el administrador).');
  }

  await db.run(`
    CREATE TABLE IF NOT EXISTS casos_servicio_tecnico (
      id SERIAL PRIMARY KEY,
      negocio_id INTEGER REFERENCES negocios(id),
      contacto_id INTEGER NOT NULL REFERENCES contactos(id),
      empresa_id INTEGER REFERENCES empresas(id),
      producto_id INTEGER REFERENCES productos(id),
      detalle_equipo TEXT,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta','urgente')),
      fecha_compromiso DATE,
      tecnico_asignado_id INTEGER REFERENCES users(id),
      creado_por_id INTEGER NOT NULL REFERENCES users(id),
      etapa_id INTEGER REFERENCES servicio_tecnico_etapas(id),
      fecha_cierre TIMESTAMP,
      ultima_actividad TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_casos_servicio_tecnico_etapa ON casos_servicio_tecnico (etapa_id)`);

  await db.run(`
    CREATE TABLE IF NOT EXISTS servicio_tecnico_adjuntos (
      id SERIAL PRIMARY KEY,
      caso_id INTEGER NOT NULL REFERENCES casos_servicio_tecnico(id),
      tipo TEXT NOT NULL DEFAULT 'otro' CHECK (tipo IN ('foto_cliente','video_cliente','informe_tecnico','otro')),
      descripcion TEXT,
      archivo_key TEXT NOT NULL,
      archivo_nombre TEXT,
      archivo_mime TEXT,
      subido_por_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_servicio_tecnico_adjuntos_caso ON servicio_tecnico_adjuntos (caso_id, created_at)`);

  // === Módulo Despacho (v1.11) ===
  // Una ruta con una o más paradas (puntos), cada una con sus propios datos
  // obligatorios. Puede originarse en un negocio cerrado, en un caso de
  // postventa, o crearse suelta (logística interna sin relación a una venta)
  // — por eso ambos vínculos son opcionales, no uno u otro obligatorio.
  await db.run(`
    CREATE TABLE IF NOT EXISTS despachos (
      id SERIAL PRIMARY KEY,
      negocio_id INTEGER REFERENCES negocios(id),
      caso_postventa_id INTEGER REFERENCES casos_postventa(id),
      titulo TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado','en_ruta','completado','cancelado')),
      creado_por_id INTEGER NOT NULL REFERENCES users(id),
      ultima_actividad TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  // documento_tipo: factura/guía de despacho para una entrega, O/C para un
  // retiro — "otro" cubre casos internos sin ese tipo de respaldo formal.
  // foto_respaldo_key: referencia al archivo en el bucket privado de R2
  // (guía/factura firmada que sube el encargado desde el celular al
  // completar la parada) — no la URL en sí, para no depender de que el
  // bucket sea público.
  await db.run(`
    CREATE TABLE IF NOT EXISTS despacho_puntos (
      id SERIAL PRIMARY KEY,
      despacho_id INTEGER NOT NULL REFERENCES despachos(id),
      orden INTEGER NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL CHECK (tipo IN ('retiro','entrega')),
      direccion TEXT NOT NULL,
      comuna TEXT NOT NULL,
      fecha DATE NOT NULL,
      contacto_nombre TEXT NOT NULL,
      contacto_telefono TEXT,
      documento_tipo TEXT NOT NULL CHECK (documento_tipo IN ('factura','guia_despacho','orden_compra','otro')),
      documento_numero TEXT,
      duracion_estimada_min INTEGER,
      completado BOOLEAN NOT NULL DEFAULT false,
      completado_en TIMESTAMP,
      foto_respaldo_key TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  // Coordenadas cacheadas para no re-geocodificar en cada optimización de
  // ruta; se limpian (a NULL) cuando se edita la dirección o comuna.
  await db.run(`ALTER TABLE despacho_puntos ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
  await db.run(`ALTER TABLE despacho_puntos ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_despacho_puntos_despacho ON despacho_puntos (despacho_id, orden)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_despacho_puntos_fecha ON despacho_puntos (fecha)`);

  // Historial de adjuntos por parada (v1.22) — antes una parada solo tenía
  // foto_respaldo_key (una sola foto, que además se perdía al "reemplazarla").
  // Mismo patrón que postventa_adjuntos/servicio_tecnico_adjuntos: una fila
  // por archivo, nunca se sobrescribe.
  await db.run(`
    CREATE TABLE IF NOT EXISTS despacho_adjuntos (
      id SERIAL PRIMARY KEY,
      punto_id INTEGER NOT NULL REFERENCES despacho_puntos(id),
      archivo_key TEXT NOT NULL,
      archivo_nombre TEXT,
      archivo_mime TEXT,
      subido_por_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_despacho_adjuntos_punto ON despacho_adjuntos (punto_id, created_at)`);
  // Backfill único: la foto que ya estuviera en foto_respaldo_key pasa a ser
  // el primer adjunto histórico, para no perderla al migrar. No borra la
  // columna vieja (queda sin uso) ni vuelve a correr dos veces (el filtro
  // NOT EXISTS evita duplicar si esta migración ya se aplicó antes).
  await db.run(`
    INSERT INTO despacho_adjuntos (punto_id, archivo_key, created_at)
    SELECT id, foto_respaldo_key, created_at FROM despacho_puntos
    WHERE foto_respaldo_key IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM despacho_adjuntos WHERE despacho_adjuntos.punto_id = despacho_puntos.id
      )
  `);

  // Atribución adicional, independiente del rol (mismo patrón que
  // es_encargado_postventa): quien la tenga gestiona el módulo de Despacho
  // completo (agrega/edita paradas, las marca completadas, sube fotos).
  await db.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS es_encargado_despacho BOOLEAN NOT NULL DEFAULT false`);

  // Lugares frecuentes de retiro/entrega (ej. "Vulcano", "Koslan"): solo
  // dirección/comuna/contacto — el tipo (retiro/entrega) y el documento se
  // siguen eligiendo en cada parada porque un mismo lugar puede usarse para
  // ambos casos.
  await db.run(`
    CREATE TABLE IF NOT EXISTS despacho_lugares_frecuentes (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      direccion TEXT NOT NULL,
      comuna TEXT NOT NULL,
      contacto_nombre TEXT,
      contacto_telefono TEXT,
      activo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  // Qué lugar frecuente se eligió para autocompletar una parada (si alguno),
  // para poder mostrar su nombre en la ficha — antes solo quedaban copiadas
  // la dirección/comuna, sin rastro de cuál lugar frecuente era. Se limpia
  // (a NULL) si se edita la dirección o comuna a mano, igual que lat/lng,
  // porque deja de representar a ese lugar.
  await db.run(`ALTER TABLE despacho_puntos ADD COLUMN IF NOT EXISTS lugar_frecuente_id INTEGER REFERENCES despacho_lugares_frecuentes(id)`);

  // === Etapa 2B — Cotizaciones ===

  // Correlativo por año (COT-AAAA-NNNNN): formato reemplazado por el
  // correlativo global de abajo. Se deja la tabla sin usar (no se borra)
  // porque las cotizaciones ya emitidas con ese formato siguen existiendo.
  await db.run(`
    CREATE TABLE IF NOT EXISTS cotizacion_correlativo (
      anio INTEGER PRIMARY KEY,
      ultimo INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Correlativo global sin año, formato NNNNNN (6 dígitos). El número final
  // de una cotización se muestra como NNNNNN-VV (versión, 2 dígitos), sin
  // prefijo de texto. COTIZACION_CORRELATIVO_INICIAL solo se usa la primera
  // vez que se genera una cotización tras este cambio (define desde qué
  // número seguir contando); llamadas siguientes ignoran esa variable y
  // solo incrementan lo que ya hay guardado.
  await db.run(`
    CREATE TABLE IF NOT EXISTS cotizacion_correlativo_global (
      id INTEGER PRIMARY KEY DEFAULT 1,
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

  // El vendedor decide por línea si se muestra la imagen del producto en el
  // PDF/vista pública. Tildado por defecto; sin efecto si la línea no tiene
  // producto asociado o el producto no tiene imagen cargada.
  await db.run(`ALTER TABLE cotizacion_items ADD COLUMN IF NOT EXISTS mostrar_imagen BOOLEAN NOT NULL DEFAULT true`);
  // Igual que mostrar_imagen, pero para la descripción larga del producto.
  await db.run(`ALTER TABLE cotizacion_items ADD COLUMN IF NOT EXISTS mostrar_descripcion BOOLEAN NOT NULL DEFAULT true`);
  // Igual que mostrar_imagen, pero para el link de la ficha técnica (PDF).
  await db.run(`ALTER TABLE cotizacion_items ADD COLUMN IF NOT EXISTS mostrar_ficha BOOLEAN NOT NULL DEFAULT true`);
  // Multiplicador de línea (ej. 0.5 para media unidad, o ajustar un precio
  // matcheado) — solo se edita/muestra en el flujo de Cotizador Operaciones
  // (nota v1.18); Ventas Directas lo deja siempre en 1.
  await db.run(`ALTER TABLE cotizacion_items ADD COLUMN IF NOT EXISTS factor NUMERIC(6,3) NOT NULL DEFAULT 1`);

  // === Cotizador Operaciones (v1.17) — HT-AP-03 nota de cambio v1.17 ===
  // Comunas para el cálculo de traslado/tránsito (reemplaza el array
  // hardcodeado de la herramienta standalone). Debe existir ANTES de la FK
  // que agrega comuna_id a cotizaciones.
  await db.run(`
    CREATE TABLE IF NOT EXISTS comunas_operaciones (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE,
      km NUMERIC(6,1),
      horas_transito NUMERIC(5,2) NOT NULL DEFAULT 0,
      costo_traslado_uf NUMERIC(8,2) NOT NULL DEFAULT 0,
      activo BOOLEAN NOT NULL DEFAULT true
    )
  `);

  // origen distingue una cotización nacida del pipeline Ventas Directas de
  // una nacida de una solicitud Fracttal (Operaciones) — ambas comparten el
  // mismo correlativo y la misma secuencia de seguimiento post-envío, no
  // hay nada más que las separe a nivel de negocio_id/pipeline.
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'venta_directa' CHECK (origen IN ('venta_directa','operaciones'))`);
  // Datos de la solicitud Fracttal de origen (Operaciones); NULL en Ventas Directas.
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fracttal_numero TEXT`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fracttal_fecha_solicitud DATE`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fracttal_solicitante TEXT`);
  // Hallazgo (detectado o completado a mano) y justificación técnica — bloques propios del PDF de Operaciones (§7 de la nota v1.17).
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS hallazgo TEXT`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS justificacion_tecnica TEXT`);
  // desglosado: PDF muestra materiales/elementos menores/markup/MO por separado. alzada: solo el total.
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS modalidad_precio TEXT NOT NULL DEFAULT 'desglosado' CHECK (modalidad_precio IN ('desglosado','alzada'))`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS comuna_id INTEGER REFERENCES comunas_operaciones(id)`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS horas_normales NUMERIC(6,2) NOT NULL DEFAULT 0`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS horas_extra NUMERIC(6,2) NOT NULL DEFAULT 0`);
  // Snapshot de la UF usada al calcular: una cotización de Operaciones ya
  // enviada no debe cambiar de precio en CLP solo porque cambió la UF del
  // día al reabrirla.
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS uf_valor NUMERIC(10,2)`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS uf_fecha DATE`);

  // Moneda en la que se cotizó (nota v1.27 §1): 'CLP' es el comportamiento
  // de siempre. 'UF': los ítems se ingresan a mano en UF (sin buscador de
  // productos, que solo tiene precios en CLP) y subtotal_uf/total_uf guardan
  // esos montos tal cual — es lo único que ve el cliente, sin equivalencia
  // en CLP. subtotal/total (arriba) siguen SIEMPRE en CLP, convertidos con
  // el mismo snapshot uf_valor/uf_fecha, para que Pipeline/Reportes/
  // monto_estimado no tengan que distinguir moneda.
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'CLP' CHECK (moneda IN ('CLP','UF'))`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS subtotal_uf NUMERIC(12,2)`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS total_uf NUMERIC(12,2)`);

  // Caché diaria de la UF (findic.cl). Evita golpear la API externa en cada
  // cotización y deja registro de qué valor estuvo disponible cada día, para
  // poder auditar contra qué UF se calculó una cotización antigua.
  await db.run(`
    CREATE TABLE IF NOT EXISTS uf_diaria (
      fecha DATE PRIMARY KEY,
      valor NUMERIC(10,2) NOT NULL,
      obtenido_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Consideraciones de ejecución del PDF de Operaciones (§7): lista de ítems
  // etiquetados, orden propio, independiente de las líneas de materiales.
  await db.run(`
    CREATE TABLE IF NOT EXISTS cotizacion_consideraciones (
      id SERIAL PRIMARY KEY,
      cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
      tag TEXT NOT NULL CHECK (tag IN ('info','atencion','corte_agua','horario_no_habil','acceso','otro')),
      texto TEXT NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Parámetros de mano de obra (fila única, mismo patrón que config_empresa).
  // hh_uf/hm_uf: costo hora-hombre/hora-máquina. markup: factor de venta
  // sobre materiales. elem_mat_pct: % de elementos menores sobre el
  // subtotal de materiales. elem_furg_uf: elementos menores de furgón, fijo
  // por trabajo.
  await db.run(`
    CREATE TABLE IF NOT EXISTS config_operaciones_mo (
      id INTEGER PRIMARY KEY DEFAULT 1,
      hh_uf NUMERIC(8,2) NOT NULL DEFAULT 0,
      hm_uf NUMERIC(8,2) NOT NULL DEFAULT 0,
      markup NUMERIC(5,2) NOT NULL DEFAULT 1,
      elem_mat_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      elem_furg_uf NUMERIC(8,2) NOT NULL DEFAULT 0,
      CONSTRAINT config_operaciones_mo_unica CHECK (id = 1)
    )
  `);
  const operacionesMoExiste = await db.get('SELECT id FROM config_operaciones_mo WHERE id = 1');
  if (!operacionesMoExiste) {
    await db.run('INSERT INTO config_operaciones_mo (id) VALUES (1)');
    console.log('[DB] Config de mano de obra de Operaciones creada (valores en 0, pendiente de cargar).');
  }

  // Sinónimos para el matching de ítems del correo Fracttal contra el
  // maestro de productos (reemplaza el objeto JS hardcodeado SINONIMOS de
  // la herramienta standalone).
  await db.run(`
    CREATE TABLE IF NOT EXISTS cotizacion_sinonimos_operaciones (
      id SERIAL PRIMARY KEY,
      termino_fracttal TEXT NOT NULL,
      termino_bbdd TEXT NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT true
    )
  `);

  // === Cotizador Operaciones (v1.18) — HT-AP-03 nota de cambio v1.18 ===
  // Plantilla de propuesta en Word (HTCO01-04) para cualquier cotización
  // (Ventas Directas u Operaciones) — independiente del cálculo de MO/comuna,
  // que sigue siendo exclusivo de Operaciones (origen='operaciones').
  await db.run(`
    ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS tipo_plantilla TEXT NOT NULL DEFAULT 'ninguna'
    CHECK (tipo_plantilla IN ('ninguna','simple_suministro','estandar_suministro_montaje','llave_en_mano_regulado','lavado_sanitizacion'))
  `);
  // Secciones narrativas de la plantilla: texto libre editable, se inicializan
  // con el texto tipo de la plantilla elegida y el operador las ajusta al
  // proyecto específico antes de generar el Word.
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS objeto_propuesta TEXT`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS alcances_texto TEXT`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS exclusiones_texto TEXT`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS condiciones_ejecucion_texto TEXT`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS otras_consideraciones_texto TEXT`);
  // El Word generado se descarga para retocar (fotos, ajustes) fuera del
  // sistema; el PDF ya retocado se sube aquí antes de poder enviarlo con el
  // botón "Enviar cotización" existente.
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS documento_final_url TEXT`);
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS documento_final_subido_en TIMESTAMP`);

  // Los tipos originales (NUMERIC(8,2) / NUMERIC(5,2), v1.17) truncaban a 2
  // decimales — insuficiente para los valores reales de la herramienta
  // standalone (ej. hh_uf=0.456426, costo_traslado_uf=0.042301). Se amplían
  // antes de resembrar para no perder precisión.
  await db.run(`ALTER TABLE config_operaciones_mo ALTER COLUMN hh_uf TYPE NUMERIC(10,6)`);
  await db.run(`ALTER TABLE config_operaciones_mo ALTER COLUMN hm_uf TYPE NUMERIC(10,6)`);
  await db.run(`ALTER TABLE config_operaciones_mo ALTER COLUMN elem_furg_uf TYPE NUMERIC(10,6)`);
  await db.run(`ALTER TABLE comunas_operaciones ALTER COLUMN horas_transito TYPE NUMERIC(10,6)`);
  await db.run(`ALTER TABLE comunas_operaciones ALTER COLUMN costo_traslado_uf TYPE NUMERIC(10,6)`);

  // Resiembra de los valores reales de la herramienta standalone
  // `cotizador_hidrotecnica.html` (en uso actual del equipo de Operaciones),
  // que v1.17 dejó en 0/vacío. Solo se resiembra si nadie los tocó todavía —
  // no pisa configuración ya editada por un administrador.
  const moDefault = await db.get(
    `SELECT 1 FROM config_operaciones_mo WHERE id=1 AND hh_uf=0 AND hm_uf=0 AND markup=1 AND elem_mat_pct=0 AND elem_furg_uf=0`
  );
  if (moDefault) {
    await db.run(
      `UPDATE config_operaciones_mo SET hh_uf=0.456426, hm_uf=0.069477, markup=1.47, elem_mat_pct=0.07, elem_furg_uf=0.358 WHERE id=1`
    );
    console.log('[DB] Config de mano de obra de Operaciones resembrada con valores reales.');
  }

  const comunasExisten = await db.get('SELECT 1 FROM comunas_operaciones LIMIT 1');
  if (!comunasExisten) {
    const comunasSeed = [
      { c: 'Cerrillos', km: 10.0, ht: 0.6667, ct: 0.285954 }, { c: 'Cerro Navia', km: 10.0, ht: 0.6667, ct: 0.285954 },
      { c: 'Conchalí', km: 8.0, ht: 0.5333, ct: 0.269034 }, { c: 'El Bosque', km: 12.0, ht: 0.8, ct: 0.40355 },
      { c: 'Estación Central', km: 5.0, ht: 0.3333, ct: 0.042301 }, { c: 'Huechuraba', km: 11.0, ht: 0.7333, ct: 0.39509 },
      { c: 'Independencia', km: 5.0, ht: 0.3333, ct: 0.14297 }, { c: 'La Cisterna', km: 11.0, ht: 0.7333, ct: 0.185956 },
      { c: 'La Florida', km: 14.0, ht: 0.9333, ct: 0.169036 }, { c: 'La Granja', km: 12.0, ht: 0.8, ct: 0.135196 },
      { c: 'La Pintana', km: 18.0, ht: 1.2, ct: 0.270377 }, { c: 'La Reina', km: 11.0, ht: 0.7333, ct: 0.152116 },
      { c: 'Las Condes', km: 12.0, ht: 0.8, ct: 0.203876 }, { c: 'Lo Barnechea', km: 18.0, ht: 1.2, ct: 0.372838 },
      { c: 'Lo Espejo', km: 12.0, ht: 0.8, ct: 0.152116 }, { c: 'Lo Prado', km: 8.0, ht: 0.5333, ct: 0.101718 },
      { c: 'Macul', km: 10.0, ht: 0.6667, ct: 0.118637 }, { c: 'Maipú', km: 15.0, ht: 1.0, ct: 0.219915 },
      { c: 'Ñuñoa', km: 8.0, ht: 0.5333, ct: 0.084798 }, { c: 'Pedro Aguirre Cerda', km: 9.0, ht: 0.6, ct: 0.118637 },
      { c: 'Peñalolén', km: 14.0, ht: 0.9333, ct: 0.185956 }, { c: 'Providencia', km: 6.0, ht: 0.4, ct: 0.033921 },
      { c: 'Pudahuel', km: 13.0, ht: 0.8667, ct: 0.219915 }, { c: 'Quilicura', km: 14.0, ht: 0.9333, ct: 0.320477 },
      { c: 'Quinta Normal', km: 7.0, ht: 0.4667, ct: 0.084798 }, { c: 'Recoleta', km: 5.0, ht: 0.3333, ct: 0.118637 },
      { c: 'Renca', km: 10.0, ht: 0.6667, ct: 0.235397 }, { c: 'San Joaquín', km: 6.0, ht: 0.4, ct: 0.050761 },
      { c: 'San Miguel', km: 6.0, ht: 0.4, ct: 0.151437 }, { c: 'San Ramón', km: 11.0, ht: 0.7333, ct: 0.294414 },
      { c: 'Santiago', km: 3.0, ht: 0.2, ct: 0.025381 },
    ];
    for (const co of comunasSeed) {
      await db.run(
        `INSERT INTO comunas_operaciones (nombre, km, horas_transito, costo_traslado_uf) VALUES ($1,$2,$3,$4)`,
        [co.c, co.km, co.ht, co.ct]
      );
    }
    console.log(`[DB] Comunas de Operaciones resembradas (${comunasSeed.length}).`);
  }

  const sinonimosExisten = await db.get('SELECT 1 FROM cotizacion_sinonimos_operaciones LIMIT 1');
  if (!sinonimosExisten) {
    const sinonimosSeed = [
      ['tripolar', 'automatico'], ['tripolares', 'automatico'], ['disyuntor', 'automatico'], ['breaker', 'automatico'],
      ['contactor', 'contactor'], ['contactores', 'contactor'],
      ['termico', 'rele termico'], ['relé térmico', 'rele termico'], ['rele termico', 'rele termico'], ['relés termicos', 'rele termico'],
      ['rele', 'rele miniatura'], ['relé', 'rele miniatura'],
      ['ferrule', 'terminal ferrule'], ['ferrul', 'terminal ferrule'],
      ['cable control', 'cable thhn'],
      ['flange', 'flange'], ['brida', 'flange'],
      ['chapaleta', 'valvula chapaleta'], ['chapa leta', 'valvula chapaleta'],
      ['pera de nivel', 'pera nivel'], ['peras de nivel', 'pera nivel'],
      ['mufa', 'mufa resina'], ['mufas', 'mufa resina'],
      ['perno anclaje', 'perno anclaje'], ['pernos anclaje', 'perno anclaje'], ['pernos de anclaje', 'perno anclaje'],
      ['copla pvc', 'copla pvc'], ['terminal pvc', 'terminal he pvc'],
      ['terminal he pvc', 'terminal he pvc'], ['union americana pvc', 'union americ. pvc'],
      ['hilo tuerca galvanizado', 'hilo tuerca galvanizado'],
      ['codo galvanizado', 'codo galvanizado'],
      ['bomba pedrollo', 'bomba pedrollo'], ['vx', 'pedrollo vx'],
      ['pera', 'pera nivel'], ['cordel', 'cordel polipropileno'],
    ];
    for (const [fracttal, bbdd] of sinonimosSeed) {
      await db.run(
        `INSERT INTO cotizacion_sinonimos_operaciones (termino_fracttal, termino_bbdd) VALUES ($1,$2)`,
        [fracttal, bbdd]
      );
    }
    console.log(`[DB] Sinónimos de Operaciones resembrados (${sinonimosSeed.length}).`);
  }

  // Datos del emisor y banco para el documento de cotización (fila única id=1).
  await db.run(`
    CREATE TABLE IF NOT EXISTS config_empresa (
      id INTEGER PRIMARY KEY DEFAULT 1,
      razon_social TEXT, rut TEXT, direccion TEXT, comuna TEXT, ciudad TEXT,
      telefono TEXT, whatsapp TEXT, email_ventas TEXT, email_cobranzas TEXT,
      sitio_web TEXT, banco TEXT, cuenta_tipo TEXT, cuenta_numero TEXT,
      mensaje_cotizacion_whatsapp TEXT NOT NULL DEFAULT '',
      CONSTRAINT config_empresa_unica CHECK (id = 1)
    )
  `);
  const cfgExiste = await db.get('SELECT id FROM config_empresa WHERE id = 1');
  if (!cfgExiste) {
    await db.run(
      `INSERT INTO config_empresa (id, razon_social, rut, direccion, comuna, ciudad, telefono, whatsapp, email_ventas, email_cobranzas, sitio_web, banco, cuenta_tipo, cuenta_numero, mensaje_cotizacion_whatsapp)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      ['HidroTécnica SpA', '80.463.600-5', 'Manuel Tocornal 1906', 'Santiago', 'Santiago',
       '(56 2) 2327 6000', '+56 9 8106 2974', 'ventas@hidrotecnica.cl', 'cobranzas@hidrotecnica.cl',
       'www.hidrotecnica.cl', 'Banco de Chile', 'Cuenta Corriente', '1510143209',
       'Adjunto la cotización según lo solicitado, quedo atento a cualquier consulta para que la revisemos juntos.']
    );
    console.log('[DB] Config de empresa (emisor) creada.');
  }
  await db.run(`ALTER TABLE config_empresa ADD COLUMN IF NOT EXISTS mensaje_cotizacion_whatsapp TEXT NOT NULL DEFAULT ''`);
  await db.run(
    `UPDATE config_empresa SET mensaje_cotizacion_whatsapp=$1 WHERE id=1 AND mensaje_cotizacion_whatsapp=''`,
    ['Adjunto la cotización según lo solicitado, quedo atento a cualquier consulta para que la revisemos juntos.']
  );
  // Texto del correo de envío de cotización, y bloque opcional de WhatsApp
  // dentro de ese correo (mismo patrón que el mensaje de WhatsApp de arriba).
  await db.run(`ALTER TABLE config_empresa ADD COLUMN IF NOT EXISTS mensaje_cotizacion_email TEXT NOT NULL DEFAULT ''`);
  await db.run(`ALTER TABLE config_empresa ADD COLUMN IF NOT EXISTS incluir_whatsapp_email BOOLEAN NOT NULL DEFAULT true`);
  await db.run(`ALTER TABLE config_empresa ADD COLUMN IF NOT EXISTS mensaje_whatsapp_email TEXT NOT NULL DEFAULT ''`);
  await db.run(
    `UPDATE config_empresa SET mensaje_cotizacion_email=$1 WHERE id=1 AND mensaje_cotizacion_email=''`,
    ['Junto con saludar, adjuntamos la cotización solicitada']
  );
  await db.run(
    `UPDATE config_empresa SET mensaje_whatsapp_email=$1 WHERE id=1 AND mensaje_whatsapp_email=''`,
    ['Cualquier consulta sobre esta cotización o sobre otro tema, puede responder este correo o escribirnos a nuestro whatsapp.']
  );

  // Formas de pago seleccionables en la cotización. incluir_datos_bancarios
  // decide si el correo de envío agrega el bloque de datos bancarios
  // (el PDF los muestra siempre, sin condicionar a esto).
  await db.run(`
    CREATE TABLE IF NOT EXISTS formas_pago (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE,
      incluir_datos_bancarios BOOLEAN NOT NULL DEFAULT true,
      activo BOOLEAN NOT NULL DEFAULT true
    )
  `);
  const formasPagoExisten = await db.get('SELECT 1 FROM formas_pago LIMIT 1');
  if (!formasPagoExisten) {
    await db.run(
      `INSERT INTO formas_pago (nombre, incluir_datos_bancarios) VALUES
       ('Transferencia bancaria', true), ('Efectivo', false), ('Cheque', false)`
    );
    console.log('[DB] Formas de pago creadas (valores por defecto).');
  }
  await db.run(`ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS forma_pago_id INTEGER REFERENCES formas_pago(id)`);

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
  // Espera fina en horas, además de los días (ej. "1 día y 4 horas"). Acotada
  // a 0-23 para que las horas sean siempre el resto de un día — el total se
  // sigue expresando como dias_espera días + horas_espera horas, nunca al revés.
  await db.run(`ALTER TABLE secuencia_pasos ADD COLUMN IF NOT EXISTS horas_espera INTEGER NOT NULL DEFAULT 0 CHECK (horas_espera >= 0 AND horas_espera < 24)`);

  // Paso "cambiar etapa" (19-08-2026): en vez de enviar un mensaje, mueve el
  // negocio a otra etapa del pipeline — usa el mismo dias_espera/horas_espera
  // que ya tienen los demás pasos como "plazo de gracia" antes de actuar. Si
  // el contacto responde antes (secuencia pausada por /marcar-respondido),
  // este paso nunca se ejecuta, igual que cualquier otro paso posterior.
  await db.run(`ALTER TABLE secuencia_pasos DROP CONSTRAINT IF EXISTS secuencia_pasos_canal_check`);
  await db.run(`ALTER TABLE secuencia_pasos ADD CONSTRAINT secuencia_pasos_canal_check CHECK (canal IN ('correo','whatsapp','llamada','tarea','cambiar_etapa'))`);
  await db.run(`ALTER TABLE secuencia_pasos ALTER COLUMN mensaje DROP NOT NULL`); // no aplica al canal 'cambiar_etapa'
  await db.run(`ALTER TABLE secuencia_pasos ADD COLUMN IF NOT EXISTS etapa_destino_id INTEGER REFERENCES pipeline_etapas(id)`);
  await db.run(`ALTER TABLE secuencia_pasos ADD COLUMN IF NOT EXISTS causa_no_cierre_id INTEGER REFERENCES causas_no_cierre(id)`);

  // Canal "whatsapp" con envío automático (26-08-2026): WhatsApp exige una
  // plantilla aprobada por Meta para mensajes que inicia la empresa fuera de
  // la ventana de 24h de servicio — no texto libre como el canal correo. El
  // nombre guardado acá coincide con el nombre de la plantilla en Meta (ver
  // services/secuencias.js#PLANTILLAS_WHATSAPP).
  await db.run(`ALTER TABLE secuencia_pasos ADD COLUMN IF NOT EXISTS whatsapp_template TEXT`);

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
  // Editar una secuencia reemplaza todos sus pasos (borra e inserta de
  // nuevo) — sin esto, borrar un paso que ya se ejecutó alguna vez rompería
  // por la llave foránea. El log de ejecución queda igual, solo pierde la
  // referencia al paso exacto (19-08-2026: se saca el candado que impedía
  // editar una secuencia ya usada — ver nota de cambio).
  await db.run(`ALTER TABLE secuencia_ejecuciones ALTER COLUMN paso_id DROP NOT NULL`);
  await db.run(`ALTER TABLE secuencia_ejecuciones DROP CONSTRAINT IF EXISTS secuencia_ejecuciones_paso_id_fkey`);
  await db.run(`ALTER TABLE secuencia_ejecuciones ADD CONSTRAINT secuencia_ejecuciones_paso_id_fkey FOREIGN KEY (paso_id) REFERENCES secuencia_pasos(id) ON DELETE SET NULL`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_secuencia_pasos_secuencia ON secuencia_pasos (secuencia_id, orden)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_negocio_secuencias_pendientes ON negocio_secuencias (estado, proxima_ejecucion)`);

  // Si está marcada, un paso vencido fuera del horario de atención espera a
  // que abra en vez de generarse a cualquier hora (ver config_horario_atencion).
  await db.run(`ALTER TABLE secuencias ADD COLUMN IF NOT EXISTS respetar_horario BOOLEAN NOT NULL DEFAULT false`);

  // Secuencia que se dispara al entrar a una etapa del pipeline (reemplaza
  // cualquier otra activa/pausada del negocio) y se detiene al salir de esa
  // etapa hacia una que no tenga secuencia asociada, o al cerrar el negocio.
  // Ver services/secuencias.js#alCambiarEtapa.
  await db.run(`ALTER TABLE pipeline_etapas ADD COLUMN IF NOT EXISTS secuencia_id INTEGER REFERENCES secuencias(id) ON DELETE SET NULL`);

  // Migración única: reemplaza al viejo toggle "es_default_post_cotizacion"
  // (una sola secuencia global que se disparaba al enviar la cotización) por
  // el nuevo mecanismo genérico por etapa — la secuencia marcada como default
  // pasa a quedar asociada a toda etapa "Cotizado" que todavía no tenga una.
  const teniaColumnaVieja = await db.get(
    `SELECT 1 FROM information_schema.columns WHERE table_name='secuencias' AND column_name='es_default_post_cotizacion'`
  );
  if (teniaColumnaVieja) {
    const secuenciaDefault = await db.get(`SELECT id FROM secuencias WHERE es_default_post_cotizacion = true LIMIT 1`);
    if (secuenciaDefault) {
      await db.run(
        `UPDATE pipeline_etapas SET secuencia_id = $1
         WHERE tipo='abierta' AND activo=true AND nombre ILIKE 'cotizado' AND secuencia_id IS NULL`,
        [secuenciaDefault.id]
      );
      console.log('[DB] Secuencia post-cotización migrada a la(s) etapa(s) "Cotizado".');
    }
    await db.run('DROP INDEX IF EXISTS idx_secuencias_default_post_cotizacion');
    await db.run('ALTER TABLE secuencias DROP COLUMN es_default_post_cotizacion');
  }

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
  // Apaga cada tipo de respuesta automática por separado: el mensaje
  // entrante se sigue registrando en la Bandeja para atención manual, pero
  // el bot no contesta el tipo que esté desactivado.
  await db.run(`ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS activo_fuera_horario BOOLEAN NOT NULL DEFAULT true`);
  await db.run(`ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS activo_categorizacion BOOLEAN NOT NULL DEFAULT true`);
  await db.run(`ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS activo_confirmacion BOOLEAN NOT NULL DEFAULT true`);
  await db.run(`ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS activo_recontacto BOOLEAN NOT NULL DEFAULT true`);
  await db.run(`ALTER TABLE whatsapp_bot_config DROP COLUMN IF EXISTS bot_activo`);
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

  // Adjuntos y medios (fotos/audio/video/documentos que manda el cliente, o
  // que sube un vendedor para enviar). El archivo en sí se guarda en R2
  // (services/r2.js); acá solo queda la referencia (key, nombre, mime).
  await db.run(`ALTER TABLE whatsapp_mensajes ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto','imagen','video','audio','documento'))`);
  await db.run(`ALTER TABLE whatsapp_mensajes ADD COLUMN IF NOT EXISTS archivo_key TEXT`);
  await db.run(`ALTER TABLE whatsapp_mensajes ADD COLUMN IF NOT EXISTS archivo_nombre TEXT`);
  await db.run(`ALTER TABLE whatsapp_mensajes ADD COLUMN IF NOT EXISTS archivo_mime TEXT`);

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
  // Archivar: oculta la conversación de la Bandeja (a diferencia de "cerrar",
  // que solo bloquea el texto libre pero la sigue mostrando). Mismo criterio
  // de reaparición que cerrada_manual: si el cliente vuelve a escribir, se
  // desarchiva sola (ver services/whatsapp_mensajes.js).
  await db.run(`ALTER TABLE whatsapp_conversaciones ADD COLUMN IF NOT EXISTS archivada BOOLEAN NOT NULL DEFAULT false`);
  await db.run(`ALTER TABLE whatsapp_conversaciones ADD COLUMN IF NOT EXISTS archivada_en TIMESTAMP`);
  await db.run(`ALTER TABLE whatsapp_conversaciones ADD COLUMN IF NOT EXISTS archivada_por_id INTEGER REFERENCES users(id)`);

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

  // Seed: actor "Cowork" — a él se le atribuyen en auditoría/timeline las
  // escrituras hechas por la API de integración (HT-DO-XX). No inicia sesión
  // (sin password conocida); solo existe como referencia de autoría.
  const coworkExiste = await db.get(`SELECT id FROM users WHERE email = 'cowork@integracion.hidrotecnica.cl'`);
  if (!coworkExiste) {
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    await db.run(
      `INSERT INTO users (nombre, email, password_hash, rol, activo, must_change_password, recibe_round_robin)
       VALUES ('Cowork', 'cowork@integracion.hidrotecnica.cl', $1, 'integrador', true, true, false)`,
      [hash]
    );
    console.log('[DB] Usuario "Cowork" (integrador API) creado.');
  }

  // === Informe diario por correo (cotizaciones generadas + negocios ganados) ===
  // Una fila por día ya informado, para que el chequeo horario en server.js
  // (cada 15 min) no reenvíe el mismo informe dos veces si cae dentro de la
  // misma ventana de las 8am.
  await db.run(`
    CREATE TABLE IF NOT EXISTS informe_diario_envios (
      fecha DATE PRIMARY KEY,
      enviado_en TIMESTAMP DEFAULT now()
    )
  `);

  // === Aviso de casos de Postventa vencidos (v1.25) ===
  // Una fila por día en que se envió el aviso (solo si había al menos un caso
  // vencido) — mismo patrón que informe_diario_envios, evita reenviar dos
  // veces si el chequeo horario cae dos veces dentro de la ventana de 8:30am.
  await db.run(`
    CREATE TABLE IF NOT EXISTS postventa_vencidos_envios (
      fecha DATE PRIMARY KEY,
      enviado_en TIMESTAMP DEFAULT now()
    )
  `);

  // === Reportería Comercial + Softland (HT-AP-03, acordado con Gerencia el
  // 19-08-2026) ===
  // Área comercial del vendedor (Ventas Mesón / Operaciones / V Región /
  // Otros). Antes vivía hardcodeada a mano en un script externo (mapa
  // VenCod→área, uno por uno); se formaliza acá como campo editable en
  // Usuarios para que no se rompa cada vez que se suma un vendedor nuevo o
  // alguien cambia de área.
  await db.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS area TEXT`);
  await db.run(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_area_check`);
  await db.run(`ALTER TABLE users ADD CONSTRAINT users_area_check CHECK (area IS NULL OR area IN ('meson','operaciones','vregion','otros'))`);

  // Caché del extracto nocturno de Softland (23:00 hora Chile) — evita
  // consultar la réplica de Softland en cada carga del reporte. Se recarga
  // completa cada noche (trunca + inserta), no incremental.
  //
  // Cotizado: solo trae datos hasta jul-2026 (la consulta a Softland ya
  // filtra por fecha, igual que el script que reemplaza) — desde ago-2026
  // el cotizado se lee en vivo desde la tabla `cotizaciones` propia del CRM,
  // no de acá. Cerrado (NV emitidas) y Facturado sí son de Softland siempre,
  // sin corte de fecha y sin cruce con el pipeline del CRM (acordado
  // 19-08-2026: cuentan las NV que Softland generó, punto, sin exigir que el
  // negocio esté marcado "Ganado" en el CRM ni que tenga cotización acá).
  await db.run(`
    CREATE TABLE IF NOT EXISTS reporte_softland_mensual (
      id SERIAL PRIMARY KEY,
      anio INTEGER NOT NULL,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      vencod TEXT NOT NULL,
      nombre_vendedor TEXT,
      cotizado_monto NUMERIC NOT NULL DEFAULT 0,
      cotizado_cant INTEGER NOT NULL DEFAULT 0,
      cerrado_monto NUMERIC NOT NULL DEFAULT 0,
      cerrado_cant INTEGER NOT NULL DEFAULT 0,
      facturado_monto NUMERIC NOT NULL DEFAULT 0,
      facturado_cant INTEGER NOT NULL DEFAULT 0,
      UNIQUE (anio, mes, vencod)
    )
  `);

  // Snapshot de notas de venta pendientes de facturar (una fila por NV, no
  // por línea de detalle — si más adelante hace falta el detalle línea por
  // línea, esta tabla se extiende, no se rediseña).
  await db.run(`
    CREATE TABLE IF NOT EXISTS reporte_softland_nv_pendientes (
      id SERIAL PRIMARY KEY,
      nv_numero TEXT NOT NULL,
      fecha_nv DATE NOT NULL,
      vencod TEXT,
      nombre_vendedor TEXT,
      cod_cliente TEXT,
      nombre_cliente TEXT,
      num_oc TEXT,
      monto_pendiente NUMERIC NOT NULL DEFAULT 0
    )
  `);

  // Control de la rutina nocturna: registra cada corrida (exitosa o
  // fallida) para poder diagnosticar sin tener que revisar logs de Railway.
  // A diferencia de *_envios (que solo evitan reenviar el mismo día), acá
  // además queda el detalle de filas cargadas o el error, porque esta
  // rutina depende de una red externa (Softland) que puede fallar.
  await db.run(`
    CREATE TABLE IF NOT EXISTS reporte_softland_sync (
      fecha DATE PRIMARY KEY,
      ejecutado_en TIMESTAMP NOT NULL DEFAULT now(),
      ok BOOLEAN NOT NULL,
      filas_mensual INTEGER,
      filas_pendientes INTEGER,
      error TEXT
    )
  `);

  // Listados documento por documento (cotizaciones, notas de venta —todas,
  // no solo pendientes— y facturas), para las pestañas de detalle de la
  // Reportería Comercial + Softland (nota de cambio v1.31). anio/mes quedan
  // como columnas propias (no solo derivadas de `fecha`) para que el
  // backend pueda filtrar/indexar sin tener que extraerlos en cada consulta.
  await db.run(`
    CREATE TABLE IF NOT EXISTS reporte_softland_cotizaciones (
      id SERIAL PRIMARY KEY,
      cot_num TEXT NOT NULL UNIQUE,
      anio INTEGER NOT NULL,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      fecha DATE NOT NULL,
      vencod TEXT,
      nombre_vendedor TEXT,
      cod_cliente TEXT,
      nombre_cliente TEXT,
      monto NUMERIC NOT NULL DEFAULT 0
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_softland_cotizaciones_anio_mes ON reporte_softland_cotizaciones (anio, mes)');

  await db.run(`
    CREATE TABLE IF NOT EXISTS reporte_softland_notas_venta (
      id SERIAL PRIMARY KEY,
      nv_numero TEXT NOT NULL UNIQUE,
      anio INTEGER NOT NULL,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      fecha DATE NOT NULL,
      vencod TEXT,
      nombre_vendedor TEXT,
      cod_cliente TEXT,
      nombre_cliente TEXT,
      num_oc TEXT,
      monto NUMERIC NOT NULL DEFAULT 0
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_softland_notas_venta_anio_mes ON reporte_softland_notas_venta (anio, mes)');

  await db.run(`
    CREATE TABLE IF NOT EXISTS reporte_softland_facturas (
      id SERIAL PRIMARY KEY,
      folio TEXT NOT NULL UNIQUE,
      anio INTEGER NOT NULL,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      fecha DATE NOT NULL,
      vencod TEXT,
      nombre_vendedor TEXT,
      cod_cliente TEXT,
      nombre_cliente TEXT,
      monto NUMERIC NOT NULL DEFAULT 0
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_softland_facturas_anio_mes ON reporte_softland_facturas (anio, mes)');

  // Control de backfill histórico: cada dataset de Softland con historial
  // "congelado" (no cambia una vez pasados ~2 meses) se consulta completo
  // UNA sola vez; de ahí en adelante la sincronización nocturna solo repite
  // el mes abierto + el mes anterior (acordado con Comercial 22-08-2026 —
  // no tiene sentido volver a pedirle 3 años de historial a la réplica de
  // Softland todas las noches si esos datos ya no cambian). La presencia de
  // una fila acá es lo único que indica "ya se hizo la carga histórica" —
  // si la fila no existe, se asume que nunca se corrió y se hace completa.
  await db.run(`
    CREATE TABLE IF NOT EXISTS reporte_softland_backfill (
      dataset TEXT PRIMARY KEY,
      completado_hasta TEXT,
      ejecutado_en TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

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

  // === Migraciones de un solo uso (más allá de tablas/columnas nuevas) ===
  // Registro de qué backfills puntuales ya se aplicaron. A diferencia de las
  // migraciones de esquema (CREATE TABLE/COLUMN IF NOT EXISTS, naturalmente
  // idempotentes), un backfill de datos que se repitiera en cada arranque
  // podría pisar una corrección manual hecha después por un usuario — por
  // eso necesitan aplicarse una vez y quedar registradas.
  await db.run(`
    CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
      nombre TEXT PRIMARY KEY,
      aplicada_en TIMESTAMP DEFAULT now()
    )
  `);

  // Backfill (nota de cambio v1.26): negocios.monto_estimado pasaba a
  // sincronizarse con el TOTAL con IVA de la cotización (v1.24) — se corrigió
  // para guardar el NETO (sin IVA), pero los negocios ya sincronizados antes
  // de este cambio se quedaron con el total. Se recalcula una sola vez, para
  // cada negocio con al menos una cotización, a partir del neto de su
  // cotización más reciente (mismo criterio que sincronizarMontoEstimado()/
  // netoDeFila() en routes/cotizaciones.js). Los negocios sin ninguna
  // cotización no se tocan — mantienen lo que se haya cargado a mano.
  const backfillNetoAplicado = await db.get(
    `SELECT 1 FROM migraciones_aplicadas WHERE nombre = 'monto_estimado_neto_v1.26'`
  );
  if (!backfillNetoAplicado) {
    const resultado = await db.run(`
      UPDATE negocios n SET monto_estimado = uc.neto
      FROM (
        SELECT DISTINCT ON (c.negocio_id) c.negocio_id,
          CASE WHEN c.origen = 'operaciones' THEN ROUND(c.subtotal)
               ELSE ROUND(c.subtotal * (1 - COALESCE(c.descuento_pct, 0) / 100.0))
          END AS neto
        FROM cotizaciones c
        ORDER BY c.negocio_id, c.created_at DESC
      ) uc
      WHERE n.id = uc.negocio_id
    `);
    await db.run(`INSERT INTO migraciones_aplicadas (nombre) VALUES ('monto_estimado_neto_v1.26')`);
    console.log(`[DB] Backfill monto_estimado → neto aplicado (${resultado.rowCount} negocio(s) actualizados).`);
  }

  // === Memoria de conversaciones de WhatsApp (visión a futuro discutida en
  // HT-AP-03, punto 3) ===
  // Diario: un resumen corto por contacto y día, generado por el LLM
  // procesando solo los mensajes de ESE día (nunca relee el historial
  // completo). Maestro: memoria acumulada por contacto, que se actualiza
  // fusionando cada resumen diario nuevo con la memoria existente — no se
  // recalcula entera cada vez, para que no crezca sin control.
  await db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_resumen_diario (
      id SERIAL PRIMARY KEY,
      contacto_id INTEGER NOT NULL REFERENCES contactos(id),
      fecha DATE NOT NULL,
      resumen TEXT NOT NULL,
      cantidad_mensajes INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE (contacto_id, fecha)
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_memoria (
      contacto_id INTEGER PRIMARY KEY REFERENCES contactos(id),
      memoria TEXT NOT NULL,
      ultima_fecha_incorporada DATE NOT NULL,
      actualizado_en TIMESTAMP DEFAULT now()
    )
  `);
  // Control de ejecución diaria (mismo patrón que informe_diario_envios):
  // evita generar dos veces los resúmenes del mismo día.
  await db.run(`CREATE TABLE IF NOT EXISTS whatsapp_memoria_envios (fecha DATE PRIMARY KEY)`);

  console.log('[DB] Base de datos lista.');
}

module.exports = { db, initDb };
