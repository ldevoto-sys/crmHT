# HT-AP-03 — Nota de cambio v1.32

**Fecha:** 07 al 08-09-2026.
**Módulo:** Bandeja WhatsApp (No leídos), Dashboard, Reportería Comercial +
Softland (Conversaciones WhatsApp y Embudo comercial).
**Estado:** implementado, probado localmente y **subido a producción
(`main`) el 08-09-2026**, junto con los ajustes de permisos de asignación
de leads (Magdalena/callcenter) ya documentados por separado. El módulo de
Cobranza, en construcción en paralelo en `staging`, queda explícitamente
fuera de esta promoción — sigue sin subir a producción hasta completar
todas sus fases (ver nota de cambio de Cobranza y §16, pendientes).

## 1. Bandeja WhatsApp — "No leídos" siempre acotado a lo propio para vendedores

Reportado por el equipo: un vendedor con el filtro "No leídos" activado
veía mensajes sin leer de conversaciones que no eran suyas. Esto dependía
del toggle general de acceso a la Bandeja (`bandeja_acceso`: "cualquier
vendedor ve y responde todo" vs. "solo el asignado"), pensado para decidir
qué puede **navegar** un vendedor, no para el contador de no leídos.

**Política adoptada (07-09-2026):** el contador y el filtro "No leídos" de
un vendedor **siempre** se acotan a las conversaciones de sus propios
leads, sin importar cómo esté configurado `bandeja_acceso`. Call center,
jefe comercial, gerencia y administrador siguen viendo el total, igual que
antes.

- Backend: `GET /api/whatsapp/no-leidos/cantidad` — se reemplazó el chequeo
  `puedeVerTodo()` (dependiente del toggle) por una condición fija:
  `req.user.rol === 'vendedor'` siempre filtra por `vendedor_id`, cualquier
  otro rol ve el total.
- Frontend (`BandejaWhatsApp.jsx`): al activar "No leídos" siendo vendedor,
  se agrega `vendedor_id=<propio id>` a la consulta de conversaciones sin
  importar el filtro de usuario elegido en pantalla; el contador junto al
  botón ahora viene del mismo endpoint del badge del menú lateral, no de un
  conteo local sobre la lista ya filtrada (que se prestaba a confusión).
- Probado localmente con dos usuarios reales (un vendedor y un usuario
  callcenter): el vendedor solo ve y cuenta lo propio, callcenter ve el
  total, en ambos casos con y sin el toggle general activado.

**Archivos:** `backend/routes/whatsapp.js`,
`frontend/src/pages/bandeja/BandejaWhatsApp.jsx`.

## 2. Conversaciones de WhatsApp en Dashboard y Reportería, y Embudo comercial

Solicitado por Gerencia: visibilidad de la actividad de WhatsApp junto al
resto de la actividad comercial, y un embudo Conversaciones → Cotizaciones
→ Notas de venta → Facturas por área y por vendedor.

**Definición de "conversación"** (para que calzara con lo que ya existía,
sin inventar un criterio nuevo): un contacto distinto con al menos un
mensaje en el período — igual criterio que `whatsapp_conversaciones` y
`GET /api/whatsapp/conversaciones` (por contacto, no por lead, porque un
mismo contacto puede generar más de un lead con el tiempo). El vendedor
que se le atribuye a la conversación es el de su lead más reciente, mismo
criterio ya usado en `routes/whatsapp.js`.

**Alcance decidido con Gerencia:** sin atribución entre períodos — cada
mes se mide de forma independiente (Conversaciones de septiembre vs.
Cotizaciones de septiembre, etc.), sin intentar rastrear si una conversación
de un mes terminó en una cotización varios meses después. Si un cliente
contacta hoy y compra en 6 meses más, ese negocio cuenta en el mes en que
efectivamente ocurre, como corresponde a un negocio nuevo.

**Dashboard:** nueva tarjeta "Conversaciones WhatsApp del mes" (solo
cantidad — una conversación no tiene monto asociado, es actividad, no
venta), junto a las tarjetas ya existentes de Cotizado/Cerrado/NV/Facturas.

**Reportería Comercial + Softland:**
- Pestañas "Por vendedor" y "Por área": columna/barra de Conversaciones,
  junto a Cotizado/Cerrado/Facturado.
- **Nueva pestaña "Embudo":** dos gráficos de embudo (recharts), uno en
  cantidad (4 etapas: Conversaciones → Cotizaciones → Notas de venta →
  Facturas) y otro en monto (3 etapas: Cotizado → Notas de venta →
  Facturado — conversaciones no tienen monto, por eso no aparece acá), con
  el porcentaje de conversión entre cada etapa debajo de cada gráfico.
  Reacciona a los mismos filtros de año/mes/vendedor/área que el resto de
  la pantalla. Colores: rampa de opacidad sobre los dos únicos colores de
  marca autorizados (Celeste `#34B3DE` para cantidad, Azul Marino `#112548`
  para monto) — no se introdujeron tonos nuevos.

**Backend:** el endpoint existente `GET /api/softland/reporte` suma una
consulta más (conversaciones de WhatsApp por vendedor/mes, mismo criterio
descrito arriba) y la mezcla con las filas ya existentes de
cotizado/cerrado/facturado — no hay endpoint ni tabla nueva.

**Probado localmente** con datos de prueba reales (10 conversaciones, 3
cotizaciones, 2 notas de venta, 1 factura en el mes): tarjeta del Dashboard,
columna/barra de Reportería y ambos embudos muestran los números y
porcentajes de conversión correctos.

**Archivos:** `backend/routes/softland.js`, `frontend/src/pages/Dashboard.jsx`,
`frontend/src/pages/ventas/ReporteriaSoftland.jsx`.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.32*
