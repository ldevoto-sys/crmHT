# HT-AP-03 — Nota de cambio v1.46 (09/10/2026)

> **Estado: solo en rama de desarrollo / `staging`.** No promovido a `main`.
> Requiere el OK de Luis Devoto (más confirmación adicional si el push cae en
> horario laboral). **Documentar como instructivo en SharePoint antes de pasar
> a producción**, según la norma de la empresa.

## Mensajes de WhatsApp dentro de la ventana de 24 h: sin plantilla

### Problema
Las 3 plantillas que usa el CRM (`envio_cotizacion_v2`, `seguimiento_coti`,
`vencimiento_cotizacion`) están en categoría **Marketing** en Meta, a **78,49
CLP por mensaje entregado** (estadísticas de Meta, 2–9 oct 2026). El CRM las
enviaba siempre como plantilla, aunque el cliente hubiera escrito hace pocas
horas. Dentro de la ventana de 24 h, el mismo contenido como texto libre o
mensaje interactivo **no tiene costo**.

Datos del CRM (25 sep – 9 oct): de los envíos, 144 de 166 de "Envío de
cotización" y 104 de 271 de "Seguimiento" caían dentro de la ventana.

### Qué cambia
1. **Regla de envío** (`services/whatsappVentana.js`): si el último mensaje
   **entrante** del cliente tiene menos de **23 h** (margen sobre las 24 h de
   Meta; variable opcional `WHATSAPP_VENTANA_MARGEN_HORAS`, 1–24), el mensaje
   sale como texto libre / interactivo. Si no, sale la plantilla como antes.
   Si Meta rechaza el envío libre, se reenvía como plantilla. Un error de red
   ambiguo no se reintenta (evita duplicados).
2. **Dónde aplica:**
   - Envío de cotización por WhatsApp (`POST /cotizaciones/:id/enviar-whatsapp`).
   - Pasos de secuencia por WhatsApp: envío de cotización, seguimiento y
     vencimiento.
   - **No cambia:** reabrir conversación (siempre plantilla; por definición la
     conversación está cerrada) ni los mensajes que redactan los vendedores.
3. **Botones.** Seguimiento y vencimiento llevan 2 botones. Dentro de la
   ventana salen como mensaje interactivo con botones de respuesta rápida
   (Meta limita el título a 20 caracteres): *Necesito más info* y *No compraré*.
   Al responder, el CRM registra y procesa el texto de la plantilla
   ("Necesito más información" / "No realizaré la compra"), así el flujo
   (Perdido + encuesta de causa, o Negociación) es idéntico en ambos caminos.
   La correlación con el negocio (`whatsapp_correlacion`) se mantiene para
   `seguimiento_coti`.
4. **Registro del ahorro:** nueva columna `whatsapp_mensajes.canal_envio`
   (`'libre'` | `'plantilla'` | NULL) y texto distinto en la Bandeja y en la
   línea de tiempo del negocio. Migración con `IF NOT EXISTS`.
5. Los textos libres replican el cuerpo de las plantillas en Meta. **Si se edita
   una plantilla en Meta, hay que actualizar el texto en
   `services/secuencias.js` (`libre`) y en `routes/cotizaciones.js`.**

### Cómo se probó
- Postgres real: migración idempotente (2 arranques), columna y CHECK; ventana
  con margen 23 h vs 24 h; cliente sin mensajes entrantes → plantilla.
- Lógica de envío con Meta simulado: ventana abierta → libre; cerrada →
  plantilla; rechazo de Meta → plantilla; error de red → no reenvía; botones.
- Respuesta al botón interactivo `no_compra` con correlación real: el negocio
  pasa a Perdido y la Bandeja registra el texto canónico.
- **Pendiente:** prueba con WhatsApp real en `staging` (envío dentro y fuera de
  ventana, botones en el teléfono).

### Pendiente fuera del código (Meta)
- Cambiar la categoría de "Seguimiento" y "Vencimiento" a **Utilidad** (más
  barata que Marketing; Meta puede reclasificarla) o bajar la frecuencia.
  Ahorro adicional para los envíos fuera de ventana, que se siguen pagando.
- Confirmar tarifas vigentes en Meta antes de cuantificar.
- Observación: la plantilla de vencimiento tiene botones, pero solo
  `seguimiento_coti` está correlacionada con el negocio; el botón de vencimiento
  sigue pasando por la regla genérica de respuesta del cliente (v1.42), sin
  cambios.
