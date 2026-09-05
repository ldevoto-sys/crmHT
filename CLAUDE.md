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

**Excepción — cambios de solo documentación:** si el cambio es exclusivamente
a `docs/`, `CLAUDE.md`, o `README.md` (sin tocar `backend/` ni `frontend/`),
no afecta el comportamiento de la aplicación desplegada — se puede subir a
`staging` y `main` en simultáneo, en cualquier horario, sin esperar la
ventana fuera de horario. Confirmado explícitamente por Luis Devoto
(07-08-2026).

Ver `docs/HT-AP-03-nota-cambio-v1.24.md` y
`docs/HT-AP-03-documento-consolidado.md` (§17) para el registro completo.

## Modo actual: todo se acumula en staging (vigente desde 10-08-2026)

Instrucción explícita de Luis Devoto, más restrictiva que la regla de
horario de arriba: **por ahora, solo se promueve a `main` si hay un error**
que corregir — nunca por una mejora o feature nueva, aunque sea fuera de
horario. Las mejoras y features nuevas quedan acumulándose en `staging`
hasta que se avise lo contrario.

Antes de cualquier `git push origin main` (o cherry-pick a `main`) que no
sea la excepción de solo documentación de arriba:
- Confirmar que el cambio es la corrección de un error (algo que dejó de
  funcionar), no una mejora — si hay duda, preguntar antes de promover.
- Si es una corrección de error, sigue aplicando la regla de horario de
  arriba salvo que sea crítico.

## Pendientes (actualizado 04-09-2026)

**Foco actual: migrar el WhatsApp oficial de la empresa a producción.**

- Número actual del CRM (Ventas, ya conectado en Meta): +56 9 8109 8161.
- Número oficial a migrar: +56 9 8106 2974. Originalmente en la cuenta
  "Ventas Hidrotecnica" (nombre no se corresponde con el uso real); se
  reintentó agregarlo bajo la cuenta "Hidrotecnica" (la misma app que ya
  usa el CRM, para evitar un segundo WHATSAPP_APP_SECRET).
- **Coexistencia descartada (05-09-2026): Meta no la ofreció en ningún
  punto del flujo de self-service** (WhatsApp Manager → Agregar número).
  Al intentar agregarlo, avisó "número ya en uso" (seguía activo en la app
  de WhatsApp Business de un celular) — sin opción de migrar manteniendo la
  app. Luis desvinculó el número de la app de WhatsApp Business del celular
  para liberarlo (migración completa, coincide con la intención original:
  "Solo CRM", nadie más lo necesita en el celular).
- **Estado actual (05-09-2026, pausado hasta mañana)**: número ya liberado
  y aceptado por Meta bajo la cuenta "Hidrotecnica" — llegó a la pantalla
  de verificación por código (SMS o llamada), pero llegó al límite de
  reintentos de Meta ("verification code too many times"). Falta:
  reintentar mañana el código de verificación (probar SMS si la llamada
  sigue bloqueada), completar el alta del número en Meta.
- **Código ya listo en `staging`** (commit `c12c362`, 04-09-2026): soporte
  multi-cuenta en `config/whatsappCuentas.js` + `services/whatsapp.js` +
  `routes/public.js`. Probado con Postgres local: el número de Ventas sigue
  funcionando exactamente igual; un número nuevo, con sus variables de
  entorno configuradas, se reconoce solo por `phone_number_id` y registra
  sus mensajes sin correr el bot de categorización de Ventas.
- **Falta para terminar** una vez Luis complete la migración en Meta:
  1. Cargar en Railway `WHATSAPP_PHONE_NUMBER_ID_OFICIAL` y
     `WHATSAPP_ACCESS_TOKEN_OFICIAL` con los datos que entregue Meta.
  2. Verificar si el número oficial queda bajo la misma app de Meta que
     Ventas o una distinta — si es distinta, `firmaValida()` en
     `routes/public.js` (valida la firma del webhook con un solo
     `WHATSAPP_APP_SECRET`) también necesita soporte multi-cuenta; no se
     tocó todavía porque no se sabe cuál de los dos casos aplica.
  3. Probar de punta a punta con el número real.
- Sirve dos necesidades a la vez: el número oficial de la empresa y, más
  adelante, el número separado de Operaciones (ver abajo).

**Cobranza**: módulo con desarrollo pendiente, acumulado en `staging` sin
promover a `main` (sigue la regla de arriba — no se promueve por mejoras).

**Operaciones — "Arranque de Trabajos" (Ventas → Operaciones)**: especificación
funcional revisada y analizada contra el código (ver
`Especificacion_Tecnica_CRM_Arranque_Trabajos.md`, no forma parte de este
repo todavía). Decisiones ya tomadas por Luis Devoto:
- Correos del flujo salen de `operaciones@hidrotecnica.cl`.
- WhatsApp de Operaciones: número separado del de Ventas, **todavía no
  dado de alta en Meta** — depende del trabajo de multi-número de arriba.
- Listado de materiales/herramientas: solo registro en la orden de trabajo,
  sin integración con Compras ni con el módulo Despacho.
- Sin firma digital en sitio.
Queda pendiente como el mayor hueco de diseño: no existe en el código un
motor de checklist obligatorio configurable por etapa — el único gate
existente hoy es un `if` puntual en `negocios.js` (causa de no cierre).
Habría que construirlo desde cero, con una matriz tipo-de-trabajo × etapa
(Reparación/Rutinario/Lavado/Especial-Proyecto tienen requisitos distintos).
También sigue abierto si el trabajo "Rutinario" referencia un N° de
Contrato (no existe esa tabla hoy) o solo N° de cotización.
No se ha empezado a construir nada de esto — se retoma después de terminar
la migración del WhatsApp oficial.
