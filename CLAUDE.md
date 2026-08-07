# CRM Comercial HidroTecnica (HT-AP-03) — instrucciones del proyecto

## Despliegue a producción (vigente desde 07-08-2026)

Promover cambios a `main` (producción) **solo fuera del horario de trabajo
de la empresa**, salvo que se trate de un **error crítico** que no pueda
esperar (el sistema caído, un flujo de venta bloqueado, pérdida de datos).

Origen de la regla: el 07-08-2026 se promovió a producción una tanda
importante de cambios (v1.24) durante horario de trabajo. Ese mismo día un
usuario (Nicolás Quezada) reportó haber sido desconectado de su sesión dos
veces mientras cotizaba, perdiendo el borrador de una cotización extensa.
Luis Devoto planteó como hipótesis que ambas cosas estén relacionadas. **No
se confirmó una relación causal** — no se investigó si un despliegue puede
efectivamente cerrar la sesión de un usuario activo — pero la regla se
adopta de todas formas como precaución.

Antes de hacer `git push origin main` (o cherry-pick a `main`):
- Confirmar que es fuera de horario de trabajo, o que el cambio es un
  error crítico.
- Si Gerencia pide explícitamente promover algo en horario de trabajo,
  confirmar que entiende que se aparta de esta regla antes de proceder.
- `staging` no tiene esta restricción — se puede promover ahí en cualquier
  momento para pruebas.

Ver `docs/HT-AP-03-nota-cambio-v1.24.md` y
`docs/HT-AP-03-documento-consolidado.md` (§17) para el registro completo.
