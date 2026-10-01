# HT-AP-03 — Nota de cambio v1.40 (01/10/2026)

> **Estado: en producción desde el 01-10-2026** (`main`: `ee000f3`, más el fix
> `60cd435`). Se promovió **solo Operaciones**; Cobranza sigue en `staging`.
> Ver "Despliegue a producción" al final de esta nota.

## Operaciones: programación y ejecución de la OT, y pestaña "OT's" en Reportes

Pedido de Luis Devoto (01-10-2026). **Solo en `staging`**: va junto con el resto
de "Arranque de Trabajos" (OT), que sigue sin promover a `main`.

### Campos nuevos en la Orden de Trabajo

| Campo | Cuándo se exige | Notas |
|---|---|---|
| Fecha programada para ejecutar | Al entrar a **Programado** | Es la fecha comprometida; se mantiene separada de la fecha real. |
| Horas de trabajo programadas | Al entrar a **Programado** | Por técnico, mayor a 0. |
| Técnicos que ejecutan la tarea | Al entrar a **Programado** | Uno o más, solo usuarios activos con rol `tecnico`. Editables después. |
| Horas ejecutadas | Al entrar a **Ejecutado** | Por técnico, mayor a 0, **en blanco por defecto** (no se prellena con las programadas). |
| Fecha de ejecución (real) | Al entrar a **Ejecutado** | Se pide al marcar la tarea como ejecutada. La diferencia con la programada es la **brecha**. |
| ID Fracttal | Opcional | Texto libre, hasta 100 caracteres. |

- Las reglas viven en `cambiarEtapaNegocio()` (`routes/negocios.js`), así que
  cubren el Pipeline (arrastrar o "Mover a etapa"), la ficha del negocio, las
  secuencias automáticas y la confirmación de sugerencias de facturación.
  Pipeline y ficha del negocio abren un cuadro que pide los datos; el backend
  valida igual.
- Ejecutado también exige que la OT tenga fecha programada, horas y técnicos (si no pasó antes por Programado).
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
6 horas son **18 horas-hombre**. Lo mismo vale para las horas ejecutadas (3
técnicos × 7 horas = 21 horas-hombre reales). En los reportes, las OT ejecutadas
usan las horas ejecutadas registradas; las anteriores a esta versión, que no las
tienen, se estiman con las programadas y el detalle lo marca ("estimadas con las
programadas").

### Importador de oportunidades (`/pipeline` → Importar)

Columnas nuevas: `horas_programadas`, `tecnicos` (email o nombre de usuarios con
perfil técnico, separados por `;`), `fecha_programada`, `fecha_ejecucion`
(DD-MM-AAAA), `horas_ejecutadas` e `id_fracttal`. Una fila en Programado exige fecha programada,
horas y técnicos; en Ejecutado, además la fecha de ejecución y las horas ejecutadas. Las filas que entran a Programado o Ejecutado exigen
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
tabla por técnico, tabla por tipo de trabajo (ambas con brecha promedio y % a
tiempo), programadas pendientes (con fecha programada y días de atraso), detalle OT por OT y exportación CSV.

Definiciones:

- **Valor de venta**: neto de la cotización más reciente del negocio; si el
  negocio no tiene cotización (p. ej. cargado por el importador), el
  `monto_estimado` del negocio.
- **Ejecutada**: tiene fecha de ejecución; cuenta en el período de esa fecha
  aunque el negocio ya esté en Facturado.
- **Programada**: la OT tiene fecha programada; cuenta en el período de esa
  fecha. Sin respaldo para OT antiguas: una OT sin fecha programada no cuenta
  como programada.
- **Pendiente**: hoy en Programado y sin fecha de ejecución. No depende del rango.
  **Atrasada**: pendiente con fecha programada anterior a hoy (hora de Chile).
- **Brecha** = fecha de ejecución − fecha programada, en días: positiva = se
  ejecutó después de lo programado; 0 o negativa = "a tiempo". Se muestra
  promedio y % a tiempo en las tarjetas, por técnico y por tipo de trabajo, y
  la brecha de cada OT en el detalle y el CSV. Solo existe para OT ejecutadas
  con fecha programada.
- **Por técnico**: cada técnico suma las horas completas de la OT; el valor de
  venta se reparte en partes iguales entre los técnicos de la OT, para que la
  suma coincida con el total.
- Las OT anteriores a esta versión no tienen técnicos ni horas: aparecen en los
  totales pero no en la tabla por técnico, y una OT antigua sin fecha de
  ejecución no cuenta como ejecutada.

También disponibles para Cowork vía `GET /api/v1/reportes/:tipo` con `ots_kpis`,
`ots_resumen_mensual`, `ots_por_tipo`, `ots_por_tecnico`, `ots_pendientes` y
`ots_detalle`.

### Botón "Ver OT" en el Pipeline

Las tarjetas de negocios que ya tienen OT muestran el botón "Ver OT", que abre la
ficha de la OT (`GET /api/negocios` suma `tiene_ot`).

### Técnico en Tareas: sus OT asignadas (solo lectura, sin precios)

El rol `tecnico` ahora ve **Mis Tareas** en el menú. Arriba de las tareas aparece
"Mis órdenes de trabajo":

- **Programadas**: OT donde está asignado, hoy en la etapa Programado y sin fecha de
  ejecución; las atrasadas marcadas. Muestra cliente, dirección, tipo de trabajo,
  fecha y horas programadas, otros técnicos e ID Fracttal.
- **Ejecutadas**: histórico de las OT con fecha de ejecución (incluye las que
  después pasaron a Facturado), con selector por mes/año o todo el histórico, horas
  ejecutadas y brecha contra lo programado.
- **Gerencia, administrador y jefe comercial** ven la misma sección con las OT de
  **todos los técnicos**, con selector para revisar a uno puntual.
- Cada tarjeta abre la ficha de la OT (materiales, herramientas, observaciones y
  PDF) en **solo lectura**. El técnico solo abre las OT donde está asignado (otra
  da 403) y **no ve precios** ni valor de venta, ni en pantalla ni en el PDF.
- Al iniciar sesión el técnico **entra a Tareas** (antes entraba a Servicio Técnico, que
  sigue en su menú); cualquier ruta que no le corresponda lo devuelve ahí.
- No ve negocios, contactos ni empresas; no puede editar ni mover etapas.
- API: `GET /api/ordenes-trabajo/mis-ots?estado=programadas|ejecutadas&mes=AAAA-MM|todos&tecnico_id=`;
  `GET /negocio/:id` y `GET /:id/pdf` aceptan al técnico asignado.

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
Frontend: `ReporteriaOTs.jsx`, `ModalProgramacionOT.jsx` y `MisOTs.jsx` (nuevos), `MisTareas.jsx`, `Layout.jsx`, `Pipeline.jsx`,
`DetalleNegocio.jsx`, `DetalleOT.jsx`, `ReportesHub.jsx`, `ImportarNegocios.jsx`,
`ConfigPipeline.jsx`, `App.jsx`.

### Migración de schema

`ordenes_trabajo`: columnas `horas_programadas`, `horas_ejecutadas`, `fecha_programada`, `fecha_ejecucion`, `id_fracttal`
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

### Despliegue a producción (01-10-2026)

- **Autorización:** Luis Devoto, explícita, en horario laboral ("es horario de
  trabajo, pero doy ok para pasar a production"), con la instrucción de pasar
  **solo lo de Operaciones** y dejar Cobranza en `staging`.
- **Cómo se armó:** `staging` no se podía fusionar (mezcla Cobranza y
  Operaciones, y arrastra 390 commits que en buena parte ya estaban en `main`
  con otro SHA). Se creó una rama desde `main` y, comparando contenido archivo
  por archivo: los archivos solo de OT se tomaron completos de `staging`; en los
  compartidos (`db.js`, `users.js`, `server.js`, `App.jsx`) se aplicaron solo los
  bloques sin Cobranza; en `Layout.jsx` se agregaron a mano dos líneas; no se
  promovieron `middleware/auth.js`, `routes/auth.js`, `services/email.js` ni
  `Usuarios.jsx` (solo tenían cambios de Cobranza).
- **Pruebas previas:** base creada con el schema de `main` y encima el código a
  promover; unos 40 endpoints autenticados (admin, vendedor, técnico, gerencia)
  sin ningún 500; negocios ya existentes en Aceptado/Programado sin OT; búsqueda
  de referencias a objetos de Cobranza (ninguna); frontend revisado en navegador.
- **Incidente — primer despliegue fallido (`ee000f3`):** Railway no pudo
  construir ("cannot replace to directory .../backend/node_modules with file").
  Causa: el commit incluyó por error dos **enlaces simbólicos**
  (`backend/node_modules`, `frontend/node_modules`) creados solo para probar en
  una carpeta temporal; `.gitignore` tiene `node_modules/` (carpetas) y no ignora
  enlaces. Producción **no se cayó**: Railway mantiene el despliegue anterior
  cuando un build falla. Corregido con `60cd435`, que borra solo esos dos
  archivos; antes de subirlo se reprodujo el build desde un clon limpio
  (mismo comando de `railway.json`) y se probó el arranque y `/api/health`.
  Luis confirmó que el despliegue quedó correcto.
- **Lecciones:** (1) antes de cada push a `main`, revisar la lista de archivos
  del commit (`git diff --stat origin/main HEAD`) y comprobar que no haya
  enlaces simbólicos (`git ls-files -s | grep ^120000`); (2) no usar
  `git add -A` en carpetas de prueba con enlaces; (3) un build fallido no
  tumba producción, pero una verificación contra la API puede estar leyendo la
  versión **anterior**: la confirmación del despliegue es el estado "Success" de
  Railway, no una consulta al conector.
- **Al desplegar:** los negocios que ya estaban en Programado (31) y Ejecutado
  (24) no tienen OT; al moverlos, el sistema pide tipo de trabajo y los datos de
  la etapa. Las OT que existan al migrar quedan exentas de las reglas nuevas.
  Se necesitan usuarios con rol `tecnico` para asignar técnicos.
