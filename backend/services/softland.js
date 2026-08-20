// Conexión de solo lectura a la réplica de Softland (SQL Server), para la
// Reportería Comercial + Softland (HT-AP-03, acordado con Gerencia el
// 19-08-2026). Reemplaza la conexión que hacía a mano el script
// `generar_dashboard.py` desde el equipo de Luis — acá corre del lado del
// backend, en la rutina nocturna de las 23:00 (services/softlandSync.js,
// siguiente paso).
//
// Variables de entorno requeridas (Railway, staging y producción):
//   SOFTLAND_DB_SERVER  ej: SQLREPLICA01.SOFTLANDCLOUD.CL,1433
//   SOFTLAND_DB_NAME    ej: HIDROTECNICA1
//   SOFTLAND_DB_USER    ej: HIDROTECNICA
//   SOFTLAND_DB_PASS    la entrega Softland — de solo lectura sobre una
//                       réplica, no rotable por nuestro lado (confirmado con
//                       Gerencia el 19-08-2026: riesgo aceptado).
const sql = require('mssql');

function config() {
  const { SOFTLAND_DB_SERVER, SOFTLAND_DB_NAME, SOFTLAND_DB_USER, SOFTLAND_DB_PASS } = process.env;
  if (!SOFTLAND_DB_SERVER || !SOFTLAND_DB_NAME || !SOFTLAND_DB_USER || !SOFTLAND_DB_PASS) {
    throw new Error(
      'Faltan variables de entorno de Softland (SOFTLAND_DB_SERVER, SOFTLAND_DB_NAME, SOFTLAND_DB_USER, SOFTLAND_DB_PASS).'
    );
  }
  // SOFTLAND_DB_SERVER viene como "host,puerto" (mismo formato que usaba
  // pyodbc en el script) — el driver mssql necesita host y puerto separados.
  const [host, puerto] = SOFTLAND_DB_SERVER.split(',');
  return {
    server: host,
    port: puerto ? Number(puerto) : 1433,
    database: SOFTLAND_DB_NAME,
    user: SOFTLAND_DB_USER,
    password: SOFTLAND_DB_PASS,
    options: {
      // Softland Cloud es un SQL Server administrado (certificado válido de
      // una CA pública) — encrypt:true es lo estándar para ese caso. Si al
      // probar contra la réplica real sale un error de certificado (self-
      // signed), se soluciona con SOFTLAND_DB_TRUST_CERT=true en Railway sin
      // tocar código.
      encrypt: true,
      trustServerCertificate: process.env.SOFTLAND_DB_TRUST_CERT === 'true',
    },
    connectionTimeout: 15000,
    requestTimeout: 60000, // las consultas agregan varios años de historia — pueden demorar
    pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
  };
}

let poolPromise = null;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config()).connect().catch(err => {
      poolPromise = null; // para que el siguiente intento reconecte, no quede pegado en la promesa fallida
      throw err;
    });
  }
  return poolPromise;
}

// query(sql, params?) — params es un objeto { nombre: valor }, se referencia
// en el texto SQL como @nombre (equivalente a los $1/$2 de pg en db.js).
async function query(text, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  for (const [nombre, valor] of Object.entries(params)) request.input(nombre, valor);
  const result = await request.query(text);
  return result.recordset;
}

module.exports = { query };
