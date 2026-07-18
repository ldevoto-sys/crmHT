# HT-AP-03 — Nota de cambio v1.8 → v1.9

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.8 → v1.9
**Fecha:** 2026-07-18
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Etapa 4 — integración de WhatsApp (bot de categorización y
recontacto, Bandeja de conversaciones, adjuntos y medios) y envío de
cotizaciones por correo y WhatsApp desde la plataforma, con seguimiento
automático post-envío. Puntos que requieren validación de Gerencia o de IT
se marcan explícitamente.

---

## 1. Envío de cotizaciones desde el CRM (correo y WhatsApp)

- El detalle de la cotización tiene un botón único **"Enviar cotización"**
  con dos casillas (Correo / WhatsApp), que se deshabilitan solas si el
  contacto no tiene el dato correspondiente (email o teléfono). Permite
  enviar por ambos canales a la vez.
- **Correo:** usa el SMTP existente (cuenta "rindelukas" en Brevo), con el
  vendedor como "Responder a" para que la respuesta del cliente le llegue
  directo a él. **Pendiente de IT:** que cada cotización salga literalmente
  desde el correo del vendedor requiere autenticar el dominio
  hidrotecnica.cl en Brevo o el envío nativo de Microsoft Graph; mientras
  eso no esté, se usa el Responder a como solución intermedia.
- **WhatsApp:** envía el PDF como documento adjunto, con un mensaje de
  acompañamiento **editable** (Configuración → Datos de empresa → "Mensaje
  al enviar cotización por WhatsApp").
- En ambos casos, si el envío falla (SMTP caído, token de WhatsApp vencido,
  etc.), no se marca la cotización como enviada ni se dispara ningún
  seguimiento — se informa el error tal cual lo entrega el proveedor,
  traducido a un mensaje entendible (ver §4).

## 2. Secuencia de seguimiento automática post-cotización

- En Configuración → Secuencias, una secuencia puede marcarse como
  **"Predeterminada"** para dispararse sola al enviar una cotización (por
  cualquiera de los dos canales). Solo puede haber una marcada a la vez.
- Al enviar, si el negocio ya tenía otra secuencia corriendo, se **cancela y
  se reemplaza** por la predeterminada — se asume que, al mandar una
  cotización, el cliente ya respondió, así que el seguimiento "post
  cotización" prevalece sobre cualquier secuencia de contacto inicial. Si
  ya era esa misma la que estaba corriendo, no se reinicia.
- Si no hay ninguna secuencia marcada como predeterminada, no se dispara
  nada (comportamiento igual al de antes de este cambio).

## 3. Bot de WhatsApp (categorización y recontacto automático)

Integración con la Cloud API de WhatsApp (Meta), con la app y el número de
prueba configurados por IT/Gerencia. **Pendiente:** la app de Meta sigue en
modo desarrollo (sin publicar) — solo puede enviar/recibir con números
agregados como destinatarios de prueba (máx. 5). Publicarla para uso
general con clientes reales requiere completar la verificación de negocio
de Meta y migrar del número de prueba al número de producción de
Hidrotécnica.

- **Horario de atención configurable** (Configuración → Bot de WhatsApp):
  días hábiles y horas de inicio/fin (por defecto L–V 9:15–17:15). Se
  evalúa en hora de Chile (America/Santiago) sin importar en qué huso
  horario corra el servidor.
- **Fuera de horario:** se envía un mensaje automático avisando el horario
  de atención y se registra el lead, sin más acción del bot.
- **En horario hábil:** el bot pregunta la categoría de la consulta
  mediante una lista de opciones editable (texto y categoría de cada
  opción, usada por el motor de asignación existente — mismas reglas que
  el canal web).
- **Decisión de diseño explícita (validada con Gerencia):** el bot **no
  escala a un vendedor** si el cliente no responde a la categorización — el
  tiempo del equipo comercial se reserva para leads ya calificados. En vez
  de eso:
  - Se reintenta con una **secuencia de recontacto configurable** (por
    defecto: 1 h, 8 h y 24 h después del silencio anterior, con mensajes
    editables).
  - Si se agotan los intentos sin respuesta, el lead se **cierra
    automáticamente** con `causa_descarte = 'sin_respuesta_bot'`, un campo
    nuevo en `leads` pensado para poder medir a futuro la fuga en el flujo
    de entrada (cuántos leads se pierden por no responder, sin que eso
    consuma tiempo de vendedores).
  - Un mensaje de confirmación (editable) se envía apenas el cliente elige
    una opción, antes de derivarlo a un vendedor.
- Igual que el canal web: si el motor de asignación no encuentra vendedor
  disponible, el lead queda en estado "nuevo" con solo una sugerencia (para
  asignar a mano desde Cola de asignación), nunca "asignado" sin dueño.
- El motor de secuencias de negocio (no el del bot) también puede marcarse
  para **respetar el horario de atención** (un paso vencido fuera de
  horario espera a que abra antes de generar la tarea).

## 4. Bandeja WhatsApp (conversación completa, no solo el bot)

Reemplaza el placeholder que existía en el menú por una pantalla real de
conversaciones, para que un vendedor atienda por WhatsApp desde la
plataforma una vez que el bot deriva el caso.

- **Historial completo:** se registra todo mensaje entrante y saliente
  (del bot, del cliente y del vendedor), independiente del estado del lead.
- **Filtros:** por vendedor, por estado (nuevo/asignado/convertido/
  descartado — mismas categorías que Cola de asignación) y por conversación
  abierta/cerrada.
- **Responder desde la plataforma:** el vendedor escribe y envía sin salir
  del CRM. Incluye selector simple de emojis.
- **Adjuntos y medios** (requiere Cloudflare R2, ver §5): el vendedor puede
  adjuntar archivos (hasta 16 MB, el límite de WhatsApp); si el cliente
  manda una foto, audio, video o documento, se descarga automáticamente y
  se puede ver inline en el hilo (imagen/audio/video) o descargar
  (documento).
- **Cierre de conversación:** además del cierre automático por 24 h sin
  actividad (ventana de mensajería de Meta: fuera de ella solo se pueden
  mandar plantillas pre-aprobadas, no texto libre — **plantillas quedan
  pendientes para una próxima etapa**), un vendedor/admin puede cerrarla a
  mano en cualquier momento. Se reabre sola si el cliente vuelve a
  escribir.
- **Acceso configurable** (Configuración → Bot de WhatsApp): "cualquier
  vendedor puede ver y responder todas las conversaciones" (por defecto) o
  "solo el vendedor asignado al lead/negocio". Administrador, jefe
  comercial, callcenter y gerencia siempre ven todo — el toggle solo
  restringe al rol vendedor.
- Los errores más comunes de la Cloud API (token vencido, número no
  autorizado en modo de prueba, fuera de ventana de 24 h) se traducen a
  mensajes en español entendibles por quien usa el CRM, en vez de mostrar
  el JSON técnico de Meta.

## 5. Almacenamiento de adjuntos (Cloudflare R2)

- Se creó un bucket privado en Cloudflare R2 (`crm-ht-adjuntos`) dedicado a
  los archivos de WhatsApp — **no** es de acceso público.
- El acceso de la aplicación queda acotado por un token de API de R2 con
  permiso "Object Read & Write" restringido a ese bucket únicamente (no a
  toda la cuenta de Cloudflare).
- El control de quién puede ver un archivo lo sigue haciendo el CRM (mismo
  criterio de acceso a la conversación), no una URL pública fija: el
  backend descarga el archivo de R2 y lo entrega solo a un usuario
  autorizado. Para que Meta reciba un adjunto que sube un vendedor, se usa
  una URL firmada de validez corta (minutos), suficiente para que Meta la
  descargue una sola vez.

## 6. Impacto en el documento base

- **§6 (Modelo de datos):**
  - `leads`: nuevos campos `causa_descarte`, `bot_estado`,
    `bot_paso_recontacto`, `bot_proxima_accion` (seguimiento del bot,
    independiente del `estado` nuevo/asignado/convertido/descartado ya
    existente).
  - `secuencias`: nuevos campos `respetar_horario` y
    `es_default_post_cotizacion`.
  - `config_empresa`: nuevo campo `mensaje_cotizacion_whatsapp`.
  - Tablas nuevas: `config_horario_atencion`, `whatsapp_bot_config`,
    `whatsapp_recontacto_pasos`, `whatsapp_mensajes` (historial completo,
    con soporte de adjuntos: `tipo`, `archivo_key`, `archivo_nombre`,
    `archivo_mime`), `whatsapp_conversaciones` (cierre manual).
- **§7 (Pipeline/motor de asignación):** se documenta que el bot de
  WhatsApp usa el mismo motor de asignación (`sugerirVendedor`) que el
  canal web, con el mismo comportamiento ante falta de vendedor disponible.
- **§9 (Integraciones):** se agrega la integración con WhatsApp Cloud API
  (Meta) y con Cloudflare R2 (almacenamiento de adjuntos), como nuevas
  dependencias externas junto a Brevo (correo).
- **§11 (Pantallas):** "Bandeja WhatsApp" pasa de placeholder a pantalla
  funcional; nuevas pantallas de configuración "Bot de WhatsApp" y campos
  adicionales en "Datos de empresa" y "Secuencias".

## 7. Pendiente para una próxima nota

- **Publicar la app de Meta** y migrar del número de prueba al número de
  producción de Hidrotécnica (requiere verificación de negocio en Meta).
- **Plantillas de mensaje aprobadas por Meta**, para poder responder fuera
  de la ventana de 24 h en conversaciones cerradas (hoy solo se puede
  responder dentro de esa ventana).
- **Correo del vendedor como remitente real** de las cotizaciones (hoy
  usa Responder a): depende de autenticar el dominio en Brevo o de envío
  nativo vía Microsoft Graph — en evaluación con IT.
- Canal de correo como fuente de leads (ver v1.8 §7), sigue pendiente.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.9 · Borrador para validación de Gerencia*
