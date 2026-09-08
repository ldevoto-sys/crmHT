# HT-AP-03 — Nota de cambio v1.33

**Fecha:** 08-09-2026.
**Módulo:** Pipeline, Reportería Comercial + Softland — nueva función
"Sugerencias de facturación".
**Estado:** implementado y **subido a `staging`** (commit `d3c847a`) el
08-09-2026. Es una mejora, no la corrección de un error — según la regla
vigente ("todo se acumula en staging", 10-08-2026) no sube a `main` hasta
nueva instrucción. Pendiente de prueba con datos reales antes de darlo por
validado (ver "Pendiente" más abajo).

## 1. Contexto

Luis Devoto reportó diferencias importantes entre el monto de facturación
de septiembre visto en el pipeline del CRM y el que trae Softland. La causa
no es un error: es una decisión de diseño explícita del 19-08-2026 (ver
nota de cambio v1.31) — "Cerrado" y "Facturado" siempre se leen de Softland,
sin cruce con el pipeline, porque no todo negocio facturado en Softland
queda marcado "Ganado" en el CRM (y viceversa).

Pregunta planteada: ¿se puede, al sincronizar con Softland, identificar el
negocio del pipeline que corresponde a una factura nueva (por cliente y
monto) y moverlo automáticamente a "Facturado"?

**Se descartó la automatización total.** Con datos reales de la conversación
(planilla de facturas de septiembre + export del pipeline) se verificó que
cliente+monto no es una clave única: clientes de mantención recurrente
(ej. CENCOSUD RETAIL S.A.) repiten el mismo monto en decenas de negocios
distintos — mismo cliente, mismo vendedor, mismo monto, pero sitios/tareas
distintas. Mover un negocio solo por ese cruce sería adivinar cuál sitio
corresponde a qué folio, con riesgo real de marcar "Facturado" el negocio
equivocado sin que nadie lo note. Se optó por **sugerir, nunca mover solo**
— la persona confirma cuál negocio corresponde.

## 2. Qué se construyó

**Cruce (`backend/services/sugerenciasFacturacion.js`):** facturas de
Softland sin resolver (`reporte_softland_facturas`, aún sin `negocio_id` ni
`revisado_en`) contra negocios del pipeline, por:
- **RUT de empresa** (`empresas.rut` normalizado vs. `cod_cliente` de
  Softland, que ya viene en formato RUT) — más confiable que cruzar por
  `nombre_cliente`, que es texto libre sin garantía de coincidir con la
  razón social del CRM.
- **Monto exacto** — sin tolerancia. Una tolerancia solo ampliaría la
  ambigüedad ya detectada en clientes de mantención, nunca la reduce.
- Acotado a negocios de pipelines que tengan una etapa llamada "Facturado"
  configurada y activa (si un pipeline no la tiene, sus negocios no
  participan — no se inventa una etapa destino) y que no estén ya en
  "Facturado" ni en una etapa de tipo "perdida".

**Confirmar y descartar (`backend/routes/softland.js`):**
- `GET /api/softland/sugerencias-facturacion` — facturas pendientes con sus
  negocios candidatos.
- `POST .../:folio/confirmar {negocio_id}` — revalida el candidato contra
  el cálculo recién hecho (no confía en lo que mandó el navegador) y mueve
  el negocio a "Facturado" **reusando exactamente la misma lógica** que
  mover la tarjeta a mano en el Pipeline (historial de etapas, secuencias,
  encuesta de satisfacción si aplica) — esa lógica se extrajo de
  `PUT /negocios/:id/etapa` a una función compartida
  (`cambiarEtapaNegocio`, en `backend/routes/negocios.js`) para no
  duplicarla.
- `POST .../:folio/descartar` — marca la factura como revisada sin match;
  no vuelve a ofrecerse.
- Permisos: `administrador`, `jefe_comercial`, `gerencia` (mismo set que ya
  usa `/api/softland/sync`).

**Dónde aparece (nunca se mueve nada sin un clic humano):**
- **Pipeline** (`frontend/src/pages/ventas/Pipeline.jsx`): la tarjeta del
  negocio candidato muestra un aviso con el monto y folio de la factura
  sugerida, con botones Confirmar/Descartar ahí mismo.
- **Reportería Softland** (`frontend/src/pages/ventas/SugerenciasFacturacion.jsx`,
  pestaña nueva "Sugerencias de facturación"): vista global de todas las
  facturas pendientes con sus candidatos, para revisarlas todas juntas en
  vez de recorrer el Pipeline negocio por negocio.

**Esquema:** 3 columnas nuevas en `reporte_softland_facturas`: `negocio_id`
(se llena solo al confirmar), `revisado_por_id`, `revisado_en` (quedan
seteados tanto al confirmar como al descartar).

## 3. Qué NO hace

- No mueve ningún negocio de forma automática — el cálculo solo arma la
  lista de candidatos; el cambio de etapa lo dispara una persona.
- No resuelve la ambigüedad dentro de un mismo cliente+monto (ej. cuál de
  los 17 negocios de mantención de CENCOSUD con el mismo monto es el
  correcto) — eso lo sigue decidiendo quien confirma, con el contexto que
  no tiene el sistema (qué sitio se atendió).

## 4. Pendiente

- **Validar en staging con datos reales**: en particular, que
  `empresas.rut` esté cargado para los clientes de mantención recurrente
  (CENCOSUD y similares) — sin RUT en la ficha de empresa, el cruce no
  encuentra candidatos para esa factura, silenciosamente.
- **Opción "completa" (a explorar después, no iniciada):** capturar en
  Softland un identificador único por sitio/tarea (el código tipo
  J507/N569 que ya usan en los títulos de los negocios de mantención) en
  el campo `NumOC` de la factura — ese campo ya se sincroniza para NV
  pendientes pero no para facturas. Con eso el match dejaría de depender
  de que la persona elija entre varios candidatos idénticos y pasaría a
  ser exacto. Requiere que Operaciones cargue ese código de forma
  consistente al facturar en Softland, no solo cambio de código — a
  confirmar primero si ese campo (o alguno equivalente) efectivamente se
  usa así en la práctica.
- No sube a `main` mientras siga el modo "todo se acumula en staging"
  vigente desde el 10-08-2026 — es una mejora, no la corrección de un
  error.

## 5. Archivos

`backend/db.js`, `backend/routes/negocios.js`, `backend/routes/softland.js`,
`backend/services/sugerenciasFacturacion.js` (nuevo),
`frontend/src/pages/ventas/Pipeline.jsx`,
`frontend/src/pages/ventas/ReporteriaSoftland.jsx`,
`frontend/src/pages/ventas/SugerenciasFacturacion.jsx` (nuevo).

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.33*
