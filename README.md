# CRM Comercial HidroTecnica (HT-AP-03)

Sistema web interno que reemplaza a HubSpot (CRM) y Saaspro (bandeja de WhatsApp)
para el proceso comercial de HidroTecnica SpA.

> Documento de contexto y alcance: **HT-AP-03 v1.1** (SharePoint / Manuales).
> El desarrollo sigue el plan por etapas de la §13 de ese documento.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express |
| Base de datos | PostgreSQL (`pg`) |
| Frontend | React 18 + Vite + Tailwind CSS |
| Autenticación | JWT |
| Despliegue | Railway.app |

## Estado actual — Bloque A (andamiaje)

Fundación del sistema, sin integraciones externas:

- Autenticación JWT: login, cambio forzado de contraseña, recuperación por token (1 h).
- Roles: `administrador`, `vendedor`, `callcenter`, `gerencia`.
- Estructura backend/frontend y layout por rol (§11).
- CRUD de usuarios (administrador).
- Colores de marca: `ht-navy #112548`, `ht-cyan #34B3DE` (§4).

Las etapas siguientes (maestros, cotizador, seguimiento, WhatsApp, bot) se
habilitan según el plan.

## Desarrollo local

Requisitos: Node.js 20 y un PostgreSQL accesible.

```bash
# 1. Backend
cd backend
cp .env.example .env        # completar DATABASE_URL y JWT_SECRET
npm install

# 2. Frontend
cd ../frontend
npm install

# 3. Levantar ambos (desde la raíz)
cd ..
npm install
npm run dev
```

Backend en `http://localhost:3001`, frontend (Vite) en `http://localhost:5173`
con proxy `/api` hacia el backend.

Usuario inicial: `admin@hidrotecnica.cl` / contraseña definida en `ADMIN_PASSWORD`
(por defecto `Admin2024!`). **Cambiarla tras el primer ingreso.**

## Despliegue en Railway

1. Crear proyecto en Railway y agregar un servicio PostgreSQL (inyecta `DATABASE_URL`).
2. Conectar este repositorio; Railway usa `railway.json` (build + start + healthcheck).
3. Cargar las variables de entorno de `backend/.env.example` en el servicio.
4. La base de datos se inicializa sola al primer arranque (`initDb`).

## Variables de entorno

Ver `backend/.env.example`. En el Bloque A solo son imprescindibles:
`DATABASE_URL`, `JWT_SECRET`, `APP_URL`. Las de Graph, WhatsApp, Anthropic y
Brevo se completan en sus etapas correspondientes.
