# HT-AP-03 — CRM Comercial HidroTecnica — Documento Consolidado

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Fecha de consolidación:** 2026-08-07
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
la ficha del negocio y **sincronizado automáticamente** con el total al
generar o editar una cotización (§3), y el **aviso manual de novedades por
correo** (§9), que queda establecido como estándar para toda futura
promoción de cambios a producción; y de v1.25 (07-08-2026): **autoguardado
de borrador de cotización** y aviso honesto al expirar la sesión (§4), y el
**aviso diario de casos de Postventa vencidos** por correo a las 8:30am
(§5). Este documento es el que debe subirse a SharePoint reemplazando la
versión anterior del documento base.

---

## 1. Alcance y roles

**Roles del sistema:** `administrador`, `jefe_comercial`, `vendedor`,
`callcenter`, `gerencia`, `tecnico` (v1.22).

**Rol `tecnico` (v1.22):** rol acotado a un solo módulo — quien lo tiene
**solo** ve y usa Servicio Técnico (§15), nada más del sistema (ni Dashboard,
ni Pipeline, ni Contactos, etc., aunque no tuvieran antes una restricción de
rol explícita). Los cinco roles preexistentes, en cambio, **suman** Servicio
Técnico a lo que ya veían — no se les quita nada. Pensado para personal de
terreno que solo necesita gestionar casos técnicos, sin acceso al resto del
CRM comercial.

**Atribuciones adicionales (v1.13-v1.14):** además del rol, un usuario puede
tener marcados uno o ambos de `es_encargado_postventa` y
`es_encargado_despacho` — booleanos independientes del rol, no un perfil de
usuario nuevo. Decisión explícita: permiten que alguien cubra esa función
(por ejemplo, el jefe comercial durante una licencia del encargado titular)
sin cambiarle el rol. Quien tiene el atributo marcado ve el módulo en su
menú aunque su rol no lo traiga por defecto, y gestiona el tablero/las rutas
completas de ese módulo.

**Matriz de permisos** (resumen; ver detalle por función en la nota v1.6 si se
necesita el historial de por qué se definió así):

| Función | Admin | Jefe Comercial | Vendedor | Call center | Gerencia | Técnico |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Pipeline / negocios | ✅ | ✅ (cualquiera) | propios | ver | ver | — |
| Cotizaciones | ✅ | ✅ | propias | — | ver | — |
| Aprobar descuento sobre tope | ✅ | ✅ | — | — | — | — |
| Postventa (gestión completa) | ✅ | ✅ | encargado (*) | — | — | — |
| Postventa (crear caso / ver propios) | ✅ | ✅ | ✅ | — | — | — |
| Despacho (gestión completa) | ✅ | ✅ | encargado (*) | — | — | — |
| Despacho (crear ruta / ver propios) | ✅ | ✅ | ✅ | — | — | — |
| **Servicio Técnico (§15, v1.22)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (‡) |
| Cola de asignación (†) | ✅ | ✅ | — | ✅ | — | — |
| Bandeja WhatsApp (†) | ✅ | ✅ | sus conv. | ✅ | ver | — |
| Empresas / Contactos | ✅ | ✅ | ✅ | ✅ | ver | — |
| Duplicados | ✅ | ✅ | — | ✅ | — | — |
| Import/Export de maestros | ✅ | ✅ | — | — | — | — |
| Productos (consulta) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Reportes | ✅ | ✅ | sus números | — | ✅ | — |
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

(*) Cualquier usuario con `es_encargado_postventa`/`es_encargado_despacho`
marcado, sin importar su rol — no solo vendedor.

(†) Desde v1.19 (01-08-2026), estas dos pantallas se ocultaron del **menú**
para todos los roles (el canal WhatsApp no está operativo, ver §11/§14) —
los permisos de esta tabla siguen vigentes tal cual y las rutas
(`/bandeja`, `/cola`) siguen funcionando por URL directa; solo se sacó el
acceso visible.

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
  la etapa **"Aceptado"** (tipo `ganada`) del pipeline **Operaciones** —
  mismo patrón de subir → previsualizar → confirmar → informe de rechazos
  que Empresas/Contactos, botón "Importar oportunidades" en Pipeline
  (administrador/jefe comercial). La empresa y el contacto se buscan o se
  crean automáticamente; el vendedor debe existir ya en el sistema (se
  resuelve por email o nombre). Como entra directo a la etapa terminal, no
  dispara encuesta de satisfacción ni tarea automática. Campo nuevo
  `negocios.n_oc` para el N° de orden de compra.
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
  cierre), y además se actualiza **automáticamente** con el total de la
  cotización cada vez que se genera una cotización nueva, se edita en
  borrador, o se genera una nueva versión (sobrescribe cualquier valor
  cargado a mano). Antes, un negocio sin monto cargado a mano al crearlo
  quedaba en $0 para siempre en Reportería y Pipeline, aunque después se
  cotizara y se ganara.

## 4. Cotizaciones

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
- **Canal WhatsApp retirado de este botón (v1.19):** el envío por WhatsApp
  existía (backend `/enviar-whatsapp` sigue ahí), pero se sacó de esta
  pantalla porque el canal no está operativo todavía (sin credenciales de
  Meta, ver §11/§14/§16). Correo queda como único canal de envío desde el
  sistema.
- Si el contacto no tiene email registrado, ya no queda ningún canal para
  enviar desde el sistema — se muestra una advertencia visible indicando
  que hay que agregarlo en la ficha del contacto.
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
  un revisor interno del servidor avanza los pasos vencidos cada 15 minutos.
  Como es un motor de asistencia (no envía solo salvo el caso de WhatsApp ya
  conectado, ver §11), cada paso vencido genera una **tarea** para el
  vendedor.
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
  **pipeline** (§3; Ventas Directas por defecto).
- **Cotizaciones por día**, con detalle expandible por vendedor: contactos
  asignados ese día, cotizaciones generadas (cantidad/monto) y cotizaciones
  ganadas (cantidad/monto). Ya corregido para contar **solo la última
  versión** de cada cotización (ver §4) — antes duplicaba/triplicaba
  cotizaciones re-versionadas.
- Vendedor ve solo sus números; administrador/jefe comercial/gerencia ven
  todos o filtran por vendedor; call center no tiene acceso a reportería.
- **Acceso de solo lectura para BI externo:** rol de PostgreSQL
  (`bi_readonly`) aprovisionado automáticamente si está definida la variable
  `BI_READONLY_PASSWORD`, con `SELECT` sobre todas las tablas actuales y
  futuras. Pensado para Power BI / Looker Studio combinando esta fuente con
  Softland. La contraseña se resincroniza en cada arranque.
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

## 10. Encuesta post-cierre

- Al mover un negocio a etapa "ganada" se crea automáticamente una encuesta
  con link público. Formato: NPS (0 a 10) + comentario libre opcional,
  pregunta editable por administrador/jefe comercial.
- Como el envío automático de correo depende de una integración pendiente,
  se genera una tarea para que el vendedor comparta el link.
- Recordatorio único a los 5 días si no ha respondido (configurable vía
  `ENCUESTA_DIAS_RECORDATORIO`).

## 11. WhatsApp

**Bot (categorización y recontacto):** integración con la Cloud API de
WhatsApp (Meta), app en modo desarrollo (ver pendientes, §16).
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

**Almacenamiento de adjuntos (Cloudflare R2):** bucket privado
`crm-ht-adjuntos` (no público, distinto del bucket de catálogo de productos
del §2 y del de documentos de despacho del §6). Token de API con permiso
"Object Read & Write" acotado solo a ese bucket. El control de acceso a un
archivo lo hace el CRM (mismo criterio de acceso a la conversación); para
que Meta reciba un adjunto se usa una URL firmada de validez corta.

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

- **Usuarios/roles:** `users.rol` admite `jefe_comercial` y, desde v1.22,
  `tecnico` (§1/§15). `users.pipeline_default_id` (pipeline por defecto,
  v1.12). `users.es_encargado_postventa` (v1.13), `users.es_encargado_despacho`
  (v1.14) — atribuciones adicionales, independientes del rol.
- **Contactos:** `vendedor_id`, `vendedor_asignado_en`.
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

## 14. Integraciones externas

- **Brevo (SMTP):** correos transaccionales y envío de cotizaciones.
  Remitente genérico con "Responder a" = vendedor.
- **WhatsApp Cloud API (Meta):** bot, Bandeja, envío de cotizaciones y
  adjuntos. App en modo desarrollo (número de prueba, máx. 5 destinatarios)
  y sin credenciales cargadas en producción — por eso, desde v1.19, el botón
  "Enviar cotización" (§4) y el menú (Bandeja/Cola, §1) no lo exponen
  todavía; el código sigue existiendo, listo para cuando se publique la app
  (§16, punto 3).
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
3. **Publicar la app de Meta** y migrar del número de prueba (máx. 5
   destinatarios) al de producción (requiere verificación de negocio en
   Meta). Es requisito previo del punto 4: mientras la app siga en modo
   de desarrollo, el bot no puede conversar con clientes reales.
4. **Bot con IA fuera de horario**: hoy, fuera de horario, el bot solo
   envía un mensaje automático y registra el lead (§11). La idea es que
   pueda asesorar al cliente, ayudarlo a elegir una bomba y guiarlo hasta
   la ficha de compra. Por definir con Gerencia: hasta dónde responde solo
   (¿solo recomendación de producto, o también precio/disponibilidad?) y
   cuándo escala a un vendedor.
5. **Plantillas de mensaje aprobadas por Meta**, para responder fuera de la
   ventana de 24 h en conversaciones cerradas.
6. **Correo del vendedor como remitente real** de las cotizaciones: en
   evaluación entre autenticar el dominio en Brevo, envío nativo vía
   Microsoft Graph, o el SMTP directo de Microsoft 365 recién habilitado
   por soporte (§14) — falta la prueba real.
7. **Canal de correo como fuente de leads** (paralelo al canal web),
   requiere definir la integración con el proveedor de correo.
8. **Envío de correos masivos** a clientes: requiere separar el envío de
   marketing masivo de la cuenta Brevo transaccional actual (cotizaciones),
   para no arriesgar su entregabilidad, y definir manejo de listas/opt-out.

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

## 17. Proceso de despliegue a producción

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

---

*HidroTecnica SpA — HT-AP-03 Documento Consolidado · Borrador para validación de Gerencia*
