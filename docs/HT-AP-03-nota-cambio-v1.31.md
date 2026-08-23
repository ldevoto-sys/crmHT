# HT-AP-03 — Nota de cambio v1.31

**Fecha:** 19 al 23-08-2026.
**Módulo:** Reportería Comercial + Softland (nuevo), Reportes, Dashboard,
WhatsApp Business Platform (Meta) — estado de habilitación.
**Estado:** Reportería Comercial + Softland implementada y verificada
localmente contra Postgres real; **subida a producción (`main`) el
23-08-2026**. WhatsApp Business Platform: en curso, con un bloqueo
pendiente (ver punto 2).

## 1. Reportería Comercial + Softland

Módulo nuevo, nunca documentado formalmente hasta esta nota — reemplaza el
script manual `generar_dashboard.py` (Luis) que se corría a mano desde un
equipo personal. Vive en el CRM como una sección más, con datos siempre
actualizados sin depender de que alguien lo genere y lo suba a SharePoint.

**Qué muestra:** Cotizado, Cerrado (NV emitidas) y Facturado, por
vendedor/área, en monto y cantidad de documentos.

- **Cotizado:** Softland hasta jul-2026 (histórico estático, una sola
  fuente); desde ago-2026 se lee en vivo desde `cotizaciones` del CRM — es
  el punto exacto en que el CRM se volvió la fuente de verdad para
  cotizaciones.
- **Cerrado y Facturado:** siempre Softland, todos los años, sin cruce con
  el pipeline del CRM — cuentan las NV/facturas que Softland generó, sin
  exigir que el negocio esté "Ganado" en el CRM (hay vendedores que no
  marcan todo, y hay NV sin cotización asociada en ningún sistema).

**Pestañas:**
1. **Mensual (2023-hoy):** serie corrida; reacciona a los filtros de
   Año/Mes — con Mes fijado (sin año), compara ese mes entre los distintos
   años; con Año fijado, muestra Ene-Dic de ese año. Tooltip al pasar el
   mouse con el detalle de las tres métricas.
2. **Comparación anual:** barras agrupadas por año, una métrica a la vez,
   con versión acumulada debajo y tabla de detalle mensual por año.
3. **Por vendedor** y **Por área.**
4. **NV sin facturar:** listado de notas de venta pendientes de
   facturación, con antigüedad en días y buscador libre (cliente, vendedor,
   N° NV, O/C).
5. **Cotizaciones, Notas de Venta y Facturas** (nuevas, 23-08-2026):
   listado documento por documento (no solo agregado), filtrable por
   año/mes/día/vendedor/área + texto libre, con botón "Exportar CSV". A
   diferencia del resto del reporte (unos cientos de filas, se manda todo
   y se filtra en el navegador), estas tres tablas pueden acumular varios
   miles de documentos en el histórico completo — el filtrado y la
   paginación son del lado del servidor
   (`GET /api/softland/documentos/:tipo` y su `/exportar`).

**Filtros compartidos:** año, mes, vendedor, área, unidad (montos/cantidad
de documentos) — aplican a todas las pestañas.

**Sincronización con Softland (SQL Server, solo lectura):**
- Botón "Actualizar" manual + rutina automática a las 23:00 hora de Chile,
  solo en producción (staging se sincroniza a mano).
- **Rediseño 22-08-2026 — backfill único + ventana viva:** Softland no
  genera cotizaciones, NV ni facturas retroactivas de meses más viejos que
  el mes abierto y el anterior — ese historial está "congelado" y se
  consulta a Softland **una sola vez** (tabla `reporte_softland_backfill`
  lleva el registro de qué ya se cargó). Cada corrida solo vuelve a
  consultar y reemplazar la "ventana viva" (mes abierto + el anterior),
  sin tocar el resto de la tabla. Reduce sustancialmente la carga sobre la
  réplica de Softland en cada sincronización. Cotizado no tiene ventana
  viva propia: su "mes abierto" ya lo cubre el CRM en vivo, así que el
  historial de Softland se consulta una única vez para siempre.

**Área comercial (meson/operaciones/vregion/otros):**
- **Corrección 21→22-08-2026:** el área se resolvía solo por el campo
  `area` cargado a mano en Usuarios (vía `codigo_softland`) — los códigos
  de contrato/grupo de mantención (M10, M20, M30, M40, M50, U12, U13, C20,
  L14) no son vendedores, nunca tienen usuario en el CRM, y quedaban fuera
  de cualquier filtro por área.
- **Fuente de verdad actual:** mapa oficial vendedor/código → área
  documentado en HT-IN-01 §4.6 (skill de dashboards Softland, el mismo
  usado y validado en `generar_dashboard.py`), con el mismo fallback por
  prefijo (`VT*`/`M*` → Operaciones, `V*` → Ventas Mesón). El área cargada
  a mano en Usuarios queda como último recurso, solo para códigos que ni
  el mapa ni el fallback reconocen.

**Corrección de datos 20-08-2026:** "Facturado" se agrupaba por la fecha
de la nota de venta que origina la factura, no por la fecha real de la
factura — un mes mostraba "cuánto de lo vendido ese mes ya se facturó",
no "cuánto se facturó ese mes". Se corrigió para agrupar por
`WG_vsnpCuboVentas.Fecha`, el mismo criterio que la "Consulta de Ventas
por Vendedor" nativa de Softland (confirmado contra un caso real de
agosto-2026: $52,4M, versión vieja, vs. $74,2M, Softland).

**Reportes: una sola sección en el menú (23-08-2026):** existían dos
ítems de navegación separados ("Reportes" y "Reportería Softland"), sin
contenido duplicado pero confuso. Se unificaron en un solo ítem "Reportes"
con un selector Pipeline / Comercial (Softland); `/reportes/softland`
sigue funcionando como enlace directo a la vista Comercial.

**Dashboard (23-08-2026):** además de Cotizado/Cerrado ganado del mes
(CRM), ahora muestra también Notas de Venta y Facturas del mes en curso
(Softland).

**Modelo de datos:** ver §13 del documento consolidado — tablas
`reporte_softland_mensual`, `reporte_softland_nv_pendientes`,
`reporte_softland_sync`, `reporte_softland_cotizaciones`,
`reporte_softland_notas_venta`, `reporte_softland_facturas`,
`reporte_softland_backfill`; `users.area`.

**Variables de entorno (Railway):** `SOFTLAND_DB_SERVER`,
`SOFTLAND_DB_NAME`, `SOFTLAND_DB_USER`, `SOFTLAND_DB_PASS`, opcional
`SOFTLAND_DB_TRUST_CERT` — cargadas en `staging` y `main`.

**Archivos principales:** `backend/services/softland.js` (conexión),
`backend/services/softlandSync.js` (sincronización), `backend/routes/softland.js`
(endpoints), `frontend/src/pages/ventas/ReporteriaSoftland.jsx`,
`frontend/src/pages/ventas/ListadoDocumentosSoftland.jsx`,
`frontend/src/pages/ventas/ReportesHub.jsx`.

## 2. WhatsApp Business Platform (Meta) — estado de habilitación (23-08-2026)

Trabajo en curso para dejar operativo el envío/recepción real de WhatsApp
(hasta ahora solo Bandeja/bot con credenciales de prueba, ver §11 y §14
del documento consolidado). Avance y bloqueo actual:

**Completado:**
- App de desarrollador creada en Meta ("CRM HT Prueba"), producto WhatsApp
  conectado.
- Webhook configurado y verificado contra `staging`.
- Flujo de mensajes probado extremo a extremo: mensaje entrante visible en
  la Bandeja real del CRM; plantilla `hello_world` enviada y recibida.
- Política de privacidad publicada (`hidrotecnica.cl/politica-de-privacidad`)
  y cargada en la configuración de la app.
- 3 plantillas de mensaje redactadas y **aprobadas** por Meta:
  `envio_cotizacion`, `cierre_de_cotizacion`, `seguimiento1` (las 3
  categorizadas como "Marketing" por el clasificador de Meta, no
  "Utilidad" como se esperaba inicialmente).

**Bloqueo actual:** la cuenta de WhatsApp Business ("Hidrotécnica") quedó
**desactivada permanentemente** por Meta el 23-08-2026, por supuesto
incumplimiento de la Política de Comercio de WhatsApp Business — sin
haber enviado ningún mensaje real todavía. Causa más probable (no
confirmada por Meta, que no da detalle): el portafolio empresarial se
administraba desde un perfil personal de Facebook creado especialmente
para esto con un nombre de fantasía ("Luis Hidro"), no el perfil personal
auténtico del administrador — Meta exige que los activos comerciales se
gestionen desde un perfil que represente la identidad real de la persona.
Una solicitud de revisión ya fue rechazada (respuesta genérica, sin
detalle adicional).

**Plan de resolución (en curso, no completado):**
1. Crear un portafolio empresarial nuevo en Meta Business Manager,
   administrado desde el perfil personal real del administrador (no desde
   el perfil de fantasía).
2. Recrear ahí la Página de Facebook, la app de desarrollador y la cuenta
   de WhatsApp Business — con los documentos de la empresa, el número de
   teléfono de producción y el método de pago ya disponibles, este segundo
   intento debería ser más rápido que el primero.
3. Pendiente, independiente del punto anterior: verificación de negocio
   específica de WhatsApp (documentos de la empresa — sube el límite de
   conversaciones/día y el tope de números de teléfono por cuenta), número
   de teléfono de producción, método de pago.
4. **Aclaración importante para quien retome esto:** WhatsApp Business
   Platform **no requiere** que la app pase por "Tech Provider" ni por
   Advanced Access/App Review de `whatsapp_business_management` /
   `whatsapp_business_messaging` — esos trámites son solo para empresas
   que administran cuentas de WhatsApp de **otras** empresas (modelo BSP).
   Una empresa que administra directamente su propia única cuenta
   (Hidrotécnica, "Direct Developer") no los necesita; ese camino se
   intentó primero por error y se abandonó.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.31*
