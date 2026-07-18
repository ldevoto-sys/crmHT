# HT-AP-03 — Nota de cambio v1.10 → v1.11

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.10 → v1.11
**Fecha:** 2026-07-18
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Completa el pedido de controles por línea de cotización iniciado en la
v1.10 (check "Imagen"): se agregan los checks de "Descripción completa" y
"Ficha técnica", y una descripción larga nueva en el maestro de productos.
De paso, se corrige un riesgo detectado en el importador de catálogo.

---

## 1. Descripción completa por línea de cotización

- El catálogo técnico en Excel trae ahora una columna **"Descripción"**: un
  texto largo (tipo párrafo) pensado para el cliente final, distinto del
  nombre corto del producto. Se agregó al maestro de productos como
  **`descripcion_completa`**, un campo nuevo — no se reutilizó el campo
  `descripcion` que ya existía en la base, porque ese no se usa en ninguna
  pantalla hoy y mezclar ambos habría sido confuso.
- El importador de catálogo mapea automáticamente esa columna al importar
  o actualizar productos.
- Cada línea de cotización suma un check **"Descripción completa"** (tildado
  por defecto). Si está marcado, el párrafo se muestra en el PDF y en la
  vista pública del cliente; si no, no aparece. Sin efecto si la línea no
  tiene producto asociado o el producto no tiene esta descripción cargada.
- En el PDF, la altura de la fila se ajusta automáticamente según el largo
  del texto (probado con descripciones de 350-400 caracteres y con
  cotizaciones de varias líneas, sin errores de paginación).

## 2. Ficha técnica por línea de cotización

- El link "Ficha técnica (PDF)" en el PDF y la vista pública, que antes se
  mostraba automáticamente si el producto tenía una ficha cargada, ahora
  requiere el mismo tipo de check por línea: **"Ficha técnica"** (tildado
  por defecto), sin efecto si la línea no tiene producto o ficha cargada.
- **Decisión validada con Gerencia:** el envío por correo y WhatsApp sigue
  mandando solo el PDF de la cotización — la ficha no se adjunta aparte,
  el cliente accede a ella por el link. Se evaluó adjuntarla también como
  archivo independiente y se descartó por ahora: no aporta lo suficiente
  frente a la complejidad de manejar varias fichas por cotización y fichas
  que aún están en SharePoint (no descargables de la misma forma que las
  de Cloudflare R2).

## 3. Corrección en el importador: no pisar URLs ya corregidas

- **Riesgo detectado:** el catálogo Excel trae para muchos productos
  enlaces de **SharePoint** en las columnas de imagen y ficha técnica,
  pero la URL real y pública de esos mismos productos ya se había
  corregido a Cloudflare R2 mediante la acción "Aplicar URLs de Cloudflare
  por código" (nota v1.10 §1). Como el importador actualizaba esas
  columnas sin condición, reimportar el catálogo habría reemplazado las
  URLs de R2 (correctas) por las de SharePoint (no públicas, se excluyen
  explícitamente de lo que se le muestra al cliente).
- **Corrección:** al actualizar un producto existente, si la URL nueva es
  de SharePoint y la que ya estaba cargada es pública, no se sobrescribe.
  Se sigue completando con normalidad cuando el producto no tiene URL
  previa. Verificado con un caso de cada tipo antes de desplegar.

## 4. Impacto en el documento base

- **§6 (Modelo de datos):**
  - `productos`: nuevo campo `descripcion_completa`.
  - `cotizacion_items`: nuevos campos `mostrar_descripcion` y
    `mostrar_ficha` (booleanos, por defecto verdadero), sumados a
    `mostrar_imagen` de la v1.10.
- **§11 (Pantallas):** el formulario de cotización agrega los dos checks
  restantes por línea; la plantilla CSV descargable del importador agrega
  la columna "Descripción".

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.11 · Borrador para validación de Gerencia*
