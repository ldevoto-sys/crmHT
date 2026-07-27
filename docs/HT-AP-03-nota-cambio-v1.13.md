# HT-AP-03 — Nota de cambio v1.12 → v1.13

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.12 → v1.13
**Fecha:** 2026-07-26
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Nuevo módulo de Postventa, para gestionar garantías y reclamos
técnicos de forma separada del pipeline de ventas, con trazabilidad al
negocio de origen.

---

## 1. Módulo de Postventa

- Un caso de postventa siempre se vincula a un **negocio de origen**
  (la venta a la que corresponde el reclamo/garantía) — obligatorio, para
  no perder la trazabilidad.
- Tablero Kanban propio (`/postventa`), separado del Pipeline de ventas —
  usa su propia tabla de etapas (`postventa_etapas`), **no** el mecanismo de
  pipelines múltiples de la v1.12: Postventa es un solo flujo, no un área
  comercial con su propio pipeline, y reutilizar esa tabla habría mezclado
  las etapas de Postventa en el selector de pipelines de Ventas/Operaciones.
- Etapas: dos terminales protegidas (**Resuelto**, **Rechazado** — no se
  pueden eliminar) y las intermedias abiertas que defina el encargado
  (Configuración → Config Postventa, con reordenamiento).
- Campos del caso: título, descripción, producto/equipo reclamado (opcional,
  buscable en el catálogo), detalle del equipo (N° de serie, ubicación),
  prioridad (baja/media/alta/urgente), **fecha límite de respuesta**
  (obligatoria) y técnico asignado.
- **Alertas de SLA** en cada tarjeta según la fecha límite de respuesta:
  amarillo si quedan 3 días o menos, rojo si ya venció.
- Filtro en el tablero: Todos / Vencidos / Por vencer.
- Casos creados antes de que existiera alguna etapa abierta (o cuya etapa
  fue desactivada) se muestran en una columna aparte **"Sin etapa
  asignada"**, para que nunca queden invisibles.

## 2. Permisos: atribución adicional, no un rol nuevo

- Se agrega `users.es_encargado_postventa` (booleano), **independiente del
  rol** — mismo patrón que se usará después para Despacho (v1.14). Decisión
  explícita: gestionar Postventa es una función que alguien puede cubrir
  temporalmente (ej. el jefe comercial durante una licencia) sin cambiarle
  el rol ni crear un perfil de usuario nuevo.
- Quien tiene el atributo marcado (o es administrador/jefe comercial)
  gestiona el tablero completo: mueve etapas, asigna técnico, prioridad y
  SLA. Un vendedor sin el atributo puede **crear** un caso y ver los que él
  creó, pero no gestionar el resto del tablero.
- El menú y las rutas de Postventa aparecen para cualquiera con el
  atributo marcado, aunque su rol no lo traiga por defecto.

## 3. Impacto en el documento base

- **§1 (Alcance y roles):** nueva fila en la matriz — "Postventa: gestión
  completa (admin/jefe comercial/encargado), crear y ver propios (vendedor)".
- **§6 (Modelo de datos):** `users.es_encargado_postventa`; tablas
  `postventa_etapas` y `casos_postventa` (con `negocio_id` obligatorio,
  `producto_id`/`detalle_equipo` opcionales, `fecha_limite_respuesta`,
  `tecnico_asignado_id`, `etapa_id`).

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.13 · Borrador para validación de Gerencia*
