# HT-AP-03 — CRM Comercial HidroTecnica — Documento Consolidado

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Fecha de consolidación:** 2026-07-26
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Naturaleza de este documento:** reemplaza la lectura dispersa de las notas de
cambio v1.2 a v1.16 (que quedan archivadas en `docs/` como historial de
decisiones) por una descripción única y al día de todo el sistema. Incorpora,
sobre la consolidación anterior (v1.11, 18-07-2026), el trabajo de las
v1.12-v1.14: múltiples pipelines (Ventas Directas/Operaciones), el módulo de
Postventa y el módulo de Despacho; de v1.15: ajuste de UX en Despacho y el
backlog priorizado post-lanzamiento (§14); y de v1.16: optimización de ruta
de Despacho con Google Maps Platform. Este documento es el que debe subirse
a SharePoint reemplazando la versión anterior del documento base.

---

## 1. Alcance y roles

**Roles del sistema:** `administrador`, `jefe_comercial`, `vendedor`,
`callcenter`, `gerencia`.

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

| Función | Admin | Jefe Comercial | Vendedor | Call center | Gerencia |
|---|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pipeline / negocios | ✅ | ✅ (cualquiera) | propios | ver | ver |
| Cotizaciones | ✅ | ✅ | propias | — | ver |
| Aprobar descuento sobre tope | ✅ | ✅ | — | — | — |
| Postventa (gestión completa) | ✅ | ✅ | encargado (*) | — | — |
| Postventa (crear caso / ver propios) | ✅ | ✅ | ✅ | — | — |
| Despacho (gestión completa) | ✅ | ✅ | encargado (*) | — | — |
| Despacho (crear ruta / ver propios) | ✅ | ✅ | ✅ | — | — |
| Cola de asignación | ✅ | ✅ | — | ✅ | — |
| Bandeja WhatsApp | ✅ | ✅ | sus conv. | ✅ | ver |
| Empresas / Contactos | ✅ | ✅ | ✅ | ✅ | ver |
| Duplicados | ✅ | ✅ | — | ✅ | — |
| Import/Export de maestros | ✅ | ✅ | — | — | — |
| Productos (consulta) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reportes | ✅ | ✅ | sus números | — | ✅ |
| Configurar secuencias/flujos | ✅ | ✅ | — | — | — |
| Gatillar/pausar una secuencia | ✅ | ✅ | propios | — | — |
| ⚙️ Config pipeline(s) | ✅ | ✅ | — | — | — |
| ⚙️ Config Postventa (etapas) | ✅ | ✅ | — | — | — |
| ⚙️ Lugares frecuentes de despacho | ✅ | ✅ | — | — | — |
| ⚙️ Reglas de asignación | ✅ | ✅ | — | — | — |
| ⚙️ Datos de empresa | ✅ | ✅ | — | — | — |
| ⚙️ Config WhatsApp/bot | ✅ | — | — | — | — |
| ⚙️ Usuarios | ✅ | — | — | — | — |
| ⚙️ Cambiar contraseña | ✅ | ✅ | ✅ | ✅ | ✅ |

(*) Cualquier usuario con `es_encargado_postventa`/`es_encargado_despacho`
marcado, sin importar su rol — no solo vendedor.

**Anti-alcance explícito (decisiones tomadas, no se construye):**
- Nota de venta Softland: el ingreso se hace directamente y a mano en
  Softland; no hay importación automática desde el CRM.
- Scoring predictivo o proyecciones automáticas de cierre: el pipeline
  ponderado (§3) usa el % que fija la configuración o el vendedor, nunca un
  modelo.
- Réplica de base de datos para BI: en su lugar existe un rol de solo
  lectura sobre la misma base (§8).
- Mapa y optimización de ruta de Despacho (§6): diferido a una siguiente
  etapa, requiere antes una cuenta de proveedor de mapas.

## 2. Maestros — Empresas, Contactos, Productos

**Importadores CSV** (Empresas, Contactos, Productos): mismo patrón en los
tres — subir archivo → previsualización (muestra + conteo) → validación fila
a fila → confirmar → informe de rechazos con motivo. Restringido a
administrador y jefe comercial.

- **Contactos:** valida RUT chileno (dígito verificador), email, teléfono
  normalizable a E.164; detecta duplicados por teléfono o email.
- **Empresas:** valida RUT; matchea por RUT si existe.
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
  distinto del bucket privado de adjuntos de WhatsApp (§10) y del de
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
    quedan en el pipeline del **dueño del negocio**.
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

## 4. Cotizaciones

**Numeración:** formato **`NNNNNN-VV`** — correlativo global de 6 dígitos
(sin año, sin prefijo de texto) seguido de la versión (2 dígitos), ej.
`000501-02`. Reemplaza el formato anterior `COT-AAAA-NNNNN` (correlativo por
año). El correlativo es global y no se resetea. La variable de entorno
`COTIZACION_CORRELATIVO_INICIAL` define, solo la primera vez que se genera
una cotización tras este cambio, desde qué número seguir contando — **queda
pendiente fijarla en Railway al pasar a producción**, según el correlativo
que la empresa lleve fuera del CRM. Las cotizaciones ya emitidas antes de
este cambio conservan su formato viejo; no se reescriben.

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

**Envío desde el CRM:** botón único **"Enviar cotización"** con dos casillas
(Correo/WhatsApp), deshabilitadas solas si el contacto no tiene el dato
correspondiente. Permite ambos canales a la vez.
- Correo: SMTP existente (cuenta Brevo), con el vendedor como "Responder a".
  **Pendiente de IT** que salga literalmente desde el correo del vendedor
  (ver §13 y §14).
- WhatsApp: envía el PDF como documento, con mensaje de acompañamiento
  editable (Configuración → Datos de empresa).
- Si el envío falla, no se marca la cotización como enviada ni se dispara
  seguimiento; el error se traduce a un mensaje entendible.

**Secuencia de seguimiento automática post-envío:** una secuencia puede
marcarse "Predeterminada" (Configuración → Secuencias) para dispararse sola
al enviar una cotización. Si el negocio ya tenía otra secuencia corriendo,
se cancela y se reemplaza (se asume que, al mandar cotización, el cliente ya
respondió, así que el seguimiento post-cotización prevalece sobre el de
contacto inicial).

**Estandarización de texto:** el título de la cotización y el nombre del
contacto/razón social de empresa se normalizan a **mayúsculas** al guardar
(los vendedores suelen tipearlos en minúscula o mezclado). La descripción de
cada línea de ítem no se toca — ya viene en mayúsculas desde el catálogo.
Los contactos que ya existían en minúscula se corrigieron una sola vez al
desplegar este cambio (backfill); razón social y título de cotización solo
aplican hacia adelante.

## 5. Postventa (v1.13)

- Un caso de postventa (garantía o reclamo técnico) siempre se vincula a un
  **negocio de origen**, obligatorio — para no perder la trazabilidad hacia
  la venta que lo originó.
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
- Casos sin etapa asignada (creados antes de existir alguna etapa abierta,
  o cuya etapa fue desactivada) se muestran en una columna aparte **"Sin
  etapa asignada"**, para no quedar nunca invisibles.
- **Permisos:** atribución adicional `users.es_encargado_postventa` (ver
  §1) — quien la tiene (o es administrador/jefe comercial) gestiona el
  tablero completo; un vendedor sin el atributo crea casos y ve los que él
  creó, sin gestionar el resto.

## 6. Despacho (v1.14-v1.16)

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
- **Foto de respaldo desde el celular:** el encargado puede subir, al
  completar una parada, una foto del documento firmado. El selector de
  archivo permite tanto tomar una foto nueva como elegir una ya existente
  en el teléfono. Almacenamiento en un bucket **privado y separado** de
  Cloudflare R2 (distinto del de imágenes de producto y del de adjuntos de
  WhatsApp, por tratarse de documentos con firmas y datos de clientes);
  visualización autenticada desde el CRM, sin URL pública directa.
  **Pendiente de configurar en Cloudflare** (ver §14): mientras el bucket
  no exista, subir una foto responde "no configurado todavía" sin romper
  el resto del módulo.
- **Optimización de ruta (v1.16):** botón "Optimizar ruta" que sugiere el
  orden más eficiente para visitar las paradas pendientes de un mismo día,
  ida y vuelta desde la dirección de la empresa, usando Google Directions
  API (con Geocoding API para convertir cada dirección a coordenadas, que
  se cachean en `despacho_puntos.lat/lng`). Solo sugiere — el encargado
  decide si aplica el orden. Rechaza con un error claro si las paradas
  pendientes tienen fechas distintas, o si Google no puede ubicar alguna
  dirección. Pendiente cargar `GOOGLE_MAPS_API_KEY` en Railway (ver §14).
- **Diferido a una siguiente etapa** (decisión explícita): mapa visual con
  los puntos del día embebido en el CRM — hoy la ruta sugerida se muestra
  como lista, no en un mapa.
- **Permisos:** mismo patrón que Postventa — atribución adicional
  `users.es_encargado_despacho` (ver §1).

## 7. Motor de seguimiento (secuencias) y notas/tareas

- **Secuencias configurables:** nombre + pasos ordenados (días de espera,
  canal, mensaje/guion). Un negocio abierto inicia una secuencia a la vez;
  un revisor interno del servidor avanza los pasos vencidos cada 15 minutos.
  Como es un motor de asistencia (no envía solo salvo el caso de WhatsApp ya
  conectado, ver §10), cada paso vencido genera una **tarea** para el
  vendedor.
- Pausar, reactivar (reinicia el conteo de días), marcar "cliente
  respondió", cancelar. Un negocio cerrado (ganado o perdido) cancela su
  secuencia activa automáticamente.
- Una secuencia puede marcarse para **respetar el horario de atención** (un
  paso vencido fuera de horario espera a que abra).
- **Notas y tareas** ligadas a contacto/empresa/negocio, visibles en el
  timeline unificado. Asignar una tarea a otro usuario: solo administrador o
  jefe comercial (un vendedor/call center solo se asigna a sí mismo).

## 8. Reportería

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

## 9. Encuesta post-cierre

- Al mover un negocio a etapa "ganada" se crea automáticamente una encuesta
  con link público. Formato: NPS (0 a 10) + comentario libre opcional,
  pregunta editable por administrador/jefe comercial.
- Como el envío automático de correo depende de una integración pendiente,
  se genera una tarea para que el vendedor comparta el link.
- Recordatorio único a los 5 días si no ha respondido (configurable vía
  `ENCUESTA_DIAS_RECORDATORIO`).

## 10. WhatsApp

**Bot (categorización y recontacto):** integración con la Cloud API de
WhatsApp (Meta), app en modo desarrollo (ver pendientes, §14).
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

## 11. Diseño visual y responsive

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

## 12. Modelo de datos — tablas y campos agregados desde el documento base original

- **Usuarios/roles:** `users.rol` admite `jefe_comercial`.
  `users.pipeline_default_id` (pipeline por defecto, v1.12).
  `users.es_encargado_postventa` (v1.13), `users.es_encargado_despacho`
  (v1.14) — atribuciones adicionales, independientes del rol.
- **Contactos:** `vendedor_id`, `vendedor_asignado_en`.
- **Productos:** `marca`, `url_imagen`, `atributos` (JSONB),
  `descripcion_completa`.
- **Pipeline:** tabla `pipelines` (id, nombre, orden, activo — v1.12);
  `pipeline_etapas.pipeline_id`, `negocios.pipeline_id` (v1.12);
  `negocios.etapa_id` (FK) + `negocios.probabilidad_cierre`.
- **Cotizaciones:** `iva_pct`; tabla `config_empresa` (emisor/banco);
  `cotizacion_correlativo_global` (correlativo NNNNNN, reemplaza el
  correlativo por año); `cotizacion_items` agrega `mostrar_imagen`,
  `mostrar_descripcion`, `mostrar_ficha`.
- **Postventa (v1.13):** tabla `postventa_etapas` (nombre, orden, tipo
  abierta/resuelto/rechazado, activo); tabla `casos_postventa`
  (`negocio_id` obligatorio, `contacto_id`, `empresa_id`, `producto_id` y
  `detalle_equipo` opcionales, `prioridad`, `fecha_limite_respuesta`,
  `tecnico_asignado_id`, `creado_por_id`, `etapa_id`, `fecha_cierre`).
- **Despacho (v1.14):** tabla `despachos` (`negocio_id` y
  `caso_postventa_id` opcionales, `titulo`, `estado` con enum fijo
  programado/en_ruta/completado/cancelado, `creado_por_id`); tabla
  `despacho_puntos` (`despacho_id`, `orden`, `tipo` retiro/entrega,
  `direccion`, `comuna`, `fecha`, `contacto_nombre`, `contacto_telefono`,
  `documento_tipo`, `documento_numero`, `duracion_estimada_min`,
  `completado`, `completado_en`, `foto_respaldo_key`); tabla
  `despacho_lugares_frecuentes` (`nombre`, `direccion`, `comuna`,
  `contacto_nombre`, `contacto_telefono`, `activo`).
- **Leads/bot WhatsApp:** `leads.causa_descarte`, `bot_estado`,
  `bot_paso_recontacto`, `bot_proxima_accion`; tablas
  `config_horario_atencion`, `whatsapp_bot_config`,
  `whatsapp_recontacto_pasos`, `whatsapp_mensajes` (con `tipo`,
  `archivo_key`, `archivo_nombre`, `archivo_mime`), `whatsapp_conversaciones`.
- **Secuencias:** tablas `secuencias`, `secuencia_pasos`,
  `negocio_secuencias`, `secuencia_ejecuciones`; campos
  `respetar_horario`, `es_default_post_cotizacion`.
- **Notas/tareas/timeline:** tablas `notas`, `tareas`,
  `negocio_etapa_historial`.
- **Encuestas:** tablas `encuestas`, `encuesta_respuestas`;
  `encuesta_config`.
- **Acceso BI:** rol de PostgreSQL `bi_readonly` (a nivel de base de datos,
  fuera del modelo de aplicación).

## 13. Integraciones externas

- **Brevo (SMTP):** correos transaccionales y envío de cotizaciones.
  Remitente genérico con "Responder a" = vendedor.
- **WhatsApp Cloud API (Meta):** bot, Bandeja, envío de cotizaciones y
  adjuntos. App en modo desarrollo (número de prueba, máx. 5 destinatarios).
- **Google Maps Platform (v1.16):** Directions API + Geocoding API, para
  optimización de ruta de Despacho (§6). Uso exclusivamente server-side —
  la key nunca se expone al navegador, restringida en Google Cloud Console
  a esas dos APIs. Pendiente cargar `GOOGLE_MAPS_API_KEY` en Railway.
- **Cloudflare R2:** tres buckets — `crm-ht-adjuntos` (privado, WhatsApp),
  `crm-ht-productos` (público, catálogo de imágenes/fichas) y un tercero
  **privado, pendiente de crear** para documentos de respaldo de Despacho
  (§6, §14).
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

## 14. Pendientes abiertos (consolidado de todas las notas)

Ninguno de estos puntos es impedimento para salir a producción (fecha
objetivo: 01-08-2026) — lo construido ya mejora lo que existe hoy. Quedan
como backlog post-lanzamiento, en el siguiente orden de prioridad
(acordado con Gerencia el 27-07-2026):

1. ~~**Optimización de ruta de Despacho** (§6)~~ — **hecho (v1.16,
   27-07-2026):** botón "Optimizar ruta" que sugiere el orden más eficiente
   para visitar las paradas pendientes de un mismo día (ida y vuelta desde
   la dirección de la empresa), con Google Directions/Geocoding API. El
   encargado revisa la sugerencia y decide aplicarla o no. Falta cargar
   `GOOGLE_MAPS_API_KEY` en Railway.
2. **Bucket de Cloudflare R2 para documentos de despacho** (§6, §13):
   rápido — crear el bucket privado, su token de API, y cargar en Railway
   `R2_DESPACHO_ACCESS_KEY_ID`, `R2_DESPACHO_SECRET_ACCESS_KEY`,
   `R2_DESPACHO_BUCKET_NAME`. No bloquea el resto del módulo.
3. **Publicar la app de Meta** y migrar del número de prueba (máx. 5
   destinatarios) al de producción (requiere verificación de negocio en
   Meta). Es requisito previo del punto 4: mientras la app siga en modo
   de desarrollo, el bot no puede conversar con clientes reales.
4. **Bot con IA fuera de horario**: hoy, fuera de horario, el bot solo
   envía un mensaje automático y registra el lead (§10). La idea es que
   pueda asesorar al cliente, ayudarlo a elegir una bomba y guiarlo hasta
   la ficha de compra. Por definir con Gerencia: hasta dónde responde solo
   (¿solo recomendación de producto, o también precio/disponibilidad?) y
   cuándo escala a un vendedor.
5. **Plantillas de mensaje aprobadas por Meta**, para responder fuera de la
   ventana de 24 h en conversaciones cerradas.
6. **Correo del vendedor como remitente real** de las cotizaciones: en
   evaluación entre autenticar el dominio en Brevo, envío nativo vía
   Microsoft Graph, o el SMTP directo de Microsoft 365 recién habilitado
   por soporte (§13) — falta la prueba real.
7. **Canal de correo como fuente de leads** (paralelo al canal web),
   requiere definir la integración con el proveedor de correo.
8. **Envío de correos masivos** a clientes: requiere separar el envío de
   marketing masivo de la cuenta Brevo transaccional actual (cotizaciones),
   para no arriesgar su entregabilidad, y definir manejo de listas/opt-out.

Sin prioridad asignada (no comerciales / no bloquean nada):

- **Rotar el token de acceso de R2** usado en la carga masiva por `rclone`:
  las credenciales se compartieron en texto plano durante la configuración.
- **Fijar `COTIZACION_CORRELATIVO_INICIAL`** en Railway antes de que se
  genere la primera cotización con el nuevo formato de numeración (§4).
- Hidroneumáticos y Filtros de piscina: la columna "Descripción" ya está en
  sus plantillas de importación (§2), pero el Excel real de esas dos
  categorías aún no la trae completa.

---

*HidroTecnica SpA — HT-AP-03 Documento Consolidado · Borrador para validación de Gerencia*
