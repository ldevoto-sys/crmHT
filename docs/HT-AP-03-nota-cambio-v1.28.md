# HT-AP-03 — Nota de cambio v1.28

**Fecha:** 11 y 12-08-2026.
**Módulo:** Negocios, Despacho, Motor de seguimiento (secuencias),
Usuarios, Cotizaciones (PDF/lista), Reportería, **integración externa
nueva (API Cowork)**.
**Estado:** Implementadas, verificadas localmente y desplegadas en
`staging` → `main` (producción) el 18-08-2026, por instrucción explícita
de Gerencia (Luis Devoto) — ver §17 del consolidado. Agrupa varios
cambios independientes promovidos juntos en la misma tanda.

## 1. Reasignar vendedor de un negocio: jefe comercial además de administrador

**Antes:** solo `administrador` podía cambiar el vendedor dueño desde la
ficha del negocio.
**Ahora:** `jefe_comercial` también puede. El resto de los roles sigue
viendo el dato como texto de solo lectura.

- `backend/routes/negocios.js`, `frontend/.../DetalleNegocio.jsx`.

## 2. Despacho: nombre del lugar frecuente en la ficha de la parada

**Problema que resuelve:** la ficha de una parada de despacho mostraba
solo la dirección; si esa dirección coincidía con un "lugar frecuente"
guardado, no había forma de saber cuál sin buscarlo a mano.
**Ahora:** si la dirección de la parada coincide con un lugar frecuente
registrado, se muestra su nombre junto a la dirección.

- `backend/routes/despacho.js`, `frontend/.../Despacho.jsx`.

## 3. Motor de seguimiento: envío automático por correo

**Problema que resuelve:** todo paso vencido de una secuencia de
seguimiento generaba una **tarea** para que el vendedor la ejecutara a
mano — incluido el canal "correo", que perfectamente podía enviarse solo.

**Qué hace:**

- Un paso de canal **correo** ahora se envía solo, sin intervención,
  usando el mismo servicio (Brevo) que ya usa el envío inicial de la
  cotización. Si el contacto no tiene correo registrado o el envío
  falla, **cae a una tarea manual** con el motivo explicado en el
  título — nunca se pierde el paso en silencio.
- Los canales **whatsapp / llamada / tarea** no cambian: siguen
  generando una tarea para el vendedor (hasta que se conecte WhatsApp).
- **Personalización:** el correo saluda por el nombre del contacto y
  referencia la cotización (número + título del negocio) — antes era un
  texto genérico.
- **Firma:** incluye el correo y, si está cargado, el **teléfono
  directo** del vendedor. Se agregó el campo Teléfono a la ficha de
  Usuarios (Configuración → Usuarios) para esto.
- El vendedor va en **copia (CC)** del correo (no solo como "Responder
  a"), para que vea que salió sin tener que revisar el timeline. No se
  duplica si el destinatario es el propio vendedor.
- Link "Ver cotización online" apuntando a la última cotización del
  negocio, si existe.

### Esquema

| Tabla/columna | Cambio |
|---|---|
| `users.telefono` | nueva, opcional — teléfono directo, mostrado en la firma del correo de seguimiento. |

### Backend

- `backend/services/secuencias.js`: `intentarEnviarCorreo()`,
  `crearTareaSeguimiento()` (fallback).
- `backend/services/email.js`: plantilla `seguimiento`.
- `backend/routes/users.js`, `frontend/.../Usuarios.jsx`: campo Teléfono.

## 4. Fix: título largo se pisaba en el PDF de cotización

**Problema:** un título de cotización que envolvía a 2+ líneas quedaba
pisado por el bloque "CLIENTE / INFORMACIÓN" que empezaba justo debajo,
a una distancia fija pensada para una sola línea. Mismo tipo de bug ya
corregido antes para el nombre del cliente, no replicado en su momento
para el título.
**Fix:** se mide la altura real del título antes de dibujar lo
siguiente, igual que ya se hacía con el nombre del cliente.

- `backend/services/pdf.js`.

## 5. Fix: columna "Negocio" muy ancha en la lista de Cotizaciones

**Problema:** sin límite de ancho, un título de negocio largo empujaba
la columna "Vendedor" fuera de la pantalla, obligando a hacer zoom-out.
**Fix:** ancho máximo + texto truncado con "…" (el texto completo
aparece al pasar el mouse) — mismo patrón ya usado en Contactos.

- `frontend/src/pages/ventas/Cotizaciones.jsx`.

## 6. Reportería: filtro por cliente

Los reportes (embudo, causas de no cierre, tiempos por etapa, ranking de
vendedores, cotizaciones por día) ya filtraban por vendedor; ahora
también aceptan `cliente_id` (empresa), solo o combinado con
`vendedor_id`. Aplica tanto a la página Reportería como a la API nueva
del punto 7.

- `backend/routes/reportes.js`.

## 7. Nueva integración externa: API `/api/v1` para Cowork

**Qué es:** la primera versión de la API REST que el agente Cowork
(operado por Gerencia) usa para registrar clientes y negocios, y generar
cotizaciones rápido desde afuera del CRM — especificada en
`HT-DO-XX_Especificacion_API_CRM_Cowork` (v0.1 borrador → v1.0 con lo
realmente construido).

**Endpoints implementados:**

- `GET /api/v1/clientes?rut=&nombre=` — buscar cliente.
- `POST /api/v1/clientes` — alta de cliente, idempotente por RUT.
- `POST /api/v1/negocios` — crear negocio, idempotente por
  `referencia_externa` (evita duplicar el mismo negocio si Cowork
  reintenta la misma solicitud). Asigna vendedor con las mismas reglas
  de asignación del CRM (cuenta, categoría, round-robin).
- `GET /api/v1/negocios/{id}` — detalle: etapa actual, historial de
  etapas y cotizaciones del negocio.
- `POST /api/v1/negocios/{id}/cotizaciones` — registra la cotización con
  el **mismo correlativo numérico real** que usa el resto del CRM (no un
  formato paralelo) y **avanza sola la etapa del negocio a "Cotizado"**
  — mismo mecanismo que la creación manual desde la app.
- `GET /api/v1/reportes/{tipo}` — expone los reportes comerciales ya
  existentes (punto 6), con los mismos filtros.

**Autenticación:** Bearer token fijo por variable de entorno
(`COWORK_API_KEY`), mismo patrón que el canal de leads web
(`/api/leads/web`) — un solo integrador hoy, no se justifica una tabla
de tokens revocables individualmente. Límite de 60 solicitudes/minuto.
Toda escritura queda atribuida a un actor real "Cowork" (`users.rol =
'integrador'`), consultable en el timeline unificado.

**Diseño no implementado tal cual el borrador original** (documentado en
detalle en el propio HT-DO-XX v1.0): la máquina de 8 estados fijos
(`recibido → ... → traspasado_operaciones`) no existe — el CRM expone en
su lugar la etapa real del pipeline configurable, que ya tenía su propio
historial. Tampoco se persisten todavía `cuadrante`/`tipo` del cliente ni
`tipo_documento` del negocio (se aceptan si vienen en el body, se
ignoran).

### Esquema

| Tabla/columna | Cambio |
|---|---|
| `users.rol` | se agrega el valor `'integrador'` al CHECK. |
| `negocios.origen` | nueva — `'crm' \| 'fracttal' \| 'correo' \| 'whatsapp' \| 'otro'`, default `'crm'`. |
| `negocios.referencia_externa` | nueva — clave de idempotencia. Índice único parcial `(origen, referencia_externa)`. |
| `negocios.urgencia` | nueva, boolean. |
| `contactos.origen` | se agrega el valor `'api'` al CHECK. |
| `users` (seed) | usuario "Cowork" (`rol = 'integrador'`), sin login real — solo autoría en auditoría. |

### Backend

- `backend/routes/api_v1.js` (nuevo).
- `backend/db.js`: columnas/constraints de arriba, seed del usuario
  "Cowork".
- `backend/routes/cotizaciones.js`, `backend/routes/reportes.js`:
  exponen internamente `proximoNumero`, `avanzarAEtapaCotizado`,
  `sincronizarMontoEstimado`, `REPORTES` para que la API los reutilice
  sin duplicar lógica.

## Verificación local

Todos los puntos probados contra Postgres real (no solo sintaxis):
- Puntos 3 y 7: recorridos extremo a extremo simulando la API de Brevo
  (envío exitoso, contacto sin correo, fallo de Brevo, canal whatsapp
  sin cambios) y la API `/api/v1` completa (alta/búsqueda de cliente,
  idempotencia de negocio, cotización en CLP y UF, avance de etapa,
  errores 400/401/404/422).
- Punto 4: PDF de prueba con el mismo título largo reportado,
  confirmado visualmente que ya no se pisa.
- Punto 6: dos clientes con montos distintos, filtro separa los totales
  correctamente, solo y combinado con vendedor.
- `npm run build` del frontend sin errores en todos los puntos con
  cambios de frontend.

## Pendientes explícitos

1. **`COWORK_API_KEY` sin configurar en producción** — hasta que se
   cargue esa variable en Railway, la API `/api/v1` responde 503 a
   cualquier solicitud. Bloqueante para que Cowork pueda usarla en
   producción.
2. **`APP_URL` de `staging`** apuntaba al dominio de producción durante
   las pruebas (se corrigió a mano para probar) — confirmar que la
   variable de Railway de `staging` quedó apuntando a su propio dominio.
3. `cuadrante`/`tipo` del cliente y `tipo_documento` del negocio — no
   persistidos, ver HT-DO-XX v1.0 §10.
4. Máquina de estados fija de 8 pasos del diseño original — no
   implementada, ver HT-DO-XX v1.0 §7.
5. `GET /negocios` con filtros (listado general) y `PATCH /negocios/{id}`
   (actualizar estado) — no implementados en esta vuelta.
6. Documento `HT-DO-XX_Especificacion_API_CRM_Cowork` actualizado a v1.0
   con lo realmente construido — pendiente asignarle el correlativo
   `HT-DO-##` definitivo y publicarlo en SharePoint (Control Documental).

---

*Historial completo de decisiones queda archivado junto a las notas
v1.2–v1.27 en `docs/HT-AP-03-nota-cambio-v1.X.md`.*
