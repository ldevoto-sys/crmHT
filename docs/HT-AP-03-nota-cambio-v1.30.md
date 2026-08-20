# HT-AP-03 — Nota de cambio v1.30

**Fecha:** 20-08-2026.
**Módulo:** Cotizaciones (listado), Motor de seguimiento (secuencias).
**Estado:** Implementadas y verificadas localmente contra Postgres real,
subidas a `staging`. Pendiente de promover a `main` — a la espera de
instrucción de Gerencia (regla vigente desde el 10-08-2026: solo se
promueve a `main` por error, no por mejora, hasta nuevo aviso).

## 1. Listado de Cotizaciones: etapa del pipeline en vez de estado del documento

**Problema que resuelve:** la columna "Estado" del listado mostraba el
ciclo de vida del documento (borrador/enviada/vista/...), que no es lo
que se quiere ver de un vistazo — la etapa real del negocio en el
pipeline (Lead, Cotizado, Ganado, Perdido, ...) es la información
relevante ahí.

**Qué hace:** la columna (renombrada "Etapa") ahora muestra
`pipeline_etapas.nombre`, coloreada por tipo (abierta/ganada/perdida).
El estado del documento sigue existiendo en la base y en el detalle de
la cotización — solo se sacó de este listado.

- `backend/routes/cotizaciones.js`: `LEFT JOIN pipeline_etapas` en el
  GET de listado (ya existía en el GET de detalle).
- `frontend/src/pages/ventas/Cotizaciones.jsx`.

## 2. Se puede editar una secuencia aunque ya tenga casos o historial

**Problema que resuelve:** el `PUT` de una secuencia rechazaba con
`409` si **alguna vez** se había ejecutado cualquiera de sus pasos —
sin importar si el caso ya había terminado. Forzaba a desactivar y
crear una secuencia nueva para cualquier ajuste menor.

**Qué hace:** se sacó esa validación. Los negocios en curso avanzan
por **número de orden** del paso, no por su `id` — así que retoman la
versión nueva de la secuencia solos, la próxima vez que les toque
avanzar, sin ninguna migración manual.

- `backend/routes/secuencias.js`: se quita el chequeo `enUso`.
- `backend/db.js`: la llave foránea `secuencia_ejecuciones.paso_id`
  pasa a `ON DELETE SET NULL` (antes bloqueaba el borrado de un paso
  usado con un error de base de datos crudo, no un mensaje claro — el
  candado que se sacó existía justamente para no llegar a ese error).
  El log de ejecución queda igual, solo pierde la referencia al paso
  exacto si éste se elimina en una edición.

**Verificado:** se editó una secuencia con un caso activo a mitad de
camino (paso 1 ya ejecutado); el caso continuó con los pasos de la
versión editada sin intervención manual.

## 3. Nuevo paso de secuencia: "cambiar etapa"

**Problema que resuelve:** no había forma de que una secuencia hiciera
algo distinto de enviar un mensaje al terminar — por ejemplo, mover el
negocio a "Perdido" si no hubo respuesta tras varios intentos de
seguimiento.

**Qué hace:** nuevo canal de paso, `cambiar_etapa`, junto a los ya
existentes (correo/whatsapp/llamada/tarea):

- En vez de mensaje, se elige una **etapa destino** del pipeline. Si
  esa etapa es de tipo "perdida", además se exige una **causa de no
  cierre** (ya existe "Sin respuesta" como causa precargada).
- El "tiempo de espera" antes de ejecutar el cambio es el mismo
  `días/horas de espera` que ya tiene cualquier paso — no es un
  concepto nuevo.
- Si el contacto responde antes de llegar a este paso (secuencia
  pausada a mano vía `/marcar-respondido`), el paso nunca se ejecuta —
  mismo mecanismo de pausa que ya existía, sin cambios.
- Reutiliza exactamente el mismo camino que mover una etapa a mano
  desde el Pipeline (kanban): actualiza `negocios`, cierra/abre fila en
  `negocio_etapa_historial`, registra en el timeline, dispara
  `alCambiarEtapa` (cancela otras secuencias, encuesta de satisfacción
  si la etapa destino es "Ganado", etc.) y marca la propia secuencia
  como `completada`.

**Límite conocido, ya documentado en el código:** "sin respuesta" hoy
depende 100% de que alguien marque la respuesta a mano
(`/marcar-respondido`) — no hay detección automática de respuestas
entrantes por correo o WhatsApp todavía.

- `backend/db.js`: `secuencia_pasos.canal` acepta `'cambiar_etapa'`;
  columnas nuevas `etapa_destino_id`, `causa_no_cierre_id`; `mensaje`
  pasa a nullable (no aplica a este canal).
- `backend/routes/secuencias.js`: `validarPasos` valida etapa destino y
  causa de no cierre.
- `backend/services/secuencias.js`: `cambiarEtapaSeguimiento()`.
- `frontend/src/pages/admin/ConfigSecuencias.jsx`: selector de etapa
  destino y, si corresponde, de causa de no cierre.

**Verificado:** secuencia de 2 pasos (correo + cambiar_etapa) sobre un
negocio real; el paso 2 movió el negocio a "Perdido" con la causa
correcta, cerró/abrió el historial de etapas y quedó registrado en el
timeline.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.30*
