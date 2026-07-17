require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db');
const { avanzarPasosPendientes } = require('./services/secuencias');
const { enviarRecordatorios } = require('./services/encuestas');
const { avanzarRecontactosPendientes } = require('./services/whatsapp_bot');

const app = express();
const PORT = process.env.PORT || 3001;

// Railway corre detrás de un proxy: sin esto, req.ip sería siempre la IP del
// proxy (rompe el rate limiting y el registro de IP en cotizacion_vistas).
app.set('trust proxy', 1);

// Uploads (imágenes de producto, fichas técnicas, media WhatsApp). En Railway
// se monta un volumen persistente en RAILWAY_VOLUME_MOUNT_PATH.
const uploadsDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads')
  : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// CSP desactivado: el frontend carga imágenes de producto desde dominios
// externos (fichas/fotos del catálogo); una CSP por defecto las bloquearía.
app.use(helmet({ contentSecurityPolicy: false }));

// El frontend siempre llama a esta misma API en el mismo origen (o vía el
// proxy de Vite en desarrollo), así que no hay un caso de uso real que
// necesite CORS abierto a cualquier origen; se acota al de la app.
const ORIGENES_PERMITIDOS = [process.env.APP_URL, 'http://localhost:5173', 'http://localhost:3001'].filter(Boolean);
app.use(cors({ origin: ORIGENES_PERMITIDOS }));
// rawBody: se guarda el cuerpo tal cual llega, solo lo usa el webhook de
// WhatsApp para verificar la firma de Meta (X-Hub-Signature-256).
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(uploadsDir));

// Health check (requerido por Railway)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Rutas API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/empresas', require('./routes/empresas'));
app.use('/api/contactos', require('./routes/contactos'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/negocios', require('./routes/negocios'));
app.use('/api/cotizaciones', require('./routes/cotizaciones'));
app.use('/api/leads', require('./routes/leads')); // /web es público con API key; el resto autenticado
app.use('/api/public', require('./routes/public')); // sin autenticación (link al cliente)
app.use('/api/config', require('./routes/config'));
app.use('/api/notas', require('./routes/notas'));
app.use('/api/tareas', require('./routes/tareas'));
app.use('/api/secuencias', require('./routes/secuencias'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/whatsapp', require('./routes/whatsapp'));

// Servir el frontend compilado si existe (Railway lo construye en el deploy).
// No dependemos de NODE_ENV para evitar quedar con "Cannot GET /".
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No encontrado' });
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Iniciar solo cuando se ejecuta directamente (no al importar en pruebas).
if (require.main === module) {
  initDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[Server] CRM HidroTecnica corriendo en http://localhost:${PORT}`);
      });
      // Motor de secuencias: revisa pasos vencidos cada 15 minutos (HT-AP-03 §7.4).
      const QUINCE_MIN = 15 * 60 * 1000;
      setInterval(() => {
        avanzarPasosPendientes().catch(err => console.error('[secuencias] Error al avanzar pasos:', err));
      }, QUINCE_MIN);
      // Bot de WhatsApp: recontacto de leads que no respondieron la categorización (v1.8 §7).
      setInterval(() => {
        avanzarRecontactosPendientes().catch(err => console.error('[whatsapp_bot] Error al avanzar recontactos:', err));
      }, QUINCE_MIN);
      // Recordatorio único de encuesta post-cierre: revisa una vez por hora.
      const UNA_HORA = 60 * 60 * 1000;
      setInterval(() => {
        enviarRecordatorios().catch(err => console.error('[encuestas] Error al enviar recordatorios:', err));
      }, UNA_HORA);
    })
    .catch((err) => {
      console.error('[Server] Error al inicializar DB:', err);
      process.exit(1);
    });
}

module.exports = { app, initDb };
