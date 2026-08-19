# HT-AP-03 — Nota de cambio v1.29

**Fecha:** 19-08-2026.
**Módulo:** integración externa (API Cowork).
**Estado:** Implementada y verificada localmente contra Postgres real,
subida a `staging`. Pendiente de promover a `main` (producción) — a la
espera de instrucción de Gerencia (ver §17 del consolidado, regla vigente
desde el 10-08-2026: solo se promueve a `main` por error, no por mejora,
hasta nuevo aviso).

## GET /api/v1/negocios — listado con filtros

**Problema que resuelve:** la API solo permitía consultar un negocio si
ya se conocía su `id` (`GET /negocios/{id}`) o crear uno nuevo. No había
forma de pedir "todos los negocios de hoy" ni de ningún otro rango —
Cowork reportó (19-08-2026) que esto bloqueaba automatizar su informe
diario, ya documentado como decisión de alcance deliberada en la nota
v1.28 ("no implementado todavía") pero que en el uso real resultó ser
necesario.

**Qué hace:**

- Nuevo endpoint `GET /api/v1/negocios` con filtros opcionales por query
  string: `desde`, `hasta` (rango de fecha de ingreso, `YYYY-MM-DD`),
  `estado` (`abierta` | `ganada` | `perdida`, valida y responde
  `400 estado_invalido` si viene otro valor), `vendedor_id`, `cliente_id`,
  `origen`, y `limit` (por defecto 100, tope 200).
- Responde un arreglo plano, mismo formato de objeto que ya usan
  `POST /negocios` y `GET /negocios/{id}` (`negocioOut`) — sin
  `historial` ni `cotizaciones` anidados, para mantener el listado
  liviano. El detalle completo de un negocio puntual sigue estando en
  `GET /negocios/{id}`.
- Ordenado por fecha de ingreso descendente.
- Reutiliza el mismo join ya existente (etapa + vendedor + código
  Softland) — no agrega lógica nueva, solo la versión "listado" del
  mismo armado.

**Backend:** `backend/routes/api_v1.js` (nuevo handler `GET /negocios`,
antes del `POST /negocios` existente).

**Documentación actualizada:** `docs/HT-AP-03-documento-consolidado.md`
§18 (tabla de endpoints y lista de "no implementado"), y el anexo
"Guía de Conexión API — Cowork" (entregado directamente a Gerencia,
fuera del repositorio) — se agregó la sección 3.x del nuevo endpoint y
se sacó de "Lo que no está implementado".

## Verificación

Contra una base Postgres local (esquema real vía `initDb()`, sin datos
de producción):

- `GET /negocios` sin filtros → devuelve los negocios creados, más
  reciente primero.
- `GET /negocios?desde=<hoy>&hasta=<hoy>` → devuelve los del día.
- `GET /negocios?desde=<ayer>&hasta=<ayer>` (sin negocios ese día) →
  arreglo vacío `[]`.
- `GET /negocios?estado=abierta` → filtra correctamente por tipo de
  etapa.
- `GET /negocios?estado=cerrado` (valor inválido) →
  `400 { codigo: "estado_invalido" }`.
- `GET /negocios?origen=correo` y `?vendedor_id=<id>` → filtran
  correctamente.
- Sin token / token inválido → `401 no_autorizado` (sin cambios, mismo
  middleware que el resto de la API).

## Pendiente

- Promover a `main` cuando Gerencia lo indique.
- Cargar la sección nueva en la Guía de Conexión entregada a Cowork
  (documento vive fuera del repositorio, en Gerencia General).

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.29*
