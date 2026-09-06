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

## Pendientes (actualizado 06-09-2026)

**Migración del WhatsApp oficial — COMPLETADA (06-09-2026).**

Estado final en producción:
- **+56 9 8106 2974 es el número comercial real** (`WHATSAPP_PHONE_NUMBER_ID`
  en Railway producción = `1339808529211189`). Es el número publicado en el
  sitio web — recibía ~200 contactos/semana atendidos hasta el 05-09-2026
  por un chatbot externo (chatbot.saaspro.br); desde ahora los atiende el
  CRM (bot de categorización, asignación de vendedor, todo el flujo
  comercial completo).
- **+56 9 8109 8161** (el número que usaba el CRM hasta esta migración,
  con historial real de clientes) **pasó a ser el número de pruebas**:
  se reenvía a `staging` vía `WHATSAPP_REENVIO_PHONE_NUMBER_ID` +
  `WHATSAPP_REENVIO_URL` + `WHATSAPP_REENVIO_SECRETO` (mismo secreto en
  ambos entornos). Ya no lo atiende nadie del equipo comercial — solo
  sirve para pruebas de desarrollo, con base de datos separada (staging).
- Ambos números viven bajo la misma app de Meta ("Hidrotecnica",
  `WhatsApp Business account ID: 1115263817731903`) — mismo
  `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_APP_SECRET` sirven para los dos, no
  hizo falta soporte multi-secreto en `firmaValida()`.
- Probado en ambos sentidos desde el celular real: mensaje a 8106-2974 →
  aparece completo en Bandeja de producción; mensaje a 8109-8161 → aparece
  en Bandeja de staging. Confirmado sin cruce entre entornos.
- Nota interna: el objeto `VENTAS` en `config/whatsappCuentas.js` mantiene
  ese nombre por herencia del código, aunque ahora corresponde a
  8106-2974, no a 8109-8161 — es solo una etiqueta de log, no afecta nada
  funcional. No es necesario renombrarlo, pero puede confundir si se lee
  el código sin este contexto.

**Para Operaciones y Cobranza** (a futuro, cuando se construyan esos
módulos): cada uno necesita su propio número — mismo mecanismo que ya está
probado (otra entrada en `whatsappCuentas.js`, con su propio `ambito`), no
reenvío ni nada especial.

**Herramienta de reenvío entre entornos** (06-09-2026, **ya en `main`**,
commit `429dfb9`): `WHATSAPP_REENVIO_PHONE_NUMBER_ID` + `WHATSAPP_REENVIO_URL`
reenvían tal cual (mismo cuerpo, misma firma) los mensajes de un número al
webhook de otro entorno, sin procesarlos ni guardar nada localmente.
Pensada para probar el número oficial en producción sin ensuciar la base
de datos real: se ve el flujo completo (aviso de privacidad, bot, etc.) en
la base de destino. Probada con dos instancias locales — funciona, y el
número normal de Ventas sigue procesando local sin regresión. Ambas
variables quedan vacías por defecto (desactivada) — activarla es cargar
las dos en Railway cuando se quiera usar.

**Ley 21.719 — protección de datos personales**: implementada y **ya en
`main` (producción)** desde 06-09-2026 (commit `993321a`), validada con
Gerencia (rol DPO). Aviso automático de privacidad en primer contacto/
reapertura de WhatsApp, detección de solicitud de eliminación de datos con
revisión humana en `/config/privacidad`, y purga automática diaria de
contactos inactivos sin conversión (12 meses, configurable). Ver detalle
en el commit de staging `af39e0d`.

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
