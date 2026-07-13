# HT-AP-03 — Nota de cambio v1.3 → v1.4

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.3 → v1.4
**Fecha:** 2026-07-11
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Hacer configurables las etapas del pipeline e incorporar
probabilidad de cierre (pipeline ponderado).

---

## 1. Etapas del pipeline configurables

Las etapas dejan de ser una lista fija. El **administrador** las gestiona desde
"Config pipeline": agregar, renombrar, reordenar, cambiar su % y desactivar.

- **Etapas terminales protegidas:** "Ganado" (tipo `ganada`) y "Perdido"
  (tipo `perdida`) no se pueden eliminar ni desactivar, porque disparan la
  lógica de cierre (causa obligatoria al perder, y en etapas siguientes la
  nota de venta Softland y la encuesta).
- Las etapas intermedias (`abierta`) son libres. No se puede eliminar una
  etapa con negocios dentro (primero se mueven o se desactiva).

## 2. Probabilidad de cierre (pipeline ponderado)

- Cada etapa tiene una **probabilidad de cierre por defecto** (%). Seeds:
  Lead 10, Calificado 25, Cotizado 50, Negociación 75, Ganado 100, Perdido 0.
- Cada **negocio hereda** el % de su etapa y puede **ajustarlo individualmente**.
- Al cambiar de etapa, el % del negocio se actualiza al de la nueva etapa
  (el vendedor puede volver a ajustarlo).
- El pipeline muestra, por columna, el monto total y el **monto ponderado**
  (Σ monto × probabilidad).

## 3. Ajuste al anti-alcance (§1)

El anti-alcance excluía "forecasting". Esta nota **acota y permite** un
forecasting simple: pipeline ponderado por probabilidad. **No** se incluye
scoring predictivo ni proyecciones automáticas; el % lo fija la configuración
o el vendedor, no un modelo.

## 4. Rol configurador

Por ahora **solo el administrador** configura el pipeline. Si en el futuro se
crea un rol "jefe comercial", heredará este permiso (queda pendiente y
documentado, sin implementar aún).

## 5. Impacto en el documento base

- **§6 (Modelo de datos):** nueva tabla `pipeline_etapas`
  (nombre, orden, probabilidad_cierre, tipo, activo). `negocios.etapa` (enum)
  se reemplaza por `negocios.etapa_id` (FK) + `negocios.probabilidad_cierre`.
- **§10 / §11:** endpoints `config/pipeline-etapas` y pantalla "Config pipeline"
  (admin). El cambio de etapa usa `etapa_id`.
- **§14:** *Etapas de pipeline* → configurables por administrador, con % de
  cierre por defecto y ajustable por oportunidad; terminales protegidas.

Sin más cambios.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.4 · Borrador para validación de Gerencia*
