# HT-AP-03 — Nota de cambio v1.41 (06/10/2026)

> **Estado: en `staging`, sin promover a `main`.** Depende de Operaciones
> ("Arranque de Trabajos" / OT, v1.34-v1.40), que tampoco está en `main`.

## Integración CRM ↔ app de Mantenimiento (lado CRM)

Pedido de Luis Devoto (06-10-2026): "quiero empezar a sincronizar la app de
mantenimiento y el crm... Quiero que en el listado de OTs se vean las mismas
en los dos ambientes". Esta nota documenta el lado CRM; el lado Mantenimiento
está en el repo `hidrotecnica-app` (ver `docs/notas-de-cambio/v0.27-integracion-crm.md`
ahí).

### Decisión de diseño (confirmada con Luis)

**Opción elegida: Mantenimiento se queda con toda la ejecución en terreno.**
El CRM crea la Orden de Trabajo (OT) y avisa; Mantenimiento asigna sus propios
técnicos, programa y ejecuta, y avisa de vuelta para mover la etapa real del
pipeline Operaciones (Aceptado → Programado → Ejecutado). El v1.40 (programar/
ejecutar OT con técnicos del CRM) queda vigente para quien cargue los datos a
mano en el CRM — no se tocó ni se retiró — pero deja de ser el camino que
usa Mantenimiento.

Otras decisiones:
- **Cliente ↔ Cliente, por RUT.** El CRM no modela sucursales propias: consulta
  las de Mantenimiento en vivo por RUT de la empresa.
- **Comercial ve un cliente, operacional ve el detalle.** Un mismo cliente puede
  tener varias sucursales y cada sucursal varias salas de bombas (ej. Santander,
  Sodimac, Cencosud) — eso lo modela y lo ve Mantenimiento; el CRM solo guarda
  cuál sucursal se eligió (o su nombre, si es nueva).
- **Solo la conexión por ahora.** Las direcciones reales de los clientes
  (sucursales) no están cargadas todavía en ninguno de los dos sistemas — se
  decidió armar la integración primero y poblar los datos después, sin bloquear
  ni inventar direcciones.

### Qué se construyó

- **`ordenes_trabajo.mantenimiento_gestiona`** (columna nueva): cuando
  Mantenimiento toma una OT, el CRM deja de exigirle técnico/horas propios (el
  gate de `services/ot.js` que antes exigía eso para entrar a Programado/
  Ejecutado se salta si esta columna es `true`). Las fechas igual se guardan
  (vienen de Mantenimiento).
- **`negocios.mantenimiento_sucursal_id` / `sucursal_nombre`** (columnas
  nuevas): cuál sucursal de Mantenimiento corresponde a este negocio.
- **`services/mantenimientoOT.js`** (nuevo): arma el detalle de la OT para
  Mantenimiento (cliente, monto, etapa, fechas, ítems de la cotización sin
  precio), consulta sucursales por RUT, y mueve la etapa real del negocio
  cuando Mantenimiento avisa que programó o ejecutó.
- **`routes/api_mantenimiento.js`** (nuevo), montado en
  `/api/v1/mantenimiento` — token propio (`MANTENIMIENTO_API_KEY_ENTRANTE`,
  mismo patrón que `/api/v1` de Cowork, nunca el mismo token):
  - `GET /ordenes-trabajo/:negocioId` — detalle de la OT.
  - `PATCH /ordenes-trabajo/:negocioId/programacion` — Mantenimiento avisa
    fecha programada; mueve el negocio a "Programado".
  - `PATCH /ordenes-trabajo/:negocioId/ejecucion` — avisa fecha de ejecución;
    mueve el negocio a "Ejecutado".
- **Webhook saliente** (`notificarOTCreada`, variables `MANTENIMIENTO_WEBHOOK_URL`
  / `MANTENIMIENTO_WEBHOOK_SECRET`, firma HMAC-SHA256 igual que WhatsApp) en
  los 3 lugares donde nace una OT: `cambiarEtapaNegocio()` (kanban, secuencias,
  sugerencias de facturación), creación directa de negocio, e importador CSV
  masivo (se dispara recién después del `COMMIT`, nunca antes — un rollback no
  debe avisar una OT que no quedó creada).
- **`GET /api/negocios/sucursales-sugeridas?rut=`**: proxy para que el
  frontend del CRM consulte en vivo las sucursales de un cliente en
  Mantenimiento (`MANTENIMIENTO_API_URL` / `MANTENIMIENTO_API_KEY_SALIENTE`).
  Frontend del CRM: **pendiente**, hoy solo existe el endpoint.
- Usuario **"Mantenimiento"** (integrador) seedeado en `db.js`, igual patrón
  que el usuario "Cowork" — autor de auditoría/timeline de lo que escribe
  esta integración.

### Variables de entorno nuevas (Railway)

| Variable | Sentido | Para qué |
|---|---|---|
| `MANTENIMIENTO_API_KEY_ENTRANTE` | Mantenimiento → CRM | Token que Mantenimiento presenta al llamar `/api/v1/mantenimiento/...` |
| `MANTENIMIENTO_WEBHOOK_URL` / `MANTENIMIENTO_WEBHOOK_SECRET` | CRM → Mantenimiento | URL y firma del webhook al crear una OT |
| `MANTENIMIENTO_API_URL` / `MANTENIMIENTO_API_KEY_SALIENTE` | CRM → Mantenimiento | Consulta de sucursales por RUT |

Las tres parejas usan un secreto propio cada una (nunca compartido entre
sentidos) — mismo criterio que ya usa el CRM para WhatsApp y el reenvío entre
entornos. Vacías = integración desactivada, igual que esas otras.

### Pendiente

- **Frontend del CRM**: no hay pantalla que use
  `GET /api/negocios/sucursales-sugeridas` todavía — el vendedor no puede
  elegir una sucursal de Mantenimiento al crear/editar el negocio desde la
  interfaz (el endpoint existe, falta el selector). Mientras tanto, todo
  negocio nuevo manda `mantenimiento_sucursal_id`/`sucursal_nombre` en blanco,
  así que del lado Mantenimiento cada OT cae en una sucursal "Principal" por
  defecto (ver nota de cambio v0.27 de `hidrotecnica-app`).
- **El CRM solo avisa por webhook al crear la OT**, no en cada cambio de
  etapa posterior. Si alguien mueve la etapa a mano en el CRM sin pasar por
  Mantenimiento (o la OT es de las exentas, anteriores a v1.40), Mantenimiento
  no se entera.
- Población real de direcciones/sucursales de clientes — explícitamente
  diferida, no es parte de esta conexión.
- Promoción a `main`: depende de que se promueva primero el resto de
  Operaciones (v1.34-v1.40), que sigue en `staging`.

### Cómo se probó

Servidor real + Postgres real (sin mocks), y además **los dos sistemas
corriendo a la vez** (crmHT local + `hidrotecnica-app` local, con los 3 pares
de credenciales configurados entre ambos):

- Negocio directo a "Aceptado" (empresa con RUT) → OT creada → webhook →
  Mantenimiento crea Cliente y Sucursal por RUT y la OT con los datos
  correctos (cliente, monto, etapa, materiales), sin técnico ni fecha.
- Mantenimiento programa (técnico + fecha) → el negocio en el CRM pasa a
  "Programado", sin pedir técnicos propios del CRM.
- Mantenimiento cierra la ficha de la OT → el negocio pasa a "Ejecutado".
- Proxy de sucursales por RUT desde el CRM → devuelve la sucursal creada por
  Mantenimiento.
- Importador CSV: una fila directo a "Aceptado" y otra directo a "Programado"
  (con técnico/horas propios del CRM, gate independiente que sigue exigiendo
  esos datos cuando el alta es manual) — ambas avisan por webhook sin errores.
- Reintento del mismo webhook → no duplica la OT en Mantenimiento, refresca
  etapa/monto/materiales mostrados, pero no pisa técnico/fecha ya guardados
  ahí.
- Casos de error: negocio/OT inexistente (404), fecha inválida (400), token
  ausente o incorrecto (401) en los 3 endpoints nuevos.
- Resiliencia: con el webhook apuntando a una URL caída, la creación del
  negocio responde igual en menos de 100 ms (el webhook falla y se loguea,
  nunca bloquea la respuesta al vendedor).
- Bug encontrado y corregido durante la prueba: el orden de montaje en
  `server.js` hacía que `/api/v1` (Cowork, con su propio token) interceptara
  también todo `/api/v1/mantenimiento/*` antes de llegar al router nuevo —
  corregido montando este router primero.

### Archivos

`backend/db.js`, `backend/services/ot.js`, `backend/services/mantenimientoOT.js`
(nuevo), `backend/routes/api_mantenimiento.js` (nuevo), `backend/routes/negocios.js`,
`backend/server.js`, `backend/.env.example`.
