# HT-AP-03 — Nota de cambio v1.39 (30/09/2026)

## WhatsApp: un lead por conversación (fin de los leads duplicados)

Pedido de Luis Devoto (30-09-2026): que los leads de WhatsApp dejen de inflarse
hacia adelante. Lo pasado no importa; importa que desde ahora un lead sea una
conversación real y no un mensaje.

### Qué pasaba

Por cada mensaje que escribía un cliente, el bot creaba **otro lead nuevo**
cuando el último lead de ese contacto no tenía estado del bot. Datos de
producción al 30-09-2026 (diagnóstico de solo lectura):

- 2.914 leads de WhatsApp para unos 450 a 600 contactos.
- 2.255 (77%) creados a menos de 60 minutos de otro lead del mismo contacto;
  475 contactos afectados; contactos con 31, 25 y 22 leads.
- 2.484 leads "nuevo" sin vendedor (la cola de asignación inflada).
- 88% de los leads sin estado del bot se crearon en horario laboral
  (clasificación aproximada: L-V 9:00 a 17:30, sin feriados).

**Consecuencia:** toda cifra calculada sobre leads (tasa de conversión, leads
sin asignar) salía distorsionada.

### Causa raíz

`routes/public.js#procesarMensaje` solo reutilizaba un lead si estaba en
`esperando_categoria` o `recontactando`. Los leads que quedan **sin estado del
bot** (`bot_estado` vacío) nunca se reutilizaban: los deja así la rama de
"fuera de horario", la de "categorización desactivada" y las asignaciones
manuales desde la Bandeja. Con la categorización desactivada en producción
(confirmado por Luis en Config → Bot de WhatsApp), todos los mensajes en
horario caían en esa rama.

### Qué se cambió

Solo `backend/routes/public.js`. Sin migración de schema ni cambios de datos.
Un **lead abierto que el bot nunca manejó** (estado `nuevo` o `asignado`, sin
`bot_estado`) ahora se reutiliza:

- Fuera de horario: el mensaje se anota en ese lead en vez de crear otro.
- En horario, con el lead ya asignado a un vendedor, o con la categorización
  desactivada: solo se registra el mensaje. No se crea otro lead ni se
  reinicia nada.
- En horario, con la categorización activa y el lead "nuevo" (creado fuera de
  horario): se usa ese mismo lead para iniciar la categorización, en vez de
  dejarlo huérfano y abrir otro.
- **Lead cerrado** (`convertido` o `descartado`): un cliente que vuelve abre un
  **lead nuevo**, y los mensajes siguientes reutilizan ese nuevo lead
  (decisión de Luis Devoto, 30-09-2026).

### Qué no cambia

- **Leads ya derivados por el bot** (`bot_estado = 'derivado'`): comportamiento
  idéntico al anterior. Un cliente con lead derivado sigue en ese lead aunque
  esté cerrado; no abre uno nuevo. Si se quisiera que también abran lead
  nuevo, es un cambio aparte.
- **Los leads que ya existen**, incluidos los 2.484 sin asignar de la cola.
  Limpiarlos es una decisión aparte, con respaldo previo.
- El flujo del bot con categorización activa en horario (primer mensaje,
  lista de categorías, derivación).
- Las cuentas que no son la de Ventas (ya reutilizaban el último lead).

### Efecto a vigilar

Un cliente que vuelve después de que su lead se cerró abre un lead "nuevo"
**sin vendedor**: no hereda el del lead anterior. Con la categorización
desactivada queda en la cola de asignación manual, y en la Bandeja la
conversación puede aparecer "sin asignar" hasta que alguien lo tome.

### Cómo se probó

Servidor real, Postgres con el schema real y mensajes de WhatsApp firmados como
los de Meta (el CRM no envía nada sin credenciales de WhatsApp). 10
verificaciones sobre 9 escenarios:

1. Categorización desactivada, en horario, 5 mensajes seguidos.
2. Categorización activa, fuera de horario, 5 mensajes seguidos.
3. Categorización activa, en horario, 5 mensajes (flujo normal del bot).
4. Primero de noche y después de día, con categorización activa.
5. Lead ya asignado a un vendedor.
6. Lead cerrado como `convertido` y cliente que vuelve.
7. Lead cerrado como `descartado`, con categorización activa.
8. Lead derivado y abierto (sin cambios).
9. Lead derivado y cerrado (sin cambios).

**Antes del cambio fallaban 6 verificaciones** (5 mensajes creaban 5 leads, un
lead asignado terminaba con 3, etc.). **Después pasan las 10.** No se probó
contra datos reales de producción.

### Para analizar

Desde el día del despliegue, los leads nuevos equivalen a conversaciones. Para
cualquier análisis que cruce fechas anteriores, contar **contactos** y no leads.
