# HT-AP-03 — Nota de cambio v1.42

**Fecha:** 07-10-2026.
**Módulo:** WhatsApp / Seguimiento comercial — respuesta del cliente a un
negocio en seguimiento.
**Estado:** Implementado y probado en `staging` (commits `b8d4886` y
`fc2870e`). **No está en `main`.** La promoción a producción requiere el OK de
Luis Devoto (más confirmación adicional si cae en horario laboral).

## 1. Problema

Una clienta con una cotización en seguimiento respondió por WhatsApp "No
realizaré la compra". El negocio no cambió de etapa y la secuencia de
seguimiento continuó: dos días después recibió el correo "Última revisión de
tu cotización".

Causa: solo el toque del botón de la plantilla "Seguimiento de cotización"
(`services/seguimientoBoton.js`) hacía algo con el negocio. Una respuesta
escrita a mano, o el botón de otra plantilla (ej. "Vencimiento de
cotización"), solo quedaba registrada en la Bandeja. Esa plantilla de
vencimiento no guarda correlación con el negocio, así que su botón tampoco
era reconocido.

## 2. Regla nueva (`services/respuestaCliente.js`)

Se aplica a todo mensaje entrante en la cuenta de Ventas, de un contacto con
negocios abiertos en la etapa **Cotizado** o con una **secuencia de
seguimiento activa**. Quedan fuera las reacciones con emoji y las solicitudes
de eliminación de datos (Ley 21.719), que revisa una persona.

| Situación | Resultado |
|---|---|
| Cualquier respuesta | Se pausa la secuencia activa del negocio (motivo "Cliente respondió"). |
| Rechazo claro y **un solo** negocio en seguimiento | El negocio pasa a **Perdido**, y se envía por WhatsApp la encuesta de causa de no cierre (mismo camino que el botón "No realizaré la compra"). El texto del cliente queda en el detalle de la causa. |
| Rechazo claro y **varios** negocios en seguimiento | No se mueve ninguno. Tarea al vendedor "Rechazo del cliente por WhatsApp: elegir negocio". |
| Otra respuesta y **un solo** negocio en Cotizado | Pasa a **Negociación**, igual que mover la tarjeta a mano (historial de etapas, línea de tiempo, secuencias de la etapa). |
| Otra respuesta y **varios** negocios en Cotizado | No se mueve ninguno. Tarea al vendedor "Cliente respondió por WhatsApp: elegir negocio". |
| Pipeline sin etapa "Negociación" activa | No se mueve. Tarea "Cliente respondió por WhatsApp". |
| Pipeline sin etapa de tipo perdida | No se mueve. Tarea "Rechazo del cliente por WhatsApp". |

Detalles:

- Cada acción queda en la línea de tiempo del negocio.
- La tarea se asigna al vendedor del negocio o, si no tiene, al del contacto.
  Si ninguno tiene vendedor, solo queda el evento en la línea de tiempo.
- No se repite una tarea pendiente igual para el mismo contacto y vendedor.
- Si Negociación tiene una secuencia propia, esta se activa al mover el
  negocio y queda pausada, porque el cliente acaba de responder.
- El botón "No realizaré la compra" / "Necesito más información" de la
  plantilla "Seguimiento de cotización" mantiene su comportamiento anterior y
  tiene prioridad. Para el rechazo se extrajo una función común
  (`marcarPerdidoPorRechazo`), usada por el botón y por el texto escrito.
- Un error en esta lógica no impide que el mensaje se registre en la Bandeja.

## 3. Detección de rechazo

Se compara el texto, sin tildes ni mayúsculas, con una lista fija de frases
(`PATRONES_RECHAZO`), solo en mensajes de hasta 300 caracteres. Ejemplos que
detecta: "no realizaré la compra", "ya no me interesa", "decidimos no
continuar", "ya compramos en otro lado", "desisto", "no gracias". No detecta
"no" suelto ni dudas ("no sé si me llegó la cotización").

**Decisión de Luis Devoto (07-10-2026):** un rechazo claro cierra el negocio
sin confirmación humana. Riesgo aceptado: una frase que parezca rechazo sin
serlo deja un negocio abierto en Perdido; se corrige moviéndolo de vuelta a
mano. Una frase de rechazo que no esté en la lista se trata como respuesta
normal.

## 4. Alcance y límites

- Sin cambios de schema ni de datos existentes.
- Solo aplica a la cuenta de Ventas. El número oficial no tiene este flujo.
- La lista de frases no interpreta el sentido del mensaje; el texto libre
  largo o ambiguo no se clasifica como rechazo.
- La secuencia pausada no se reanuda sola; se reanuda desde la ficha del
  negocio, panel "Seguimiento".

## 5. Archivos

- `backend/services/respuestaCliente.js` (nuevo).
- `backend/services/seguimientoBoton.js` (función `marcarPerdidoPorRechazo`
  extraída y exportada).
- `backend/routes/public.js` (llamada después del manejo de botones).

## 6. Cómo se probó

Postgres real con el schema del código, `initDb()` y casos: respuesta normal
con un negocio (pasa a Negociación, secuencia pausada); rechazo con un negocio
(pasa a Perdido, secuencia cancelada, encuesta programada una sola vez aunque
lleguen dos mensajes); rechazo con dos negocios (ninguno se mueve, una tarea);
dos negocios en Cotizado sin rechazo (ninguno se mueve, una tarea); contacto
sin negocios; negocio ya en Negociación; negocio Perdido (sin cambios). Prueba
de la lista de frases con 9 rechazos y 7 mensajes que no lo son.
`routes/public.js` carga sin errores sobre `staging`.

**No probado:** con un webhook real de Meta ni con un botón real de la
plantilla "Vencimiento de cotización".

## 7. Prueba sugerida en staging

Desde el número de pruebas (+56 9 8109 8161), escribir a un contacto con un
solo negocio en Cotizado: (a) una consulta normal, debe pasar a Negociación;
(b) "no gracias" en otro contacto, debe pasar a Perdido y llegar la encuesta
de causa.

## 8. Pendientes

- Promoción a `main` (requiere OK de Luis Devoto).
- Actualizar HT-AP-03 (§8 y §11) y HT-IN-05 al promover.
- Evaluar si conviene guardar la correlación también para las plantillas
  "Vencimiento de cotización" y "Envío de cotización", para reconocer sus
  botones por negocio.

---
*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.42*
