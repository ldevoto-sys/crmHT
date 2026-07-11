# HT-AP-03 — Nota de cambio v1.2 → v1.3

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.2 → v1.3
**Fecha:** 2026-07-11
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Definir el catálogo técnico (Excel) como base de productos e
incorporar el importador de productos por archivo.

---

## 1. Base de productos — Catálogo Técnico (Excel)

Se reemplaza HubSpot como fuente de productos por el **Catálogo Técnico
HidroTécnica** (Excel, hoja "Catálogo"), que es más completo y es la fuente de
verdad del área.

- **2.481 productos** con código; 2.379 con precio, 2.329 con URL de imagen,
  2.322 con URL de ficha PDF.
- Especificaciones: marca, tipo, HP, voltaje, caudal, altura, conexión,
  diámetro de pozo, curva Q/H (hasta 6 puntos), sustitutos, notas, "en sitio web".
- Se importa el catálogo **completo** (incluidos los que no están en el sitio,
  porque igual se cotizan).

## 2. Esquema de productos — núcleo + atributos JSONB

`productos` guarda columnas núcleo (código/SKU, nombre, marca, categoría, precio,
URL imagen, URL ficha) **más un campo `atributos` (JSONB)** con todo el detalle
técnico. Permite guardar todo el catálogo hoy y decidir **después** qué campos se
muestran en la cotización, sin migrar el esquema.

## 3. Importador de productos por archivo (CSV)

Se agrega a la Etapa 1, con el mismo patrón del importador de contactos (§9.5 /
nota v1.2): subir → previsualizar → validar → confirmar → informe de rechazos.
Matchea por **Código**: crea los nuevos y actualiza los existentes.

- La **carga base** se realiza desde el Excel del catálogo por este mismo camino.
- El área exporta la hoja "Catálogo" a CSV para cargas posteriores.

## 4. Stock del proveedor en el mismo archivo

El Excel del catálogo sumará a futuro una **columna de stock del proveedor**.
Cuando esté presente, el importador la detecta y registra el stock en
`stock_proveedor` (histórico; la carga más reciente es la vigente, §6/§9.5).

**Simplificación:** al venir el stock en el mismo archivo del catálogo, la
pantalla dedicada de "carga de lista del proveedor" (§9.5) deja de ser necesaria
como flujo separado; se cubre con el importador de productos.

## 5. Punto abierto (a resolver en Etapa 2 — Cotizaciones)

Las URL de imagen y ficha apuntan a **SharePoint (acceso interno)**. Es probable
que **no se visualicen en la vista pública de la cotización** sin autenticación.
Se definirá en Etapa 2 cómo exponer esas imágenes (p. ej. copiándolas a los
`uploads` del sistema o a un almacenamiento público). Por ahora se guarda la URL.

## 6. Impacto en el documento base

- **§6 (Modelo de datos):** `productos` incorpora `marca`, `url_imagen` y
  `atributos JSONB`.
- **§9:** agregar "Importador de productos CSV"; la fuente de productos pasa a ser
  el Catálogo Técnico (Excel), no HubSpot.
- **§13 / §17 Etapa 1:** agregar ítem `[ ] Importador de productos CSV (carga base del catálogo + cargas posteriores)`.
- **§14:** *Base de productos* → Catálogo Técnico (Excel), núcleo + JSONB; se importa completo.

Sin más cambios.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.3 · Borrador para validación de Gerencia*
