# HT-AP-03 — CRM Comercial HidroTecnica — Documento Consolidado

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Fecha de consolidación:** 2026-07-18
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Naturaleza de este documento:** reemplaza la lectura dispersa de las notas de
cambio v1.2 a v1.11 (que quedan archivadas en `docs/` como historial de
decisiones) por una descripción única y al día de todo el sistema, incluyendo
trabajo de esta sesión que aún no tenía nota de cambio propia (numeración de
cotizaciones, checks de imagen/descripción/ficha por línea, mayúsculas
estandarizadas, y el rediseño visual completo). Este documento es el que debe
subirse a SharePoint reemplazando la versión anterior del documento base.

---

## 1. Alcance y roles

**Roles del sistema:** `administrador`, `jefe_comercial`, `vendedor`,
`callcenter`, `gerencia`.

**Matriz de permisos** (resumen; ver detalle por función en la nota v1.6 si se
necesita el historial de por qué se definió así):

| Función | Admin | Jefe Comercial | Vendedor | Call center | Gerencia |
|---|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pipeline / negocios | ✅ | ✅ (cualquiera) | propios | ver | ver |
| Cotizaciones | ✅ | ✅ | propias | — | ver |
| Aprobar descuento sobre tope | ✅ | ✅ | — | — | — |
| Cola de asignación | ✅ | ✅ | — | ✅ | — |
| Bandeja WhatsApp | ✅ | ✅ | sus conv. | ✅ | ver |
| Empresas / Contactos | ✅ | ✅ | ✅ | ✅ | ver |
| Duplicados | ✅ | ✅ | — | ✅ | — |
| Import/Export de maestros | ✅ | ✅ | — | — | — |
| Productos (consulta) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reportes | ✅ | ✅ | sus números | — | ✅ |
| Configurar secuencias/flujos | ✅ | ✅ | — | — | — |
| Gatillar/pausar una secuencia | ✅ | ✅ | propios | — | — |
| ⚙️ Config pipeline | ✅ | ✅ | — | — | — |
| ⚙️ Reglas de asignación | ✅ | ✅ | — | — | — |
| ⚙️ Datos de empresa | ✅ | ✅ | — | — | — |
| ⚙️ Config WhatsApp/bot | ✅ | — | — | — | — |
| ⚙️ Usuarios | ✅ | — | — | — | — |
| ⚙️ Cambiar contraseña | ✅ | ✅ | ✅ | ✅ | ✅ |

**Anti-alcance explícito (decisiones tomadas, no se construye):**
- Nota de venta Softland: el ingreso se hace directamente y a mano en
  Softland; no hay importación automática desde el CRM.
- Scoring predictivo o proyecciones automáticas de cierre: el pipeline
  ponderado (§3) usa el % que fija la configuración o el vendedor, nunca un
  modelo.
- Réplica de base de datos para BI: en su lugar existe un rol de solo
  lectura sobre la misma base (§6).

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
  distinto del bucket privado de adjuntos de WhatsApp (§8).
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

- **Etapas configurables** por administrador/jefe comercial: nombre, orden,
  % de cierre por defecto, activar/desactivar. Las etapas terminales
  ("Ganado", "Perdido") están protegidas — no se eliminan ni desactivan,
  porque disparan la causa de no cierre obligatoria y la encuesta post-cierre.
- **Pipeline ponderado:** cada negocio hereda el % de cierre de su etapa y
  puede ajustarlo individualmente; el pipeline muestra monto total y monto
  ponderado (Σ monto × probabilidad) por columna. No es forecasting
  predictivo — el % lo fija la configuración o el vendedor.
- **Kanban:** tarjetas con drag-and-drop entre columnas (desktop). En mobile,
  donde arrastrar con el dedo entre columnas angostas no es viable, cada
  tarjeta suma un selector **"Mover a etapa"** como alternativa — el
  drag-and-drop de escritorio no cambió.
- **Automatismos:**
  - Al generar una cotización (nueva o nueva versión), el negocio avanza
    automáticamente a la etapa "Cotizado" — solo hacia adelante (si ya está
    en una etapa posterior o cerrado, no se toca).
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
  (ver §10 y §11).
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

## 5. Motor de seguimiento (secuencias) y notas/tareas

- **Secuencias configurables:** nombre + pasos ordenados (días de espera,
  canal, mensaje/guion). Un negocio abierto inicia una secuencia a la vez;
  un revisor interno del servidor avanza los pasos vencidos cada 15 minutos.
  Como es un motor de asistencia (no envía solo salvo el caso de WhatsApp ya
  conectado, ver §8), cada paso vencido genera una **tarea** para el
  vendedor.
- Pausar, reactivar (reinicia el conteo de días), marcar "cliente
  respondió", cancelar. Un negocio cerrado (ganado o perdido) cancela su
  secuencia activa automáticamente.
- Una secuencia puede marcarse para **respetar el horario de atención** (un
  paso vencido fuera de horario espera a que abra).
- **Notas y tareas** ligadas a contacto/empresa/negocio, visibles en el
  timeline unificado. Asignar una tarea a otro usuario: solo administrador o
  jefe comercial (un vendedor/call center solo se asigna a sí mismo).

## 6. Reportería

- `negocio_etapa_historial` registra cuándo un negocio entra y sale de cada
  etapa (se completa desde que se implementó hacia adelante).
- Reportes: embudo por etapa, causas de no cierre, tiempo promedio por
  etapa, ranking de vendedores (ganados/perdidos, tasa de cierre, monto
  ganado) — todos exportables a CSV.
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

## 7. Encuesta post-cierre

- Al mover un negocio a etapa "ganada" se crea automáticamente una encuesta
  con link público. Formato: NPS (0 a 10) + comentario libre opcional,
  pregunta editable por administrador/jefe comercial.
- Como el envío automático de correo depende de una integración pendiente,
  se genera una tarea para que el vendedor comparta el link.
- Recordatorio único a los 5 días si no ha respondido (configurable vía
  `ENCUESTA_DIAS_RECORDATORIO`).

## 8. WhatsApp

**Bot (categorización y recontacto):** integración con la Cloud API de
WhatsApp (Meta), app en modo desarrollo (ver pendientes, §12).
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
del §2). Token de API con permiso "Object Read & Write" acotado solo a ese
bucket. El control de acceso a un archivo lo hace el CRM (mismo criterio de
acceso a la conversación); para que Meta reciba un adjunto se usa una URL
firmada de validez corta.

## 9. Diseño visual y responsive

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
    uso como acento — ver el punto de atención de marca más abajo.
- **Contraste (WCAG AA) verificado, no asumido:** blanco sobre celeste da
  2.4:1 (no pasa el mínimo 4.5:1); navy sobre celeste da 6.3:1 (sí pasa). Por
  eso los botones primarios (celeste) usan **texto navy**, no blanco, aunque
  la app usaba naranja con texto navy antes con el mismo criterio (mismo
  precedente, aplicado ahora al celeste).
- **Sidebar:** blanco con borde gris, ítem activo con fondo celeste suave +
  borde izquierdo celeste, ícono de línea por cada opción del menú. Logo
  único (se quitó el que estaba duplicado en el header).
- **Responsive (mobile, sin app nativa):** el layout no tenía ningún manejo
  de pantallas chicas antes de este cambio. Ahora: sidebar colapsa a menú
  hamburguesa + panel deslizante con superposición; encabezados de pantalla
  (título + botones de acción) se apilan en vez de superponerse; tablas de
  listado scrollean horizontalmente en vez de comprimir columnas y partir
  texto; grupos de botones y barras de búsqueda/filtro envuelven en vez de
  salirse de la pantalla; el Pipeline suma el selector "Mover a etapa" por
  tarjeta (§3) porque arrastrar con el dedo entre columnas angostas no es
  viable — el drag-and-drop de escritorio no cambió.
- **Punto de atención de marca (pendiente de decisión de Gerencia):** el
  anexo "Enmienda de marca — Sistema de acentos por aplicación"
  (`docs/marca-acentos-por-app.md`) ya asignaba el celeste `#34B3DE` como
  acento exclusivo de **Control EPP (HT-AP-02)**, justamente para que cada
  app interna se distinga a golpe de vista por su color de acento. Este
  rediseño asignó el mismo celeste al CRM, lo que contradice ese propósito
  — hoy EPP y el CRM comparten el mismo acento. Falta que Gerencia decida
  entre: (a) actualizar el anexo para reasignar el acento del CRM a otro
  color, (b) reasignar el acento de EPP, o (c) aceptar formalmente que
  ambas apps compartan celeste y ajustar el anexo en consecuencia.

## 10. Modelo de datos — tablas y campos agregados desde el documento base original

- **Usuarios/roles:** `users.rol` admite `jefe_comercial`.
- **Contactos:** `vendedor_id`, `vendedor_asignado_en`.
- **Productos:** `marca`, `url_imagen`, `atributos` (JSONB),
  `descripcion_completa`.
- **Pipeline:** tabla `pipeline_etapas` (nombre, orden, probabilidad_cierre,
  tipo, activo); `negocios.etapa_id` (FK) + `negocios.probabilidad_cierre`.
- **Cotizaciones:** `iva_pct`; tabla `config_empresa` (emisor/banco);
  `cotizacion_correlativo_global` (correlativo NNNNNN, reemplaza el
  correlativo por año); `cotizacion_items` agrega `mostrar_imagen`,
  `mostrar_descripcion`, `mostrar_ficha`.
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

## 11. Integraciones externas

- **Brevo (SMTP):** correos transaccionales y envío de cotizaciones.
  Remitente genérico con "Responder a" = vendedor.
- **WhatsApp Cloud API (Meta):** bot, Bandeja, envío de cotizaciones y
  adjuntos. App en modo desarrollo (número de prueba, máx. 5 destinatarios).
- **Cloudflare R2:** dos buckets — `crm-ht-adjuntos` (privado, WhatsApp) y
  `crm-ht-productos` (público, catálogo de imágenes/fichas).
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

## 12. Pendientes abiertos (consolidado de todas las notas)

- **Publicar la app de Meta** y migrar del número de prueba al de
  producción (requiere verificación de negocio en Meta).
- **Plantillas de mensaje aprobadas por Meta**, para responder fuera de la
  ventana de 24 h en conversaciones cerradas.
- **Correo del vendedor como remitente real** de las cotizaciones: en
  evaluación entre autenticar el dominio en Brevo, envío nativo vía
  Microsoft Graph, o el SMTP directo de Microsoft 365 recién habilitado por
  soporte (§11) — falta la prueba real.
- **Canal de correo como fuente de leads** (paralelo al canal web),
  requiere definir la integración con el proveedor de correo.
- **Rotar el token de acceso de R2** usado en la carga masiva por `rclone`:
  las credenciales se compartieron en texto plano durante la configuración.
- **Fijar `COTIZACION_CORRELATIVO_INICIAL`** en Railway antes de que se
  genere la primera cotización con el nuevo formato de numeración (§4).
- **Conflicto de acento de marca** entre EPP y CRM (§9) — pendiente de
  decisión de Gerencia sobre el anexo de marca.
- Hidroneumáticos y Filtros de piscina: la columna "Descripción" ya está en
  sus plantillas de importación (§2), pero el Excel real de esas dos
  categorías aún no la trae completa.

---

*HidroTecnica SpA — HT-AP-03 Documento Consolidado · Borrador para validación de Gerencia*
