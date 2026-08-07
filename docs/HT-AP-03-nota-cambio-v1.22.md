# HT-AP-03 — Nota de cambio v1.22

**Fecha:** 07-08-2026
**Módulo:** Correo/forma de pago de cotizaciones, fecha de compromiso en el
Pipeline, módulo Servicio Técnico de bombas + rol `tecnico`, fotos al crear
un caso de Postventa/Servicio Técnico, pipeline elegible al crear un negocio.
**Estado:** Implementadas, verificadas localmente y en `staging`. Pendiente
de aprobación explícita para promover a `main` (producción).

## Contexto

Esta nota agrupa 6 cambios pedidos en conjunto por Gerencia, trabajados en 4
tandas más 2 ajustes de seguimiento tras revisar la primera entrega en
`staging`. Cada punto se implementó y verificó por separado (base Postgres
nueva + navegador real) antes de pasar al siguiente.

## 1. Mensaje de correo editable al enviar una cotización

**Problema que resuelve:** el texto del correo de envío salía siempre igual
(el configurado en Datos de empresa), sin poder ajustarlo para un envío en
particular.

**Qué hace:** la pantalla de la cotización trae el mensaje por defecto
precargado en un campo editable; el vendedor puede cambiarlo **solo para ese
envío**, sin tocar el default de la empresa. Mismo patrón que ya existía
para el envío por WhatsApp.

### Backend / Frontend

- `backend/routes/cotizaciones.js`: `GET /:id` expone
  `mensaje_email_default`; `POST /:id/enviar` acepta `mensaje` opcional.
- `backend/services/email.js`: `cotizacion(...)` acepta un mensaje que
  sobrescribe el default.
- `frontend/src/pages/ventas/DetalleCotizacion.jsx`: textarea "Mensaje del
  correo" junto al botón "Enviar cotización".

## 2. Forma de pago + datos bancarios condicionales en el correo

**Problema que resuelve:** el correo de envío no mostraba datos bancarios
(el PDF sí, siempre); no había forma de decidirlo según cómo fuera a pagar
el cliente.

**Qué hace:** catálogo configurable de **formas de pago**
(nombre + flag "incluir datos bancarios"), seleccionable al crear/editar
una cotización. Si la forma de pago elegida tiene el flag activo, el correo
agrega un bloque con los datos bancarios de la empresa; si no, no lo
incluye. El **PDF sigue mostrándolos siempre**, sin condicionarlos — es un
comportamiento distinto, específico del cuerpo del correo. Catálogo
sembrado con "Transferencia bancaria" (incluye), "Efectivo" y "Cheque" (no
incluyen).

### Esquema

| Tabla | Cambio |
|---|---|
| `formas_pago` | nueva — `nombre` (único), `incluir_datos_bancarios` (bool), `activo`. |
| `cotizaciones` | + `forma_pago_id` (FK a `formas_pago`). |

### Backend / Frontend

- `backend/routes/config.js`: CRUD `/config/formas-pago` (GET sin
  restricción de rol, POST/PUT/DELETE administrador/jefe comercial).
- `backend/routes/cotizaciones.js`: POST/PUT aceptan `forma_pago_id`; GET
  `/:id` expone `forma_pago_nombre`.
- `backend/services/cotizacion_data.js`: `fetchCompleta` expone
  `forma_pago_incluir_datos_bancarios`, usado por el envío de correo.
- `backend/services/email.js`: bloque de datos bancarios condicional.
- `frontend/src/pages/admin/ConfigFormasPago.jsx` (nuevo): CRUD.
- `frontend/src/pages/ventas/NuevaCotizacion.jsx`: selector "Forma de pago".
- `frontend/src/pages/ventas/DetalleCotizacion.jsx`: muestra la forma de
  pago elegida.

## 3. Fecha de compromiso en el Pipeline

**Problema que resuelve:** el Pipeline de ventas no tenía forma de marcar
una fecha comprometida con el cliente (ej. entrega) ni de alertar cuando se
acerca o vence — solo existía "fecha estimada de cierre" (forecast de
venta, un concepto distinto).

**Qué hace:** campo opcional `negocios.fecha_compromiso`, editable en la
ficha del negocio y, opcionalmente, al crearlo. Se muestra en la tarjeta
del Pipeline y en la ficha con la misma alerta de SLA que ya usaba
Postventa: borde/texto ámbar si quedan 3 días o menos, rojo si venció, sin
alerta si está lejos o no está definida. El cálculo se extrajo a un helper
compartido (`frontend/src/utils/sla.js`) para no duplicarlo entre Pipeline
y Postventa — Servicio Técnico (punto 4) también lo reutiliza.

### Esquema

| Tabla | Cambio |
|---|---|
| `negocios` | + `fecha_compromiso` (DATE, opcional). |

### Backend / Frontend

- `backend/routes/negocios.js`: POST/PUT aceptan `fecha_compromiso`.
- `frontend/src/utils/sla.js` (nuevo): `slaEstado`/`ESTILO_SLA`, extraído de
  `Postventa.jsx` (que ahora lo importa en vez de tener su propia copia).
- `frontend/src/pages/ventas/Pipeline.jsx`: tarjeta con alerta; campo en
  "Nuevo negocio".
- `frontend/src/pages/ventas/DetalleNegocio.jsx`: bloque editable con
  alerta.

## 4. Módulo Servicio Técnico de bombas + rol `tecnico`

**Problema que resuelve:** no había una sección para casos de servicio
técnico (revisiones, reparaciones, mantenciones) separada de Postventa (que
está atada a la lógica de ventas); tampoco existía forma de dar acceso a un
usuario limitado solo a esta función.

**Qué hace:** un tablero Kanban calcado de Postventa (mismo patrón de
etapas y adjuntos), pero **sin dueño de caso** — no hay concepto de
"vendedor propio" como en Postventa, así que cualquier usuario con acceso
al módulo ve y gestiona cualquier caso por igual. Solo la estructura de
etapas (crear/editar/eliminar) queda restringida a administrador/jefe
comercial, igual que las demás pantallas de Configuración.

Se creó también el rol **`tecnico`**: quien lo tiene **solo** ve Servicio
Técnico, nada más del sistema (ni Dashboard). Los cinco roles preexistentes
(administrador, jefe comercial, vendedor, call center, gerencia) **suman**
este módulo a lo que ya veían, sin perder nada.

**Detalle no evidente:** para que `tecnico` quedara realmente acotado, se
tuvo que agregar una restricción de rol explícita a varias pantallas que
antes no la tenían (Dashboard, Pipeline, Contactos, Empresas, Productos,
Mis Tareas, y el detalle de negocio/cotización) — no importaba hasta ahora
porque todos los roles existentes tenían acceso a casi todo. La lista de
roles agregada es la de los cinco roles preexistentes; no cambia nada para
ninguno de ellos, solo excluye a `tecnico`. El redirect de "sin permiso"
también se ajustó para no mandar a `tecnico` a `/dashboard` (al que no
tiene acceso) — cae en `/servicio-tecnico`.

### Esquema

| Tabla | Cambio |
|---|---|
| `users.rol` | CHECK amplía valores admitidos con `'tecnico'`. |
| `servicio_tecnico_etapas` | nueva — igual que `postventa_etapas`. |
| `casos_servicio_tecnico` | nueva — igual que `casos_postventa`, con `fecha_compromiso` en vez de `fecha_limite_respuesta` y sin distinción de dueño. |
| `servicio_tecnico_adjuntos` | nueva — igual que `postventa_adjuntos`. |

### Backend / Frontend

- `backend/routes/servicio_tecnico.js` (nuevo): CRUD de etapas y casos,
  adjuntos — mismas rutas que Postventa, sin las verificaciones de "dueño".
- `backend/routes/users.js`, `frontend/src/pages/admin/Usuarios.jsx`:
  `tecnico` en la lista de roles seleccionables.
- `frontend/src/pages/servicio_tecnico/ServicioTecnico.jsx`,
  `ConfigServicioTecnicoEtapas.jsx` (nuevos).
- `frontend/src/App.jsx`: nuevas rutas; restricción de rol explícita
  (`ROLES_SIN_TECNICO`) en las pantallas mencionadas arriba.
- `frontend/src/components/Layout.jsx`: "Servicio Técnico" sumado al menú de
  los 5 roles existentes; menú exclusivo para `tecnico`.
- `frontend/src/components/ProtectedRoute.jsx`,
  `frontend/src/pages/Login.jsx`, `CambiarPassword.jsx`: `tecnico` cae en
  `/servicio-tecnico`, no en `/dashboard`.

## 5. Fotos al crear un caso (Postventa y Servicio Técnico)

**Problema que resuelve:** para adjuntar una foto había que crear el caso
primero, y recién después abrirlo para subirla — dos pasos separados.

**Qué hace:** el formulario "Nuevo caso" (en ambos módulos) ahora acepta
seleccionar fotos ahí mismo. A ojos del usuario es un solo paso; por dentro,
el frontend crea el caso y sube cada foto justo después (el adjunto
necesita el id del caso, que no existe hasta que se crea).

### Backend / Frontend

Sin cambios de esquema ni de rutas — reutiliza el endpoint de adjuntos que
ya existía. Solo cambia el frontend:
- `frontend/src/pages/postventa/Postventa.jsx`: campo de fotos en
  `NuevoCaso`, sube cada una tras crear el caso.
- `frontend/src/pages/servicio_tecnico/ServicioTecnico.jsx`: mismo cambio.

## 6. Pipeline elegible al crear un negocio

**Problema que resuelve:** un negocio nuevo caía siempre en el pipeline por
defecto del vendedor, sin poder elegir otro al crearlo (había que crearlo y
después moverlo aparte).

**Qué hace:** el formulario "Nuevo negocio" del Pipeline trae un selector de
pipeline, preseleccionado en el default del vendedor pero editable. El
backend valida que el pipeline elegido exista y esté activo antes de
crearlo.

### Backend / Frontend

- `backend/routes/negocios.js`: `POST /` acepta `pipeline_id` opcional
  (valida contra la tabla `pipelines`; si no llega, sigue usando el default
  del dueño del negocio, como antes).
- `frontend/src/pages/ventas/Pipeline.jsx`: selector "Pipeline" en "Nuevo
  negocio".

## Verificación local

Los 6 puntos se probaron contra Postgres real (base nueva) y con navegador
real (Playwright) contra el frontend en desarrollo:
- Formas de pago: CRUD completo, selector en cotización, y los 3 casos del
  correo (forma de pago con datos bancarios, sin ellos, y sin forma de pago
  elegida) verificados con el servicio de correo simulado (interceptando el
  HTML enviado, sin credenciales reales de Brevo en este entorno).
- Fecha de compromiso: los 3 estados de alerta (vencido, por vencer, sin
  alerta) en Pipeline y en la ficha del negocio, incluyendo guardar/limpiar
  desde la interfaz.
- Servicio Técnico + rol `tecnico`: usuario técnico creado end-to-end
  (creación → cambio de contraseña obligatorio → aterriza en
  `/servicio-tecnico`), bloqueo confirmado al intentar navegar a `/pipeline`
  por URL directa (sin loop de redirección), CRUD de casos/etapas con los
  permisos correctos, y confirmación visual de que callcenter y gerencia
  suman el módulo sin perder lo que ya tenían. Simulación del servicio de
  almacenamiento (Cloudflare R2) para probar adjuntos sin credenciales
  reales en este entorno, mismo patrón ya usado para Despacho/Postventa.
- Fotos al crear caso: subida de 2 fotos al crear un caso de Servicio
  Técnico y 1 al crear uno de Postventa, confirmando que quedan asociadas
  al caso recién creado.
- Pipeline elegible: negocio creado con pipeline explícito, con un
  `pipeline_id` inválido (rechazado con error claro) y sin especificarlo
  (usa el default del vendedor, comportamiento sin cambios).

## Pendientes explícitos (fuera de esta nota)

1. `docs/HT-AP-03-documento-consolidado.md` — actualizado junto con esta
   nota (mismo commit): §1 (rol `tecnico` y matriz de permisos), §3 (fecha
   de compromiso y pipeline elegible), §4 (mensaje editable y forma de
   pago), §5 (fotos al crear caso), §13 (modelo de datos), §14
   (Cloudflare R2 compartido), y nueva §15 (Servicio Técnico) — la sección
   de Pendientes pasó de §15 a §16.
2. Manual de usuario (HT-IN-05) — pendiente de actualizar con estas 6
   funciones.
3. Promoción a producción — pendiente de confirmación explícita de
   Gerencia tras revisar en `staging`.

---

*Historial completo de decisiones queda archivado junto a las notas
v1.2–v1.21 en `docs/HT-AP-03-nota-cambio-v1.X.md`.*
