# HT-AP-03 — CRM Comercial HidroTecnica — Documento Consolidado

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Fecha de consolidación:** 2026-10-01 (última actualización: 2026-10-01)
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Naturaleza de este documento:** reemplaza la lectura dispersa de las notas de
cambio v1.2 a v1.25 (que quedan archivadas en `docs/` como historial de
decisiones) por una descripción única y al día de todo el sistema. Incorpora,
sobre la consolidación anterior (v1.11, 18-07-2026), el trabajo de las
v1.12-v1.14: múltiples pipelines (Ventas Directas/Operaciones), el módulo de
Postventa y el módulo de Despacho; de v1.15: ajuste de UX en Despacho y el
backlog priorizado post-lanzamiento (§16); de v1.16: optimización de ruta de
Despacho con Google Maps Platform; de v1.17-v1.18: el **Cotizador
Operaciones** completo (§7 de esta versión) — parser de solicitudes Fracttal,
motor de cálculo de mano de obra/traslado, y generación de propuestas en Word
a partir de 4 plantillas corporativas; de v1.19: secuencias de seguimiento
disparadas por etapa de pipeline (reemplaza el mecanismo anterior de
"secuencia predeterminada post-cotización"), el Dashboard con actividad real
del mes, el fix de rendimiento/normalización de RUT en los importadores
masivos, el retiro temporal del canal WhatsApp del envío de cotizaciones, y
la puesta en producción del sistema (01-08-2026); de v1.20: el **informe
diario por correo** de cotizaciones generadas y negocios ganados (§9 de esta
versión); de v1.21 (05-08-2026): el **importador de oportunidades** para el
pipeline Operaciones (§3), el **historial de adjuntos de Postventa** y la
posibilidad de abrir un **caso de Postventa sin negocio de origen** (ambos en
§5); y de v1.22 (07-08-2026): mensaje de correo editable y **forma de pago**
(con datos bancarios condicionales) al enviar una cotización (§4), **fecha de
compromiso** en el Pipeline con alerta de SLA (§3), el módulo **Servicio
Técnico de bombas** y el rol dedicado `tecnico` (§15, nueva), y la
posibilidad de subir fotos directo al crear un caso de Postventa o de
Servicio Técnico (§5/§15); y de v1.23 (07-08-2026): en Despacho, cada parada
pasa de guardar **una sola foto que se reemplazaba** a un **historial de
archivos** (§6), y en Postventa/Servicio Técnico el panel para agregar un
adjunto a un caso ya creado admite **selección múltiple** en una sola
acción (§5/§15) — con esta versión, `staging` y `main` (producción) quedan
con el mismo código; y de v1.24 (07-08-2026): **monto estimado editable** en
la ficha del negocio y **sincronizado automáticamente** al
generar o editar una cotización (§3), y el **aviso manual de novedades por
correo** (§9), que queda establecido como estándar para toda futura
promoción de cambios a producción; y de v1.25 (07-08-2026): **autoguardado
de borrador de cotización** y aviso honesto al expirar la sesión (§4), y el
**aviso diario de casos de Postventa vencidos** por correo a las 8:30am
(§5); y de v1.26 (11-08-2026): el monto sincronizado en §3 pasa a ser el
**neto (sin IVA)**, no el total, con backfill de los negocios existentes;
de v1.27 (11-08-2026): **cotización en UF** además de CLP (§4); y de v1.28
(11 y 12-08-2026, promovidas a producción el 18-08-2026 por instrucción
explícita de Gerencia): reasignar vendedor por jefe comercial (§3), nombre
del lugar frecuente en la parada de Despacho (§6), **envío automático por
correo** en el motor de seguimiento con personalización, teléfono del
vendedor y copia (CC) (§8), fixes de PDF y de la lista de Cotizaciones
(§4), filtro por cliente en Reportería (§9), y la primera versión de la
**API de integración para Cowork** (§18, nueva); de v1.29 (19-08-2026):
`GET /negocios` con filtros en la API de Cowork (§18); de v1.30
(20-08-2026): etapa del pipeline en vez de estado del documento en el
listado de Cotizaciones (§4), secuencias editables con casos en curso, y
el nuevo paso de secuencia "cambiar etapa" (§8); y de v1.31 (19 al
23-08-2026): la **Reportería Comercial + Softland** completa —nunca antes
documentada en este consolidado— con su listado documento por documento
de Cotizaciones/NV/Facturas y su sincronización con backfill único +
ventana viva (§9/§13/§14), la unificación de "Reportes" en una sola
sección del menú, las tarjetas de Notas de Venta/Facturas del mes en el
Dashboard (§9), y el estado de habilitación de WhatsApp Business Platform
con Meta, incluido el bloqueo pendiente por cuenta desactivada (§11); y de
v1.32 (07 al 08-09-2026): en la Bandeja WhatsApp, el filtro "No leídos" de
un vendedor queda siempre acotado a lo propio, sin importar el toggle
general de acceso (§11); y en Dashboard/Reportería, la tarjeta y columnas
de **Conversaciones de WhatsApp del mes** más el nuevo **Embudo comercial**
(Conversaciones → Cotizaciones → Notas de venta → Facturas, en cantidad y
en monto, por vendedor/área) (§9); de v1.33 (08-09-2026): **Sugerencias de
facturación** — cruce automático de facturas de Softland contra negocios
del pipeline por RUT de empresa + monto exacto, que solo sugiere (nunca
mueve un negocio solo) desde el Pipeline y desde una pestaña propia de
Reportería (§9); de v1.34 (11 al 12-09-2026): **Arranque de Trabajos** —
tipo de trabajo obligatorio y Orden de Trabajo automática al aceptar un
negocio de Operaciones (§3); y de v1.35 (26-08 al 14-09-2026, relevamiento
completo pedido por Luis Devoto para poner al día toda la documentación):
varios cambios que habían quedado en `staging` sin nota propia — fixes de
Arranque de Trabajos, "negocio = un hilo de cotización" (§4), sincronización
de productos desde Softland (§2), corrección del motor de seguimiento
(canal WhatsApp automático y canal "cambiar etapa", §8), variables
`{{...}}` en el correo de seguimiento sin contenido automático (§8), los 3
últimos fixes de permisos de `callcenter` para cotizar, extensión de
WhatsApp en la API Cowork (§18); además, en esta misma pasada se
incorporaron por primera vez a este consolidado la **migración del
WhatsApp oficial y la Ley 21.719 de protección de datos** (§11, ya en
producción desde el 06-09-2026 pero nunca documentadas acá) y el estado
real del módulo **Cobranza** (§19, en construcción en `staging`). Este
documento es el que debe subirse a SharePoint reemplazando la versión
anterior del documento base.

**Actualización v1.36 a v1.40 (01-10-2026):** se incorpora lo que estaba en
producción sin documentar acá. Postventa (folio, aviso, cierre con comentario,
informe PDF; §5), Alertas de respuesta de WhatsApp y reporte de tiempo de
respuesta por vendedor (§9, §11), plantilla desde la ficha del contacto y
sincronización de vendedor entre contacto, lead y negocios (v1.37; §11),
Despacho con vista de hoy y atrasados (§6), un lead por conversación (v1.39;
§11), API v1 de solo lectura para análisis y conector MCP de Cowork (v1.38;
§18), la auditoría de seguridad del 23-09-2026 (v1.36; subsección al final de
§1) y Operaciones completo (v1.34 y v1.40: Arranque de Trabajos, programación
y ejecución de la OT, "Ver OT", pestaña "OT's" y OT del técnico en Tareas; §1,
§3, §9, §13), con el procedimiento de promoción parcial y el incidente del
primer despliegue (§17). Los pendientes vigentes están en §16. Cobranza (§19)
sigue solo en `staging`.

---

## 1. Alcance y roles

**Roles del sistema:** `administrador`, `jefe_comercial`, `vendedor`,
`callcenter`, `gerencia`, `tecnico` (v1.22), `integrador` (v1.28 — ver
nota abajo).

**Rol `integrador`:** no es un rol de persona — es el actor de sistema
único que usa la API de integración Cowork (§18), sembrado con el usuario
`cowork@integracion.hidrotecnica.cl`. Queda seleccionable en el
desplegable de rol de la pantalla Usuarios junto a los roles de personas
reales (decisión deliberada, confirmada 14-09-2026: no genera confusión
real, no se oculta de la UI); toda escritura de esa API queda atribuida a
ese actor en el timeline.

**Rol `tecnico` (v1.22):** rol acotado a un solo módulo — quien lo tiene
**solo** ve y usa Servicio Técnico (§15), nada más del sistema (ni Dashboard,
ni Pipeline, ni Contactos, etc., aunque no tuvieran antes una restricción de
rol explícita). Los cinco roles preexistentes, en cambio, **suman** Servicio
Técnico a lo que ya veían — no se les quita nada. Pensado para personal de
terreno que solo necesita gestionar casos técnicos, sin acceso al resto del
CRM comercial.

**Rol `tecnico` — actualización v1.40 (01-10-2026):** además de Servicio
Técnico, el técnico ve **Mis Tareas** y es su pantalla de inicio: ahí ve, en
solo lectura, las Órdenes de Trabajo donde está asignado (programadas y el
histórico de ejecutadas, con selector por mes/año). Puede abrir la ficha y el
PDF de sus OT, siempre **sin precios** ni valor de venta; las OT donde no está
asignado dan 403. Administrador, jefe comercial y gerencia ven la misma sección
con las OT de **todos** los técnicos (o de uno puntual). No ve negocios,
contactos ni empresas.

**Atribuciones adicionales (v1.13-v1.14, +v1.35):** además del rol, un
usuario puede tener marcados uno o más de `es_encargado_postventa`,
`es_encargado_despacho` y `es_encargado_cobranza` (v1.35, ver §19) —
booleanos independientes del rol, no un perfil de usuario nuevo. Decisión
explícita: permiten que alguien cubra esa función (por ejemplo, el jefe
comercial durante una licencia del encargado titular) sin cambiarle el
rol. Quien tiene el atributo marcado ve el módulo en su menú aunque su rol
no lo traiga por defecto, y gestiona el tablero/las rutas completas de ese
módulo.

**Matriz de permisos** (resumen; ver detalle por función en la nota v1.6 si se
necesita el historial de por qué se definió así):

| Función | Admin | Jefe Comercial | Vendedor | Call center | Gerencia | Técnico |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Pipeline / negocios | ✅ | ✅ (cualquiera) | propios | ver | ver | — |
| Cotizaciones | ✅ | ✅ | propias | ✅ (v1.32) | ver | — |
| Aprobar descuento sobre tope | ✅ | ✅ | — | — | — | — |
| Postventa (gestión completa) | ✅ | ✅ | encargado (*) | — | — | — |
| Postventa (crear caso / ver propios) | ✅ | ✅ | ✅ | — | — | — |
| Despacho (gestión completa) | ✅ | ✅ | encargado (*) | — | — | — |
| Despacho (crear ruta / ver propios) | ✅ | ✅ | ✅ | — | — | — |
| Cobranza — operación diaria (§19, v1.35) | ✅ | — | encargado (*) | — | ✅ | — |
| ⚙️ Cobranza — cuentas contables (§19) | ✅ | ✅ | — | — | — | — |
| **Servicio Técnico (§15, v1.22)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (‡) |
| Cola de asignación (†) | ✅ | ✅ | — | ✅ | — | — |
| Bandeja WhatsApp (†) | ✅ | ✅ | sus conv. | ✅ | ver | — |
| Empresas / Contactos | ✅ | ✅ | ✅ | ✅ | ver | — |
| Duplicados | ✅ | ✅ | — | ✅ | — | — |
| Import/Export de maestros | ✅ | ✅ | — | — | — | — |
| Productos (consulta) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Reportes | ✅ | ✅ | sus números | sus números (§) | ✅ | — |
| Configurar secuencias/flujos | ✅ | ✅ | — | — | — | — |
| Gatillar/pausar una secuencia | ✅ | ✅ | propios | — | — | — |
| ⚙️ Config pipeline(s) | ✅ | ✅ | — | — | — | — |
| ⚙️ Config Postventa (etapas) | ✅ | ✅ | — | — | — | — |
| ⚙️ Config Servicio Técnico (etapas) | ✅ | ✅ | — | — | — | — |
| ⚙️ Config Cotizador Operaciones | ✅ | ✅ | — | — | — | — |
| ⚙️ Config Formas de pago | ✅ | ✅ | — | — | — | — |
| ⚙️ Lugares frecuentes de despacho | ✅ | ✅ | — | — | — | — |
| ⚙️ Reglas de asignación | ✅ | ✅ | — | — | — | — |
| ⚙️ Datos de empresa | ✅ | ✅ | — | — | — | — |
| ⚙️ Config WhatsApp/bot | ✅ | — | — | — | — | — |
| ⚙️ Usuarios | ✅ | — | — | — | — | — |
| ⚙️ Cambiar contraseña | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

(*) Cualquier usuario con `es_encargado_postventa`/`es_encargado_despacho`/
`es_encargado_cobranza` marcado, sin importar su rol — no solo vendedor.
Para Cobranza, a diferencia de Postventa/Despacho, `jefe_comercial` **no**
tiene acceso a la operación diaria sin el atributo — asimetría deliberada,
confirmada 14-09-2026: es información financiera sensible.

(†) Desde v1.19 (01-08-2026), estas dos pantallas se ocultaron del **menú**
para todos los roles (el canal WhatsApp no está operativo, ver §11/§14) —
los permisos de esta tabla siguen vigentes tal cual y las rutas
(`/bandeja`, `/cola`) siguen funcionando por URL directa; solo se sacó el
acceso visible.

(§) Desde el 28-09-2026 (en producción), `callcenter` ve Reportes (pestañas
Comercial (Softland) y WhatsApp) con el mismo alcance que `vendedor`: solo sus
propios números, sin el selector de todos los vendedores ni la exportación de
detalle. En el mismo cambio se agregó la **edición de tareas** (título y fecha
de vencimiento) en Mis Tareas y en las fichas de negocio, contacto y empresa,
para quien ya podía gestionar la tarea en el backend (dueño de la tarea,
administrador o jefe comercial); antes esa función no existía en ninguna
pantalla aunque el endpoint ya estaba. Origen: commit `fc0b893`, sin nota de
cambio propia.

(‡) `tecnico` es un rol nuevo, acotado exclusivamente a esta función (ver
§1, arriba) — no es un rol preexistente que sumó el acceso, como pasó con los
otros cinco. Para el resto de las filas de esta tabla `tecnico` no tiene
acceso (marcado "—"), incluidas pantallas como Dashboard o Pipeline que hoy
no tenían restricción de rol explícita: se les agregó una lista explícita de
roles (los cinco preexistentes) puntualmente por este motivo, sin cambiar el
comportamiento para ninguno de ellos.

**Anti-alcance explícito (decisiones tomadas, no se construye):**
- Nota de venta Softland: el ingreso se hace directamente y a mano en
  Softland; no hay importación automática desde el CRM.
- Scoring predictivo o proyecciones automáticas de cierre: el pipeline
  ponderado (§3) usa el % que fija la configuración o el vendedor, nunca un
  modelo.
- Réplica de base de datos para BI: en su lugar existe un rol de solo
  lectura sobre la misma base (§9).
- Mapa y optimización de ruta de Despacho (§6): diferido a una siguiente
  etapa, requiere antes una cuenta de proveedor de mapas.

### Seguridad — auditoría del 23-09-2026 (v1.36)

Auditoría de solo lectura sobre `main` y `staging`, seguida de la corrección de
los hallazgos que Luis Devoto marcó como "corregir". Detalle completo en la
nota de cambio v1.36. En producción desde la segunda promoción del 23-09-2026
(la primera falló y se revirtió, ver §17); las correcciones propias de Cobranza
de esa nota **no** están en producción (§19). Qué cambió:

- **Caída del servidor por errores no capturados:** un error no capturado en
  `PUT /cotizaciones/:id` y en `PUT /ordenes-trabajo/:id/items` podía tumbar el
  proceso completo (Express 4 no captura promesas rechazadas fuera de un
  `try/catch`). Se corrigieron ambos puntos y se agregó un manejador global
  (`unhandledRejection` y `uncaughtException`) como red de seguridad; no
  reemplaza el `try/catch` de cada ruta.
- **Adjuntos ejecutables:** un HTML o SVG subido a Postventa, Servicio Técnico
  o Despacho se servía con el tipo declarado por quien lo subía y permitía robar
  el token de sesión de quien lo abría. Ahora solo se aceptan imagen, video,
  audio y PDF, con tipo y extensión coherentes (`utils/archivosSeguros.js`), y
  al servir cualquier adjunto, incluidos los anteriores, se fuerza un tipo seguro
  (descarga si no es imagen, video, audio o PDF).
- **Rol de BI (`bi_readonly`):** tenía acceso completo a `users`, incluido el
  token de restablecimiento de contraseña en texto plano. Ahora ese token se
  guarda con hash (SHA-256) y el rol solo ve columnas no sensibles de `users`
  (sin `password_hash`, token de reset, RUT, teléfono ni datos del token de
  Microsoft Graph).
- **Sesiones y permisos:** el estado real del usuario (activo, rol, atribuciones)
  se consulta en cada solicitud con un caché de 60 segundos, así que desactivar
  a alguien o cambiarle el rol surte efecto sin esperar a que expire el token
  (8 horas); la contraseña temporal (`must_change_password`) se exige también en
  el backend; un vendedor ya no puede quedarse con un lead de otro ni
  descartarlo; los roles `tecnico` e `integrador` ya no tienen acceso de más a
  la Bandeja de WhatsApp; se cerraron los huecos por los que un vendedor veía
  secuencias, encuestas, notas, tareas o negocios de otro vendedor; y
  `GET /api/users` (RUT, email, teléfono) quedó solo para administrador y jefe
  comercial.
- **Entradas externas:** los datos que llegan por WhatsApp se escapan antes de
  ir en correos internos; las exportaciones CSV neutralizan celdas que empiezan
  con `=`, `+`, `-` o `@` (inyección de fórmulas); la descarga de imágenes para
  PDF acota el destino (SSRF); los mensajes de WhatsApp reenviados por Meta se
  deduplican por su identificador, para no repetir la respuesta del bot ni la
  asignación.
- **Webhook de WhatsApp:** si falta `WHATSAPP_APP_SECRET`, el CRM rechaza todo el
  webhook (antes aceptaba cualquier POST sin firma) y lo deja registrado en el
  log. El reenvío entre entornos (§11) solo lo acepta el entorno que tenga
  `WHATSAPP_REENVIO_ACEPTAR=true`; antes cualquier entorno con el mismo
  `WHATSAPP_REENVIO_SECRETO` podía saltarse la firma de Meta.
- **Claves y firmas:** comparación de tiempo constante para la clave de la API de
  Cowork (§18), del canal web de leads y de la firma del webhook.

Pendientes de esta auditoría (también en §16): rotar `BI_READONLY_PASSWORD`,
definir `WHATSAPP_REENVIO_ACEPTAR=true` en `staging`, `npm audit fix` de
dependencias, separar la API key de Cowork en lectura y escritura, y la
pregunta de Gerencia/DPO sobre el hilo de WhatsApp al anonimizar (Ley 21.719,
§11).

## 2. Maestros — Empresas, Contactos, Productos

**Importadores CSV** (Empresas, Contactos, Productos): mismo patrón en los
tres — subir archivo → previsualización (muestra + conteo) → validación fila
a fila → confirmar → informe de rechazos con motivo. Restringido a
administrador y jefe comercial.

- **Contactos:** valida RUT chileno (dígito verificador), email, teléfono
  normalizable a E.164; detecta duplicados por teléfono o email.
- **Empresas:** valida RUT; matchea por RUT si existe. El RUT se **normaliza**
  a un único formato (`XX.XXX.XXX-X`, con puntos) antes de comparar o
  guardar (v1.19) — un mismo RUT escrito de dos formas distintas en el
  archivo (ej. `77.131.014-1` y `77131014-1`) ya no se trata como dos RUTs
  distintos.
- **Rendimiento con archivos grandes (v1.19):** la confirmación de Empresas y
  Contactos procesa las filas en **lotes** (`INSERT ... ON CONFLICT`) en vez
  de una consulta por fila — una carga de ~49.000 empresas o ~30.000
  contactos, que antes no llegaba a terminar dentro del tiempo de espera del
  navegador, ahora toma un par de segundos. El informe de rechazos y el
  conteo nuevo/actualizado no cambian.
- **Productos:** matchea por **código/SKU**; crea nuevos y actualiza
  existentes. Fuente de verdad: el **Catálogo Técnico** (Excel de
  HidroTécnica), no HubSpot — reemplazo decidido por ser más completo.
  - Esquema: columnas núcleo (código, nombre, marca, categoría, precio, URL
    imagen, URL ficha, **descripcion_completa**) + un campo `atributos`
    (JSONB) con todo el detalle técnico (HP, voltaje, caudal, altura,
    conexión, curva Q/H hasta 6 puntos, sustitutos, notas, etc.). Permite
    guardar todo el catálogo sin migrar el esquema cada vez que se decide
    mostrar un campo nuevo en la cotización.
  - El importador detecta automáticamente las 3 hojas del Excel (Catálogo,
    Hidroneumáticos, Filtros Piscina) por sus columnas propias, y asigna la
    categoría correspondiente a las dos últimas (no traen columna "Tipo").
  - **Modo "catálogo completo"** (checkbox opcional): desactiva productos
    activos no incluidos en el archivo, acotado por categoría (subir solo
    bombas no desactiva hidroneumáticos ni filtros). Por defecto destildado.
  - Stock del proveedor: si el Excel trae esa columna, se registra en
    `stock_proveedor` (histórico; la carga más reciente es la vigente).
  - **Descripción completa:** columna nueva del Excel ("Descripción", texto
    largo para mostrar al cliente), mapeada a `productos.descripcion_completa`
    — campo distinto del `descripcion` interno preexistente (que no se usa en
    ninguna pantalla). Ya soportada en las 3 plantillas descargables
    (Bombas, Hidroneumáticos, Filtros Piscina).

**Decisiones de alcance de la migración desde HubSpot** (no se repite la
migración, quedan registradas para no perder el criterio):

| Objeto | En HubSpot | Se migró |
|---|---|---|
| Productos | 1.836 | Todos → luego reemplazado por el Catálogo Técnico Excel (2.481 productos) |
| Empresas | 1.570 | Todas, con validación dry-run |
| Contactos | 46.509 | Solo los que tenían teléfono o empresa asociada (~3.500–4.000); el resto (bases de difusión Constant Contact/Saaspro) no se migró |
| Negocios (deals) | 7 (demo) | Ninguno — el pipeline arrancó limpio |

**Imágenes y fichas técnicas de productos (Cloudflare R2):**
- Bucket público `crm-ht-productos` (Public Development URL habilitada),
  distinto del bucket privado de adjuntos de WhatsApp (§11) y del de
  documentos de despacho (§6).
- El CRM **no sube archivos**: la carga masiva (~3 GB) se hizo directo a R2
  por `rclone`, fuera de la aplicación (subir de a uno por navegador es
  inviable con más de 1.000 productos).
- El CRM solo **calcula la URL esperada** de cada producto según su código y
  la convención real de nombre de archivo, mediante la acción "Aplicar URLs
  de Cloudflare por código" (Productos → Importar catálogo):
  - Imágenes: `img/imagen1_{código}.jpg` (prefijo fijo `imagen1_`).
  - Fichas técnicas: `pdf/{código}FT.pdf` (sufijo `FT` antes de la extensión).
  - Por defecto solo completa productos sin URL previa; una casilla permite
    sobrescribir todos.
- **Protección en el importador:** el catálogo Excel todavía trae para
  muchos productos enlaces de SharePoint (no públicos) en las columnas de
  imagen/ficha. Al actualizar un producto existente, si la URL nueva es de
  SharePoint y la ya cargada es pública (R2), **no se sobrescribe** — evita
  que reimportar el catálogo destruya URLs ya corregidas.

**Búsqueda en listados (v1.19):** Empresas, Contactos y Productos filtran
**en vivo** mientras se escribe (debounce de 300 ms), igual que Cotizaciones
— ya no requieren apretar Enter o un botón "Buscar". Sin cambios de backend,
mismo filtro `ILIKE` de siempre. De paso, buscar un contacto por el nombre
de la empresa asociada (no solo por datos del propio contacto) ahora sí
encuentra resultados — antes el filtro comparaba solo los campos del
contacto, aunque el listado ya mostraba la empresa en pantalla.

**Sincronización de productos desde Softland (v1.35):** botón "Actualizar
productos desde Softland" (administrador/jefe comercial), separado del
importador Excel de arriba. La tabla origen en Softland (`iw_tprod`) solo
trae código y nombre — por eso este sincronizador **solo actualiza
`nombre` y `marca`**, nunca precio, categoría, imagen, ficha técnica ni
`atributos` (esos siguen curándose a mano o vía el Excel). Un producto
**nuevo** creado por esta vía queda sin precio ni categoría hasta
completarse por una de esas dos vías. Es manual (un botón, no una rutina
automática como la de ventas/facturas del §9) — el catálogo no cambia
todos los días. Reutiliza la conexión a la réplica de Softland ya
configurada, sin variables nuevas. **Sin validar todavía contra la
réplica real de producción** — pendiente de confirmar al desplegarse.

**Buscador de equivalencias técnicas** (pestaña dentro de Productos,
reemplaza la herramienta HTML independiente que existía antes):
- Bombas: filtro por tipo/voltaje/marca/precio máximo; búsqueda por caudal,
  altura manométrica y potencia con tolerancia ajustable (±5/10/20/30%);
  interpolación de la curva Q/H real cuando existe; sustitutos declarados
  por código (siempre primero).
- Hidroneumáticos: búsqueda por litros, presión mínima, orientación y marca.
- Filtros de piscina: por código/modelo o por volumen de piscina.
- Selección múltiple → "Generar cotización", que precarga esos productos
  como líneas en Nueva cotización.

## 3. Pipeline / Negocios

- **Múltiples pipelines (v1.12):** cada área comercial puede tener su
  propio tablero con sus propias etapas. Al desplegar este cambio se
  crearon dos: **Ventas Directas** (las 6 etapas históricas) y
  **Operaciones** (arranca solo con las terminales Ganado/Perdido; las
  intermedias las define el administrador, porque su flujo es distinto —
  cotizador propio que considera horas de trabajo, desplazamiento y otros
  gastos, en evaluación de integrarse a futuro con el de Ventas Directas).
  - Cada usuario tiene un **pipeline por defecto**; los negocios nuevos
    quedan en el pipeline del **dueño del negocio** salvo que se elija otro
    al crearlo (v1.22 — el formulario "Nuevo negocio" trae un selector de
    pipeline, preseleccionado en el default del vendedor pero editable; el
    backend valida que el pipeline elegido exista y esté activo).
  - Mover un negocio **a otro pipeline** es una acción separada de mover de
    etapa (las etapas disponibles cambian según el pipeline), restringida a
    administrador/jefe comercial.
  - Pipeline y Reportería suman un **selector de pipeline**; Pipeline suma
    además filtro por vendedor y por rango de fecha estimada de cierre.
- **Etapas configurables** por administrador/jefe comercial, por pipeline:
  nombre, orden (con botones subir/bajar), % de cierre por defecto,
  activar/desactivar. Las etapas terminales ("Ganado", "Perdido") están
  protegidas — no se eliminan ni desactivan, porque disparan la causa de no
  cierre obligatoria y la encuesta post-cierre.
- **Pipeline ponderado:** cada negocio hereda el % de cierre de su etapa y
  puede ajustarlo individualmente; el pipeline muestra monto total y monto
  ponderado (Σ monto × probabilidad) por columna. No es forecasting
  predictivo — el % lo fija la configuración o el vendedor.
- **Kanban:** tarjetas con drag-and-drop entre columnas (desktop). En mobile,
  donde arrastrar con el dedo entre columnas angostas no es viable, cada
  tarjeta suma un selector **"Mover a etapa"** como alternativa (y, si
  corresponde, "Mover a otro pipeline…") — el drag-and-drop de escritorio no
  cambió.
- **Automatismos:**
  - Al generar una cotización (nueva o nueva versión), el negocio avanza
    automáticamente a la etapa "Cotizado" de su pipeline — solo hacia
    adelante (si ya está en una etapa posterior o cerrado, no se toca).
  - Un lead que ya tenía vendedor asignado (vía Cola de asignación), al
    convertirse a negocio nace directo en "Calificado" en vez de "Lead".
- Exportación a CSV (Contactos y Pipeline), respetando los filtros en
  pantalla, sin el límite de filas del listado.
- **Importador CSV de oportunidades (v1.21):** para negocios que nacen de
  una orden de compra contra un contrato ya firmado (Cencosud, Sodimac,
  etc.), sin pasar por una cotización. Cada fila crea el negocio directo en
  una etapa del pipeline **Operaciones**, por defecto **"Aceptado"** si la
  columna "estado" viene vacía — mismo patrón de subir → previsualizar →
  confirmar → informe de rechazos que Empresas/Contactos, botón "Importar
  oportunidades" en Pipeline (administrador/jefe comercial). La empresa y
  el contacto se buscan o se crean automáticamente; el vendedor debe existir
  ya en el sistema (se resuelve por email o nombre). Campo nuevo
  `negocios.n_oc` para el N° de orden de compra. (Fix v1.34: antes una fila
  sin "estado" caía por error en "Ganado" en vez de "Aceptado".)
- **Arranque de Trabajos — tipo de trabajo y Orden de Trabajo automática
  (v1.34):** al mover un negocio a **"Aceptado"** en el pipeline Operaciones
  (por cualquier vía: kanban, creación directa o el importador CSV de
  arriba) se exige **tipo de trabajo** (mantenimiento preventivo, lavado,
  impermeabilizado, mantenimiento correctivo u otro) y se genera sola una
  **Orden de Trabajo** (`OT-{negocio_id}`, tablas `ordenes_trabajo` +
  `ot_items`), editable e imprimible/exportable a PDF igual que una
  cotización. Los materiales/herramientas se prellenan según el tipo:
  mantenimiento preventivo y lavado desde una plantilla configurable una
  sola vez (`Config → Plantillas de Orden de Trabajo`, tabla
  `ot_plantilla_items`); impermeabilizado, correctivo y otro caso a caso,
  copiando los ítems de la cotización vigente **sin precios**. El aviso a
  cliente al pasar a "Programado" se configura como una secuencia de
  seguimiento más (§8), asignada a esa etapa desde Config → Pipeline — no
  necesitó mecanismo nuevo. Detalle completo:
  `docs/HT-AP-03-nota-cambio-v1.34.md`.
  - **Fixes posteriores (v1.35):** el gate de tipo de trabajo no se podía
    completar desde el Pipeline (kanban) — solo existía en la ficha del
    negocio; se agregó el mismo modal al arrastrar la tarjeta o usar
    "Mover a etapa" en mobile. Columna **Código** en los ítems de la OT y
    su plantilla (solo aplica a ítems sin producto del catálogo asociado
    — con producto, el código mostrado es el SKU real). Buscador doble
    código → Tab (autocompleta la descripción si el código calza con un
    SKU). Fix del desplegable de búsqueda de producto, que se cortaba
    dentro de la tabla de ítems con scroll horizontal.
- **Programación y ejecución de la OT (v1.40, en producción desde el
  01-10-2026):** al pasar un negocio del pipeline Operaciones a **"Programado"**
  se exigen **fecha programada para ejecutar**, **horas de trabajo
  programadas** (por técnico) y **al menos un técnico** (usuarios activos con
  rol `tecnico`, editables después); al pasar a **"Ejecutado"**, además la
  **fecha de ejecución** (la real) y las **horas ejecutadas** (por técnico, en
  blanco por defecto, no se prellenan). **ID Fracttal** es opcional. Las
  horas-hombre son horas × cantidad de técnicos (3 técnicos × 6 h = 18). Las
  reglas rigen en todas las vías que mueven la etapa: Pipeline, ficha del
  negocio, secuencias automáticas, sugerencias de facturación y los dos
  importadores CSV (el de actualización masiva no puede saltarse la regla y
  rechaza la fila si a la OT le faltan datos). Solo aplican a OT nuevas
  (`ordenes_trabajo.exige_programacion`; las que existían al migrar quedan
  exentas). Un negocio que llega a Programado/Ejecutado sin OT exige también el
  tipo de trabajo. El Pipeline muestra el botón **"Ver OT"** en las tarjetas con
  OT, y el cuadro de "Programado"/"Ejecutado" pide los datos al mover. El
  código reconoce las etapas **Aceptado, Programado y Ejecutado** del pipeline
  "Operaciones" por su nombre: Config → Pipeline avisa si alguna falta o está
  inactiva y pide confirmación antes de renombrarla, desactivarla o eliminarla.
  Detalle: `docs/HT-AP-03-nota-cambio-v1.40.md`.
- **Fecha de compromiso (v1.22):** campo opcional `negocios.fecha_compromiso`
  (ej. fecha de entrega pactada con el cliente) — distinto de "fecha
  estimada de cierre" (forecast de venta). Se edita en la ficha del negocio
  y, opcionalmente, al crearlo. Se muestra en la tarjeta del Pipeline y en
  la ficha con la misma **alerta de SLA** que Postventa (§5): borde/texto
  ámbar si quedan 3 días o menos, rojo si ya venció, sin alerta si está
  lejos o no está definida. El cálculo (`slaEstado`) se extrajo a un helper
  compartido (`frontend/src/utils/sla.js`) para no duplicarlo entre Pipeline
  y Postventa — Servicio Técnico (§15) también lo reutiliza.
- **Monto estimado editable + sincronizado (v1.24):** `negocios.monto_estimado`
  se edita a mano en la ficha del negocio (mismo patrón que Probabilidad de
  cierre), y además se actualiza **automáticamente** cada vez que se genera
  una cotización nueva, se edita en borrador, o se genera una nueva versión
  (sobrescribe cualquier valor cargado a mano). Antes, un negocio sin monto
  cargado a mano al crearlo quedaba en $0 para siempre en Reportería y
  Pipeline, aunque después se cotizara y se ganara. **Desde v1.26, sincroniza
  el monto neto (sin IVA), no el total** — antes sobreestimaba ~19%; se hizo
  además un backfill único sobre los negocios ya existentes.
- **Reasignar vendedor dueño (v1.28):** antes solo administrador podía
  cambiarlo desde la ficha del negocio; ahora jefe comercial también puede.
- **Campos de origen externo (v1.28):** `origen` (`'crm' | 'fracttal' |
  'correo' | 'whatsapp' | 'otro'`, default `'crm'`), `referencia_externa`
  (clave de idempotencia) y `urgencia` (boolean) — agregados para que la API
  de integración (§18) pueda crear negocios sin duplicarlos ante un
  reintento. Los negocios creados desde la app quedan con origen `'crm'` y
  sin referencia externa.

## 4. Cotizaciones

**Negocio = un hilo de cotización (v1.35):** cambio de regla de negocio de
fondo. Antes existía, al crear una cotización desde un negocio ya
existente, un selector "Negocio existente / Negocio nuevo" (nota v1.9).
Ese selector **ya no existe**: el botón "+ Cotizar" de la ficha de un
negocio solo aparece si ese negocio **todavía no tiene ninguna
cotización** — con una ya creada, una versión nueva se agrega desde la
cotización misma ("Nueva versión"), nunca desde el negocio. Un negocio
pasa a ser estrictamente 1:1 con un hilo de cotización — misma premisa de
diseño que sostiene que la Orden de Trabajo (§3) también sea 1:1 con el
negocio. Sin cambios de esquema ni de la API Cowork (§18). Fix posterior
(01-09-2026): si el negocio de origen todavía no tiene cotización, la
nueva se cuelga de ese mismo negocio; solo crea uno nuevo si ya tenía una
— la primera versión de este cambio creaba un negocio nuevo siempre,
dejando huérfano el original.

**Numeración:** formato **`NNNNNN-VV`** — correlativo global de 6 dígitos
(sin año, sin prefijo de texto) seguido de la versión (2 dígitos), ej.
`000501-02`. Reemplaza el formato anterior `COT-AAAA-NNNNN` (correlativo por
año). El correlativo es global y no se resetea. Al salir a producción
(01-08-2026, v1.19) se fijó manualmente en la base de datos de producción
en **714838**, para que la numeración nueva continúe desde **714839** en
adelante (el correlativo que la empresa llevaba fuera del CRM), en vez de
reiniciar en 1. Las cotizaciones ya emitidas antes de este cambio conservan
su formato viejo; no se reescriben.

**Versión:** al generar una "nueva versión" se mantiene el mismo número y se
incrementa la versión; la anterior queda en estado "reemplazada" (salvo que
ya estuviera aceptada/rechazada). **En listados y reportes solo cuenta la
última versión de cada cotización** — las versiones anteriores no se listan
ni se cuentan (no se borran, solo dejan de mostrarse), para no duplicar o
triplicar lo que en los números es en realidad una sola oportunidad.

**Formato del documento** (PDF y vista pública `/c/:token`): encabezado con
datos del emisor y WhatsApp, cliente + vendedor + información, detalle de
productos, totales con IVA (`iva_pct` configurable por cotización, default
19%, 0 = exento), condiciones comerciales y datos bancarios
(`config_empresa`, fila única editable por administrador).

**Checks por línea de ítem** (tildados por defecto; antes esto era
automático y ahora requiere que el vendedor lo pida explícitamente):
- **Imagen** (`mostrar_imagen`): muestra la imagen del producto en el PDF y
  la vista pública.
- **Descripción completa** (`mostrar_descripcion`): muestra el párrafo largo
  del catálogo (`productos.descripcion_completa`, ver §2).
- **Ficha técnica** (`mostrar_ficha`): muestra el link "Ficha técnica (PDF)".

En los tres casos, si la línea no tiene producto asociado (texto libre) o el
producto no tiene ese dato cargado, el check no tiene ningún efecto. El
envío por correo/WhatsApp sigue mandando solo el PDF de la cotización — la
ficha técnica no se adjunta aparte, el cliente accede por el link (decisión
explícita: no justifica la complejidad de manejar varias fichas por
cotización, algunas aún en SharePoint).

**Envío desde el CRM:** botón único **"Enviar cotización"**.
- Correo: SMTP existente (cuenta Brevo), con el vendedor como "Responder a".
  **Pendiente de IT** que salga literalmente desde el correo del vendedor
  (ver §14 y §16).
- **Mensaje del correo editable (v1.22):** el texto que acompaña el link a
  la cotización trae por defecto el mensaje configurado en Datos de empresa
  (`config_empresa.mensaje_cotizacion_email`), pero se puede editar en la
  pantalla de la cotización **solo para ese envío** — no cambia el default
  de la empresa. Mismo patrón que ya existía para el envío por WhatsApp.
- **Forma de pago (v1.22):** selector opcional al crear/editar la
  cotización (`cotizaciones.forma_pago_id`), con las opciones editables en
  Configuración → Formas de pago (catálogo simple: nombre + flag "incluir
  datos bancarios"). Si la forma de pago elegida tiene ese flag activo, el
  **correo** de envío agrega un bloque con los datos bancarios de la
  empresa; si no, no lo incluye. El **PDF adjunto sigue mostrando los datos
  bancarios siempre**, sin condicionarlos a esto — es una decisión distinta,
  específica del cuerpo del correo. Catálogo sembrado con "Transferencia
  bancaria" (incluye datos bancarios), "Efectivo" y "Cheque" (no los
  incluyen).
- **Canal WhatsApp (corrección 14-09-2026):** la nota de v1.19 decía que
  este canal se había retirado del botón por no estar operativo — eso ya
  no es así, quedó desactualizado y no se corrigió cuando WhatsApp entró
  en producción (§11). Hoy la pantalla trae **dos casillas
  independientes, Correo y WhatsApp**, tildadas por defecto según si el
  contacto tiene email/teléfono registrado (cada una se deshabilita si
  falta el dato correspondiente); se puede enviar por uno, otro o ambos a
  la vez. El envío por WhatsApp usa la plantilla aprobada
  `envio_cotizacion_v2` con el link público (funciona aunque la
  conversación esté cerrada, a diferencia de un mensaje libre) — no
  adjunta el PDF en el mensaje mismo, el cliente accede por el link.
- Si el contacto no tiene email **ni** teléfono registrado, no queda
  ningún canal para enviar desde el sistema — se muestra una advertencia
  visible que permite cargar el email al vuelo sin salir de la pantalla.
- Si el envío falla, no se marca la cotización como enviada ni se dispara
  seguimiento; el error se traduce a un mensaje entendible.

**Secuencia de seguimiento automática:** desde v1.19, el disparo ya no
depende de "enviar cotización" sino de la **etapa del pipeline** en la que
queda el negocio — ver §8 (Motor de seguimiento) para el mecanismo completo.

**Estandarización de texto:** el título de la cotización y el nombre del
contacto/razón social de empresa se normalizan a **mayúsculas** al guardar
(los vendedores suelen tipearlos en minúscula o mezclado). La descripción de
cada línea de ítem no se toca — ya viene en mayúsculas desde el catálogo.
Los contactos que ya existían en minúscula se corrigieron una sola vez al
desplegar este cambio (backfill); razón social y título de cotización solo
aplican hacia adelante.

**Factor por línea (v1.18):** columna `cotizacion_items.factor` (multiplicador
numérico, ej. 0.5 para media unidad). Existe para toda cotización, pero solo
se edita y se muestra en el flujo de **Cotizador Operaciones** (§7) — en
Ventas Directas no aparece y no cambia nada.

**Propuesta en Word (v1.18):** cualquier cotización, sea de Ventas Directas u
Operaciones, puede generar un documento de propuesta a partir de 4 plantillas
Word corporativas, en vez de (o adicional a) el PDF plano de este documento.
Ver el detalle completo en §7 (Cotizador Operaciones), donde se construyó
junto con el resto de ese módulo.

**Autoguardado de borrador (v1.25):** el formulario de Nueva Cotización se
guarda solo en `localStorage` del navegador mientras se edita (antes no
tenía ninguna persistencia local — cualquier interrupción antes de
guardar, como una sesión expirada, perdía todo lo tecleado). Al volver a
entrar a esa misma cotización o a cotizar para el mismo negocio, si hay un
borrador guardado ofrece recuperarlo; se limpia al guardar con éxito.
Surge de un reporte de un vendedor que perdió una cotización extensa por
un corte de sesión — junto con esto, el aviso de sesión expirada
(interceptor de la API en el frontend) dejó de ser un corte silencioso: ahora
avisa explícitamente y aclara que el borrador se recuperará al volver a
entrar.

**Cotización en UF (v1.27):** además de CLP, se puede cotizar en **UF**
(Ventas Directas y Operaciones). En modo UF los ítems son de descripción
libre (sin buscador de catálogo, que solo tiene precios en CLP); el cliente
ve todo en UF de punta a punta (PDF, link público, WhatsApp, correo), sin
equivalencia en pesos. Pipeline/Reportes/Dashboard/`monto_estimado` siguen
viendo siempre el equivalente en CLP, convertido con la UF del día en que se
guardó (`uf_valor`/`uf_fecha` — mismo snapshot que ya usaba el Cotizador de
Operaciones para mano de obra). De paso se corrigió que "nueva versión" no
copiaba `origen`/`comuna`/`horas`/UF de la cotización base.

**Fix — título largo pisado en el PDF (v1.28):** un título de 2+ líneas
quedaba tapado por el bloque "CLIENTE/INFORMACIÓN" de abajo, que arrancaba a
una distancia fija pensada para una sola línea (mismo bug ya corregido antes
para el nombre del cliente, no replicado en su momento para el título).

**Fix — columna "Negocio" muy ancha en la lista (v1.28):** sin límite de
ancho, un título largo empujaba la columna "Vendedor" fuera de pantalla.
Ahora tiene ancho máximo y texto truncado (con el texto completo al pasar el
mouse), mismo patrón que Contactos.

## 5. Postventa (v1.13)

- Un caso de postventa (garantía o reclamo técnico) se vincula normalmente a
  un **negocio de origen**, para trazar la venta que lo generó. Desde
  **v1.21**, el negocio de origen es **opcional**: al crear un caso, el link
  "¿Sin venta asociada?" cambia el buscador de negocio por uno de
  **contacto** directo — pensado para reclamos de clientes sin venta
  registrada en el CRM (equipo de otro canal, garantía de un producto
  antiguo). La empresa del caso se toma automáticamente de la ficha del
  contacto elegido, sin pedirla aparte. Con negocio de origen, el
  comportamiento no cambia.
- Tablero Kanban propio (`/postventa`), separado del Pipeline de ventas —
  usa su propia tabla de etapas (`postventa_etapas`), **no** el mecanismo de
  pipelines múltiples del §3: Postventa es un solo flujo transversal, no un
  área comercial con pipeline propio; reutilizar esa tabla habría mezclado
  sus etapas en el selector de pipelines de Ventas/Operaciones.
- Etapas: dos terminales protegidas (**Resuelto**, **Rechazado**, no se
  pueden eliminar) y las intermedias abiertas que defina el encargado
  (Configuración → Config Postventa, con reordenamiento subir/bajar).
- Campos del caso: título, descripción, producto/equipo reclamado (opcional,
  buscable en el catálogo), detalle del equipo, prioridad
  (baja/media/alta/urgente), **fecha límite de respuesta** (obligatoria) y
  técnico asignado.
- **Alertas de SLA** por tarjeta según la fecha límite de respuesta:
  amarillo si quedan 3 días o menos, rojo si ya venció. Filtro en el
  tablero: Todos / Vencidos / Por vencer.
- **Aviso diario de casos vencidos por correo (v1.25):** todos los días,
  entre las 8:30 y las 8:44 hora de Chile, si hay al menos un caso
  **abierto** con la fecha límite de respuesta ya vencida, se envía un
  correo (asunto "CASO DE POSTVENTA VENCIDO") con el detalle de cada caso
  a quienes tengan el atributo `es_encargado_postventa`, o rol
  administrador/jefe comercial/gerencia. Si no hay ningún caso vencido ese
  día, no se envía nada. Tabla `postventa_vencidos_envios` evita reenviarlo
  dos veces el mismo día — mismo patrón que el informe diario (§9).
  Endpoint manual `POST /api/postventa/vencidos/enviar-ahora` para pruebas
  o reenvíos.
- Casos sin etapa asignada (creados antes de existir alguna etapa abierta,
  o cuya etapa fue desactivada) se muestran en una columna aparte **"Sin
  etapa asignada"**, para no quedar nunca invisibles.
- **Adjuntos (v1.21):** cada caso puede acumular varios archivos — foto
  cliente, video cliente, informe técnico, u otro — con descripción
  opcional, quién lo subió y cuándo. Reutiliza el bucket privado de
  Cloudflare R2 de Despacho (§6/§14), no uno nuevo. Puede subir/ver quien
  gestiona Postventa o el vendedor que creó el caso (mismo criterio que ver
  el detalle); puede eliminar quien lo subió o quien gestiona Postventa.
  Descarga autenticada desde el backend, sin URL pública. **Selección
  múltiple (v1.23):** el panel para agregar un adjunto a un caso ya creado
  admite elegir varios archivos de una vez, en vez de repetir la acción uno
  por uno — mismo cambio en Servicio Técnico (§15).
- **Fotos al crear el caso (v1.22):** antes había que crear el caso primero
  y recién después abrirlo para adjuntar fotos. El formulario "Nuevo caso"
  ahora acepta seleccionar fotos ahí mismo — a ojos del usuario es un solo
  paso; internamente el frontend crea el caso y sube cada foto justo
  después (el adjunto necesita el id del caso, que no existe hasta que se
  crea). Mismo cambio en Servicio Técnico (§15).
- **Permisos:** atribución adicional `users.es_encargado_postventa` (ver
  §1) — quien la tiene (o es administrador/jefe comercial) gestiona el
  tablero completo; un vendedor sin el atributo crea casos y ve los que él
  creó, sin gestionar el resto.
- **Folio de cara al cliente (15 al 16-09-2026):** cada caso nuevo recibe un
  folio `PV-000001` (correlativo atómico, tabla `postventa_correlativo_global`,
  columna `casos_postventa.folio`, mismo patrón que el correlativo de
  Cotizaciones). Se muestra en la tarjeta y en el detalle del caso.
- **Aviso por correo al crear un caso (16-09-2026):** al crearlo se envía un
  correo con folio, título, prioridad y cliente. Destinatarios: usuarios
  activos con correo, con `es_encargado_postventa` o rol administrador, jefe
  comercial o gerencia (mismos del aviso de casos vencidos; se excluyen el rol
  `integrador` y la cuenta `admin@hidrotecnica.cl`). El envío no bloquea la
  creación del caso: si el correo falla, el caso igual queda creado.
- **Cliente con link a su ficha:** en el detalle del caso, el nombre del
  contacto lleva a su ficha (`/contactos/{id}`).
- **Cierre con comentario obligatorio:** mover un caso a una etapa terminal
  (**Resuelto** o **Rechazado**) exige un comentario (qué se hizo o por qué se
  rechaza); sin comentario el backend responde 400. Se guarda en
  `casos_postventa.comentario_cierre`, se muestra en el detalle y se limpia si
  el caso se reabre.
- **Edición ampliada del caso:** quien gestiona Postventa puede editar título,
  descripción, producto, detalle del equipo, prioridad, fecha límite, técnico,
  el **negocio de origen** (al cambiarlo, el contacto y la empresa del caso se
  recalculan desde el negocio nuevo) y una **referencia libre a una cotización
  o venta** (`referencia_cotizacion_venta`), pensada para ventas antiguas no
  registradas en el CRM; no reemplaza al vínculo real de `negocio_id`.
- **Botón "Generar informe" (`GET /api/postventa/{id}/informe-pdf`):** genera un
  PDF único con la portada y datos del caso, las fotos incrustadas, una tabla
  con los demás adjuntos (un video no se puede incrustar en un PDF), la
  cotización vigente del negocio de origen (la versión más alta) y, desde la
  promoción de Operaciones del 01-10-2026, la **Orden de Trabajo** del negocio
  si existe (§3); los adjuntos que ya son PDF se anexan al final. Las páginas se
  fusionan con `pdf-lib`. Lo puede generar quien puede abrir el caso.

## 6. Despacho (v1.14-v1.16, v1.23)

- Un **despacho** es una ruta con una o más **paradas**, cada una con:
  dirección, comuna, fecha, tipo (retiro o entrega), datos de contacto y el
  documento de respaldo (factura/guía de despacho para una entrega, O/C
  para un retiro, "otro" para casos internos).
- El vínculo a un negocio o a un caso de postventa es **opcional** — puede
  originarse en una venta cerrada, en una garantía, o registrarse suelto
  (logística interna sin relación comercial).
- Vista de **lista/calendario por fecha**, no Kanban: el estado del
  despacho es un flujo lineal fijo (programado → en ruta →
  completado/cancelado), no etapas configurables como Ventas o Postventa.
  Filtros: rango de fecha y estado.
- Cada parada se marca **completada** por separado y se puede **editar**
  después de creada (corregir dirección, fecha, contacto, etc.).
- **Lugares frecuentes de retiro/entrega:** configurador (Configuración →
  Lugares frecuentes de despacho) con dirección, comuna y contacto de
  direcciones habituales (ej. proveedores). Un selector opcional al crear
  una parada autocompleta esos tres campos; tipo y documento se siguen
  eligiendo en cada caso, porque un mismo lugar puede usarse para ambos.
  **Desde v1.28**, si la dirección de una parada coincide con un lugar
  frecuente registrado, la ficha de la parada muestra su nombre junto a la
  dirección (antes solo mostraba la dirección, sin forma de saber a qué
  lugar correspondía sin buscarlo a mano).
- **Historial de archivos de respaldo por parada (v1.23):** el encargado
  puede subir, en cualquier momento, uno o varios archivos del documento
  firmado de una parada — ninguno reemplaza al anterior, quedan todos
  disponibles con quién los subió y cuándo (mismo patrón que los adjuntos
  de Postventa/Servicio Técnico, §5/§15). Antes de v1.23 solo se guardaba
  **una** foto por parada, que se perdía al subir una nueva
  ("Reemplazar foto") — la que ya existiera se migró automáticamente al
  nuevo historial. El selector de archivo permite tanto tomar una foto
  nueva como elegir una o varias ya existentes en el teléfono. Marcar una
  parada como completada exige al menos un archivo en su historial (antes
  exigía la foto única). Almacenamiento en un bucket **privado y separado**
  de Cloudflare R2 (distinto del de imágenes de producto y del de adjuntos
  de WhatsApp, por tratarse de documentos con firmas y datos de clientes);
  visualización y descarga autenticadas desde el CRM, sin URL pública
  directa. **Configurado en ambos ambientes desde v1.21** (`R2_DESPACHO_*`
  cargado en `staging` y producción) — mismo bucket que reutilizan los
  adjuntos de Postventa (§5) y Servicio Técnico (§15).
- **Optimización de ruta (v1.16):** botón "Optimizar ruta" que sugiere el
  orden más eficiente para visitar las paradas pendientes de un mismo día,
  ida y vuelta desde la dirección de la empresa, usando Google Directions
  API (con Geocoding API para convertir cada dirección a coordenadas, que
  se cachean en `despacho_puntos.lat/lng`). Solo sugiere — el encargado
  decide si aplica el orden. Rechaza con un error claro si las paradas
  pendientes tienen fechas distintas, o si Google no puede ubicar alguna
  dirección. Pendiente cargar `GOOGLE_MAPS_API_KEY` en Railway (ver §16).
- **Hora de llegada estimada (v1.16):** indicando una hora de salida (por
  defecto, la de apertura configurada en horario de atención), la
  sugerencia muestra la hora estimada de llegada a cada parada y de vuelta
  a la empresa. Solo informativo — no valida nada automáticamente todavía.
- **Casos reales de ruteo — en construcción:** se identificaron con
  Gerencia tres variables que la optimización no resuelve aún: uno o dos
  vehículos, restricciones horarias por parada, y orden fijo obligatorio
  para algunas paradas. Enfoque acordado: el sistema sugiere, el
  encargado ajusta a mano (no un solver de ruteo con restricciones duras,
  que requeriría otra API de Google — Route Optimization/fleet routing —
  bastante más compleja y cara). Falta construir: vehículo por parada,
  ventana horaria por parada (marcar en rojo si no calza), candado de
  orden fijo, y reordenar paradas a mano.
- **Diferido a una siguiente etapa** (decisión explícita): mapa visual con
  los puntos del día embebido en el CRM — hoy la ruta sugerida se muestra
  como lista, no en un mapa.
- **Permisos:** mismo patrón que Postventa — atribución adicional
  `users.es_encargado_despacho` (ver §1).
- **Vista por defecto "hoy y atrasados" (30-09-2026):** la lista abre en
  **Activos (hoy y atrasados)**: los despachos con alguna parada de hoy (en
  cualquier estado) más los programados o en ruta con alguna parada de una
  fecha anterior. Los programados a futuro no aparecen hasta su día. "Hoy" se
  calcula en hora de Chile, no en la del servidor. Las otras vistas son
  **Todos** e **Historial (completados/cancelados)** (`GET /api/despachos?vista=`).
  Al usar los filtros de fecha o estado, la lista pasa sola a **Todos** para que
  el filtro no quede restringido por la vista por defecto. El listado devuelve
  hasta 300 despachos.
- **Orden por columna (30-09-2026):** se puede ordenar la tabla por Título,
  Fecha, Paradas, Origen, Estado y Creado por, ascendente o descendente.
- **Agrupar por dirección (30-09-2026):** un interruptor (activo por defecto)
  junta en un solo bloque los despachos cuya primera parada coincide en lugar
  y fecha (mismo lugar frecuente, o misma dirección y comuna normalizadas), con
  el título "dirección, comuna · fecha — N despachos". Cada grupo queda en el
  lugar de su primera fila según el orden elegido. Cambio solo de pantalla y
  consulta: sin migración de schema.
- **Mapa embebido (corrección 01-10-2026):** el código incluye un mapa de
  Google Maps embebido con las paradas del despacho (sin ruta optimizada), que
  solo se muestra si está definida la variable `VITE_GOOGLE_MAPS_EMBED_KEY` del
  frontend (una key distinta de `GOOGLE_MAPS_API_KEY`, restringida por
  dominio). Las notas de cambio no lo documentan, no consta si esa variable
  está cargada en producción y el punto "diferido a una siguiente etapa" de
  más arriba quedó desactualizado respecto del código: por confirmar con
  Gerencia.

## 7. Cotizador Operaciones (v1.17-v1.18)

Cotizador propio para el pipeline **Operaciones** (§3), usado para cotizar
trabajos que se originan en solicitudes del sistema **Fracttal**
(mantención/reparación), no en negociación directa de venta de equipos.
Reemplaza la herramienta HTML standalone `cotizador_hidrotecnica.html` que
el equipo de Operaciones/Mantención usaba hasta ahora (catálogo propio de
411 productos embebido en el archivo, sin fuente de verdad única).

**Decisión explícita:** no existe catálogo de productos propio para
Operaciones — todo material/equipo resuelve su precio contra el maestro
`productos` único del CRM (§2). Si un producto cotizado no existe ahí, se
agrega por el importador de Productos existente, no por otra vía.

**Importador/parser de solicitudes Fracttal:** el texto del correo Fracttal
("Nueva solicitud creada") se pega manualmente — no hay integración API con
Fracttal. El parser extrae N° de solicitud, fecha, solicitante, urgente,
activo/ubicación → cliente y descripción; detecta el **hallazgo** por
heurística de verbos de falla (falla, avería, bloqueado, quemado, dañado,
roto, no funciona, desgaste, colapso — o la primera oración útil si no
detecta ninguno); **ítems de materiales** (patrones "N + descripción" o "se
requiere de N…", normalizando fracciones unicode ½ ¾ ⅜ a texto antes de
matchear); **horas de mano de obra** (patrón "N personas/técnicos … M
horas"); **notas de ejecución** (líneas con llevar/conseguir/coordinar/
escalera/camión); y comuna fuera de la Región Metropolitana (lista de 20
ciudades conocidas).

**Motor de matching de productos** — determinístico y auditable, sin IA/LLM
eligiendo el producto (la empresa no adivina, ver Anti-alcance §1):
normaliza el texto (minúsculas, sin tildes, fracciones a texto) → aplica la
tabla de sinónimos (`cotizacion_sinonimos_operaciones`, ej.
`tripolar → automatico`, `chapaleta → valvula chapaleta`) → separa "tokens
de modelo" (con dígito o ≤4 letras, peso ×3) de "palabras descriptivas" (sin
dígito, >2 letras, peso ×1) → puntúa cada producto por coincidencia contra
`nombre`/`descripcion` de `productos` → exige un score ≥ 30% del largo de
la búsqueda **y** rechaza matches que solo coincidan por tokens cortos o
genéricos (`220v`, `2`, `inox`) sin ninguna palabra descriptiva real
compartida — filtro que evitó falsos positivos reales detectados en
pruebas (ej. "amarra inox" matcheando con "bomba … inox"). Sin match, la
línea queda con precio 0, editable a mano; no da de alta el producto en el
maestro.

**Cálculo de mano de obra y totales** — constantes reales portadas de la
herramienta en uso (`config_operaciones_mo`, fila única editable por
administrador/jefe comercial): `HH_UF = 0.456426` UF, `HM_UF = 0.069477` UF,
`MARKUP = 1.47`, `ELEM_MAT_PCT = 0.07`, `ELEM_FURG_UF = 0.358` UF.

```
HH normales      = HH_UF × horas_normales × 2 técnicos
HH fuera horario = HH_UF × 1.5 × horas_extra × 2 técnicos
HM en trabajo    = HM_UF × (horas_normales + horas_extra)
HM en tránsito   = HM_UF × horas_transito_comuna × 2
Traslado         = costo_traslado_uf_comuna × 2
Elem. furgón     = ELEM_FURG_UF (fijo)
MO total (UF)    = suma de lo anterior
```
Si `horas_normales = 0` y `horas_extra = 0` → MO total = 0 completo (no se
cobra traslado sin visita real — gate explícito, ya evitó un bug en la
herramienta original). `comunas_operaciones` trae las 31 comunas de la
Región Metropolitana (nombre, km, horas de tránsito, costo de traslado en
UF).

```
Subtotal materiales (CLP) = Σ cantidad × precio × factor
Elementos menores (CLP)   = subtotal materiales × ELEM_MAT_PCT
Materiales × Markup (CLP) = (subtotal + elementos) × MARKUP
MO total (CLP)            = MO total (UF) × valor UF del día
Total neto CLP            = materiales×markup + MO total (CLP)
IVA                       = total neto CLP × iva_pct   (mismo campo de §4)
Total con IVA             = neto + IVA
```
Los materiales se cotizan en CLP (igual que Ventas Directas, tomando
`productos.precio`); la mano de obra, el traslado y los elementos de
furgón se calculan en UF y se convierten a CLP con el valor UF del día
(`services/uf.js`, cacheado desde findic.cl — no requiere ingreso manual).

**Modalidad de precio** (`cotizaciones.modalidad_precio`): **desglosado**
(muestra subtotal materiales, elementos menores, markup y MO por separado)
o **suma alzada** (solo el total, con nota fija "Precio suma alzada: valor
fijo e invariante para el alcance definido").

**Documento de propuesta:**
- Bloques propios además del formato general de Cotizaciones (§4):
  **Hallazgo** (entre comillas), **Justificación técnica/Observaciones**, y
  **Consideraciones de ejecución** (lista de ítems con tag — Info /
  Atención / Corte agua / Horario no hábil / Acceso / Otro — con nota fija
  "las variaciones de alcance no previstas se cotizan por separado"). Marca
  "URGENTE" si la solicitud Fracttal de origen venía marcada como tal.
- **Plantillas Word (v1.18):** 4 plantillas corporativas — `HTCO01` Simple
  Suministro, `HTCO02` Estándar Suministro y Montaje, `HTCO03` Llave en Mano
  Regulado, `HTCO04` Lavado y Sanitización de Estanques — disponibles para
  **cualquier** cotización (Ventas Directas u Operaciones, ver §4). Cinco
  secciones narrativas (Objeto de la propuesta, Alcances, Exclusiones,
  Condiciones de ejecución, Otras consideraciones) son texto libre editable
  por cotización, con valor por defecto igual al texto tipo de la plantilla
  elegida — no se modelan como campos estructurados. El sistema arma el
  `.docx` (`docxtemplater`/`pizzip`) con esos 5 textos + ítems + montos
  calculados; el vendedor lo descarga, lo retoca (fotos, ajustes), lo
  convierte a PDF y **lo sube al sistema** — desde ahí se envía con el botón
  "Enviar cotización" (§4), conservando la secuencia de seguimiento. El Word
  nunca se envía directamente.
  - Pago por hitos (%) de `HTCO03`: fuera de alcance por ahora — esa
    plantilla cotiza con el mismo modelo de suma alzada que HTCO01/02; si se
    necesita el detalle de hitos, se agrega a mano en el Word ya descargado.

**Permisos:** los mantenedores (Configuración → Cotizador Operaciones: Mano
de obra, Comunas, Sinónimos) los edita administrador y jefe comercial —
mismo criterio que Secuencias (§8).

## 8. Motor de seguimiento (secuencias) y notas/tareas

- **Secuencias configurables:** nombre + pasos ordenados (días de espera,
  canal, mensaje/guion). Un negocio abierto inicia una secuencia a la vez;
  un revisor interno del servidor avanza los pasos vencidos cada 15
  minutos. **El tiempo de espera de cada paso cuenta desde que se ejecutó
  el paso anterior** (el primero, desde que se activa la secuencia) — es
  acumulativo, no desde el inicio de la secuencia; con "Respetar horario
  hábil" activo, un paso que espera fuera de horario corre recién cuando
  abre y el atraso se arrastra al resto de los pasos.
  **Desde v1.28, un paso de canal "correo" se envía solo** (Brevo, mismo
  servicio del envío inicial de cotización). Si el contacto no tiene
  correo o el envío falla, cae a una **tarea** manual con el motivo.
  **Correo — sin contenido automático, todo por variables (v1.35):** el
  cuerpo del correo es exactamente el mensaje configurado — ya no se
  agrega solo ningún saludo, firma ni referencia a la cotización (así
  era hasta v1.28, y mezclaba campos fijos con las variables que la
  persona sí controlaba). Variables disponibles en asunto y mensaje:
  `{{nombre_cliente}}`, `{{apellido_cliente}}`, `{{n_cotizacion}}`,
  `{{negocio_titulo}}`, `{{monto_cotizacion}}`, `{{producto_resumen}}`
  (resumen de ítems de la cotización, hasta 4), `{{link_cotizacion}}`,
  `{{nombre_vendedor}}`, `{{email_vendedor}}`, `{{telefono_vendedor}}` —
  una variable no reconocida o sin dato se deja visible en el correo en
  vez de desaparecer en silencio, para notarlo antes de enviarlo.
  **Canal "whatsapp" (v1.35, corrige lo que decían versiones anteriores
  de este documento):** también se envía solo, vía la Cloud API de Meta,
  con una plantilla aprobada elegida al configurar el paso (ver el
  listado real vigente en §11) — cae a tarea manual si el contacto no
  tiene teléfono o el envío falla, igual que correo. **Canal "cambiar
  etapa" (v1.30):** no envía nada — mueve el negocio a la etapa elegida
  (si es de tipo "perdida", exige causa de no cierre), reutilizando el
  mismo camino que moverlo a mano en el Pipeline; útil como último paso
  si el cliente no respondió a ninguno de los anteriores (ej. mover a
  "Perdido" con causa "Sin respuesta"). Los canales **llamada / tarea**
  siguen generando una tarea para el vendedor.
- **Disparo por etapa de pipeline (v1.19):** cualquier etapa de un pipeline
  (§3) puede tener asociada una secuencia (`pipeline_etapas.secuencia_id`).
  Al mover un negocio a una etapa: si esa etapa tiene secuencia asociada, se
  dispara — reemplazando cualquier otra que estuviera activa o pausada en el
  negocio; si la etapa no tiene secuencia asociada, se detiene la que viniera
  corriendo (para que no siga activa una secuencia de una etapa anterior en
  una etapa que no la necesita). Reemplaza el mecanismo anterior de una sola
  secuencia "predeterminada" que se disparaba solo al enviar una cotización
  — ahora es cualquier etapa, no solo "Cotizado", y aplica a cualquier
  pipeline (Ventas Directas u Operaciones).
- Pausar, reactivar (reinicia el conteo de días), marcar "cliente
  respondió", cancelar. Un negocio cerrado (ganado o perdido) cancela su
  secuencia activa automáticamente.
- Una secuencia puede marcarse para **respetar el horario de atención** (un
  paso vencido fuera de horario espera a que abra).
- **Notas y tareas** ligadas a contacto/empresa/negocio, visibles en el
  timeline unificado. Asignar una tarea a otro usuario: solo administrador o
  jefe comercial (un vendedor/call center solo se asigna a sí mismo).
- **Edición de tareas (28-09-2026):** en Mis Tareas y en las fichas de negocio,
  contacto y empresa se puede editar el título y la fecha de vencimiento de una
  tarea. Puede hacerlo el dueño de la tarea (a quien está asignada),
  administrador o jefe comercial; es el mismo criterio que ya aplicaba el
  backend (`PUT /api/tareas/{id}`), que hasta entonces no tenía pantalla.
- **Envíos automáticos de WhatsApp en la Bandeja (fix de septiembre de 2026):**
  los mensajes que una secuencia enviaba solos por WhatsApp (§8, canal
  "whatsapp") no aparecían en la Bandeja; se corrigió en el commit `274fe52`
  (sin nota de cambio propia).
- **Registro del seguimiento para análisis (v1.38):** el seguimiento
  automático (pasos de secuencia, plantilla "Seguimiento de cotización" y
  encuesta de causa de no cierre) se puede consultar desde la API de lectura
  (`GET /api/v1/seguimientos`, ver §18); distingue `enviado_automatico`,
  `tarea_generada` y `cambio_etapa`.

## 9. Reportería

- **Dashboard (v1.19):** pantalla de inicio con la actividad real del mes en
  curso — dos tarjetas de total (cotizado / cerrado-ganado del mes) y un
  gráfico de barras comparando cotizado vs. cerrado-ganado por vendedor, con
  tabla de detalle debajo. Mismo filtro de fecha que "Cotizaciones por día"
  (cotizado) y que "Ranking de vendedores" (cerrado-ganado); un vendedor solo
  ve lo propio, igual que el resto de Reportería. Reemplaza el texto
  estático que mostraba esta pantalla desde el arranque del sistema.
- `negocio_etapa_historial` registra cuándo un negocio entra y sale de cada
  etapa (se completa desde que se implementó hacia adelante).
- Reportes: embudo por etapa, causas de no cierre, tiempo promedio por
  etapa, ranking de vendedores (ganados/perdidos, tasa de cierre, monto
  ganado), cotizaciones por día — todos exportables a CSV y filtrables por
  **pipeline** (§3; Ventas Directas por defecto). **Desde v1.28**, también
  filtrables por **cliente** (empresa), solo o combinado con vendedor —
  mismo filtro disponible desde la API de integración (§18).
- **Cotizaciones por día**, con detalle expandible por vendedor: contactos
  asignados ese día, cotizaciones generadas (cantidad/monto) y cotizaciones
  ganadas (cantidad/monto). Ya corregido para contar **solo la última
  versión** de cada cotización (ver §4) — antes duplicaba/triplicaba
  cotizaciones re-versionadas.
- Vendedor ve solo sus números; administrador/jefe comercial/gerencia ven
  todos o filtran por vendedor; call center no tenía acceso a reportería —
  **actualización 28-09-2026:** ahora ve las pestañas Comercial (Softland) y
  WhatsApp con el mismo alcance que un vendedor (solo sus números, ver §1).
- **Acceso de solo lectura para BI externo:** rol de PostgreSQL
  (`bi_readonly`) aprovisionado automáticamente si está definida la variable
  `BI_READONLY_PASSWORD`, con `SELECT` sobre todas las tablas actuales y
  futuras. Pensado para Power BI / Looker Studio combinando esta fuente con
  Softland. La contraseña se resincroniza en cada arranque. **Desde la
  auditoría del 23-09-2026 (v1.36)** la tabla `users` es la excepción: el rol
  solo puede leer `id`, `nombre`, `email`, `rol`, `activo`, `area`,
  `es_encargado_postventa`, `es_encargado_despacho`, `pipeline_default_id`,
  `codigo_softland`, `recibe_round_robin` y `created_at` (ver §1). Pendiente:
  rotar la clave (§16).
- **Informe diario por correo (v1.20):**
  alternativa al acceso de BI externo cuando la conexión al proxy público de
  Railway no es viable (ej. firewall corporativo bloqueando el puerto no
  estándar). Un job interno (`services/informeDiario.js`, sin pasar por el
  proxy público) envía a las 8:00 AM hora de Chile, a todos los usuarios
  activos, un correo con las cotizaciones generadas y los negocios ganados el
  día anterior (ambos pipelines) — mismo criterio de "última versión cuenta
  una sola vez" que "Cotizaciones por día", con 2 CSV adjuntos. Tabla
  `informe_diario_envios` evita reenviarlo dos veces el mismo día. Endpoint
  manual `POST /api/reportes/informe-diario/enviar-ahora` para pruebas o
  reenvíos. Ver nota de cambio v1.20 para el detalle completo.
- **Aviso manual de novedades por correo (v1.24) — estándar de
  comunicación de cambios:** pantalla "Avisar novedades" (Configuración →
  administrador/jefe comercial) para redactar un título y una lista de
  cambios (uno por línea) y enviarlos por correo a todos los usuarios
  activos — mismo criterio de destinatarios que el informe diario.
  `POST /api/novedades/enviar {titulo, cambios[]}`. No guarda historial de
  envíos ni genera el contenido automáticamente desde Git — es un envío
  puntual, redactado a mano. **Queda como estándar:** cada vez que se
  promueve a `main` (producción) un conjunto de cambios visibles para el
  usuario, corresponde enviar este aviso además de (no en reemplazo de) la
  nota de cambio técnica de esta carpeta.

**Reportería Comercial + Softland (v1.31):** sección propia dentro de
"Reportes" (selector Pipeline / Comercial), con datos de Cotizado, Cerrado
(NV emitidas) y Facturado por vendedor/área, en monto y cantidad —
reemplaza el script manual `generar_dashboard.py` que se corría a mano
desde un equipo personal. Cotizado: Softland hasta jul-2026 (histórico
estático), en vivo desde el CRM desde ago-2026. Cerrado y Facturado:
siempre Softland, sin cruce con el pipeline del CRM. Pestañas: Mensual
(2023-hoy, reactiva a los filtros de Año/Mes, con tooltip), Comparación
anual (con acumulado y tabla de detalle), Por vendedor, Por área, NV sin
facturar (con buscador), y **Cotizaciones/Notas de Venta/Facturas**
documento por documento (filtro por año/mes/día/vendedor/área + texto,
exportar CSV, paginado server-side por el volumen — a diferencia del
resto del reporte). Botón "Actualizar" manual + sincronización automática
a las 23:00 hora Chile (solo producción), con backfill único del histórico
congelado y ventana viva (mes abierto + anterior) para lo que todavía
puede cambiar — ver detalle completo en la nota de cambio v1.31 y en §13
(modelo de datos) y §14 (integraciones externas, conexión a Softland).
Área comercial resuelta por el mapa oficial de HT-IN-01 §4.6. Dashboard:
agrega tarjetas de Notas de Venta y Facturas del mes en curso, además de
Cotizado/Cerrado ganado del CRM.

**Conversaciones de WhatsApp y Embudo comercial (v1.32):** una
"conversación" es un contacto distinto con al menos un mensaje en el
período (mismo criterio que `whatsapp_conversaciones`, por contacto y no
por lead), atribuida al vendedor del lead más reciente de ese contacto —
sin monto asociado, es actividad, no venta. Sin atribución entre
períodos: cada mes se mide solo, un cliente que recontacta y compra meses
después cuenta como negocio nuevo en el mes en que ocurre. Dashboard:
tarjeta "Conversaciones WhatsApp del mes". Reportería: columna/barra de
Conversaciones en "Por vendedor" y "Por área", y nueva pestaña
**"Embudo"** con dos gráficos (Conversaciones→Cotizaciones→Notas de
venta→Facturas en cantidad, 4 etapas; Cotizado→Notas de venta→Facturado
en monto, 3 etapas — conversaciones no tienen monto) y el % de conversión
entre cada etapa, filtrable por año/mes/vendedor/área como el resto de la
pantalla. Sin endpoint ni tabla nueva: se suma a la consulta ya existente
de `GET /api/softland/reporte`. Ver detalle en la nota de cambio v1.32.

**Sugerencias de facturación (v1.33):** al sincronizar con Softland, cruza
facturas sin resolver contra negocios del pipeline por **RUT de empresa +
monto exacto** (no por nombre de cliente, texto libre sin garantía de
coincidir con la razón social del CRM) — acotado a pipelines que tengan
una etapa "Facturado" configurada. **Nunca mueve un negocio solo:** con
datos reales se comprobó que cliente+monto no es una clave única (un
mismo cliente de mantención recurrente puede repetir el mismo monto en
decenas de negocios distintos — sitios/tareas diferentes) — el sistema
lista los candidatos y una persona confirma cuál corresponde, o descarta
si ninguno aplica. Aparece en dos lugares: como aviso directo en la
tarjeta del negocio candidato en el Pipeline, y en una pestaña propia
("Sugerencias de facturación") dentro de Reportería Softland con la vista
completa. Confirmar reusa exactamente la misma lógica que mover la
tarjeta a mano (historial de etapas, secuencias, encuesta de
satisfacción). Pendiente de explorar más adelante: capturar en Softland
un identificador de sitio/tarea (campo `NumOC`, ya sincronizado para NV
pendientes pero no para facturas) para que el cruce deje de depender de
elegir entre varios candidatos idénticos. Ver detalle completo en la nota
de cambio v1.33.

- **Pestaña "WhatsApp" en Reportes — tiempo de respuesta (23-09-2026):** pedido
  de Luis Devoto; junto a Comercial, Pipeline y OT's. Mide cuánto tarda alguien
  del equipo en responder a un cliente por WhatsApp.
  - **Qué es un tramo:** el cliente escribió (una o varias veces seguidas) y
    después hubo un mensaje saliente. El tramo cuenta desde el **primer**
    mensaje sin responder de la racha, no desde el último ni como promedio. Se
    guarda en horario hábil (con los feriados y horarios especiales de Config →
    Bot de WhatsApp, §11) y también en minutos corridos. Se atribuye al
    vendedor del lead más reciente del contacto.
  - **Hora real de Meta:** cada mensaje guarda ahora `wa_timestamp`, la hora
    que informa Meta; si falta, se usa la hora de registro. Antes solo se
    aproximaba con el mensaje más reciente de toda la Bandeja. Existe desde el
    23-09-2026: los mensajes anteriores no la tienen.
  - **Cálculo:** un job nocturno lo calcula una vez por día entre las 23:45 y
    las 23:59 hora de Chile (referido como "~23:50"; corre en producción y en
    `staging`, cada uno sobre sus mensajes) y lo guarda en
    `whatsapp_tiempos_respuesta`; el reporte no recalcula al vuelo. Sin
    historial anterior al 23-09-2026: solo hacia adelante. El botón
    **Actualizar** (`POST /api/reportes/whatsapp/actualizar-ahora`; administrador,
    jefe comercial y gerencia) corre el cálculo al momento.
  - **Pantalla "Tiempo de respuesta WhatsApp":** filtro por mes (y por vendedor
    para los roles que ven todo); tarjetas Abiertas ahora, Promedio del mes,
    Mediana del mes y Peor caso del mes; gráfico del promedio por mes; tabla por
    vendedor (conversaciones respondidas, promedio, mediana, peor caso); y la
    lista **Conversaciones abiertas ahora**, calculada en vivo (cliente sin
    respuesta y conversación no cerrada a mano) con link directo a la Bandeja en
    una pestaña nueva.
  - **API:** `GET /api/reportes/whatsapp/resumen-mensual`, `/por-vendedor` y
    `/abiertas-ahora`; para Cowork, como reportes `whatsapp_resumen_mensual`,
    `whatsapp_por_vendedor` y `whatsapp_abiertas_ahora` en
    `GET /api/v1/reportes/{tipo}` (§18).
- **Pestaña "OT's" en Reportes (v1.40):** junto a Comercial, Pipeline y
  WhatsApp. Filtros por fechas, técnico, tipo de trabajo y vendedor. Tarjetas
  (ejecutadas, programadas, pendientes hoy con las atrasadas, cumplimiento de
  la fecha programada), OT por mes en cantidad y en valor, tabla por técnico y
  por tipo de trabajo (con brecha promedio y % a tiempo), pendientes de
  ejecución, detalle OT por OT y exportación CSV. Definiciones: **valor de
  venta** = neto de la cotización más reciente del negocio (o `monto_estimado`
  si no tiene cotización); **ejecutada** = tiene fecha de ejecución;
  **programada** = tiene fecha programada; **brecha** = fecha de ejecución −
  fecha programada (positiva = tarde; "a tiempo" = 0 o menos); **horas-hombre**
  de las ejecutadas = horas ejecutadas × técnicos (las OT anteriores que no las
  tienen se estiman con las programadas y el detalle lo marca); por técnico,
  cada uno suma las horas completas de la OT y el valor de venta se reparte en
  partes iguales. Disponible también para Cowork como reportes `ots_kpis`,
  `ots_resumen_mensual`, `ots_por_tipo`, `ots_por_tecnico`, `ots_pendientes` y
  `ots_detalle` (§18).

## 10. Encuesta post-cierre

- Al mover un negocio a etapa "ganada" se crea automáticamente una encuesta
  con link público. Formato: NPS (0 a 10) + comentario libre opcional,
  pregunta editable por administrador/jefe comercial.
- Como el envío automático de correo depende de una integración pendiente,
  se genera una tarea para que el vendedor comparta el link.
- Recordatorio único a los 5 días si no ha respondido (configurable vía
  `ENCUESTA_DIAS_RECORDATORIO`).

## 11. WhatsApp

**Estado de habilitación con Meta — migración completada (06-09-2026):**
la cuenta que había quedado bloqueada (ver historia abajo) se resolvió
recreando el portafolio empresarial desde el perfil real del
administrador. **+56 9 8106 2974 es el número comercial real**, publicado
en el sitio web — antes atendido por un chatbot externo, ahora por el CRM
completo (bot de categorización, asignación de vendedor, Bandeja). El
número que usaba el CRM hasta la migración (**+56 9 8109 8161**, con
historial real de clientes) pasó a ser el número de **pruebas**: se
reenvía a `staging` vía `WHATSAPP_REENVIO_PHONE_NUMBER_ID`/
`WHATSAPP_REENVIO_URL` (intercepta antes de resolver la cuenta, reenvía
el cuerpo y la firma del webhook tal cual, sin procesar ni guardar nada
localmente — pensado para probar sin ensuciar la base de datos real).
Ambos números viven bajo la misma app de Meta ("Hidrotecnica") — mismo
token y secreto de app sirven para los dos. Probado en ambos sentidos
desde un celular real, sin cruce entre ambientes. Nota interna: el objeto
`VENTAS` de `backend/config/whatsappCuentas.js` mantiene ese nombre por
herencia del código aunque ahora corresponde al 8106-2974, no al
8109-8161 — es solo una etiqueta de log, no afecta nada funcional.

**Reenvío entre entornos — cambio de seguridad (23-09-2026, v1.36):** el
entorno que **recibe** un reenvío debe tener `WHATSAPP_REENVIO_ACEPTAR=true`
(solo `staging`); sin esa variable el webhook rechaza el encabezado de reenvío
y exige la firma de Meta como siempre. Antes, cualquier entorno con el mismo
`WHATSAPP_REENVIO_SECRETO` (hoy es el mismo valor en `staging` y producción)
podía saltarse la firma. Consecuencia: mientras la variable no esté definida
en `staging`, el reenvío de producción a `staging` no funciona; no consta en
las notas que ya se haya definido (pendiente de Luis, §16).

**Plantillas de mensaje aprobadas — confirmado contra el Administrador de
WhatsApp de Meta el 14-09-2026** (reemplaza el listado desactualizado de
versiones anteriores de este documento): `envio_cotizacion_v2`,
`retomar_conversacion`, `seguimiento_coti`, `vencimiento_cotizacion`,
`permiso_llamada` (categoría Utilidad) y `hello_world` (prueba estándar de
Meta) — las 6 activas, estado "calidad pendiente". **Bug corregido
(14-09-2026):** el motor de secuencias (§8) ofrecía como opción
`envio_cotizacion` (sin el sufijo `_v2`) apuntando literalmente a ese
nombre de plantilla — Meta lo rechazaba en silencio porque esa plantilla
ya no existe activa (reemplazada por `envio_cotizacion_v2`, la que sí usa
correctamente el botón individual "Enviar cotización" de una cotización,
ver §4), y además faltaba el parámetro `link` que la plantilla exige. La
opción de configuración sigue llamándose internamente `envio_cotizacion`
(no se migró el valor guardado en `secuencia_pasos.whatsapp_template` de
ninguna secuencia ya configurada), pero ahora llama a Meta con el nombre
de plantilla correcto y los 3 parámetros completos. `retomar_conversacion`
y `permiso_llamada` están aprobadas pero no están disponibles como opción
en ningún paso de secuencia ni botón del CRM todavía. Ver nota de cambio
v1.35 (bug original) y este mismo documento para la corrección.
**Corrección 01-10-2026:** en el código de producción `retomar_conversacion`
sí se usa: es la plantilla del botón "Reabrir con plantilla" de la Bandeja y de
"Enviar plantilla WhatsApp" desde la ficha del contacto (ver más abajo).
`permiso_llamada` sigue sin uso. (Las notas de CLAUDE.md llaman a esa acción
"plantilla de seguimiento"; el código usa `retomar_conversacion`.)

**Historia — cuenta bloqueada y su resolución (v1.31, 23-08-2026 al
06-09-2026):** la cuenta de WhatsApp Business quedó desactivada
permanentemente por Meta por la Política de Comercio, sin actividad real
de mensajería — causa más probable, el portafolio se administraba desde
un perfil personal de fantasía en vez del perfil real del administrador.
Se resolvió creando un portafolio empresarial nuevo desde el perfil real,
recreando ahí la app/WABA. **Aclaración para evitar repetir un desvío ya
identificado:** no hace falta "Tech Provider" ni Advanced Access/App
Review de `whatsapp_business_management`/`whatsapp_business_messaging` —
eso es solo para quien administra cuentas de **otras** empresas (modelo
BSP); Hidrotécnica administra directamente su propia única cuenta. Ver
detalle completo en la nota de cambio v1.31.

**Bot (categorización y recontacto):** integración con la Cloud API de
WhatsApp (Meta), en producción desde la migración de arriba.
- Horario de atención configurable (por defecto L–V 9:15–17:15, hora de
  Chile). Fuera de horario: mensaje automático + registro del lead, sin más
  acción del bot.
- En horario hábil: pregunta la categoría de la consulta (lista editable),
  usada por el mismo motor de asignación que el canal web.
- **Decisión explícita:** el bot no escala a un vendedor si el cliente no
  responde — reintenta con una secuencia de recontacto configurable (por
  defecto 1h/8h/24h). Si se agotan los intentos, el lead se cierra
  automáticamente con `causa_descarte = 'sin_respuesta_bot'`.
- Si no hay vendedor disponible, el lead queda "nuevo" con sugerencia (nunca
  "asignado" sin dueño), igual que el canal web.

**Bandeja WhatsApp** (pantalla real, ya no un placeholder):
- Historial completo (bot, cliente, vendedor), independiente del estado del
  lead. Filtros por vendedor, estado y conversación abierta/cerrada.
- Responder desde la plataforma, con selector simple de emojis. El nombre
  de quien envió cada mensaje se muestra **en negrita arriba del mensaje**
  (estilo de plataformas de mensajería con varios agentes).
- **Adjuntos y medios:** el vendedor adjunta archivos (hasta 16 MB); si el
  cliente manda foto/audio/video/documento, se descarga automáticamente y
  se ve inline en el hilo o se puede descargar.
- Cierre automático a las 24 h sin actividad (ventana de mensajería de
  Meta) o manual por un vendedor/admin; se reabre sola si el cliente vuelve
  a escribir.
- Acceso configurable: "cualquier vendedor ve y responde todo" (por
  defecto) o "solo el vendedor asignado al lead/negocio".
- Errores comunes de la Cloud API (token vencido, número no autorizado en
  modo de prueba, fuera de ventana de 24 h) se traducen a español.
- **Botón "Crear cotización"** directamente desde una conversación, abre en
  pestaña nueva (para que el vendedor pueda seguir revisando el chat);
  detecta si el contacto ya tiene negocio o crea uno nuevo.
- **Filtro "No leídos" acotado por rol (v1.32):** un vendedor siempre ve
  solo lo suyo al activarlo, sin importar cómo esté configurado el acceso
  general de la Bandeja ("cualquier vendedor ve todo" vs. "solo el
  asignado"); call center, jefe comercial, gerencia y administrador siguen
  viendo el total. Antes dependía del mismo toggle de acceso general, lo
  que hacía que un vendedor viera no leídos de conversaciones ajenas. Ver
  detalle en la nota de cambio v1.32.
- **Vendedor sincronizado entre contacto, chat y negocios (v1.37, 23-09-2026):**
  existían tres campos de vendedor independientes —`contactos.vendedor_id`
  ("Vendedor asignado" en la ficha), `leads.vendedor_id` ("Asignado a" en la
  Bandeja) y `negocios.vendedor_id` (dueño en el Pipeline)— y se desincronizaban:
  caso real de un contacto con vendedora en la ficha y chat "Sin asignar" en la
  Bandeja, que además no se podía corregir desde ahí. Ahora, al cambiar el
  vendedor desde la ficha del contacto o desde "Asignado a" en la Bandeja
  (`services/sincronizarVendedor.js`), se actualizan el lead más reciente del
  contacto (se crea uno si no hay ninguno, por ejemplo un contacto que nunca
  escribió por WhatsApp) y **todos los negocios abiertos** del contacto. **Los
  negocios cerrados (ganados o perdidos) nunca se tocan**, decisión de Luis
  Devoto: no reasignar retroactivamente algo ya definido. Otros cambios del
  mismo pedido: `POST /api/leads/{id}/asignar` ya no fuerza el estado a
  `asignado` si el lead está `convertido` o `descartado` (por eso reasignar en
  una conversación cerrada "no hacía nada visible"); nuevo
  `POST /api/leads/asignar-por-contacto/{contactoId}` para asignar cuando no hay
  lead al que apuntar (la Bandeja ahora usa siempre este); y
  `sugerirVendedor()` (`services/asignacion.js`) mira primero si el contacto ya
  tiene vendedor propio, antes de la regla de vendedor de cuenta por empresa:
  un cliente con contacto y vendedor asignados que vuelve a escribir se asigna
  a ese vendedor, sin pasar por categoría ni round-robin.
- **Plantilla de WhatsApp desde la ficha del contacto (23-09-2026):** la ficha
  del contacto ("Enviar plantilla WhatsApp") y el listado de Contactos (botón
  "WhatsApp") permiten reabrir contacto con la plantilla aprobada
  `retomar_conversacion` (`POST /api/whatsapp/conversaciones/{contactoId}/reabrir-plantilla`)
  sin necesitar un lead o conversación previa, por ejemplo para alguien que dejó
  su teléfono por correo. Disponible para el vendedor dueño del contacto, aunque
  aún no tenga lead. No reabre la ventana de 24 horas por sí sola: eso ocurre
  cuando el cliente responde.
- **Cerrar o marcar como atendida una conversación pasadas las 24 horas
  (septiembre de 2026):** la Bandeja lo permite aunque la ventana de Meta ya
  haya vencido (commit `136f5d7`, sin nota de cambio propia).

**Un lead por conversación (v1.39, 30-09-2026):** hasta esa fecha, por cada
mensaje de un cliente el bot creaba **otro lead** cuando el último lead del
contacto no tenía estado del bot (`bot_estado` vacío), que es como lo dejan la
rama de fuera de horario, la de categorización desactivada y las asignaciones
manuales. Datos de producción antes del arreglo (diagnóstico de solo lectura,
30-09-2026): 2.914 leads de WhatsApp para unos 450 a 600 contactos; 2.255 (77%)
creados a menos de 60 minutos de otro lead del mismo contacto, en 475 contactos;
2.484 leads "nuevo" sin vendedor; 88% de los leads sin estado del bot creados en
horario laboral (clasificación aproximada). La categorización del bot está
**desactivada** en producción (confirmado por Luis en Config → Bot de WhatsApp).
Cambio solo en `backend/routes/public.js`, sin migración de schema:
- Un **lead abierto** (`nuevo` o `asignado`) que el bot nunca manejó se
  **reutiliza**: fuera de horario, en horario con la categorización desactivada,
  o si ya tiene vendedor, el mensaje se registra en ese lead. Con la
  categorización activa en horario, el lead "nuevo" creado de noche se usa para
  iniciar la categorización.
- Si el último lead está **cerrado** (`convertido` o `descartado`), el cliente
  que vuelve abre un **lead nuevo** (decisión de Luis Devoto) y los mensajes
  siguientes reutilizan ese nuevo lead.
- **No cambia:** los leads ya derivados por el bot (`bot_estado = 'derivado'`),
  aunque estén cerrados; los leads que ya existían, incluidos los 2.484 sin
  asignar; el flujo del bot con categorización activa en horario; y las cuentas
  distintas de Ventas.
- **Efecto a vigilar:** el lead nuevo de un cliente que vuelve no hereda el
  vendedor del anterior; con la categorización desactivada queda en la cola de
  asignación y la Bandeja puede mostrar la conversación "sin asignar".
- **Cómo se probó:** servidor real, Postgres con el schema real y mensajes de
  WhatsApp firmados como los de Meta; 10 verificaciones sobre 9 escenarios (antes
  del cambio fallaban 6, después pasan las 10). No se probó contra datos reales
  de producción.
- **Para analizar:** desde el 30-09-2026 (21:12 hora de Chile, commit `f8ccfb7`)
  los leads nuevos equivalen a conversaciones; para fechas anteriores hay que
  contar **contactos**, no leads.

**Horario hábil: feriados y excepciones (15 al 16-09-2026):** además del
horario de atención semanal, Config → Bot de WhatsApp tiene la sección
**Excepciones de horario** (tabla `config_horario_excepciones`): fechas de tipo
`feriado` (no laborable) u `horario_especial` (laborable con otra hora de
inicio y fin, por ejemplo hasta las 13:00). No existe una fuente automática de
feriados de Chile (la API oficial del Estado dejó de existir, investigado
15-09-2026): se editan a mano y se precargaron los 15 feriados legales de 2026
(no incluye feriados regionales ni horarios especiales de la empresa). Las usan
todas las funciones que dependen del horario hábil: el bot, las secuencias con
"respetar horario", las alertas de respuesta y el reporte de tiempo de
respuesta (§9). Las horas se ingresan en formato 24 h.

**Alertas de respuesta de WhatsApp (15 al 16-09-2026):** cuando un cliente
escribe y nadie responde, el CRM avisa por correo y por Microsoft Teams,
escalando en cuatro niveles **acumulativos** (cada nivel nuevo incluye a los
destinatarios de los anteriores; diseño validado con Luis Devoto el
15-09-2026). Se configura en Config → Alertas de respuesta WhatsApp
(administrador y jefe comercial).
- **Niveles y umbrales:** 1 vendedor asignado, 2 + callcenter, 3 + jefe
  comercial, 4 + gerencia (los usuarios activos con ese rol). Los umbrales son
  minutos de **horario hábil acumulado** (se pausan fuera de horario y en
  feriados) y vienen por defecto en 15, 60, 120 y 240 minutos; cada umbral debe
  ser entero, mayor a 0 y mayor que el anterior. Hay un interruptor para activar
  o apagar toda la función.
- **Tres situaciones:** (1) cliente ya derivado a un vendedor cuyo último
  mensaje es del cliente y sin respuesta, escala desde el vendedor; el tiempo
  cuenta desde el primer mensaje sin responder de la racha (no se reinicia si
  el cliente insiste) y "Cerrar conversación" en la Bandeja apaga la alerta;
  (2) cliente categorizado por el bot pero sin vendedor (queda en la Cola de
  asignación): escala directo desde callcenter, contando desde `leads.derivado_en`;
  (3) lead que el bot cerró solo porque el cliente nunca respondió la
  categorización: aviso único a callcenter y jefe comercial, no es una escalada
  por tiempo.
- **Funcionamiento:** el chequeo corre cada 15 minutos en el servidor y no repite
  un nivel ya avisado para la misma racha (tabla `whatsapp_alertas_respuesta`).
  La pantalla muestra cuándo corrió por última vez el chequeo automático
  (`ultima_revision_automatica`).
- **Botones de diagnóstico:** "Probar ahora" corre la revisión fuera de su ciclo
  y devuelve el detalle por conversación evaluada (minutos hábiles, nivel y por
  qué avisó o no); "Probar conexión con Teams" envía un mensaje fijo al
  Workflow para revisar la URL y el formato, sin depender de un caso real.
- **Teams:** se envía por un Workflow de Teams ("Publicar en un canal cuando se
  reciba una solicitud webhook") con una Adaptive Card simple, vía la variable
  `TEAMS_WEBHOOK_URL`. Sin esa variable no falla: el sistema sigue funcionando
  solo por correo. Al 16-09-2026 faltaba cargarla en Railway producción.
- **Buscador de Config:** reconoce alias por palabra clave, no solo el título de
  cada ítem (por ejemplo, "feriados" lleva a Bot de WhatsApp y "escalamiento" a
  Alertas de respuesta).

**Almacenamiento de adjuntos (Cloudflare R2):** bucket privado
`crm-ht-adjuntos` (no público, distinto del bucket de catálogo de productos
del §2 y del de documentos de despacho del §6). Token de API con permiso
"Object Read & Write" acotado solo a ese bucket. El control de acceso a un
archivo lo hace el CRM (mismo criterio de acceso a la conversación); para
que Meta reciba un adjunto se usa una URL firmada de validez corta.

**Ley 21.719 — protección de datos personales (implementada y en
producción desde el 06-09-2026, validada con Gerencia en rol DPO — nunca
antes documentada en este consolidado):**

| Pieza | Cómo funciona |
|---|---|
| Aviso de privacidad | Se dispara en el primer mensaje entrante de un contacto, o si pasaron ≥12 meses (configurable) desde su último mensaje — mismo criterio para el número comercial y el de pruebas. |
| Detección de solicitud de eliminación | Comparación de texto contra una lista fija de frases — **no es NLP/IA**, es un filtro literal. Detectada, crea una solicitud pendiente (sin duplicar si ya hay una) y notifica por correo a gerencia/administrador. |
| Revisión humana | Pantalla `/config/privacidad` (solo administrador/gerencia) — lista de solicitudes con estado, para anonimizar o rechazar a mano. También admite carga manual (ej. una solicitud llegada por correo a info@hidrotecnica.cl, sin integración automática de correo entrante). |
| Anonimización | Borra nombre/apellido/teléfono/email/RUT/cargo del contacto y lo desactiva. **No toca mensajes ni notas de texto libre** — alcance acotado, validado con Gerencia. Envía confirmación por WhatsApp solo si está dentro de la ventana de 24 h de Meta; fuera de ventana, no se manda nada al cliente, solo queda registro interno (falta definir con Gerencia una plantilla aprobada para ese caso). |
| Purga automática | Diaria, 04:00 hora Chile, solo producción. Contactos activos, sin ningún lead convertido, sin mensajes ni actividad en los últimos 12 meses (configurable). Sin excepción por negocio abierto — decisión explícita, es un tema separado del cierre de negocios estancados. |
| Tablas | `config_privacidad`, `solicitudes_eliminacion_datos`, `privacidad_purga_ejecuciones`. |

Ver el commit de `staging` `af39e0d` para el detalle completo — no existe
todavía una nota de cambio dedicada para esta funcionalidad.

## 12. Diseño visual y responsive

Rediseño integral (julio 2026) hacia un estilo minimalista tipo SaaS moderno
(Linear/Notion/Stripe Dashboard): fondos blancos/gris muy claro, azul marino
solo en acentos puntuales, celeste como color de interacción principal.

- **Paleta:**
  - Azul marino `#112548`: énfasis alto — títulos, texto, logo, algún
    ícono/borde puntual. Ya no es fondo de bloques grandes (sidebar antes
    era navy sólido).
  - Celeste `#34B3DE`: color principal de interacción — botones primarios,
    badges, estado activo del menú, foco de campos, indicadores.
  - Gris: base del layout (fondos de página, bordes de tarjetas, texto
    secundario), sin cambios mayores porque el código ya seguía ese patrón.
  - El naranja de marca (`#E8833A`), acento anterior del CRM, se retiró del
    uso como acento.
- **Contraste (WCAG AA) verificado, no asumido:** blanco sobre celeste da
  2.4:1 (no pasa el mínimo 4.5:1); navy sobre celeste da 6.3:1 (sí pasa). Por
  eso los botones primarios (celeste) usan **texto navy**, no blanco.
- **Sidebar:** blanco con borde gris, ítem activo con fondo celeste suave +
  borde izquierdo celeste, ícono de línea por cada opción del menú
  (incluidos Postventa y Despacho). Logo único.
- **Responsive (mobile, sin app nativa):** sidebar colapsa a menú
  hamburguesa + panel deslizante con superposición; encabezados de pantalla
  se apilan en vez de superponerse; tablas de listado scrollean
  horizontalmente en vez de comprimir columnas; grupos de botones y barras
  de búsqueda/filtro envuelven en vez de salirse de la pantalla; el
  Pipeline suma el selector "Mover a etapa"/"Mover a otro pipeline" por
  tarjeta (§3) porque arrastrar con el dedo entre columnas angostas no es
  viable — el drag-and-drop de escritorio no cambió.
- **Ambientes (staging/producción):** desde julio 2026, todo desarrollo
  nuevo pasa primero por un ambiente de staging visualmente distinguible
  (aviso "Ambiente de pruebas"), antes de producción — estándar de la
  empresa, documentado en HT-PL-05.
- **Punto de atención de marca — resuelto:** el acento celeste `#34B3DE`
  queda compartido entre Control EPP y el CRM Comercial; la diferenciación
  visual entre ambas apps se logra por balance de color (más blanco/gris en
  el CRM), no por un acento exclusivo. Aprobado por Gerencia el 25-07-2026
  (ver `docs/marca-acentos-por-app.md` v2.0 y HT-PL-05 v02).
- **Versión desplegada visible (v1.19):** el pie del menú lateral muestra el
  commit corto de la versión en producción/staging (con la fecha de build en
  el tooltip) — para confirmar de un vistazo si un ambiente ya tiene la
  última versión desplegada, sin depender de mirar el repositorio.

## 13. Modelo de datos — tablas y campos agregados desde el documento base original

- **Usuarios/roles:** `users.rol` admite `jefe_comercial`, desde v1.22
  `tecnico` (§1/§15) y desde v1.28 `integrador` (actor "Cowork" de la API,
  §18). `users.pipeline_default_id` (pipeline por defecto, v1.12).
  `users.es_encargado_postventa` (v1.13), `users.es_encargado_despacho`
  (v1.14), `users.es_encargado_cobranza` (v1.35, ver §19) — atribuciones
  adicionales, independientes del rol. `users.telefono` (v1.28 — teléfono
  directo; ya no se usa para armar una firma automática del correo de
  seguimiento, ver v1.35 en §8 — el vendedor la escribe si quiere vía
  `{{telefono_vendedor}}`).
- **Contactos:** `vendedor_id`, `vendedor_asignado_en`. `origen` admite
  `api` desde v1.28 (contactos creados por la integración, §18).
- **Negocios — origen externo (v1.28, ver §3/§18):** `origen` (enum
  crm/fracttal/correo/whatsapp/otro, default crm), `referencia_externa`
  (clave de idempotencia, índice único parcial junto a `origen`),
  `urgencia` (boolean).
- **Productos:** `marca`, `url_imagen`, `atributos` (JSONB),
  `descripcion_completa`.
- **Pipeline:** tabla `pipelines` (id, nombre, orden, activo — v1.12);
  `pipeline_etapas.pipeline_id`, `negocios.pipeline_id` (v1.12, ahora
  elegible al crear el negocio, ver §3);
  `negocios.etapa_id` (FK) + `negocios.probabilidad_cierre`;
  `pipeline_etapas.secuencia_id` (FK a `secuencias`, v1.19 — dispara la
  secuencia asociada al mover un negocio a esa etapa, ver §8);
  `negocios.n_oc` (v1.21 — N° de orden de compra, ver §3);
  `negocios.fecha_compromiso` (v1.22 — fecha pactada con el cliente, con
  alerta de SLA, ver §3).
- **Arranque de Trabajos (v1.34-v1.35, ver §3):** `negocios.tipo_trabajo`
  (CHECK con 5 valores); tablas `ordenes_trabajo` (1:1 con el negocio,
  `OT-{negocio_id}`), `ot_items` (`producto_id` opcional, `codigo` solo
  usado si no hay producto asociado, `descripcion`, `cantidad` — sin
  precio), `ot_plantilla_items` (plantilla configurable por tipo de
  trabajo, misma estructura que `ot_items`).
- **Programación y ejecución de la OT (v1.40, ver §3):** `ordenes_trabajo`
  suma `horas_programadas`, `horas_ejecutadas`, `fecha_programada`,
  `fecha_ejecucion`, `id_fracttal` y `exige_programacion` (false para las OT
  anteriores a la migración `ot_programacion_v1.40`); tabla `ot_tecnicos`
  (`ot_id`, `user_id`) con los técnicos de cada OT.
- **Formas de pago (v1.22, ver §4):** tabla `formas_pago` (`nombre`,
  `incluir_datos_bancarios`, `activo`); `cotizaciones.forma_pago_id` (FK).
- **Cotizaciones:** `iva_pct`; tabla `config_empresa` (emisor/banco);
  `cotizacion_correlativo_global` (correlativo NNNNNN, reemplaza el
  correlativo por año); `cotizacion_items` agrega `mostrar_imagen`,
  `mostrar_descripcion`, `mostrar_ficha`, `factor` (v1.18, uso exclusivo de
  Operaciones, ver §7).
- **Cotizador Operaciones (v1.17-v1.18, ver §7):** `cotizaciones` agrega
  `origen` (enum venta_directa/operaciones), `fracttal_numero`,
  `fracttal_fecha_solicitud`, `fracttal_solicitante`, `hallazgo`,
  `justificacion_tecnica`, `modalidad_precio` (enum desglosado/alzada),
  `comuna_id` (FK), `horas_normales`, `horas_extra`, `tipo_plantilla` (enum
  ninguna/simple_suministro/estandar_suministro_montaje/
  llave_en_mano_regulado/lavado_sanitizacion), `objeto_propuesta`,
  `alcances_texto`, `exclusiones_texto`, `condiciones_ejecucion_texto`,
  `otras_consideraciones_texto`, `documento_final_url`,
  `documento_final_subido_en`; tablas nuevas `cotizacion_consideraciones`
  (cotizacion_id, tag, texto, orden), `comunas_operaciones` (nombre, km,
  horas_transito, costo_traslado_uf, activo), `config_operaciones_mo` (fila
  única — hh_uf, hm_uf, markup, elem_mat_pct, elem_furg_uf),
  `cotizacion_sinonimos_operaciones` (termino_fracttal, termino_bbdd,
  activo). `productos` no cambia de esquema — el matching de Operaciones
  consulta esa misma tabla.
- **Postventa (v1.13, v1.21):** tabla `postventa_etapas` (nombre, orden,
  tipo abierta/resuelto/rechazado, activo); tabla `casos_postventa`
  (`negocio_id` **opcional desde v1.21** — antes obligatorio, `contacto_id`
  obligatorio, `empresa_id`, `producto_id` y `detalle_equipo` opcionales,
  `prioridad`, `fecha_limite_respuesta`, `tecnico_asignado_id`,
  `creado_por_id`, `etapa_id`, `fecha_cierre`); tabla `postventa_adjuntos`
  (v1.21 — `caso_id`, `tipo` foto_cliente/video_cliente/informe_tecnico/
  otro, `descripcion`, `archivo_key`, `archivo_nombre`, `archivo_mime`,
  `subido_por_id`, `created_at`).
- **Servicio Técnico (v1.22, ver §15):** calcado de Postventa — tabla
  `servicio_tecnico_etapas` (mismas columnas que `postventa_etapas`); tabla
  `casos_servicio_tecnico` (mismas columnas que `casos_postventa`, pero con
  `fecha_compromiso` en vez de `fecha_limite_respuesta` — mismo nombre que
  usa el Pipeline, ver §3 — y sin distinción de "vendedor dueño" del caso);
  tabla `servicio_tecnico_adjuntos` (mismas columnas que
  `postventa_adjuntos`).
- **Despacho (v1.14, v1.23):** tabla `despachos` (`negocio_id` y
  `caso_postventa_id` opcionales, `titulo`, `estado` con enum fijo
  programado/en_ruta/completado/cancelado, `creado_por_id`); tabla
  `despacho_puntos` (`despacho_id`, `orden`, `tipo` retiro/entrega,
  `direccion`, `comuna`, `fecha`, `contacto_nombre`, `contacto_telefono`,
  `documento_tipo`, `documento_numero`, `duracion_estimada_min`,
  `completado`, `completado_en`, `foto_respaldo_key` — esta última columna
  sigue existiendo pero **sin uso** desde v1.23, reemplazada por la tabla de
  abajo); tabla `despacho_adjuntos` (v1.23 — `punto_id`, `archivo_key`,
  `archivo_nombre`, `archivo_mime`, `subido_por_id`, `created_at`, mismo
  patrón que `postventa_adjuntos`/`servicio_tecnico_adjuntos`; sembrada al
  arrancar con lo que ya hubiera en `foto_respaldo_key`); tabla
  `despacho_lugares_frecuentes` (`nombre`, `direccion`, `comuna`,
  `contacto_nombre`, `contacto_telefono`, `activo`).
- **Leads/bot WhatsApp:** `leads.causa_descarte`, `bot_estado`,
  `bot_paso_recontacto`, `bot_proxima_accion`; tablas
  `config_horario_atencion`, `whatsapp_bot_config`,
  `whatsapp_recontacto_pasos`, `whatsapp_mensajes` (con `tipo`,
  `archivo_key`, `archivo_nombre`, `archivo_mime`), `whatsapp_conversaciones`.
- **Secuencias:** tablas `secuencias`, `secuencia_pasos`,
  `negocio_secuencias`, `secuencia_ejecuciones`; campo `respetar_horario`.
  El campo `secuencias.es_default_post_cotizacion` **se eliminó en v1.19**
  (reemplazado por `pipeline_etapas.secuencia_id`, ver arriba y §8) — al
  arrancar, el sistema migró automáticamente cualquier secuencia que
  estuviera marcada así hacia las etapas "Cotizado" de tipo abierta que aún
  no tuvieran secuencia asignada.
- **Notas/tareas/timeline:** tablas `notas`, `tareas`,
  `negocio_etapa_historial`.
- **Encuestas:** tablas `encuestas`, `encuesta_respuestas`;
  `encuesta_config`.
- **Acceso BI:** rol de PostgreSQL `bi_readonly` (a nivel de base de datos,
  fuera del modelo de aplicación).
- **Reportería Comercial + Softland (v1.31, ver §9/§14):** `users.area`
  (CHECK, 4 valores: meson/operaciones/vregion/otros — usado solo como
  último recurso, ver §14); tabla `reporte_softland_mensual` (agregado
  mensual por vencod: cotizado/cerrado/facturado, monto y cantidad);
  tabla `reporte_softland_nv_pendientes` (NV del año en curso pendientes
  de facturar, una fila por NV); tabla `reporte_softland_sync` (registro
  de cada corrida de la sincronización, exitosa o fallida); tablas
  `reporte_softland_cotizaciones`, `reporte_softland_notas_venta`,
  `reporte_softland_facturas` (detalle documento por documento, con
  índice por año/mes para el filtrado del listado); tabla
  `reporte_softland_backfill` (marca qué dataset ya tuvo su carga
  histórica única — ver §14). `reporte_softland_facturas` agrega
  `negocio_id`, `revisado_por_id`, `revisado_en` (v1.33 — Sugerencias de
  facturación, ver §9; `negocio_id` solo se llena al confirmar una
  sugerencia, nunca automático).
- **Ley 21.719 (v1.35, ver §11):** tablas `config_privacidad`,
  `solicitudes_eliminacion_datos`, `privacidad_purga_ejecuciones`.
- **Postventa — folio, cierre y referencia (15 al 16-09-2026, ver §5):**
  `casos_postventa` suma `folio` (texto único, `PV-000001`), `comentario_cierre`
  y `referencia_cotizacion_venta`; tabla `postventa_correlativo_global` (fila
  única con el último número usado).
- **Alertas de respuesta y horario hábil (15 al 16-09-2026, ver §11):** tabla
  `config_alertas_respuesta` (fila única: `activo`, `minutos_vendedor`,
  `minutos_callcenter`, `minutos_jefe_comercial`, `minutos_gerencia`,
  `ultima_revision_automatica`); tabla `whatsapp_alertas_respuesta` (por
  contacto: `pendiente_desde`, `nivel_alertado`, evita repetir un nivel ya
  avisado); `leads.derivado_en` (desde cuándo un lead quedó derivado por el
  bot; los leads derivados antes de la columna no la tienen); tabla
  `config_horario_excepciones` (`fecha`, `tipo` feriado/horario_especial,
  `nombre`, `hora_inicio`, `hora_fin`).
- **Tiempo de respuesta de WhatsApp (23-09-2026, ver §9):**
  `whatsapp_mensajes.wa_timestamp` (hora real de Meta; vacía en los mensajes
  anteriores al 23-09-2026); tabla `whatsapp_tiempos_respuesta` (un tramo
  resuelto por fila: `contacto_id`, `vendedor_id`, `respondido_por_id`,
  `pendiente_desde`, `respondido_en`, `minutos_habiles`, `minutos_corridos`;
  único por contacto y `pendiente_desde`); tabla
  `whatsapp_tiempos_respuesta_ejecuciones` (una fila por día del job nocturno,
  con `ok`, `tramos_nuevos` y `error`).
- **Sin cambios de schema en v1.36 a v1.39:** la sincronización de vendedor
  (v1.37), la API de lectura (v1.38) y el lead por conversación (v1.39) no
  agregan tablas ni columnas. En v1.36 cambió el contenido de
  `users.reset_token`, que ahora guarda el hash del token, y los permisos del
  rol `bi_readonly` sobre `users` (§1, §9).
- **Cobranza (v1.35, en construcción — detalle completo en §19):**
  `users.es_encargado_cobranza`; tablas de configuración
  (`cobranza_config`, cuentas contables, `cuentas_bancarias`), de
  contactos de cobranza (`cobranza_contactos`,
  `cobranza_contacto_empresa`), de documentos y conciliación
  (sincronizados desde Softland, más cartolas bancarias y de Transbank
  importadas), `cobranza_cuentas_cliente` (`saldo_app` calculado al
  vuelo, nunca sincronizado), y el esqueleto sin implementar
  `cobranza_secuencias`/`cobranza_secuencia_pasos`.

## 14. Integraciones externas

- **Brevo (SMTP):** correos transaccionales y envío de cotizaciones.
  Remitente genérico con "Responder a" = vendedor.
- **WhatsApp Cloud API (Meta):** bot, Bandeja, envío de cotizaciones y
  adjuntos — **en producción desde el 06-09-2026** con el número
  comercial real (+56 9 8106 2974), tras resolver el bloqueo de cuenta de
  agosto (ver §11 para el detalle completo, incluida la migración y la
  Ley 21.719).
- **Softland (SQL Server, solo lectura — v1.31):** réplica de Softland vía
  `mssql`, variables `SOFTLAND_DB_SERVER/NAME/USER/PASS` (+ opcional
  `SOFTLAND_DB_TRUST_CERT`) cargadas en `staging` y `main`. Alimenta la
  Reportería Comercial + Softland (§9): agregado mensual y detalle
  documento por documento de cotizaciones/NV/facturas. Arquitectura de
  sincronización con **backfill único + ventana viva** (mes abierto + el
  anterior) — el histórico más viejo se consulta a Softland una sola vez
  (tabla `reporte_softland_backfill`), no todas las noches; ver §13 y la
  nota de cambio v1.31 para el detalle completo. Consultas SQL y mapa de
  vendedor/código → área documentados en HT-IN-01 §4.1/§4.6 (skill de
  dashboards Softland).
- **Google Maps Platform (v1.16):** Directions API + Geocoding API, para
  optimización de ruta de Despacho (§6). Uso exclusivamente server-side —
  la key nunca se expone al navegador, restringida en Google Cloud Console
  a esas dos APIs. Pendiente cargar `GOOGLE_MAPS_API_KEY` en Railway.
- **Cloudflare R2:** tres buckets — `crm-ht-adjuntos` (privado, WhatsApp),
  `crm-ht-productos` (público, catálogo de imágenes/fichas) y el bucket
  privado de Despacho (`R2_DESPACHO_*`, configurado desde v1.21 en
  `staging` y producción) para documentos de respaldo de Despacho (§6),
  desde v1.21 también los adjuntos de Postventa (§5) y desde v1.22 también
  los de Servicio Técnico (§15) — los tres módulos reutilizan el mismo
  bucket, no hay uno por módulo.
- **PostgreSQL (`bi_readonly`):** acceso de solo lectura para herramientas
  de BI externas.
- **API `/api/v1` para Cowork (v1.28):** ver detalle completo en §18.
- **Microsoft Teams (alertas de respuesta de WhatsApp, 16-09-2026):** aviso a un
  canal de Teams mediante un Workflow ("Publicar en un canal cuando se reciba
  una solicitud webhook"), que reemplaza a los "Incoming Webhooks" clásicos
  retirados por Microsoft. El CRM solo hace un POST a la URL del Workflow
  (variable `TEAMS_WEBHOOK_URL`); no usa registro de aplicación en Azure AD. Sin
  la variable, no falla ni envía nada. Ver §11.
- **Conector MCP de Cowork (30-09-2026):** servicio aparte del CRM (repositorio
  `ldevoto-sys/crm-mcp-hidrotecnica`, Railway, proyecto CRM-MCP) que entrega al
  agente Cowork herramientas de consulta y escritura sobre el CRM (§18). Tiene dos
  ambientes con despliegue automático al hacer push: Production (servicio
  `adequate-grace`) y Staging (`crm-mcp-hidrotecnica`). Son 14 herramientas: 10
  de consulta, marcadas `readOnlyHint`, y 4 que escriben, **sin** esa marca a
  propósito (no se debe aflojar su aprobación). Desde el 30-09-2026 ambos
  ambientes despliegan desde la rama provisional `claude/fervent-carson-dgwu65`
  (commit `1e38354`, confirmado en Railway), porque `main` del repo solo tiene 7
  herramientas. Verificado por Luis en producción con datos reales: 3 de las 4
  herramientas nuevas; `crm_softland_documentos` devolvió 0 filas para
  agosto-septiembre, lo esperado, y falta probarla con un rango que tenga datos.
  Pendientes en §16.
- **Microsoft 365 / SMTP AUTH (en evaluación, no confirmado):** soporte
  activó SMTP AUTH sobre la cuenta `ventas@hidrotecnica.cl`
  (`smtp.office365.com:587`, STARTTLS) como posible alternativa a Brevo para
  que el correo salga desde un dominio propio. El código ya soporta
  cualquier SMTP vía variables de entorno sin cambios; **falta hacer la
  prueba real** actualizando las variables en Railway (no se pudo probar
  desde este entorno de desarrollo, que no tiene salida SMTP a hosts
  externos) y revisar si la cuenta requiere App Password por MFA.

## 15. Servicio Técnico de bombas (v1.22, v1.23)

- **Qué es:** un tablero Kanban para casos de servicio técnico (revisiones,
  reparaciones, mantenciones de bombas), construido **calcado de Postventa**
  (§5) — mismo patrón de tablero por etapas y de adjuntos — pero con una
  diferencia central: **no existe el concepto de "vendedor dueño del
  caso"**. Postventa nace siempre atado (con o sin negocio) a la lógica de
  ventas, donde un vendedor solo gestiona lo que él creó salvo que sea
  encargado; Servicio Técnico no tiene ese eje — cualquier usuario con
  acceso al módulo ve y gestiona **cualquier** caso por igual.
- Un caso se vincula, igual que en Postventa, a un **negocio de origen**
  (opcional) o a un **contacto directo** vía "¿Sin venta asociada?".
- Etapas: dos terminales protegidas (**Resuelto**, **Rechazado**) y las
  intermedias que defina administrador/jefe comercial (Configuración →
  Config Servicio Técnico) — única función de este módulo restringida a
  esos dos roles; todo lo demás (crear/mover/asignar casos) es parejo para
  cualquiera con acceso.
- Campos del caso: título, descripción, equipo/bomba reclamada (opcional,
  buscable en el catálogo de Productos), detalle del equipo, prioridad
  (baja/media/alta/urgente), **fecha de compromiso** (opcional — mismo
  nombre de campo y misma alerta de SLA que usa el Pipeline, §3, vía el
  helper compartido `utils/sla.js`) y técnico asignado.
- **Adjuntos:** mismo mecanismo que Postventa — foto cliente/video
  cliente/informe técnico/otro, con descripción, quién lo subió y cuándo,
  reutilizando el bucket privado de Cloudflare R2 de Despacho (§6/§14). Se
  pueden subir **directo al crear el caso** (§5) — no solo después, abriendo
  el caso ya creado. **Selección múltiple (v1.23):** el panel para agregar
  un adjunto a un caso ya creado admite elegir varios archivos de una vez.
  Puede eliminar un adjunto quien lo subió, o administrador/jefe comercial.
- **Rol dedicado `tecnico` (§1):** pensado para personal de terreno que solo
  necesita este módulo — no ve ninguna otra pantalla del CRM, ni siquiera
  Dashboard. Se creó en vez de reutilizar el mecanismo de atribución
  adicional (`es_encargado_postventa`/`es_encargado_despacho`, §1) porque
  ese mecanismo **suma** un módulo a un rol existente; aquí el pedido era
  al revés — un usuario que **solo** tenga esto, sin el resto del CRM que
  trae cualquiera de los cinco roles preexistentes.
- **Los cinco roles preexistentes suman este módulo** a lo que ya veían —
  administrador, jefe comercial, vendedor, call center y gerencia lo ven
  igual entre sí (sin distinción de permisos dentro del módulo), además de
  todo lo que ya tenían.

## 16. Pendientes abiertos (consolidado de todas las notas)

El sistema salió a producción el **01-08-2026** (v1.19) — ninguno de estos
puntos fue impedimento, lo construido ya mejora lo que existía antes. Quedan
como backlog post-lanzamiento, en el siguiente orden de prioridad
(acordado con Gerencia el 27-07-2026):

1. ~~**Optimización de ruta de Despacho** (§6)~~ — **hecho (v1.16,
   27-07-2026):** botón "Optimizar ruta" que sugiere el orden más eficiente
   para visitar las paradas pendientes de un mismo día (ida y vuelta desde
   la dirección de la empresa), con Google Directions/Geocoding API. El
   encargado revisa la sugerencia y decide aplicarla o no. Falta cargar
   `GOOGLE_MAPS_API_KEY` en Railway.
2. ~~**Bucket de Cloudflare R2 para documentos de despacho** (§6, §14)~~ —
   **hecho (v1.21, 05-08-2026):** bucket privado creado y
   `R2_DESPACHO_ACCESS_KEY_ID`/`R2_DESPACHO_SECRET_ACCESS_KEY`/
   `R2_DESPACHO_BUCKET_NAME` cargados en Railway, en `staging` y
   producción. Los adjuntos de Postventa (§5) reutilizan el mismo bucket.
3. ~~**Publicar la app de Meta** y migrar al número de producción~~ —
   **hecho (06-09-2026):** número comercial real +56 9 8106 2974 operando
   en producción, app publicada, verificación de negocio completa. Ver §11.
4. **Bot con IA fuera de horario**: hoy, fuera de horario, el bot solo
   envía un mensaje automático y registra el lead (§11). La idea es que
   pueda asesorar al cliente, ayudarlo a elegir una bomba y guiarlo hasta
   la ficha de compra. Por definir con Gerencia: hasta dónde responde solo
   (¿solo recomendación de producto, o también precio/disponibilidad?) y
   cuándo escala a un vendedor.
5. ~~**Plantillas de mensaje aprobadas por Meta**~~ — **hecho:** 6
   plantillas activas hoy (`envio_cotizacion_v2`, `retomar_conversacion`,
   `seguimiento_coti`, `vencimiento_cotizacion`, `permiso_llamada`,
   `hello_world`, ver §11). ~~Bug detectado y corregido el 14-09-2026:~~ el
   motor de secuencias (§8) ofrecía la plantilla vieja `envio_cotizacion`
   (sin `_v2`) y fallaba en silencio — corregido, ver §11. `permiso_llamada`
   sigue aprobada sin uso en el CRM; `retomar_conversacion` sí se usa desde el
   botón "Reabrir con plantilla" de la Bandeja y desde la ficha del contacto
   (corrección 01-10-2026, §11).
6. **Correo del vendedor como remitente real** de las cotizaciones: en
   evaluación entre autenticar el dominio en Brevo, envío nativo vía
   Microsoft Graph, o el SMTP directo de Microsoft 365 recién habilitado
   por soporte (§14) — falta la prueba real.
7. **Canal de correo como fuente de leads** (paralelo al canal web),
   requiere definir la integración con el proveedor de correo.
8. **Envío de correos masivos** a clientes: requiere separar el envío de
   marketing masivo de la cuenta Brevo transaccional actual (cotizaciones),
   para no arriesgar su entregabilidad, y definir manejo de listas/opt-out.
9. **API de integración Cowork (§18) — bloqueante para usarla en
   producción:** falta cargar `COWORK_API_KEY` en Railway (producción). Sin
   esa variable, la API responde 503 a cualquier solicitud. Confirmar
   también que `APP_URL` de `staging` quedó apuntando a su propio dominio
   (durante las pruebas apuntaba al de producción, se corrigió a mano).
   **Actualización 01-10-2026:** la API y el conector MCP (§14, §18) ya se usan
   en producción: el 30-09-2026 Luis verificó con datos reales 3 de las 4
   herramientas nuevas. No consta en las notas si `COWORK_API_KEY` se cargó
   antes; los pendientes del conector están en la lista de abajo.

**Cotizador Operaciones (§7) — decisión pendiente de Gerencia:** ¿el
pipeline Operaciones reemplaza por completo la herramienta HTML standalone
`cotizador_hidrotecnica.html`, o convive en paralelo durante una transición
corta? Las demás preguntas abiertas de la nota v1.17 ya se resolvieron al
construir el módulo: los mantenedores los edita administrador y jefe
comercial (igual que Secuencias); un ítem sin match nunca da de alta un
producto nuevo directo desde la cotización, siempre pasa por el importador
de Productos (§2); y el valor UF ya se obtiene automático desde findic.cl
(`services/uf.js`), no es un pendiente.

Sin prioridad asignada (no comerciales / no bloquean nada):

- **Rotar el token de acceso de R2** usado en la carga masiva por `rclone`:
  las credenciales se compartieron en texto plano durante la configuración.
- ~~**Fijar `COTIZACION_CORRELATIVO_INICIAL`**~~ — **hecho (v1.19,
  01-08-2026):** correlativo fijado en 714838 directamente en la base de
  producción, ver §4.
- Hidroneumáticos y Filtros de piscina: la columna "Descripción" ya está en
  sus plantillas de importación (§2), pero el Excel real de esas dos
  categorías aún no la trae completa.
- **Pago por hitos (%) de la plantilla `HTCO03`** (§7): fuera de alcance de
  v1.18 — si se necesita, se agrega a mano en el Word ya descargado.
- **Cobranza — Fase 3, secuencias de recordatorio (§19):** las tablas
  existen (`cobranza_secuencias`/`cobranza_secuencia_pasos`) pero no hay
  ningún endpoint ni pantalla — es solo esquema de base de datos, sin
  funcionalidad construida todavía.
- **Sincronización de productos desde Softland (§2, v1.35):** construida y
  con upsert probado contra una base de prueba, pero **sin validar contra
  la réplica real de Softland en producción** — este entorno de
  desarrollo no tiene salida de red hacia ella.

**Pendientes vigentes al 01-10-2026 (de `CLAUDE.md`, secciones del 16-09 al
01-10-2026):**

- **Conector MCP (§14):** fusionar la rama de despliegue a `main` del repo del
  conector y apuntar ambos ambientes a `main`; hoy despliegan desde una rama con
  nombre provisional y cada push a esa rama redespliega el ambiente.
- **Costos:** el ambiente Staging del conector MCP tiene un servicio Postgres con
  volumen que el código del conector no usa. Por revisar.
- **Verificar la API de lectura (§18):** Softland con un rango que tenga datos
  (cotizaciones de julio; notas de venta y facturas de agosto-septiembre), y
  desde qué fecha hay datos en cotizaciones, mensajes y seguimientos (usar
  `limit=1` y leer `total`, sin leer datos de clientes).
- **Mensajes de WhatsApp en la API:** la primera página de agosto-septiembre
  partía el 31-08 y no aparecían los ids 1 a 7. El diagnóstico de solo lectura
  del 30-09-2026 muestra que esos 7 mensajes son del 26 y 27 de julio (contacto
  1, probablemente pruebas), que en agosto hay 26 mensajes (todos del 31-08) y
  10.881 en septiembre, consistente con la migración del número oficial del
  06-09. La hora real de Meta (`wa_timestamp`) existe solo desde el 23-09.
  Hay un contacto anonimizado, con 9 mensajes.
- **Softland:** la historia anterior a 2023-01-01 no está replicada; falta
  decidir si hace falta.
- **Fase 2 de la API, sin iniciar:** causa de pérdida "Otro" con comentario
  obligatorio, análisis de las pérdidas sin respuesta, y un endpoint para enviar
  informes por correo (destinatarios solo `@hidrotecnica.cl`, tope de envíos y
  registro de cada envío). Sin ese endpoint el agente no puede entregar
  informes periódicos por sí solo; los informes periódicos mismos están por
  definir.
- **Decisión pendiente (privacidad):** `GET /api/v1/whatsapp/conversaciones/{id}/mensajes`
  sigue devolviendo el hilo de un contacto anonimizado si se conoce su id (la
  anonimización no toca los mensajes: alcance acotado validado con Gerencia, ver
  `services/privacidad.js`). El listado masivo nuevo sí los excluye. Si eso
  cumple la Ley 21.719 para el hilo es una pregunta para Gerencia/DPO, no de
  código.
- **Dato técnico:** `initDb()` pasa a mayúsculas los nombres de contactos en cada
  arranque, así que un contacto anonimizado queda como `(ELIMINADO)`, no
  `(Eliminado)`. Cualquier filtro o consulta SQL debe comparar sin distinguir
  mayúsculas.
- **Seguridad (§1):** rotar `BI_READONLY_PASSWORD` (en Railway y en la skill de
  consultas SQL) y la clave del rol `reportes_solo_lectura`, que quedó escrita
  en una conversación con Claude el 30-09-2026; definir
  `WHATSAPP_REENVIO_ACEPTAR=true` en `staging`; decidir sobre las dependencias
  con `npm audit fix` disponible (backend: xmldom, ip-address,
  express/qs/body-parser; frontend: react-router); separar la API key de Cowork
  en lectura y escritura (hoy es una sola; requiere reconfigurar el conector
  MCP); y, cosmético, enmascarar teléfonos y correos en los logs.
- **Alertas de respuesta (§11):** falta cargar `TEAMS_WEBHOOK_URL` en Railway
  producción si se quiere el canal Teams (al 16-09-2026); sin ella funcionan
  solo por correo.
- **Leads de WhatsApp, verificar con tráfico real (v1.39):** comparar los leads
  creados desde el 30-09-2026 21:12 contra las conversaciones (debería haber uno
  por conversación) y revisar que la cola de asignación no crezca por
  duplicados.
- **Vínculo conversación a negocio:** exponer los negocios por contacto
  (`negocios.contacto_id`) en los endpoints de lectura de WhatsApp, porque el
  vínculo por lead está vacío: `leads.negocio_id` solo se llena con el botón
  manual "convertir lead". De 607 contactos con mensajes desde agosto, 0 tienen
  el negocio ligado por el lead y 248 (41%) lo tienen por `negocios.contacto_id`;
  eso mide contactos con algún negocio, no una tasa de conversión.
- **Conversaciones cerradas sin vendedor:** 212 de 558 (159 porque su último lead
  es uno "nuevo" sin asignar, 53 sin ningún lead). Las 53 sin lead no se han
  explicado.
- **Leads, ajustes opcionales (no pedidos):** que los leads ya derivados y
  cerrados también abran lead nuevo cuando el cliente vuelve; que el lead nuevo
  herede el vendedor del anterior; limpiar los leads duplicados que ya existen
  (2.484 sin asignar), siempre con respaldo previo.
- **Operaciones, al desplegar (§3):** los 31 negocios en Programado y 24 en
  Ejecutado que ya existían no tienen OT (al moverlos se piden los datos), y
  hacen falta usuarios con rol `tecnico` para asignar técnicos.

## 17. Proceso de despliegue a producción

> **Actualización 01-10-2026:** la regla vigente desde el **29-09-2026** (OK de
> Luis Devoto para cada promoción; confirmación adicional si cae en horario
> laboral) y el procedimiento de promoción parcial están al final de esta
> sección. Lo que sigue es el historial de las reglas anteriores.

**Regla vigente desde el 07-08-2026:** los cambios se promueven a `main`
(producción) **solo fuera del horario de trabajo de la empresa**, salvo
que se trate de un **error crítico** que no pueda esperar. `staging` no
tiene esta restricción — sigue disponible para pruebas en cualquier
momento.

**Origen:** ese mismo día se promovió a producción una tanda importante de
cambios (v1.24) durante horario de trabajo. En paralelo, un usuario
(Nicolás Quezada) reportó por correo haber sido desconectado de su sesión
dos veces mientras cotizaba, perdiendo el borrador de una cotización
extensa. Luis Devoto planteó como hipótesis que ambos hechos estén
relacionados. **No se investigó ni se confirmó una relación causal** entre
los despliegues y el corte de sesión — la regla se adopta de todas formas
como precaución, y queda registrada como instrucción permanente del
proyecto (`CLAUDE.md`, raíz del repositorio).

El reporte de sesión cortada / cotización en borrador no guardada queda
como un problema técnico aparte, sin diagnosticar — no se investigó su
causa real en esta nota.

**Modo más restrictivo, vigente desde el 10-08-2026:** instrucción
explícita de Luis Devoto, más estricta que la regla de horario de arriba —
solo se promueve a `main` si hay un **error** que corregir, nunca por una
mejora o feature nueva (aunque sea fuera de horario). Las mejoras quedan
acumulándose en `staging` hasta que se avise lo contrario (`CLAUDE.md`).

**Excepción ejecutada el 18-08-2026:** Gerencia (Luis Devoto) pidió
explícitamente promover **todo** lo acumulado en `staging` a producción —
11 commits, del 11 y 12-08-2026 (documentados en las notas v1.26, v1.27 y
v1.28). Se confirmó que la instrucción se aparta deliberadamente de la
regla del 10-08 (no todos son errores; la mayoría son mejoras/funcionalidad
nueva) y que el horario (≈08:23 hora Chile, antes de la apertura 09:15) es
fuera de horario de atención. `main` y `staging` quedaron con el mismo
árbol de archivos tras la promoción (cherry-pick commit por commit,
preservando el historial de cada uno). La regla del 10-08 sigue vigente
para promociones futuras — esta fue una excepción puntual, no un cambio de
la regla.

### Promociones del 16-09, 23-09 y 30-09-2026

Todas por instrucción explícita de Luis Devoto y sin Cobranza ni Operaciones
(que llegó recién el 01-10-2026, ver abajo):

- **16-09-2026:** todo lo acumulado en `staging` salvo Cobranza y Operaciones:
  Postventa (§5), alertas de respuesta de WhatsApp y buscador de Config (§11).
  Commits `ff15bf8` a `b090ddc`.
- **23-09-2026 (fuera de horario), primer intento fallido:** tras el push,
  Dashboard, Cotizaciones y Reportería dejaron de cargar ("Error interno") y la
  producción quedó caída unos 15 minutos; se revirtió de inmediato (PR #1).
  **Causa raíz:** al armar la promoción se excluyó la columna
  `users.es_encargado_cobranza` de la migración, pero `backend/middleware/auth.js`
  —copiado tal cual desde `staging` por considerarlo "limpio"— la consultaba en
  **cada** solicitud autenticada (caché de 60 s del estado del usuario), y sin la
  columna toda la API devolvía 500. **Lección:** clasificar un archivo como
  "limpio" por no tener cambios de Cobranza en su diff no basta; hay que revisar
  si **depende en tiempo de ejecución** de algo que agrega otro archivo. La
  prueba previa (`initDb()` contra Postgres) solo validó que la migración
  corriera, no que cada endpoint autenticado respondiera.
- **23-09-2026, segunda promoción:** mismo contenido con la causa corregida
  (commit `d472d27`), probada con servidor real, Postgres real y token real
  contra `/api/negocios`, `/api/cotizaciones`,
  `/api/reportes/actividad-mes` y `/api/reportes/whatsapp/resumen-mensual`.
  Incluyó la auditoría de seguridad (v1.36), el tiempo de respuesta de WhatsApp
  (§9), la plantilla desde la ficha del contacto y la sincronización de vendedor
  (v1.37; §11).
- **30-09-2026 (≈17:45, fuera de horario):** cambios de Despacho (§6) y la API
  de lectura para análisis (v1.38; §18). Commits `c9e59d2`, `64da76c` y
  `82a10d5`; sin migración de schema. Verificado en producción con el conector.
- **30-09-2026 (21:12, fuera de horario):** WhatsApp, un lead por conversación
  (v1.39; §11). Commit `f8ccfb7`; solo toca `backend/routes/public.js`.

### Promoción parcial del 01-10-2026 (Operaciones, sin Cobranza)

La regla del 07-08 y su "modo restrictivo" del 10-08 quedaron reemplazadas el
**29-09-2026**: se promueve a `main` **solo con el OK de Luis Devoto** (no hace
falta que sea un error); si el push cae en horario laboral (lunes a viernes,
9:00 a 17:30 hora de Chile) se pide una confirmación adicional puntual; nunca
sin autorización, ni siquiera por un error crítico. `staging` sigue libre.

El 01-10-2026 Luis autorizó, en horario laboral y de forma explícita, pasar a
producción **solo Operaciones** (Arranque de Trabajos y v1.40), dejando Cobranza
en `staging`. Como `staging` mezcla ambos módulos, no se fusionó la rama: se
armó una rama desde `main` comparando contenido archivo por archivo (archivos
solo de OT completos; en los compartidos, solo los bloques sin Cobranza).
Procedimiento a repetir cuando se promueva Cobranza:

1. Listar `git diff --name-only origin/main origin/staging` y clasificar cada
   archivo (OT, Cobranza o mezclado) buscando referencias a Cobranza **también
   en tiempo de ejecución** (ej. columnas que consulta `middleware/auth.js`),
   no solo en el diff.
2. Probar con una base creada con el schema de `main` y encima el código a
   promover: recorrer los endpoints autenticados con varios roles, sin 500.
3. Revisar el commit antes del push: `git diff --stat origin/main HEAD` y
   `git ls-files -s | grep ^120000` (no debe haber enlaces simbólicos).
4. Reproducir el build de Railway desde un **clon limpio** (comando de
   `railway.json`) y arrancar el servidor con `/api/health`.
5. Tras el push, confirmar el estado **Success** del despliegue en Railway.

**Incidente:** el primer despliegue (`ee000f3`) falló en Railway porque el commit
llevaba por error dos enlaces simbólicos `node_modules` (creados solo para probar
en una carpeta temporal; `.gitignore` ignora la carpeta `node_modules/`, no los
enlaces). Producción no se cayó —Railway conserva el despliegue anterior cuando
un build falla—, pero una consulta de verificación a la API leía la versión
vieja y se informó como "estable" antes de tiempo. Corregido con `60cd435`
(borra solo esos dos archivos). Primera promoción parcial: 23-09-2026 (falló
por `middleware/auth.js`, ver `CLAUDE.md`); esta fue la segunda, y la
verificación correcta es el estado del despliegue en Railway.

## 18. API de integración externa — Cowork (v1.28)

Primera versión (v1.0) de la API REST que el agente Cowork (operado por
Gerencia General) usa para registrar clientes y negocios, y generar
cotizaciones desde afuera del CRM. Especificada en
`HT-DO-XX_Especificacion_API_CRM_Cowork` (v0.1 borrador → v1.0 con lo
realmente construido; pendiente de correlativo definitivo y publicación en
SharePoint, ver §16 punto 9).

**Endpoints:**

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/v1/clientes?rut=&nombre=` | Buscar cliente |
| POST | `/api/v1/clientes` | Alta de cliente, idempotente por RUT |
| GET | `/api/v1/negocios?desde=&hasta=&estado=&vendedor_id=&cliente_id=&origen=&limit=&offset=` | Listado con filtros (agregado en v1.29); desde v1.38 con `offset`, tope de 500 por página y más campos (ver abajo) |
| POST | `/api/v1/negocios` | Crear negocio, idempotente por `referencia_externa` |
| GET | `/api/v1/negocios/{id}` | Detalle: etapa, historial de etapas, cotizaciones |
| POST | `/api/v1/negocios/{id}/cotizaciones` | Registrar cotización (numeración real del CRM, avanza etapa a "Cotizado") |
| GET | `/api/v1/reportes/{tipo}` | Reportes comerciales existentes (§9), mismos filtros; desde el 23-09-2026 también `whatsapp_resumen_mensual`, `whatsapp_por_vendedor` y `whatsapp_abiertas_ahora` (pestaña WhatsApp, §9); desde v1.40 también `ots_kpis`, `ots_resumen_mensual`, `ots_por_tipo`, `ots_por_tecnico`, `ots_pendientes` y `ots_detalle` (pestaña OT's, §9) |
| GET | `/api/v1/whatsapp/conversaciones?abierta=true\|false` | Lista conversaciones de la Bandeja (v1.35, todas, sin distinción de vendedor) |
| GET | `/api/v1/whatsapp/conversaciones/{contactoId}/mensajes` | Hilo completo de mensajes, orden ascendente (v1.35) |
| POST | `/api/v1/whatsapp/conversaciones/{contactoId}/mensajes` `{texto}` | Envío real vía Meta (v1.35) — respeta la ventana de 24h de Meta (`409` si está cerrada); a diferencia de un vendedor logueado, no antepone firma con nombre de persona |
| GET | `/api/v1/cotizaciones` | Cotizaciones del CRM para análisis (v1.38) |
| GET | `/api/v1/whatsapp/mensajes?desde=&hasta=` | Mensajes por rango de fechas (v1.38) |
| GET | `/api/v1/softland/cotizaciones`, `/notas-venta`, `/facturas` | Documentos de Softland replicados en el CRM (v1.38) |
| GET | `/api/v1/seguimientos` | Registro del seguimiento automático (v1.38) |

Los 3 endpoints de WhatsApp usan el mismo token y límite de 60
solicitudes/minuto que el resto de la API — sin diferencia de
autenticación. Explícitamente fuera de alcance por ahora: adjuntos y
reenvío de plantilla para conversaciones cerradas.

**Autenticación:** Bearer token fijo por variable de entorno
(`COWORK_API_KEY`), mismo patrón que `/api/leads/web`. Límite de 60
solicitudes/minuto. Toda escritura queda atribuida al actor real "Cowork"
(`users.rol = 'integrador'`), consultable en el timeline unificado.

**Diferencias deliberadas frente al diseño original (documento v0.1):**

- **Numeración:** usa el correlativo real del CRM (§4), no un formato
  paralelo `[año]-NNN` — evita dos numeraciones simultáneas.
- **Estados:** no existe la máquina fija de 8 estados del borrador
  original — se expone la etapa real del pipeline configurable (§3) y su
  historial, reutilizando el mecanismo que ya existía (avance automático a
  "Cotizado" al registrar una cotización).
- **No persistidos todavía:** `cuadrante`/`tipo` del cliente,
  `tipo_documento` del negocio — se aceptan si vienen en el body, se
  ignoran (ver §16 punto 9 y la nota v1.28).
- **No implementado todavía:** `PATCH /negocios/{id}` (actualizar estado).

**Actualización 19-08-2026 (v1.29):** se agregó `GET /negocios` con
filtros (`desde`/`hasta`/`estado`/`vendedor_id`/`cliente_id`/`origen`/
`limit`) — Cowork reportó que sin listado no podía automatizar su informe
diario, solo consultar un negocio si ya conocía el id. Devuelve un
arreglo plano (mismo formato que el resto de la API), sin `historial` ni
`cotizaciones` anidados — para el detalle completo de un negocio puntual
sigue estando `GET /negocios/{id}`.

Ver notas de cambio v1.28 y v1.29 para el detalle completo, incluida la
verificación extremo a extremo contra Postgres real.

**Endpoints de solo lectura para análisis (v1.38, 30-09-2026):** pedido de Luis
Devoto para analizar las oportunidades que llegan de clientes sin depender de
consultas manuales; un agente (Cowork) correrá después los análisis e informes
periódicos. Alcance: **solo lectura**, no modifica datos ni envía nada. Datos
cubiertos: el CRM desde agosto de 2026 y la historia de Softland que el CRM ya
replica (desde 2023-01-01). Mismo token y mismo límite de 60 solicitudes por
minuto. En producción desde el 30-09-2026 (commit `82a10d5`), sin migración de
schema.

- **Convención de los listados nuevos:** `?limit=&offset=` y respuesta
  `{ total, limit, offset, siguiente_offset, datos }`; `siguiente_offset` es
  `null` cuando no quedan más filas. Por defecto 200 filas por página (500 en
  mensajes de WhatsApp) y máximo 1.000. Fechas `YYYY-MM-DD`, extremos incluidos.
- **`GET /negocios` (ampliado):** suma `offset` y sube el tope de 200 a 500; el
  orden ahora desempata por `id` (antes, filas con la misma fecha podían
  repetirse o saltarse entre páginas). La respuesta suma `monto_estimado`
  (**neto**, sin IVA), `causa_no_cierre`, `causa_no_cierre_detalle`,
  `fecha_cierre`, `ultima_actividad`, `contacto_id` y `pipeline_id`. Sigue
  devolviendo una lista simple, compatible con lo anterior.
- **`GET /cotizaciones` (nuevo):** filtros `desde`, `hasta`, `estado`, `origen`
  (`venta_directa` u `operaciones`), `negocio_id`, `vendedor_id` y
  `solo_ultima_version=true`. No expone `token_publico` ni la ruta del PDF. El
  `total` incluye IVA, mientras que el `monto_estimado` del negocio es neto.
- **`GET /whatsapp/mensajes` (nuevo):** `desde` y `hasta` obligatorios; filtros
  `contacto_id`, `negocio_id`, `direccion` (`entrante` o `saliente`). Cada
  mensaje trae `lead_id`, `negocio_id` y la hora de Meta (`fecha_meta`).
  **Incluye las conversaciones archivadas y excluye los contactos anonimizados**
  (decisión de Luis Devoto). Sin archivos adjuntos: solo nombre y tipo. Como el
  filtro `negocio_id` usa el vínculo del lead, que casi no se llena (§16),
  conviene no depender de él.
- **`GET /whatsapp/conversaciones/{id}/mensajes` (ampliado):** suma `lead_id` y
  `negocio_id` a cada mensaje.
- **`GET /softland/cotizaciones`, `/notas-venta` y `/facturas` (nuevo):** tablas
  `reporte_softland_*`, con filtros `desde`, `hasta`, `vencod` y `cod_cliente`;
  `meta` informa la cobertura real y la última sincronización. Las cotizaciones
  de Softland llegan solo hasta jul-2026 (diseño de la sincronización); desde
  ago-2026 las cotizaciones son las del CRM. Las notas de venta y facturas
  llegan hasta la última sincronización nocturna (23:00). **Lo anterior a 2023
  no está replicado.**
- **`GET /seguimientos` (nuevo):** registro del seguimiento automático, con
  filtros `desde`, `hasta`, `negocio_id`, `fuente` (`secuencia` o
  `plantilla_whatsapp`) y `ventana_dias` (1 a 30, por defecto 7).
  `resultado` puede ser `enviado_automatico`, `tarea_generada` o
  `cambio_etapa`.
  - **"Si el cliente respondió":** el CRM no tiene un detector de respuesta
    general (para correo no existe). Se entregan dos datos de distinto valor:
    `pausada_por_respuesta_cliente` es un **dato real** (la secuencia se pausó
    porque el cliente respondió; solo aplica a `fuente=secuencia`) y
    `respuesta_whatsapp_inferida` es un **dato inferido**, no una prueba: indica
    si hubo *algún* mensaje entrante del contacto dentro de `ventana_dias`
    después del envío.
- **Anonimizados:** `anonimizarContacto()` guarda el nombre como `(Eliminado)`,
  pero `initDb()` pasa a mayúsculas todos los nombres de contactos en cada
  arranque, así que tras un reinicio queda `(ELIMINADO)`. El filtro compara sin
  distinguir mayúsculas; quien consulte por otro camino (por ejemplo SQL
  directo) debe hacer lo mismo.
- **Pruebas:** Postgres local con el schema real (`initDb()`), servidor real y
  token real, con datos ficticios (autenticación, paginación, validaciones de
  parámetros, filtros, exclusión de anonimizados, ausencia de `token_publico` y
  cálculo de la respuesta inferida); la prueba detectó y se corrigió el problema
  de mayúsculas de los anonimizados. La nota v1.38 aclara que no se probó contra
  datos reales de producción antes del despliegue; después del push se verificó
  producción con el conector (los campos nuevos ya aparecen).
- **Fuera de esta versión** (decisión de Luis Devoto, 30-09-2026): causa de
  pérdida "Otro" con comentario obligatorio y su análisis fino (incluidos los
  perdidos sin respuesta), y el envío de informes por correo (§16).

**Conector MCP:** las herramientas que usa el agente Cowork están descritas en
§14. Las 4 que escriben (crear cliente, crear negocio, registrar cotización y
enviar mensaje de WhatsApp) no se marcan de solo lectura a propósito, para que
su aprobación no se afloje.

## 19. Cobranza (v1.35 — en construcción, solo en `staging`)

Módulo nuevo, nunca antes documentado en este consolidado — sigue en
`staging`, **excluido de la promoción del 01-10-2026** (instrucción de Luis
Devoto; para promoverlo, repetir el procedimiento por archivo de §17), sin promover a `main` (la regla vigente, §17, no permite
promover mejoras/funcionalidad nueva). Más avanzado de lo que sugería el
seguimiento informal en `CLAUDE.md`: 3 de 4 fases de la especificación
(`HT-DO-XX`) están construidas.

**Fase 1 — Configuración y contactos de cobranza:** completa. Cuentas
contables, códigos, glosas y umbrales editables (administrador/jefe
comercial); ajustes de anticipo/garantía/fluctuación/redondeo/
indemnización; CRUD de cuentas bancarias (con flag "es cuenta Transbank").
**Contactos de cobranza modelados separados de los contactos
comerciales** — decisión explícita: "quien compra no necesariamente es
quien paga" — vinculados a una o varias empresas con nivel (par/jefe/
superior). Importador CSV masivo desde Buk Finanzas, resuelve la empresa
por RUT o razón social exacta, sin crear empresas nuevas.

**Fase 2 — Documentos y conciliación bancaria:** completa. Sincronización
diaria automática (23:30 hora Chile, solo producción — hoy corre en
`staging` porque el módulo no está en `main`) de facturas pendientes
desde Softland, validada contra el reporte nativo "Estado de Deuda" de
Softland. Importación de cartolas bancarias (Banco de Chile, Santander) y
de los dos archivos de Transbank (Cartola de Movimientos + Resumen de
abonos), con deduplicación. Conciliación automática para Transbank (por
monto+fecha, margen ±5 días, sin conciliar si hay ambigüedad — 0 o más de
1 candidato) y manual para el resto (reparto entre facturas, ajuste de
excedente contra el umbral de redondeo configurado). Reporte de
antigüedad de saldos por tramos de mora.

**Fase 3 — Secuencias de recordatorio: sin construir.** Las tablas
existen (`cobranza_secuencias`/`cobranza_secuencia_pasos`, con canal
email/whatsapp y niveles de destinatario) pero ningún endpoint ni pantalla
las usa todavía — es solo el esqueleto de base de datos.

**Fase 4 — Cuenta de cliente propia:** completa. `saldo_app` se calcula al
vuelo (nunca una columna sincronizada) y se compara contra
`saldo_softland`, detectando diferencias. Clientes sin empresa vinculada
en el CRM ("cuentas de paso") generan un aviso diario por correo (8:45
hora Chile) a quien tenga `es_encargado_cobranza` o rol
administrador/jefe comercial/gerencia.

**Permisos — dos niveles, no uno solo (§1):** configurar cuentas contables
es administrador/jefe comercial (igual que el resto de los mantenedores de
Configuración); la **operación diaria** (documentos, conciliación,
contactos, cuentas-cliente) es administrador, gerencia, o quien tenga
`es_encargado_cobranza` — **`jefe_comercial` queda deliberadamente afuera
de la operación diaria**, a diferencia de Postventa/Despacho: es
información financiera sensible, confirmado con Gerencia el 14-09-2026.

No existe todavía una nota de cambio dedicada para este módulo — vive
solo en los commits de `staging`.

---

*HidroTecnica SpA — HT-AP-03 Documento Consolidado · Borrador para validación de Gerencia*
