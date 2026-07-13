# HT-AP-03 — Nota de cambio v1.4 → v1.5

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.4 → v1.5
**Fecha:** 2026-07-12
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Formato de cotización al cliente, IVA y datos del emisor.

---

## 1. IVA en cotizaciones

Las cotizaciones calculan **neto → IVA → total**. El IVA es configurable por
cotización (`iva_pct`, default 19; 0 = exento). Antes solo había neto.

## 2. Formato del documento de cotización

La cotización al cliente (vista pública `/c/:token` y PDF) adopta el formato
de referencia usado por la empresa: encabezado con datos del emisor y
WhatsApp, cliente + vendedor + información, detalle de productos (con imagen
en la vista web), totales con IVA, condiciones comerciales y datos bancarios.

**Paleta:** el documento al cliente usa la **paleta corporativa navy + celeste**
(no el acento naranja, que identifica la app interna). Coherente con el manual
de marca.

## 3. Datos del emisor y banco (config_empresa)

Nueva tabla `config_empresa` (fila única) con razón social, RUT, dirección,
teléfono, WhatsApp, correos (ventas/cobranzas), sitio web y datos bancarios.
Semilla con los datos de HidroTécnica. Editable por administrador (pendiente
pantalla de edición; hoy se ajusta en base de datos).

## 4. Imágenes de producto en la cotización (punto abierto)

Las URL de imagen/ficha del catálogo (Excel) son de **SharePoint (internas)** y
no cargan para el cliente. La vista web muestra la imagen **solo si la URL es
pública**; si es de SharePoint, muestra un placeholder. El PDF, por ahora, no
incrusta imágenes remotas. **Pendiente:** definir el origen público de las
imágenes (derivar del sitio hidrotecnica.cl por código, o subirlas al sistema).

## 5. Impacto en el documento base

- **§6:** `cotizaciones` agrega `iva_pct`; nueva tabla `config_empresa`.
- **§12 (PDF):** formato actualizado (emisor, IVA, banco); paleta navy+celeste
  para el documento al cliente.
- **§7.5:** la vista pública incorpora el formato con imágenes cuando la URL es pública.

Sin más cambios.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.5 · Borrador para validación de Gerencia*
