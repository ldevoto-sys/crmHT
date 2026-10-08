# HT-AP-03 — Nota de cambio v1.45 (08/10/2026)

> **Estado: solo en `staging`.** No promovido a `main`. Requiere el OK de
> Luis Devoto (más confirmación adicional si el push cae en horario laboral).

## Se retira "Factura sugerida"

### Problema
La función de v1.33 cruzaba facturas de Softland con negocios por **RUT del
cliente + monto exacto** y mostraba una insignia verde "Factura sugerida" en la
tarjeta del Pipeline. No funcionó: en clientes recurrentes (ej. Cencosud) el
mismo monto se repite en decenas de negocios, así que la misma factura
aparecía sugerida en muchas tarjetas, incluso de negocios en Aceptado que ni
siquiera se habían ejecutado. El propio código ya reconocía la ambigüedad.

### Qué se quitó
- La insignia y los botones **Confirmar / Descartar** en las tarjetas del Pipeline.
- La pestaña **"Sugerencias de facturación"** de Reportería Softland.
- Los tres endpoints `/api/softland/sugerencias-facturacion` (listar, confirmar,
  descartar) y el servicio `services/sugerenciasFacturacion.js`.

### Qué se conserva
- Las columnas `negocio_id`, `revisado_por_id` y `revisado_en` de
  `reporte_softland_facturas`: guardan los vínculos que ya se habían confirmado
  a mano y el historial de lo descartado. Ya nada las escribe ni las lee. No hay
  migración ni pérdida de datos.
- `cambiarEtapaNegocio()` (núcleo del cambio de etapa): lo siguen usando los
  movimientos automáticos (WhatsApp, Mantenimiento). Solo cambió su comentario.
- Las pestañas de Softland que sí funcionan: Mensual, Comparación anual, Por
  vendedor, Por área, Embudo, NV sin facturar, y los listados de Cotizaciones,
  Notas de Venta y Facturas.

### Qué viene (plan del 08-10-2026)
Mover a **Facturado** desde Softland con una llave confiable: negocio → NV
(número y N° de OC) → factura, en vez de RUT + monto. Falta verificar si la
factura en Softland trae la referencia a la NV (el CRM hoy no sincroniza esa
columna) y revisar cuántos negocios tienen NV u OC cargados.

### Cómo se probó
Servidor real + Postgres: con una factura y un negocio que antes calzaban por
RUT + monto, `GET /negocios` ya no trae `sugerencias_factura` (0 de 23 negocios),
los endpoints responden 404, la factura de prueba queda intacta, las alertas de
OT siguen apareciendo (9) y el frontend compila. No se probó contra datos de
producción.
