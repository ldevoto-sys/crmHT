# HT-AP-03 — Nota de cambio v1.40 (01/10/2026)

## Operaciones: programación y ejecución de la OT, y pestaña "OT's" en Reportes

Pedido de Luis Devoto (01-10-2026). **Solo en `staging`**: va junto con el resto
de "Arranque de Trabajos" (OT), que sigue sin promover a `main`.

### Campos nuevos en la Orden de Trabajo

| Campo | Cuándo se exige | Notas |
|---|---|---|
| Horas de trabajo programadas | Al entrar a **Programado** | Por técnico, mayor a 0. |
| Técnicos que ejecutan la tarea | Al entrar a **Programado** | Uno o más, solo usuarios activos con rol `tecnico`. Editables después. |
| Fecha de ejecución | Al entrar a **Ejecutado** | |
| ID Fracttal | Opcional | Texto libre, hasta 100 caracteres. |

- Las reglas viven en `cambiarEtapaNegocio()` (`routes/negocios.js`), así que
  cubren el Pipeline (arrastrar o "Mover a etapa"), la ficha del negocio, las
  secuencias automáticas y la confirmación de sugerencias de facturación.
  Pipeline y ficha del negocio abren un cuadro que pide los datos; el backend
  valida igual.
- Un negocio que llega a Programado o Ejecutado sin OT (no pasó por Aceptado)
  exige también el tipo de trabajo; la OT se crea ahí mismo.
- **Solo OT nuevas** (decisión de Luis): la columna `ordenes_trabajo.exige_programacion`
  queda en `false` para las OT que ya existían al desplegar (migración única
  `ot_programacion_v1.40`). Esas OT no se bloquean ni se les exigen los datos.
- Edición posterior: `PUT /api/ordenes-trabajo/:id/programacion` y sección
  "Programación y ejecución" en la ficha de la OT. Si el negocio está en
  Programado o Ejecutado, no se puede dejar la OT sin lo que esa etapa exige.
  Los cambios de técnicos quedan en el timeline del negocio.
- Lista de técnicos: `GET /api/users/tecnicos`.
- El PDF de la OT muestra horas, técnicos, fecha de ejecución e ID Fracttal.

### Horas-hombre

Todos los técnicos de la OT acumulan las horas completas: 3 técnicos en una OT de
6 horas son **18 horas-hombre**. No existe una hora "real": se usan las
programadas.

### Importador de oportunidades (`/pipeline` → Importar)

Columnas nuevas: `horas_programadas`, `tecnicos` (email o nombre de usuarios con
perfil técnico, separados por `;`), `fecha_ejecucion` (DD-MM-AAAA) e
`id_fracttal`. Una fila en Programado exige horas y técnicos; en Ejecutado,
además la fecha. Las filas que entran a Programado o Ejecutado exigen
`tipo_trabajo` y crean la OT con sus datos. Un técnico que no existe o no tiene
perfil técnico rechaza la fila. El `monto` sigue siendo el valor de venta de las
oportunidades sin cotización.

El **importador de actualización masiva** (por `id`) no trae estos datos: no
puede mover un negocio a Programado o Ejecutado si su OT aún no los tiene
(rechaza la fila y dice qué falta).

### Pestaña "OT's" en Reportes

Junto a Comercial, Pipeline y WhatsApp. Filtros: fechas, técnico, tipo de
trabajo y (roles que ven todo) vendedor. Contenido: tarjetas (ejecutadas,
programadas, pendientes hoy, sin cotización), OT por mes en cantidad y en valor,
tabla por técnico, tabla por tipo de trabajo, programadas pendientes (con días en
Programado), detalle OT por OT y exportación CSV.

Definiciones:

- **Valor de venta**: neto de la cotización más reciente del negocio; si el
  negocio no tiene cotización (p. ej. cargado por el importador), el
  `monto_estimado` del negocio.
- **Ejecutada**: tiene fecha de ejecución; cuenta en el período de esa fecha
  aunque el negocio ya esté en Facturado.
- **Programada**: entró a la etapa Programado (o trae horas programadas); cuenta
  en el período en que entró. No existe una "fecha programada para ejecutar":
  hoy la OT no la guarda.
- **Pendiente**: hoy en Programado y sin fecha de ejecución. No depende del rango.
- **Por técnico**: cada técnico suma las horas completas de la OT; el valor de
  venta se reparte en partes iguales entre los técnicos de la OT, para que la
  suma coincida con el total.
- Las OT anteriores a esta versión no tienen técnicos ni horas: aparecen en los
  totales pero no en la tabla por técnico, y una OT antigua sin fecha de
  ejecución no cuenta como ejecutada.

También disponibles para Cowork vía `GET /api/v1/reportes/:tipo` con `ots_kpis`,
`ots_resumen_mensual`, `ots_por_tipo`, `ots_por_tecnico`, `ots_pendientes` y
`ots_detalle`.

### Alerta si cambian los nombres de las etapas

El código reconoce **Aceptado**, **Programado** y **Ejecutado** del pipeline
Operaciones por su nombre. Para que un cambio de nombre no apague las reglas sin
que nadie se entere:

- Config → Pipeline muestra un aviso si alguna de las tres no existe o está
  inactiva en Operaciones.
- Renombrar, desactivar o eliminar una de esas etapas pide confirmación
  explícita (la API responde 409 hasta recibir `confirmar_flujo_ot`).
- La pestaña OT's muestra el mismo aviso.

### Archivos

Backend: `db.js`, `services/ot.js`, `services/reportesOT.js` (nuevo),
`services/import_negocios.js`, `services/secuencias.js`, `services/pdf.js`,
`routes/negocios.js`, `routes/ordenes_trabajo.js`, `routes/reportes.js`,
`routes/config.js`, `routes/users.js`, `routes/postventa.js`.
Frontend: `ReporteriaOTs.jsx` y `ModalProgramacionOT.jsx` (nuevos), `Pipeline.jsx`,
`DetalleNegocio.jsx`, `DetalleOT.jsx`, `ReportesHub.jsx`, `ImportarNegocios.jsx`,
`ConfigPipeline.jsx`, `App.jsx`.

### Migración de schema

`ordenes_trabajo`: columnas `horas_programadas`, `fecha_ejecucion`, `id_fracttal`
y `exige_programacion`; tabla `ot_tecnicos`. Todo con `IF NOT EXISTS`, en `db.js`.
Para la promoción a `main` (lección del 23-09): `cargarOTCompleta()` ahora
consulta `ot_tecnicos`, y la usa también el informe de Postventa
(`routes/postventa.js`); por eso estos cambios deben viajar junto con la
migración y el resto de OT, nunca por separado.

### Cómo se probó

Servidor real + Postgres 16: se creó la base con el código anterior de `staging`
(una OT existente en Programado), se arrancó el código nuevo y se verificó la
migración (la OT quedó exenta). Luego, con token real: cada validación del
Pipeline (400 sin datos, sin técnicos, técnico inválido, horas inválidas, sin
fecha; 200 con todo), salto directo sin OT, edición de técnicos con timeline,
permisos (otro vendedor 403, rol técnico sin acceso a reportes), importador
(9 filas con válidas e inválidas, preview y confirmar), actualización masiva,
confirmaciones de Config → Pipeline, los 6 reportes con valor de cotización y de
monto, filtros, CSV y PDF. El frontend compila y la pestaña, la ficha de la OT y
el cuadro de programación se revisaron en un navegador real.
