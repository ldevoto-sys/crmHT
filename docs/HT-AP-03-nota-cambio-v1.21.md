# HT-AP-03 — Nota de cambio v1.21

**Fecha:** 05-08-2026
**Módulo:** Importador de negocios para Operaciones, adjuntos de Postventa,
caso de Postventa sin negocio de origen.
**Estado:** Implementadas, verificadas localmente y desplegadas en `staging` →
`main` (producción) el 05-08-2026.

## Contexto

Esta nota agrupa 3 cambios independientes, cada uno probado por separado
antes de subir. El importador de negocios (punto 1) se construyó el
04-08-2026 y quedó pendiente en `staging` a la espera de las otras dos; los
tres se llevaron a producción juntos el 05-08-2026, una vez confirmado que
`R2_DESPACHO_*` ya estaba cargado tanto en `staging` como en producción
(insumo que necesitaba el punto 2).

## 1. Importador CSV de oportunidades (pipeline Operaciones)

**Problema que resuelve:** hay oportunidades que nacen de una orden de
compra contra un contrato ya firmado (Cencosud, Sodimac, etc.), sin pasar
por una cotización del CRM. Antes no había forma de cargarlas salvo
creándolas una por una a mano.

**Qué hace:** un CSV (mismo patrón que los importadores de Empresas/
Contactos — subir → previsualización → confirmar → informe de rechazos)
crea cada fila directo como negocio en la etapa **"Aceptado"** (tipo
`ganada`) del pipeline **Operaciones**, sin pasar por cotización ni por
`PUT /:id/etapa` — por eso no dispara encuesta de satisfacción ni tarea
automática de seguimiento (no aplican a una venta que ya llegó cerrada).

- La empresa y el contacto se buscan o se crean automáticamente (por RUT/
  nombre y teléfono/email, igual que el importador de Contactos).
- El **vendedor debe existir ya** en el sistema — se resuelve por email o
  nombre, el importador no crea usuarios nuevos.
- Botón "Importar oportunidades" en Pipeline (administrador/jefe comercial).

### Esquema

| Tabla | Cambio |
|---|---|
| `negocios` | + `n_oc TEXT` — N° de orden de compra, dato propio (antes solo quedaba, si acaso, como texto libre en el título). |

### Backend / Frontend

- `backend/services/import_negocios.js` (nuevo): mapeo y validación de filas.
- `backend/routes/negocios.js`: `GET /importar/plantilla`, `POST
  /importar/preview`, `POST /importar/confirmar`.
- `frontend/src/pages/ventas/ImportarNegocios.jsx` (nuevo), botón en
  Pipeline.

## 2. Historial de adjuntos en Postventa

**Problema que resuelve:** un caso de Postventa solo tenía campos de texto
(equipo, detalle) — no había forma de dejar fotos o videos que envía el
cliente, ni informes técnicos, adjuntos al caso.

**Qué hace:** cada caso acumula ahora varios archivos, cada uno con tipo
(**foto cliente / video cliente / informe técnico / otro**), descripción
opcional, quién lo subió y cuándo — mismo patrón que `whatsapp_mensajes`
(una fila por archivo, no una sola URL en el caso). Reutiliza el **bucket
privado de Cloudflare R2 de Despacho** (`R2_DESPACHO_*`, ver §14 del
consolidado) en vez de crear un bucket nuevo.

- **Puede subir/ver:** quien gestiona Postventa, o el vendedor que creó ese
  caso — mismo criterio que ya existía para ver el detalle del caso.
- **Puede eliminar:** quien subió el archivo, o quien gestiona Postventa.
- Descarga autenticada vía el backend (la key de R2 no se expone al
  frontend), igual que los documentos de Despacho.

### Esquema

| Tabla | Cambio |
|---|---|
| `postventa_adjuntos` | nueva — `caso_id`, `tipo` (CHECK foto_cliente/video_cliente/informe_tecnico/otro), `descripcion`, `archivo_key`, `archivo_nombre`, `archivo_mime`, `subido_por_id`, `created_at`. |

### Backend / Frontend

- `backend/routes/postventa.js`: `GET`/`POST /:id/adjuntos`, `GET
  /adjuntos/:id/archivo` (descarga), `DELETE /adjuntos/:id`.
- `frontend/src/pages/postventa/Postventa.jsx`: sección "Adjuntos" en el
  detalle del caso.

## 3. Caso de Postventa sin negocio de origen

**Problema que resuelve:** todo caso de Postventa exigía una venta previa
registrada en el CRM (`negocio_id` obligatorio). Hay reclamos de clientes
que no tienen una venta ahí (equipo vendido por otro canal, garantía de un
producto antiguo) — no había forma de abrirles un caso.

**Qué hace:** `negocio_id` pasa a ser **opcional**. Al crear un caso nuevo,
un link "¿Sin venta asociada?" cambia el buscador de negocio por uno de
**contacto** directo — la empresa del caso se toma automáticamente de la
ficha del contacto (decisión explícita: no se pide elegir empresa aparte).
Con negocio de origen, el comportamiento no cambia. En el detalle del caso,
"Venta de origen" y su link solo se muestran cuando corresponde.

### Esquema

| Tabla | Cambio |
|---|---|
| `casos_postventa` | `negocio_id` pasa de NOT NULL a **opcional** (`ALTER COLUMN ... DROP NOT NULL`, no-op sobre bases que ya lo tengan nullable). |

### Backend / Frontend

- `backend/routes/postventa.js`: `POST /postventa` acepta `negocio_id` **o**
  `contacto_id` (uno de los dos). Con negocio sigue derivando contacto/
  empresa del negocio; con contacto directo, la empresa sale de la ficha
  del contacto.
- `frontend/src/pages/postventa/Postventa.jsx`: toggle en "Nuevo caso"; en
  el detalle, oculta la referencia al negocio cuando no aplica.

## Verificación local

Los 3 puntos se probaron por separado contra Postgres real (base nueva y,
para el punto 3, también contra una base con la restricción `NOT NULL`
vieja y datos ya cargados, para confirmar que la migración no rompe
instalaciones existentes). Para el punto 2, sin credenciales reales de R2
en el entorno de desarrollo, se simuló el servicio de almacenamiento para
probar el flujo de subida/descarga/borrado de punta a punta; el
comportamiento sin R2 configurado (mensaje "no configurado todavía") se
probó tal cual, sin simular nada — es el mismo camino que ya usa Despacho.

## Pendientes explícitos (fuera de esta nota)

1. `docs/HT-AP-03-documento-consolidado.md` — actualizado junto con esta
   nota (mismo commit).
2. Manual de usuario (HT-IN-05) — actualizado a v06 con las 3 funciones.

---

*Historial completo de decisiones queda archivado junto a las notas
v1.2–v1.20 en `docs/HT-AP-03-nota-cambio-v1.X.md`.*
