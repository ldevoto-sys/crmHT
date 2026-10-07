# HT-AP-03 — Nota de cambio v1.42 (07/10/2026)

> **Estado: solo en `staging`.** No promovido a `main`. Requiere el OK de
> Luis Devoto (más confirmación adicional si el push cae en horario laboral).

## Respuesta del cliente por WhatsApp a un negocio en seguimiento

### Problema
Una clienta con una cotización en seguimiento respondió por WhatsApp "No
realizaré la compra". El negocio no cambió de etapa y la secuencia siguió: dos
días después recibió el correo "Última revisión de tu cotización". Causa:
solo el toque del botón de la plantilla "Seguimiento de cotización"
(`services/seguimientoBoton.js`) hacía algo con el negocio. El texto libre, o
el botón de otra plantilla (ej. "Vencimiento de cotización"), solo quedaba en
la Bandeja.

### Regla nueva (`services/respuestaCliente.js`)
Se aplica a todo mensaje entrante en la cuenta de Ventas (se excluyen
reacciones y solicitudes de eliminación de datos, que revisa una persona), de
un contacto con negocios abiertos en **Cotizado** o con una **secuencia de
seguimiento en curso**:

1. **Se pausa la secuencia** de esos negocios (motivo "Cliente respondió").
2. **Rechazo claro** ("no realizaré la compra", "ya no me interesa", "decidimos
   no continuar", "no gracias", etc.) y **un solo negocio en seguimiento**: pasa
   a **Perdido** automáticamente y se envía la encuesta de causa de no cierre
   por WhatsApp (mismo camino que el botón "No realizaré la compra"). Con
   **varios negocios** en seguimiento no se adivina cuál: tarea al vendedor
   ("Rechazo del cliente por WhatsApp: elegir negocio").
3. **Otra respuesta y un solo negocio en Cotizado**: pasa a **Negociación**,
   por el mismo camino que mover la tarjeta a mano (historial, línea de
   tiempo, secuencias). Si el pipeline no tiene etapa "Negociación" activa,
   no se mueve y se crea una tarea.
4. **Otra respuesta y varios negocios en Cotizado**: no se adivina cuál es;
   tarea al vendedor para que elija.

Cada acción queda en la línea de tiempo del negocio. No se repite una tarea
pendiente igual para el mismo contacto y vendedor. Un error en esta lógica
no impide que el mensaje se registre en la Bandeja.

### Alcance y límites
- No hay cambios de schema.
- La detección de rechazo es por frases (lista conservadora en
  `PATRONES_RECHAZO`), por decisión de Luis Devoto (07-10-2026) cierra el
  negocio sin confirmación humana. Un falso positivo (frase que parece
  rechazo y no lo es) deja un negocio abierto en Perdido; se revierte
  moviéndolo a mano. Una frase de rechazo no cubierta se trata como respuesta
  normal (pasa a Negociación si hay un solo negocio en Cotizado).
- Solo aplica a la cuenta de Ventas; el número oficial no tiene este flujo.
- La regla de "botón No realizaré la compra" de la plantilla de seguimiento
  (v1.38 y anteriores) sigue igual y tiene prioridad: pasa a Perdido y envía
  la encuesta de causa.

### Cómo se probó
Postgres real con el schema del código, `initDb()` y seis casos: respuesta
normal con un negocio (pasa a Negociación, secuencia pausada), rechazo
con un negocio (pasa a Perdido, secuencia cancelada, encuesta programada una sola vez aunque lleguen dos mensajes), rechazo con dos negocios (ninguno se mueve, una tarea), dos negocios en Cotizado (ninguno se mueve, una tarea), contacto
sin negocios, negocio ya en Negociación y negocio Perdido (sin cambios).
Prueba de la lista de frases con 9 rechazos y 7 mensajes que no lo son.
`routes/public.js` carga sin errores. No se probó con un webhook real de Meta.
