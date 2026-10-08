# HT-AP-03 — Nota de cambio v1.44 (08/10/2026)

> **Estado: solo en `staging`.** No promovido a `main`. Requiere el OK de
> Luis Devoto (más confirmación adicional si el push cae en horario laboral).

## OT: de "bloquear" a "alertar"

### Problema
Desde v1.40, mover un negocio de Operaciones a **Programado** o **Ejecutado**
exigía fecha programada, horas, técnicos (y, en Ejecutado, fecha de ejecución y
horas ejecutadas). Quien no tenía todos los datos no podía mover la tarjeta y
dejó de actualizar el Pipeline. El Importador de oportunidades rechazaba las
filas incompletas por lo mismo (51 de 51 en la planilla de prueba del
07-10-2026, con otras causas mezcladas).

### Qué cambia
1. **Ya no bloquea** (kanban, ficha del negocio, edición de la OT, actualización
   masiva por CSV e importador). El modal sigue pidiendo los datos; si faltan,
   muestra "Quedará pendiente: …" y el botón pasa a **"Mover sin completar"**.
   El importador carga la fila igual y deja una advertencia.
2. **Sigue bloqueando:** el **tipo de trabajo** al pasar a Aceptado (o a
   Programado/Ejecutado si el negocio no tiene OT todavía), porque sin él no se
   puede crear la OT; la **causa de no cierre** al marcar Perdido; y los datos
   mal escritos (horas ≤ 0, fecha inválida, técnico que no es técnico).
3. **Alerta en rojo, calculada.** No se guarda ninguna marca en la OT: cada vez
   que se abre el Pipeline, la OT o se arma el correo, el sistema mira la etapa
   y los datos actuales (`services/ot.js#alertasOT`). Al completar el dato, la
   alerta desaparece sola. Textos: *Sin fecha programada, Sin horas
   programadas, Sin técnicos, Sin fecha de ejecución, Sin horas ejecutadas*.
   Se ve en la tarjeta del Pipeline y en la ficha de la OT.
4. **Correo diario a las 8:00** (hora de Chile, día hábil según Config →
   horario y feriados), solo si hay pendientes: cada vendedor recibe las OT
   de sus negocios; el **jefe comercial** recibe todas (con columna Vendedor),
   porque carga las horas. Un vendedor que también es jefe recibe solo la lista
   completa. Corre solo en producción; en staging se prueba con
   `POST /api/reportes/ot-pendientes/enviar-ahora` (administrador o jefe
   comercial). Control de envío: tabla `ot_alertas_envios`.
5. **Reporte OT's:** avisa en rojo cuántas OT tienen datos sin completar y
   cuántas ejecutadas del período suman 0 horas-hombre por falta de horas o
   técnicos. Antes, una OT sin fecha de ejecución simplemente no aparecía en
   "ejecutadas" y una sin horas sumaba 0 sin avisar.

### No cambia
- Las OT anteriores a v1.40 (`exige_programacion = false`) no generan alerta,
  igual que antes no se bloqueaban.
- Quién puede editar la OT (vendedor dueño, jefe comercial, administrador); el
  técnico sigue en solo lectura.
- Sin migración de datos: solo la tabla de control `ot_alertas_envios`.

### Decisiones de Luis Devoto (08-10-2026)
- Solo el tipo de trabajo sigue bloqueando.
- Alerta en texto rojo en cada OT con lo que falta; correo diario 8:00.
- Las horas las carga el jefe comercial.
- No se implementó escalamiento por días (no se pidió).

### Cómo se probó
Servidor real + Postgres con el schema real: paso a Programado/Ejecutado sin
datos (200, antes 400), alertas en `GET /negocios` y en la OT, completar
parcial y total (la alerta se achica y desaparece), horas inválidas siguen
rechazadas (400), sin tipo de trabajo sigue bloqueando (400), OT anterior a
v1.40 sin alerta, importador (3 de 5 filas cargadas: la de horas "8:00" y la
sin tipo de trabajo siguen rechazadas), reparto de destinatarios (jefe recibe
todo, vendedor lo suyo, jefe-vendedor un solo correo), contenido del correo y
KPI del reporte (9 incompletas, igual al aviso). Frontend compila. **No se
probó el envío real por Brevo** (sin clave en el entorno de prueba) ni con
datos de producción.
