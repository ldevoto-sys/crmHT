# HT-AP-03 — Nota de cambio v1.35

**Fecha:** 26-08-2026 al 14-09-2026 (agrupa cambios ya en `staging` sin nota
propia — detectados en un relevamiento completo del código pedido por Luis
Devoto el 14-09-2026 para actualizar la documentación).
**Módulo:** Pipeline/Negocios (Arranque de Trabajos), Cotizaciones, Maestros
(Productos), Motor de seguimiento (Secuencias), permisos de `callcenter`,
API Cowork.
**Estado:** todo ya en `staging`. Los permisos de `callcenter` y las
variables de correo de secuencias (ver §5/§6) ya están en `main`
(promovidos el 08 y 14-09-2026 respectivamente). El resto — fixes de OT,
"negocio = un hilo de cotización", sincronización de productos desde
Softland, canal WhatsApp/cambiar_etapa de secuencias, extensión WhatsApp de
la API Cowork — sigue solo en `staging`, sin promover.

## 1. Arranque de Trabajos — fixes posteriores a v1.34

Sobre la funcionalidad base de v1.34 (tipo de trabajo + Orden de Trabajo
automática al aceptar un negocio de Operaciones), 5 commits posteriores sin
nota propia:

- **Fix: el gate de tipo de trabajo no se podía completar desde el
  Pipeline (kanban).** El modal para pedir el tipo de trabajo solo existía
  en la ficha del negocio — arrastrar la tarjeta en el Pipeline, o usar el
  selector "Mover a etapa" en mobile, rebotaba con el error del gate sin
  forma de completarlo ahí mismo. Se agregó el mismo modal a `Pipeline.jsx`.
  De paso, `GET /negocios` no traía `tipo_trabajo` en el `SELECT` —sin eso
  el Pipeline no podía saber si el negocio ya tenía tipo asignado y lo
  volvía a pedir en cada arrastre.
- **Columna "Código" en los ítems de la OT y su plantilla:** solo aplica a
  ítems sin producto del catálogo asociado (descripción libre) — si el
  ítem tiene producto, el código que se muestra es el SKU real vía join, y
  el campo propio se ignora aunque venga cargado.
- **Buscador doble código → Tab:** si el código tipeado calza exacto con el
  SKU de un producto del catálogo, al salir del campo autocompleta la
  descripción — dirección inversa a la ya existente (elegir por
  descripción completa el código).
- **Fix: el desplegable de búsqueda de producto se cortaba en la tabla de
  OT.** La tabla va en un contenedor con scroll horizontal (necesario en
  mobile), que recortaba el desplegable de resultados. Se resolvió
  renderizándolo en un portal a `<body>` con posición fija calculada desde
  la posición real del campo.

**Archivos:** `frontend/src/pages/ventas/Pipeline.jsx`,
`backend/routes/negocios.js`, `frontend/src/pages/ventas/DetalleOT.jsx`,
`frontend/src/pages/admin/ConfigPlantillasOT.jsx`, `backend/db.js` (columna
`codigo` en `ot_items`/`ot_plantilla_items`).

## 2. Cotizaciones — "negocio = un hilo de cotización"

Cambio de regla de negocio de fondo, sin nota de cambio hasta ahora:
**un negocio pasa a ser estrictamente 1:1 con un "hilo" de cotización.**

Antes existía, al crear una cotización desde un negocio ya existente, un
selector "Negocio existente / Negocio nuevo" (documentado en la nota
v1.9). Ese selector **ya no existe**: el botón "+ Cotizar" de la ficha de
un negocio solo aparece si ese negocio **todavía no tiene ninguna
cotización** — con una ya creada, una versión nueva se agrega desde la
cotización misma ("Nueva versión"), nunca desde el negocio.

**Fix posterior (01-09-2026):** la primera versión de este cambio hacía
que crear una cotización SIEMPRE creara un negocio nuevo, incluso desde un
negocio recién creado y todavía sin cotizar — dejando ese negocio original
vacío para siempre y duplicando el registro (reportado por un vendedor).
Corregido: si el negocio de origen no tiene ninguna cotización todavía, la
cotización se cuelga de ese mismo negocio; si ya tiene una, recién ahí
crea uno nuevo.

Sin cambios de esquema ni de la API de integración (Cowork, §18 del
consolidado) — el negocio sigue existiendo igual, solo se volvió 1:1 "por
dentro". Es la misma premisa de diseño que sostiene que la Orden de
Trabajo (§1 arriba) también sea 1:1 con el negocio.

**Archivos:** `frontend/src/pages/ventas/DetalleNegocio.jsx`,
`frontend/src/pages/ventas/NuevaCotizacion.jsx`.

## 3. Maestros — sincronización de productos desde Softland

Botón nuevo "Actualizar productos desde Softland" en Productos
(administrador/jefe comercial), `POST /api/softland/productos/sincronizar`
→ `backend/services/softlandProductos.js`.

- La tabla origen en Softland (`iw_tprod`) **solo trae código y nombre/
  nombre2** — no tiene precio ni categoría. Por eso el sincronizador
  **solo actualiza `nombre` y `marca`**; nunca pisa `precio_lista`,
  `categoria`, imagen, ficha técnica ni `atributos` — esos siguen
  curándose a mano o vía el importador Excel del catálogo (§2 del
  documento consolidado). Un producto **nuevo** creado por esta vía queda
  sin precio ni categoría hasta que se complete por una de esas dos vías.
- Es manual (un botón), no una rutina automática — a diferencia de la
  sincronización de ventas/facturas (§9/§14 del consolidado, corre sola a
  las 23:00): el catálogo no cambia todos los días.
- Reutiliza la misma conexión a la réplica de Softland ya configurada
  (`SOFTLAND_DB_*`) — no requiere variables nuevas.
- **Sin validar todavía contra la réplica real de Softland en producción**
  — este entorno de desarrollo no tiene salida de red hacia
  `SOFTLANDCLOUD.CL`; queda por confirmar cuando se despliegue a
  `staging`/producción real.

**Diferencia con el importador Excel de Productos** (§2 del consolidado):
ese trae el catálogo curado completo (atributos técnicos, descripción,
stock proveedor, modo "catálogo completo" que desactiva lo no incluido);
este solo actualiza nombre/marca desde Softland, sin ninguna de esas
opciones.

**Archivos:** `backend/services/softlandProductos.js`,
`backend/routes/softland.js` (línea ~30), `frontend/src/pages/maestros/Productos.jsx`.

## 4. Motor de seguimiento (Secuencias) — corrección de lo ya documentado

El documento consolidado (§8) decía que los canales `whatsapp`/`llamada`/
`tarea` "no cambian: siguen generando una tarea para el vendedor, hasta
que WhatsApp esté conectado". Eso quedó desactualizado por dos cambios
reales en el código, ninguno reflejado hasta ahora:

- **Canal `whatsapp` con envío automático (26-08-2026):** igual que el
  canal correo (v1.28), un paso de canal `whatsapp` se envía solo, vía la
  Cloud API de Meta, con una plantilla aprobada elegida al configurar el
  paso — cae a tarea manual solo si el contacto no tiene teléfono o el
  envío falla.
- **Canal `cambiar_etapa` (20-08-2026, ya tenía nota de cambio v1.30 §3,
  nunca incorporada a este consolidado):** en vez de mandar un mensaje,
  mueve el negocio a una etapa destino — si es de tipo "perdida", exige
  causa de no cierre — reutilizando el mismo camino que moverlo a mano en
  el Pipeline. Caso de uso explícito: mover a "Perdido" con causa "Sin
  respuesta" tras varios intentos de seguimiento fallidos, como último
  paso de una secuencia.

**Confirmado contra el Administrador de WhatsApp de Meta (captura de Luis
Devoto, 14-09-2026) — plantillas realmente activas hoy:**
`envio_cotizacion_v2`, `retomar_conversacion`, `seguimiento_coti`,
`vencimiento_cotizacion`, `permiso_llamada`, `hello_world` (las 6 con
estado "Activa: calidad pendiente"). El listado que tenía el documento
consolidado (§11: `envio_cotizacion`, `cierre_de_cotizacion`,
`seguimiento1`) estaba desactualizado — ninguna de esas 3 existe hoy tal
cual.

**Bug encontrado al confirmar esto:** el motor de secuencias
(`PLANTILLAS_WHATSAPP` en `secuencias.js`) sigue ofreciendo como opción
seleccionable `envio_cotizacion` (sin el sufijo `_v2`) — plantilla que ya
no existe activa, reemplazada por `envio_cotizacion_v2` (que sí usa
correctamente el botón individual "Enviar cotización por WhatsApp",
`cotizaciones.js:514`). Una secuencia configurada con esa opción falla el
envío por WhatsApp en silencio y cae a tarea manual cada vez, sin aviso
del motivo real. Pendiente de corregir: cambiar la clave a
`envio_cotizacion_v2` en `secuencias.js`. `retomar_conversacion` y
`permiso_llamada` están aprobadas en Meta pero no están disponibles como
opción en ningún paso de secuencia ni botón del CRM — plantillas
aprobadas sin usar todavía.

## 5. Correo de secuencia — variables `{{...}}`, sin contenido automático

(Ya en `main`, 14-09-2026.) El paso de canal correo de una secuencia era
texto libre sin ningún reemplazo — cualquier `{{variable}}` que alguien
escribiera llegaba literal al cliente. Se agregó:

- `reemplazarVariables()` (`backend/utils/texto.js`): sustituye solo las
  llaves reconocidas; una no reconocida o sin dato se deja visible en vez
  de desaparecer en silencio.
- Variables disponibles en asunto y mensaje: `{{nombre_cliente}}`,
  `{{apellido_cliente}}`, `{{n_cotizacion}}`, `{{negocio_titulo}}`,
  `{{monto_cotizacion}}`, `{{producto_resumen}}` (resumen de los ítems de
  la cotización, capado a 4), `{{link_cotizacion}}`, `{{nombre_vendedor}}`,
  `{{email_vendedor}}`, `{{telefono_vendedor}}`.
- **Se eliminó todo el contenido que el sistema agregaba solo** (saludo
  "Estimado(a) [nombre]", firma del vendedor, referencia a la cotización,
  botón "Ver cotización online") — mezclaba campos fijos con las
  variables que la persona sí controlaba, sin que quedara claro cuál era
  cuál. El cuerpo del correo es ahora exactamente el mensaje configurado;
  todo lo anterior pasó a ser variable, a decisión de quien redacta.

**Archivos:** `backend/utils/texto.js`, `backend/services/email.js`,
`backend/services/secuencias.js`, `frontend/src/pages/admin/ConfigSecuencias.jsx`.

## 6. Permisos de `callcenter` para cotizar — 3 fixes

(Ya en `main`, 08-09-2026.) El commit `06d7a28b` (07-09-2026) dio acceso
completo de cotizar al rol `callcenter`, pero quedaron 3 puntos sueltos
sin actualizar, cada uno reportado por separado por el equipo:

1. `PUEDE_COTIZAR` en `frontend/src/pages/ventas/Cotizaciones.jsx` no
   incluía `callcenter` — el botón "+ Nueva cotización" no aparecía en el
   listado.
2. `GET /api/users/vendedores` filtraba `rol = 'vendedor'` — `callcenter`
   no aparecía como opción en ningún selector de "Vendedor asignado"
   (Contactos, Empresas, Negocios, etc.), aunque ya podía cotizar.
3. `POST /api/negocios` no autorizaba `callcenter` — el paso que "Nueva
   cotización" dispara automáticamente al guardar (crea el negocio antes
   de crear la cotización) rechazaba con "Sin permiso" antes de llegar
   siquiera a la lógica de cotizar.

Se auditaron los ~78 `authorize()` del backend para confirmar que no
queda ningún otro bloqueo en el camino de "crear cotización" para este
rol. No afecta el round-robin automático de leads, que sigue acotado a
`rol = 'vendedor'` en su propia consulta independiente.

## 7. API Cowork — WhatsApp (Bandeja) expuesta

Se agregaron 3 endpoints a `/api/v1`, mismo token y límite de 60
solicitudes/minuto que el resto de la API (§18 del consolidado, sin
cambios de autenticación):

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/v1/whatsapp/conversaciones?abierta=true\|false` | Lista conversaciones (todas, sin distinción de vendedor) |
| GET | `/api/v1/whatsapp/conversaciones/{contactoId}/mensajes` | Hilo completo, orden ascendente |
| POST | `/api/v1/whatsapp/conversaciones/{contactoId}/mensajes` `{texto}` | Envío real vía Meta — respeta la ventana de 24h (`409` si está cerrada); a diferencia de un vendedor logueado, no antepone firma con nombre de persona |

Explícitamente fuera de esta vuelta: adjuntos y reenvío de plantilla para
conversaciones cerradas.

**Archivos:** `backend/routes/api_v1.js`.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.35*
