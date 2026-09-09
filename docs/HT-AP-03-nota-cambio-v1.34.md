# HT-AP-03 — Nota de cambio v1.34

**Fecha:** 09-09-2026.
**Módulo:** Pipeline / Negocios — "Arranque de Trabajos" (Ventas →
Operaciones), Fase 1: tipo de trabajo obligatorio + Orden de Trabajo
automática.
**Estado:** implementado y **subido a `staging`** (commit `950ec17`) el
09-09-2026. Es una mejora, no la corrección de un error (salvo el fix
puntual del importador CSV, ver sección 3) — según la regla vigente
("todo se acumula en staging", 10-08-2026) no sube a `main` hasta nueva
instrucción.

## 1. Contexto

Existía una especificación funcional previa
(`Especificacion_Tecnica_CRM_Arranque_Trabajos.md`, revisada el 04-09-2026,
nunca incorporada al repo) que proponía 4 tipos de trabajo (Reparación,
Rutinario, Lavado, Especial/Proyecto) con formularios y comunicaciones
distintas para cada uno. Al retomarlo, Luis Devoto simplificó el enfoque:
**un solo flujo, sin ramificar por tipo**, con 5 tipos de trabajo reales
(mantenimiento preventivo, lavado, impermeabilizado, mantenimiento
correctivo, otro) — todos generan el mismo tipo de Orden de Trabajo, solo
cambia cómo se prellenan sus materiales/herramientas.

Decisiones explícitas de Luis Devoto (09-09-2026):
- No se toca Despacho ni Compras en esta fase.
- Mantenimiento preventivo y lavado: materiales/herramientas se definen
  **una sola vez** en un configurador (no se repiten a mano en cada OT).
- Impermeabilizado y mantenimiento correctivo: **caso a caso**, no hay
  plantilla razonable para un trabajo que varía en cada negocio.
- El aviso a cliente al pasar a "Programado" debía ser **configurable**,
  igual que las secuencias de seguimiento existentes.
- La OT puede identificarse con el mismo número que el negocio (no hace
  falta un correlativo propio).

## 2. Qué se construyó

**Gate de tipo de trabajo (`backend/routes/negocios.js`):** al entrar a la
etapa **"Aceptado"** del pipeline Operaciones se exige
`negocios.tipo_trabajo` (enum: `mantenimiento_preventivo`, `lavado`,
`impermeabilizado`, `mantenimiento_correctivo`, `otro`). El gate vive
dentro de `cambiarEtapaNegocio()` — la función compartida que ya usa tanto
el kanban manual como `/sugerencias-facturacion/:folio/confirmar` (v1.33)
— para que cualquier camino que mueva un negocio a "Aceptado" quede
protegido por igual. Cubre además `POST /negocios` (creación directa,
por si algún día la etapa "Aceptado" queda primera en el orden de un
pipeline) y el importador CSV masivo (nueva columna `tipo_trabajo` en la
plantilla).

**Orden de Trabajo automática (`backend/services/ot.js`):** al entrar a
"Aceptado" se crea sola una OT (tablas `ordenes_trabajo` + `ot_items`),
1:1 con el negocio, identificada como **`OT-{negocio_id}`** (sin
correlativo propio). Prellenado de ítems según `tipo_trabajo`:
- **Mantenimiento preventivo / lavado:** desde `ot_plantilla_items`, la
  lista estándar configurada una sola vez en
  `Config → Plantillas de Orden de Trabajo` (`backend/routes/ot_plantillas.js`,
  `frontend/src/pages/admin/ConfigPlantillasOT.jsx`).
- **Impermeabilizado / mantenimiento correctivo / otro:** caso a caso,
  copiando los ítems (producto, descripción, cantidad — **sin precio**)
  de la última versión de la cotización vigente del negocio; si no hay
  cotización, la OT nace sin ítems y se cargan a mano.

**Edición e impresión de la OT** (`backend/routes/ordenes_trabajo.js`,
`frontend/src/pages/ventas/DetalleOT.jsx`): igual patrón que una
cotización — agregar/editar/eliminar líneas de material o herramienta
(con o sin precio), observaciones, y exportar a PDF
(`services/pdf.js#generarOTPDF`, mismo layout/colores corporativos que
`generarCotizacionPDF`, sin columnas de precio/total si ningún ítem tiene
precio cargado).

**Aviso a cliente al pasar a "Programado":** no requirió código nuevo — el
motor de secuencias de seguimiento (§8 del consolidado) ya permite
asignar una secuencia a cualquier etapa del pipeline desde
`Config → Pipeline`, y un paso de canal "correo" con 0 días de espera se
envía solo apenas el negocio entra a esa etapa. Se configura como
cualquier otra secuencia, en `Config → Secuencias`.

## 3. Fix de paso (no relacionado, pero bloqueaba probar el importador)

`backend/services/import_negocios.js` / `routes/negocios.js`: el
importador CSV masivo de oportunidades (v1.21) documentaba que una fila
sin columna "estado" caía por defecto en la etapa **"Aceptado"**, pero el
código real buscaba la etapa con `tipo === 'ganada'` — es decir, caía en
**"Ganado"**. Comentario y código no coincidían; el código estaba mal.
Corregido para matchear por nombre ("aceptado"), consistente con el
comentario original y con el texto ya existente en la UI de importación.

## 4. Qué NO hace (fuera de alcance de esta fase)

- No construye un motor de checklist obligatorio configurable por etapa
  — sigue siendo el mayor hueco de diseño pendiente (el único gate de
  etapa, además del de tipo de trabajo, es el de causa de no cierre).
- No agrega una tabla de "Contrato" para servicios recurrentes — sigue
  existiendo solo `negocios.n_oc` (N° de orden de compra).
- No toca Despacho ni Compras — decisión explícita de esta fase.
- No agrega firma digital de cliente en sitio.
- No da de alta un número de WhatsApp de Operaciones.

## 5. Pendiente

- Validar en staging con datos reales de Operaciones (tipos de trabajo,
  plantillas de materiales/herramientas).
- Configurar en `Config → Secuencias` + `Config → Pipeline` el aviso real
  de "Programado" cuando Operaciones defina el contenido.
- No sube a `main` mientras siga el modo "todo se acumula en staging"
  vigente desde el 10-08-2026, salvo el fix del importador CSV si se
  decide subirlo antes por separado (es corrección de error, no mejora).

## 6. Archivos

`backend/db.js`, `backend/routes/negocios.js`,
`backend/routes/ordenes_trabajo.js` (nuevo),
`backend/routes/ot_plantillas.js` (nuevo), `backend/server.js`,
`backend/services/import_negocios.js`, `backend/services/ot.js` (nuevo),
`backend/services/pdf.js`, `frontend/src/App.jsx`,
`frontend/src/components/Layout.jsx`,
`frontend/src/pages/admin/ConfigPlantillasOT.jsx` (nuevo),
`frontend/src/pages/ventas/DetalleNegocio.jsx`,
`frontend/src/pages/ventas/DetalleOT.jsx` (nuevo),
`frontend/src/pages/ventas/ImportarNegocios.jsx`.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.34*
