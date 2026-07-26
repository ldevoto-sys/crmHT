# HT-AP-03 — Nota de cambio v1.11 → v1.12

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.11 → v1.12
**Fecha:** 2026-07-26
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** El área de Operaciones tiene un flujo de ventas distinto y más
largo que el de Ventas Directas (cotizador propio, en evaluación de
integrarse más adelante). Se agrega la posibilidad de tener más de un
pipeline de negocios, cada uno con sus propias etapas.

---

## 1. Múltiples pipelines

- Nueva tabla `pipelines` (id, nombre, orden, activo). Al desplegar este
  cambio se crean dos: **Ventas Directas** (las 6 etapas que ya existían:
  Lead, Calificado, Cotizado, Negociación, Ganado, Perdido) y
  **Operaciones** (arranca solo con las etapas terminales Ganado/Perdido —
  las intermedias quedan a definir por el administrador, porque su flujo es
  distinto y no corresponde inventárselo).
- Cada usuario tiene un **pipeline por defecto** (`users.pipeline_default_id`).
  Los negocios que crea quedan en el pipeline del **dueño del negocio**, no
  necesariamente de quien lo crea (por ejemplo, si un jefe comercial crea un
  negocio para un vendedor de Operaciones).
- Un negocio se puede **mover a otro pipeline** — acción separada de mover de
  etapa, porque las etapas disponibles cambian según el pipeline. Restringido
  a administrador y jefe comercial.
- En Configuración → Config. pipeline, un selector permite elegir qué
  pipeline se está configurando; cada uno tiene sus propias etapas.
  **Corrección durante las pruebas del usuario:** se agregó una opción de
  subir/bajar el orden de una etapa recién creada (faltaba en la primera
  versión).

## 2. Pipeline: filtros y selector

- La pestaña Pipeline suma: selector de pipeline (Ventas Directas /
  Operaciones), filtro por vendedor y filtro por rango de fecha estimada de
  cierre.
- Reportería también suma el selector de pipeline — cada reporte (embudo,
  causas de no cierre, tiempos por etapa, ranking, cotizaciones por día) se
  filtra por el pipeline elegido (Ventas Directas por defecto).

## 3. Impacto en el documento base

- **§3 (Pipeline / Negocios):** el pipeline deja de ser único; ver §1-2
  arriba.
- **§6 (Modelo de datos):** tabla `pipelines`; `pipeline_etapas.pipeline_id`,
  `negocios.pipeline_id`, `users.pipeline_default_id` (todos `NOT NULL
  DEFAULT 1`, referencian `pipelines(id)`).

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.12 · Borrador para validación de Gerencia*
