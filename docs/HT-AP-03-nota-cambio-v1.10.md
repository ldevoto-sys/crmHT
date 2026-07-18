# HT-AP-03 — Nota de cambio v1.9 → v1.10

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.9 → v1.10
**Fecha:** 2026-07-18
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Catálogo de imágenes/fichas técnicas de productos en Cloudflare R2,
acceso directo a "Crear cotización" desde una conversación de WhatsApp, y
control por línea de cotización sobre si se muestra la imagen del producto.

---

## 1. Imágenes y fichas técnicas del catálogo (Cloudflare R2)

- Se creó un bucket público en Cloudflare R2 (`crm-ht-productos`, con
  "Public Development URL" habilitada) para las imágenes y fichas técnicas
  del catálogo — a diferencia del bucket de adjuntos de WhatsApp (§5 de la
  v1.9), este contenido está pensado para ser visible por el cliente final.
- **Carga de archivos:** se decidió explícitamente que el CRM no sube estos
  archivos uno por uno — con más de 1.000 productos, cargar de a un archivo
  por navegador es inviable (Cloudflare además limita a 100 archivos por
  tanda desde su panel). La carga masiva (~3 GB) se hizo directamente a R2
  con `rclone`, por fuera del CRM.
- **El CRM solo calcula la URL esperada** de cada producto según su código
  (SKU) y una convención de nombre de archivo fija, mediante la acción
  "Aplicar URLs de Cloudflare por código" (Productos → Importar catálogo):
  - Imágenes: `img/imagen1_{código}.jpg`
  - Fichas técnicas: `pdf/{código}FT.pdf`
- Por defecto la acción solo completa productos que no tienen URL cargada
  (no pisa datos existentes); una casilla explícita permite sobrescribir
  todos, para cuando se resube el catálogo completo.
- **Corrección durante la implementación:** la primera versión de esta
  convención asumía `{código}.jpg` / `{código}.pdf` (sin prefijo ni sufijo).
  Al probarla contra los archivos reales ya subidos, no coincidía — se
  corrigió a la convención real descrita arriba.

## 2. Crear cotización desde una conversación de WhatsApp

- En la Bandeja WhatsApp, el encabezado de la conversación agrega un enlace
  **"Crear cotización ↗"** que abre en una pestaña nueva (para que el
  vendedor pueda seguir revisando la conversación en la pestaña original).
- Si el contacto ya tiene un negocio asociado, abre la cotización dentro de
  ese negocio; si no, abre el flujo de "negocio nuevo" (igual al que ya
  existía al cotizar desde un contacto sin negocio), que crea el negocio
  automáticamente al guardar.

## 3. Check "Imagen" por línea de cotización

- Cada ítem de una cotización tiene ahora un check **"Imagen"**, tildado
  por defecto. Controla si la imagen del producto se incluye en el PDF y en
  la vista pública que ve el cliente.
- **Cambio de comportamiento respecto a la versión anterior:** antes la
  imagen se mostraba automáticamente si el producto tenía una URL de imagen
  cargada; ahora requiere que el vendedor lo indique explícitamente en esa
  línea.
- Si la línea no tiene un producto asociado (se escribió el texto a mano) o
  el producto no tiene imagen cargada, el check no tiene ningún efecto — no
  hay imagen que mostrar en ninguno de los dos casos.
- El check se conserva al editar la cotización y al generar una nueva
  versión de la misma.
- **Pendiente, a definir en una próxima etapa** (mismo pedido, ítems 2 y 3
  de 3): agregar una columna de "descripción completa" al maestro de
  productos con su propio check por línea, y un check de "ficha técnica"
  que la muestre como link en la cotización — con la pregunta abierta de si
  la ficha debería adjuntarse también al mensaje de envío por correo o
  WhatsApp.

## 4. Impacto en el documento base

- **§6 (Modelo de datos):** `cotizacion_items` agrega el campo
  `mostrar_imagen` (booleano, por defecto verdadero).
- **§9 (Integraciones):** Cloudflare R2 pasa de ser solo almacenamiento de
  adjuntos de WhatsApp a incluir también el catálogo de imágenes/fichas de
  productos (bucket separado, público).
- **§11 (Pantallas):** "Importar catálogo de productos" agrega la sección
  "Aplicar URLs de Cloudflare"; la Bandeja WhatsApp agrega el enlace
  "Crear cotización"; el formulario de cotización agrega el check por
  línea descrito en §3.

## 5. Pendiente para una próxima nota

- **Rotar el token de acceso de R2** usado para la carga masiva por
  `rclone`: las credenciales se compartieron en texto plano durante la
  configuración y deben regenerarse en Cloudflare y actualizarse en
  Railway.
- Los dos ítems restantes del pedido de líneas de cotización descritos en
  §3 (descripción completa y ficha técnica por línea).
- Los pendientes ya listados en la nota v1.9 (§7) siguen abiertos: publicar
  la app de Meta, plantillas para conversaciones cerradas, correo del
  vendedor como remitente real, canal de correo como fuente de leads.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.10 · Borrador para validación de Gerencia*
