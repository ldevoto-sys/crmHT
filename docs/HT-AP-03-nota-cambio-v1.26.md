# HT-AP-03 — Nota de cambio v1.26

**Fecha:** 11-08-2026
**Módulo:** Negocios, Pipeline, Reportería, Correo diario.
**Estado:** Implementada, verificada localmente y desplegada en `staging`
→ `main` (producción) el 18-08-2026, por instrucción explícita de
Gerencia (Luis Devoto) — ver §17 del consolidado.

## Problema que resuelve

`negocios.monto_estimado` y las cifras mostradas en Pipeline, Dashboard,
Reportería y el correo diario tomaban el **total con IVA** de la última
cotización del negocio. Esto sobreestimaba en ~19% el tamaño real de cada
negocio y del pipeline agregado — una cotización de $1.000.000 neto
aparecía como $1.190.000, distorsionando proyecciones y comisiones
calculadas sobre esas cifras.

## Qué hace

Todo el sistema pasa a usar el **monto neto** (sin IVA) de forma
consistente:

- Al guardar o editar una cotización, `negocios.monto_estimado` se
  sincroniza con el neto (no el total).
- Backfill de una sola vez sobre negocios existentes: se recalculó
  `monto_estimado` de todo negocio con al menos una cotización, tomando
  el neto de su cotización más reciente. Se ejecuta una única vez
  (`migraciones_aplicadas.monto_estimado_neto_v1.26`), no se repite en
  arranques posteriores.
- Pipeline, Dashboard, Reportería (embudo, ranking de vendedores,
  cotizaciones por día) y el correo diario ya mostraban "monto neto" en
  su etiqueta — ahora el valor que muestran corresponde de verdad al
  neto.

### Backend

- `backend/routes/cotizaciones.js`: la sincronización de
  `monto_estimado` al guardar/editar usa el neto calculado, no el total.
- `backend/db.js`: backfill único con guarda en `migraciones_aplicadas`.

## Verificación local

Backfill probado contra Postgres real con negocios de prueba en ambos
orígenes (`venta_directa` y `operaciones`, que calculan el neto distinto
— este último no tiene descuento porcentual). Confirmado que el backfill
no se reejecuta en un segundo arranque del servidor.

## Pendientes explícitos

Ninguno — cambio autocontenido, sin dependencias externas.

---

*Historial completo de decisiones queda archivado junto a las notas
v1.2–v1.25 en `docs/HT-AP-03-nota-cambio-v1.X.md`.*
