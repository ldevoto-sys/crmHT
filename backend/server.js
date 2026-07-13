require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db');
const { avanzarPasosPendientes } = require('./services/secuencias');

const app = express();
const PORT = process.env.PORT || 3001;

// Uploads (imágenes de producto, fichas técnicas, media WhatsApp). En Railway
// se monta un volumen persistente en RAILWAY_VOLUME_MOUNT_PATH.
const uploadsDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads')
  : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json());
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
    })
    .catch((err) => {
      console.error('[Server] Error al inicializar DB:', err);
      process.exit(1);
    });
}

module.exports = { app, initDb };
