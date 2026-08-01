import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Commit corto del build, para poder confirmar en pantalla qué versión está
// desplegada en cada ambiente. Railway arma el build sin carpeta .git, por
// eso prioriza la variable que Railway sí inyecta en el build
// (RAILWAY_GIT_COMMIT_SHA); git rev-parse queda como respaldo para local.
function commitActual() {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(commitActual()),
    __APP_BUILD_FECHA__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    }
  }
})
