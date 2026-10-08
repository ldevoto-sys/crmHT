# CRM Comercial HidroTecnica (HT-AP-03) — instrucciones del proyecto

## Despliegue a producción (vigente desde 29-09-2026)

Instrucción explícita de Luis Devoto — reemplaza las dos reglas de abajo
("Despliegue a producción" del 07-08-2026 y "Modo actual: todo se acumula
en staging" del 10-08-2026), que entre las dos generaban confusión sobre
cuándo hacía falta pedir confirmación y de qué tipo:

- **Se promueve a `main` (producción) solo con el OK de Luis Devoto.** No
  hace falta que el cambio sea la corrección de un error — puede ser
  cualquier cambio, mejora o feature nueva incluida. No preguntar si es
  "error o mejora": eso ya no decide nada.
- **Si el push ocurre en horario laboral** (lunes a viernes, 9:00 a 17:30
  hrs, hora de Chile), se pide una confirmación adicional a Luis Devoto
  antes de promover — puntual para ese push, no basta con el OK general.
- **Nunca se promueve a producción sin autorización de Luis Devoto, ni
  siquiera si es un error crítico** — no hay bypass automático por "no
  puede esperar"; si es urgente, se le avisa y se le pide el OK igual,
  no se promueve antes de tenerlo.

`staging` sigue sin esta restricción — se puede promover ahí en cualquier
momento, para pruebas o para acumular cambios, sin pedir autorización.

Las reglas de abajo (horario del 07-08-2026 y "solo por error" del
10-08-2026) quedan sin efecto, reemplazadas por esta; se conservan tal
cual para registro histórico.

## Histórico — reglas de despliegue anteriores (07-08-2026 a 29-09-2026)

Reemplazadas por la regla de arriba (29-09-2026). Se conserva el texto
original sin modificar, para trazabilidad.

### Despliegue a producción (vigente desde 07-08-2026 hasta 29-09-2026)

Promover cambios a `main` (producción) **solo fuera del horario de trabajo
de la empresa**, salvo que se trate de un **error crítico** que no pueda
esperar (el sistema caído, un flujo de venta bloqueado, pérdida de datos).

Origen de la regla: el 07-08-2026 se promovió a producción una tanda
importante de cambios (v1.24) durante horario de trabajo. Ese mismo día un
usuario (Nicolás Quezada) reportó haber sido desconectado de su sesión dos
veces mientras cotizaba, perdiendo el borrador de una cotización extensa.
Luis Devoto planteó como hipótesis que ambas cosas estén relacionadas. **No
se confirmó una relación causal** — no se investigó si un despliegue puede
efectivamente cerrar la sesión de un usuario activo — pero la regla se
adopta de todas formas como precaución.

Antes de hacer `git push origin main` (o cherry-pick a `main`):
- Confirmar que es fuera de horario de trabajo, o que el cambio es un
  error crítico.
- Si Gerencia pide explícitamente promover algo en horario de trabajo,
  confirmar que entiende que se aparta de esta regla antes de proceder.
- `staging` no tiene esta restricción — se puede promover ahí en cualquier
  momento para pruebas.

**Excepción — cambios de solo documentación:** si el cambio es exclusivamente
a `docs/`, `CLAUDE.md`, o `README.md` (sin tocar `backend/` ni `frontend/`),
no afecta el comportamiento de la aplicación desplegada — se puede subir a
`staging` y `main` en simultáneo, en cualquier horario, sin esperar la
ventana fuera de horario. Confirmado explícitamente por Luis Devoto
(07-08-2026).

Ver `docs/HT-AP-03-nota-cambio-v1.24.md` y
`docs/HT-AP-03-documento-consolidado.md` (§17) para el registro completo.

### Modo actual: todo se acumula en staging (vigente desde 10-08-2026 hasta 29-09-2026)

Instrucción explícita de Luis Devoto, más restrictiva que la regla de
horario de arriba: **por ahora, solo se promueve a `main` si hay un error**
que corregir — nunca por una mejora o feature nueva, aunque sea fuera de
horario. Las mejoras y features nuevas quedan acumulándose en `staging`
hasta que se avise lo contrario.

Antes de cualquier `git push origin main` (o cherry-pick a `main`) que no
sea la excepción de solo documentación de arriba:
- Confirmar que el cambio es la corrección de un error (algo que dejó de
  funcionar), no una mejora — si hay duda, preguntar antes de promover.
- Si es una corrección de error, sigue aplicando la regla de horario de
  arriba salvo que sea crítico.

**Excepción puntual (16-09-2026):** Luis Devoto pidió explícitamente
promover a `main` todo lo acumulado en `staging` **excepto** Cobranza y
Operaciones ("Arranque de Trabajos") — instrucción específica para esa
tanda, no un levantamiento general de la regla. Los próximos cambios
vuelven a necesitar la misma confirmación de error-no-mejora salvo que se
avise lo contrario otra vez.

## Pendientes (actualizado 06-10-2026)

**Integración CRM ↔ app de Mantenimiento — lado CRM, en `staging` sin
promover (06-10-2026).** Ver `docs/HT-AP-03-nota-cambio-v1.41.md` para el
detalle completo. Resumen: Mantenimiento se queda con toda la ejecución en
terreno (decisión de Luis Devoto) — el CRM crea la OT al entrar a "Aceptado"
y avisa por webhook; cuando Mantenimiento programa o ejecuta, llama de
vuelta a `/api/v1/mantenimiento/...` y el CRM mueve la etapa real del
pipeline Operaciones. Probado end-to-end con los dos sistemas (crmHT y
`hidrotecnica-app`) corriendo a la vez, Postgres real en ambos lados.
Pendiente: selector de sucursal en el frontend del CRM (el endpoint
`GET /api/negocios/sucursales-sugeridas` ya existe, falta la pantalla), y
el CRM solo avisa al crear la OT, no en cada cambio de etapa posterior.
Depende de que se promueva primero el resto de Operaciones (v1.34-v1.40),
que sigue en `staging`.

## Pendientes (actualizado 08-10-2026)

**OT: de bloquear a alertar (v1.44, solo en `staging`).** Pedido de Luis
Devoto: las exigencias de Programado/Ejecutado frenaban el uso del Pipeline.
Ya no bloquean (solo el tipo de trabajo y la causa de no cierre); lo que falta
se ve en rojo en la tarjeta y llega por correo diario a las 8:00 (vendedor lo
suyo, jefe comercial todo). El reporte OT's avisa de las OT incompletas. Ver
`docs/HT-AP-03-nota-cambio-v1.44.md`. Sigue sin promover a `main` (necesita el
OK de Luis Devoto). Plan en curso: (1) esto, (2) leer Excel/informes de
Fracttal para mover a Ejecutado, (3) integraciones (Softland → Facturado, sacar
"factura sugerida" que no funcionó por cruzar solo RUT + monto).

## Pendientes (actualizado 01-10-2026)

**Promoción a `main` del 01-10-2026 (en horario laboral, con el OK explícito
de Luis Devoto) — Operaciones: Arranque de Trabajos completo + programación
de la OT (v1.34 y v1.40). EN PRODUCCIÓN Y CONFIRMADO POR LUIS.** Commits en
`main`: `ee000f3` (la promoción) y `60cd435` (fix del build, ver abajo). Instrucción de Luis: pasar solo lo de Operaciones;
**Cobranza sigue en `staging`, excluida**. La rama `staging` no se pudo fusionar
(390 commits "por delante" que en buena parte ya están en `main` con otro SHA),
así que se armó una rama desde `main` tomando de `staging` solo los archivos de
Operaciones y, en los archivos compartidos (`db.js`, `users.js`, `server.js`,
`App.jsx`, `Layout.jsx`), solo los bloques sin Cobranza. No se promovió nada de
`middleware/auth.js`, `routes/auth.js`, `services/email.js` ni `Usuarios.jsx`
(solo tenían cambios de Cobranza).

- **Qué incluye**: tipo de trabajo obligatorio al pasar a "Aceptado", Orden de
  Trabajo automática con plantillas (Config → Plantillas de Orden de Trabajo),
  PDF de la OT y su sección en el informe de Postventa, programación y ejecución
  de la OT (fecha programada, horas programadas, técnicos, fecha de ejecución,
  horas ejecutadas, ID Fracttal; las reglas aplican solo a OT nuevas), botón
  "Ver OT" en el Pipeline, pestaña "OT's" en Reportes (cantidad, valor, por
  técnico, por tipo, brecha de fechas y de horas) y reportes `ots_*` para
  Cowork, el técnico ve sus OT asignadas en Tareas (solo lectura, sin precios)
  y entra a Tareas al iniciar sesión, gerencia ve las de todos los técnicos,
  importador de oportunidades con las columnas nuevas y alerta en Config →
  Pipeline si cambian los nombres de Aceptado/Programado/Ejecutado. Ver
  `docs/HT-AP-03-nota-cambio-v1.34.md` y `docs/HT-AP-03-nota-cambio-v1.40.md`.
- **Migración de schema** (en `db.js`, con `IF NOT EXISTS`): `negocios.tipo_trabajo`,
  tablas `ordenes_trabajo`, `ot_items`, `ot_plantilla_items`, `ot_tecnicos`. Las
  OT que existan al desplegar quedan exentas de las reglas nuevas
  (`exige_programacion = false`, migración `ot_programacion_v1.40`). No crea
  nada de Cobranza.
- **Cómo se probó** (lección del 23-09): base creada con el schema de `main`
  (sin tablas de OT ni de Cobranza) y encima el código a promover; ~40 endpoints
  autenticados con admin, vendedor, técnico y gerencia sin ningún 500; negocios
  que ya estaban en Aceptado y Programado sin OT; reglas de cada etapa,
  importador, reportes, PDF, permisos del técnico; frontend compilado y revisado
  en navegador. Búsqueda de referencias a objetos de Cobranza en el código
  promovido: ninguna. Tras el push hay que verificar producción.
- **Incidente del primer despliegue**: `ee000f3` falló en Railway ("cannot
  replace to directory .../backend/node_modules with file"): el commit llevaba
  por error dos **enlaces simbólicos** `backend/node_modules` y
  `frontend/node_modules`, creados solo para probar en una carpeta temporal.
  `.gitignore` ignora `node_modules/` (carpetas), no enlaces, y `git add -A` los
  incluyó. Producción no se cayó (Railway conserva el despliegue anterior si el
  build falla), pero la verificación con el conector leyó la versión **vieja** y
  se informó "estable" antes de tiempo. Corregido con `60cd435` (borra solo esos
  dos archivos), probado antes con un clon limpio y el comando de build de
  `railway.json`.
- **Lecciones para la próxima promoción** (Cobranza): revisar la lista de
  archivos del commit antes del push (`git diff --stat origin/main HEAD` y
  `git ls-files -s | grep ^120000`); no usar `git add -A` en carpetas de prueba
  con enlaces; reproducir el build desde un clon limpio; y dar por buena la
  promoción solo con el estado **Success** del despliegue en Railway, no con una
  consulta al conector. Procedimiento completo en el consolidado, §17.
- **Pendiente al desplegar**: los 31 negocios en Programado y 24 en Ejecutado
  que ya existían no tienen OT (al moverlos se piden los datos); hacen falta
  usuarios con rol `tecnico` para asignar técnicos.
- **Cobranza**: sigue en `staging` sin promover (módulo con desarrollo pendiente).
  `staging` conserva su propio historial; al promover Cobranza hay que repetir
  este procedimiento por archivo, no fusionar la rama.

## Pendientes (actualizado 30-09-2026)

**Promoción a `main` del 30-09-2026 (≈17:45 hora de Chile, fuera de
horario).** Instrucción explícita de Luis Devoto: lo hecho en la sesión de
análisis de oportunidades más los cambios de Despacho del día. **Cobranza y
Operaciones ("Arranque de Trabajos") siguen en `staging`, excluidos.**
Commits en `main`: `c9e59d2` y `64da76c` (Despacho), `82a10d5` (API v1 de
lectura, nota de cambio v1.38). No toca `db.js`: sin migración de schema.

- **Despacho**: vista por defecto con las paradas de hoy más los atrasados
  sin completar ("hoy" en hora de Chile) y orden por columna; agrupar por
  dirección (misma parada y fecha) con interruptor.
- **API v1, endpoints de solo lectura para análisis** (ver
  `docs/HT-AP-03-nota-cambio-v1.38.md`): `GET /cotizaciones`,
  `/whatsapp/mensajes` (por rango de fechas), `/softland/{cotizaciones,
  notas-venta,facturas}` y `/seguimientos`; `/negocios` suma `offset`, tope
  500, monto neto y causa de pérdida; el hilo de WhatsApp suma `lead_id` y
  `negocio_id` por mensaje. Decisión de Luis: se excluyen solo los
  contactos anonimizados; las conversaciones archivadas se incluyen.
- **Cómo se probó** (lección del 23-09): servidor real + Postgres con el
  schema de `main`, endpoints autenticados, Despacho en sus tres vistas con
  token de usuario real y el frontend compilando. Tras el push se verificó
  producción con el conector (los campos nuevos ya aparecen).

**Promoción a `main` del 30-09-2026 (21:12 hora de Chile, fuera de
horario) — WhatsApp: un lead por conversación (v1.39).** Instrucción
explícita de Luis Devoto, con "lead nuevo" para el cliente que vuelve tras un
lead cerrado. Commit en `main`: `f8ccfb7` (en `staging`: `e4db916`). Solo
toca `backend/routes/public.js`; sin migración de schema. Ver
`docs/HT-AP-03-nota-cambio-v1.39.md`.

- **Problema**: por cada mensaje de un cliente el bot creaba otro lead cuando
  el último lead del contacto no tenía estado del bot (`bot_estado` vacío).
  Antes del arreglo, en producción: 2.914 leads de WhatsApp para unos 450 a
  600 contactos; 2.255 (77%) creados a menos de 60 minutos de otro lead del
  mismo contacto, en 475 contactos; 2.484 leads "nuevo" sin vendedor; el 88%
  se creó en horario laboral (clasificación aproximada). La categorización
  del bot está **desactivada** en producción (confirmado por Luis en
  Config → Bot de WhatsApp).
- **Regla nueva**: un lead abierto (`nuevo` o `asignado`) que el bot nunca
  manejó se reutiliza: fuera de horario, en horario con la categorización
  desactivada, o si ya tiene vendedor. Con la categorización activa, el lead
  "nuevo" creado de noche se usa para iniciar la categorización. Si el último
  lead está cerrado (`convertido` o `descartado`), el cliente que vuelve abre
  un lead nuevo.
- **No cambia**: los leads ya derivados por el bot (`bot_estado = 'derivado'`)
  se comportan igual, aunque estén cerrados; los leads que ya existían,
  incluidos los 2.484 sin asignar; las cuentas distintas de Ventas.
- **Efecto a vigilar**: el lead nuevo de un cliente que vuelve no hereda el
  vendedor del anterior; con la categorización desactivada queda en la cola
  de asignación y la Bandeja puede mostrar la conversación "sin asignar".
- **Cómo se probó**: servidor real + Postgres con el schema real + mensajes
  de WhatsApp firmados como los de Meta (sin credenciales el CRM no envía
  nada), 10 verificaciones sobre 9 escenarios, con el código de `main` y el
  de `staging`. Antes del cambio fallaban 6; después pasan las 10. No se
  probó contra datos reales de producción.
- **Para analizar**: desde esa hora los leads equivalen a conversaciones; para
  fechas anteriores hay que contar **contactos**, no leads.

**Hallazgos del diagnóstico de solo lectura del 30-09-2026** (consultas sobre
`whatsapp_mensajes`, `leads` y `negocios`, sin textos de mensajes):
- WhatsApp real parte a comienzos de septiembre: 7 mensajes en julio (ids 1 a
  7, del 26 y 27 de julio, contacto 1, probablemente pruebas), 26 en agosto
  (todos el 31-08) y 10.881 en septiembre, consistente con la migración del
  número oficial del 06-09. La hora real de Meta (`wa_timestamp`) existe solo
  desde el 23-09.
- Hay un contacto anonimizado, con 9 mensajes.
- `leads.negocio_id` solo se llena con el botón manual "convertir lead"
  (`routes/leads.js`): de 607 contactos con mensajes desde agosto, 0 tienen el
  negocio ligado por el lead y 248 (41%) lo tienen por `negocios.contacto_id`.
  Eso mide contactos con algún negocio, no una tasa de conversión.
- Conversaciones cerradas sin vendedor: 212 de 558 (159 porque su último lead
  es uno "nuevo" sin asignar, 53 sin ningún lead). Las 53 sin lead no se han
  explicado.

**Conector MCP** (repo `ldevoto-sys/crm-mcp-hidrotecnica`; Railway, proyecto
CRM-MCP). Dos ambientes, ambos con despliegue automático al hacer push:
Production (servicio `adequate-grace`) y Staging (`crm-mcp-hidrotecnica`).
Hasta el 30-09 desplegaban desde `claude/branch-update-tetvwa`, la única
rama con las herramientas de WhatsApp (`main` del repo tiene 7 herramientas,
no 10). Desde el 30-09 Production despliega desde
`claude/fervent-carson-dgwu65` (commit `1e38354`, confirmado en Railway) y
Staging quedó apuntando a esa rama. Son 14 herramientas: las 10 de consulta
con `readOnlyHint` y las 4 que escriben sin marca, a propósito (no se debe
aflojar su aprobación). Verificado por Luis en producción con datos reales:
3 de las 4 herramientas nuevas; `crm_softland_documentos` devolvió 0 filas
para agosto-septiembre, lo esperado (las cotizaciones de Softland llegan
hasta jul-2026), pero aún no se probó con un rango que tenga datos.

**Pendientes**
- **MCP**: fusionar la rama a `main` del repo y apuntar ambos ambientes a
  `main`. Hoy despliegan desde una rama con nombre provisional, y cada push
  a esa rama redespliega el ambiente.
- **Verificar**: Softland con un rango que tenga datos (cotizaciones de
  julio; notas de venta y facturas de agosto-septiembre), y desde qué fecha
  hay datos en cotizaciones, mensajes y seguimientos (usar `limit=1` y leer
  `total`, sin leer datos de clientes).
- **Leads de WhatsApp, verificar con tráfico real**: comparar los leads
  creados desde el 30-09 21:12 contra las conversaciones (debería haber uno
  por conversación) y revisar que la cola de asignación no crezca por
  duplicados.
- **Vínculo conversación → negocio**: exponer los negocios por contacto
  (`negocios.contacto_id`) en los endpoints de lectura de WhatsApp, porque el
  vínculo por lead está vacío.
- **Leads, ajustes opcionales (no pedidos)**: que los leads ya derivados y
  cerrados también abran lead nuevo cuando el cliente vuelve; que el lead nuevo
  herede el vendedor del anterior; limpiar los leads duplicados que ya existen
  (2.484 sin asignar), siempre con respaldo previo.
- **Softland**: la historia anterior a 2023-01-01 no está replicada. Falta
  decidir si hace falta.
- **Fase 2, sin iniciar**: causa de pérdida "Otro" con comentario
  obligatorio, análisis de las pérdidas sin respuesta, y un endpoint para
  enviar informes por correo (destinatarios solo `@hidrotecnica.cl`, tope de
  envíos y registro de cada envío). Sin ese endpoint el agente no puede
  entregar informes periódicos por sí solo. Los informes periódicos mismos
  están por definir.
- **Decisión pendiente**: `GET /api/v1/whatsapp/conversaciones/:id/mensajes`
  sigue devolviendo el hilo de un contacto anonimizado si se conoce su id
  (la anonimización no toca los mensajes: alcance acotado validado con
  Gerencia, ver `services/privacidad.js`). El listado masivo nuevo sí los
  excluye.
- **Dato técnico**: `initDb()` pasa a mayúsculas los nombres de contactos en
  cada arranque, así que un contacto anonimizado queda como `(ELIMINADO)`,
  no `(Eliminado)`. Cualquier filtro debe comparar sin distinguir
  mayúsculas.
- **Seguridad**: rotar `BI_READONLY_PASSWORD` y la clave del rol
  `reportes_solo_lectura` (esta última quedó escrita en una conversación con
  Claude el 30-09). La API key de Cowork sigue siendo una sola para lectura
  y escritura.
- **Costos**: el ambiente Staging del MCP tiene un servicio Postgres con
  volumen que el código del conector no usa. Por revisar.

**Cobranza** y **Operaciones — "Arranque de Trabajos"**: siguen en
`staging`, excluidos de esta promoción, como en las anteriores.

## Pendientes (histórico, actualizado 23-09-2026)

**Auditoría de seguridad y corrección — 23-09-2026, en `staging` sin
promover, commits `e946eb8`..`7de42b0`.** Ver
`docs/HT-AP-03-nota-cambio-v1.36.md` para el detalle completo. Resumen:
caída del servidor por errores no capturados, adjuntos HTML ejecutables,
acceso del rol BI a `users`, huecos de permisos entre vendedores,
webhook de WhatsApp sin firma cuando falta el secreto, y varias
correcciones al módulo de Cobranza (conciliación transaccional, tope de
redondeo). Falta decidir qué cuenta como corrección de error para
promover a `main`, y quedan dos tareas fuera de código para Luis en
Railway: rotar `BI_READONLY_PASSWORD` y definir
`WHATSAPP_REENVIO_ACEPTAR=true` en staging.

**Promovido a `main` el 16-09-2026** (instrucción explícita de Luis
Devoto — ver excepción puntual arriba), commits `ff15bf8`..`b090ddc`:
- **Postventa**: aviso por correo al encargado al crear un caso nuevo,
  nombre del cliente con link a su ficha, folio (`PV-000001`), cierre con
  comentario obligatorio, edición ampliada del caso (título/descripción/
  producto/negocio de origen/referencia de cotización o venta), y botón
  **"Generar informe"** (PDF con portada + datos del caso + fotos + tabla
  de otros adjuntos + cotización vigente del negocio, fusionados con
  pdf-lib). **Sin la sección de Orden de Trabajo** que tiene en `staging`
  (commit `e77989c`, adaptado de `9e3195c`) — la OT depende de Arranque de
  Trabajos, que sigue sin promover; se agrega cuando esa fase se promueva.
- **Alertas de respuesta WhatsApp**: escalamiento acumulativo vendedor →
  callcenter → jefe comercial → gerencia cuando un cliente ya derivado
  queda sin responder (umbrales configurables en `Config → Alertas de
  respuesta WhatsApp`, horario hábil con feriados/excepciones editables a
  mano en `Config → Bot de WhatsApp`), aviso por correo y por Microsoft
  Teams (Workflow — requiere `TEAMS_WEBHOOK_URL` en Railway producción,
  **falta configurarla** si se quiere el canal Teams ahí; sin ella el
  sistema sigue funcionando solo por correo). Cubre también leads sin
  asignar y el cierre automático del bot de recontacto. "Cerrar
  conversación" apaga la alerta. Buscador de `Config` con alias por
  palabra clave (no solo el título de cada ítem).

**Lo demás del 06-09-2026 sigue vigente sin cambios** (ver abajo):
migración de WhatsApp oficial, herramienta de reenvío entre entornos, Ley
21.719 — todo ya en producción desde antes.

**Cobranza**: sigue en `staging`, explícitamente excluido de la promoción
de hoy — módulo con desarrollo pendiente.

**Operaciones — "Arranque de Trabajos"**: sigue en `staging`, explícitamente
excluido de la promoción de hoy. Ver detalle completo de la Fase 1 más abajo.

## Pendientes (histórico, actualizado 06-09-2026)

**Migración del WhatsApp oficial — COMPLETADA (06-09-2026).**

Estado final en producción:
- **+56 9 8106 2974 es el número comercial real** (`WHATSAPP_PHONE_NUMBER_ID`
  en Railway producción = `1339808529211189`). Es el número publicado en el
  sitio web — recibía ~200 contactos/semana atendidos hasta el 05-09-2026
  por un chatbot externo (chatbot.saaspro.br); desde ahora los atiende el
  CRM (bot de categorización, asignación de vendedor, todo el flujo
  comercial completo).
- **+56 9 8109 8161** (el número que usaba el CRM hasta esta migración,
  con historial real de clientes) **pasó a ser el número de pruebas**:
  se reenvía a `staging` vía `WHATSAPP_REENVIO_PHONE_NUMBER_ID` +
  `WHATSAPP_REENVIO_URL` + `WHATSAPP_REENVIO_SECRETO` (mismo secreto en
  ambos entornos). Ya no lo atiende nadie del equipo comercial — solo
  sirve para pruebas de desarrollo, con base de datos separada (staging).
- Ambos números viven bajo la misma app de Meta ("Hidrotecnica",
  `WhatsApp Business account ID: 1115263817731903`) — mismo
  `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_APP_SECRET` sirven para los dos, no
  hizo falta soporte multi-secreto en `firmaValida()`.
- Probado en ambos sentidos desde el celular real: mensaje a 8106-2974 →
  aparece completo en Bandeja de producción; mensaje a 8109-8161 → aparece
  en Bandeja de staging. Confirmado sin cruce entre entornos.
- Nota interna: el objeto `VENTAS` en `config/whatsappCuentas.js` mantiene
  ese nombre por herencia del código, aunque ahora corresponde a
  8106-2974, no a 8109-8161 — es solo una etiqueta de log, no afecta nada
  funcional. No es necesario renombrarlo, pero puede confundir si se lee
  el código sin este contexto.

**Para Operaciones y Cobranza** (a futuro, cuando se construyan esos
módulos): cada uno necesita su propio número — mismo mecanismo que ya está
probado (otra entrada en `whatsappCuentas.js`, con su propio `ambito`), no
reenvío ni nada especial.

**Herramienta de reenvío entre entornos** (06-09-2026, **ya en `main`**,
commit `429dfb9`): `WHATSAPP_REENVIO_PHONE_NUMBER_ID` + `WHATSAPP_REENVIO_URL`
reenvían tal cual (mismo cuerpo, misma firma) los mensajes de un número al
webhook de otro entorno, sin procesarlos ni guardar nada localmente.
Pensada para probar el número oficial en producción sin ensuciar la base
de datos real: se ve el flujo completo (aviso de privacidad, bot, etc.) en
la base de destino. Probada con dos instancias locales — funciona, y el
número normal de Ventas sigue procesando local sin regresión. Ambas
variables quedan vacías por defecto (desactivada) — activarla es cargar
las dos en Railway cuando se quiera usar.

**Ley 21.719 — protección de datos personales**: implementada y **ya en
`main` (producción)** desde 06-09-2026 (commit `993321a`), validada con
Gerencia (rol DPO). Aviso automático de privacidad en primer contacto/
reapertura de WhatsApp, detección de solicitud de eliminación de datos con
revisión humana en `/config/privacidad`, y purga automática diaria de
contactos inactivos sin conversión (12 meses, configurable). Ver detalle
en el commit de staging `af39e0d`.

**Cobranza**: módulo con desarrollo pendiente, acumulado en `staging` sin
promover a `main` (sigue la regla de arriba — no se promueve por mejoras).

**Operaciones — "Arranque de Trabajos" (Ventas → Operaciones) — Fase 1
implementada (09-09-2026, subida a `staging`).** Reemplaza el enfoque de
la especificación funcional original (`Especificacion_Tecnica_CRM_Arranque_Trabajos.md`,
tipos Reparación/Rutinario/Lavado/Especial-Proyecto) por uno más simple,
definido directamente por Luis Devoto: un solo flujo, sin ramificar por
tipo, con 5 tipos de trabajo reales (mantenimiento preventivo, lavado,
impermeabilizado, mantenimiento correctivo, otro). Ver
`docs/HT-AP-03-nota-cambio-v1.34.md` para el detalle completo.

Construido:
- **Tipo de trabajo obligatorio** al mover un negocio a "Aceptado" (pipeline
  Operaciones) — gate en `cambiarEtapaNegocio()` (`backend/routes/negocios.js`),
  cubre kanban, creación directa y el importador CSV masivo.
- **Orden de Trabajo (OT) automática** al entrar a "Aceptado"
  (`backend/services/ot.js`), identificada como `OT-{negocio_id}` (no tiene
  numeración propia). Prellenado de materiales/herramientas:
  - Mantenimiento preventivo / lavado: desde una plantilla configurable una
    sola vez (`Config → Plantillas de Orden de Trabajo`, tabla
    `ot_plantilla_items`) — estos trabajos no varían de un negocio a otro.
  - Impermeabilizado / correctivo / otro: caso a caso, copiando los ítems de
    la cotización vigente, **sin precios** (se cargan a mano si hace falta
    costear).
- OT editable (materiales/herramientas, con o sin precio) e
  imprimible/exportable a PDF, igual que una cotización.
- **Bug corregido de paso**: el importador CSV masivo caía por defecto en
  "Ganado" en vez de "Aceptado" cuando una fila no traía columna "estado"
  — contradecía su propio comentario y el texto de la UI. No estaba
  relacionado con este feature, pero bloqueaba probarlo con el importador.
- El aviso a cliente al pasar a "Programado" **no necesitó código nuevo**:
  se configura como una secuencia de seguimiento más (`Config →
  Secuencias`, un paso de correo con 0 días de espera) asignada a esa etapa
  desde `Config → Pipeline` — el motor de secuencias ya soportaba esto.

Sigue pendiente (Fase 2, no iniciada):
- El motor de checklist obligatorio configurable por etapa (el "mayor hueco
  de diseño" que ya identificaba este documento) — sigue sin existir; el
  único gate de etapa además del de tipo de trabajo es el de causa de no
  cierre.
- N° de Contrato para servicios recurrentes (Rutinario/Lavado) — sigue sin
  existir esa tabla; hoy solo hay `negocios.n_oc` (N° de orden de compra).
- WhatsApp de Operaciones (número separado del de Ventas) — sigue sin dar
  de alta en Meta, depende del trabajo de multi-número de arriba.
- Integración con Compras y Despacho — explícitamente fuera de alcance por
  ahora (decisión de Luis Devoto, 09-09-2026): la OT solo registra
  materiales/herramientas, sin disparar nada en esos módulos.
- Firma digital de cliente en sitio — no evaluada en esta fase.
