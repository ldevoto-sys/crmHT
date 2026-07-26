# HT-AP-03 — Nota de cambio v1.13 → v1.14

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.13 → v1.14
**Fecha:** 2026-07-26
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Nuevo módulo de Despacho, para coordinar rutas de retiro/entrega
de productos — puede originarse en un negocio cerrado, en un caso de
postventa, o registrarse suelto (logística interna sin relación a una
venta).

---

## 1. Módulo de Despacho

- Un **despacho** es una ruta con una o más **paradas**. Cada parada exige:
  dirección, comuna, fecha, tipo (retiro o entrega), datos de contacto y el
  documento de respaldo (factura o guía de despacho para una entrega, O/C
  para un retiro; "otro" para casos internos sin ese tipo de respaldo).
- El vínculo a un negocio o a un caso de postventa es **opcional** (ninguno
  de los dos es obligatorio): cubre tanto un despacho que nace de una venta
  cerrada o de una garantía, como logística interna sin relación comercial.
- Vista de lista/calendario por fecha (no Kanban): se decidió así porque el
  estado de un despacho es un flujo lineal fijo (programado → en ruta →
  completado/cancelado), no etapas configurables como Ventas o Postventa.
  Filtros: rango de fecha y estado.
- Cada parada se puede marcar **completada** por separado, y se puede
  **editar** después de creada (corregir dirección, fecha, contacto, etc. —
  agregado tras las pruebas del usuario, que detectó que solo se podía
  completar o eliminar, no corregir).
- **Lugares frecuentes de retiro/entrega:** configurador (Configuración →
  Lugares frecuentes de despacho) para guardar direcciones habituales (ej.
  proveedores como Vulcano o Koslan) con su dirección, comuna y contacto. Al
  crear una parada, un selector opcional autocompleta esos tres campos; el
  tipo (retiro/entrega) y el documento se siguen eligiendo en cada caso,
  porque un mismo lugar puede usarse para ambos.

## 2. Foto de respaldo desde el celular

- El encargado puede subir, desde el celular, una foto del documento
  firmado al completar una parada (guía de despacho, factura o O/C
  firmada por quien recibe/entrega). El selector de archivo permite elegir
  tanto tomar una foto nueva como subir una ya existente en el teléfono
  (se corrigió un ajuste que forzaba abrir la cámara directo, sin dar esa
  segunda opción).
- **Almacenamiento:** bucket privado de Cloudflare R2, **separado** del
  bucket de imágenes de producto (que es público) y también distinto del
  de adjuntos de WhatsApp — por tratarse de documentos con firmas y datos
  de clientes. La visualización en el CRM es autenticada (igual que los
  adjuntos de WhatsApp, §8 del documento base): no hay URL pública directa.
- **Pendiente de configurar en Cloudflare** (no bloquea el resto del
  módulo): crear el bucket privado y su token de API, y cargar en Railway
  las variables `R2_DESPACHO_ACCESS_KEY_ID`, `R2_DESPACHO_SECRET_ACCESS_KEY`,
  `R2_DESPACHO_BUCKET_NAME`. Mientras no estén, subir una foto responde
  "no configurado todavía" en vez de fallar silenciosamente.

## 3. Permisos

- Mismo patrón que Postventa (v1.13): `users.es_encargado_despacho`
  (booleano, atribución adicional independiente del rol). Quien lo tiene
  (o es administrador/jefe comercial) gestiona el módulo completo — agrega
  y edita paradas, las marca completadas, sube fotos, ve todos los
  despachos. Un vendedor sin el atributo puede crear un despacho y ver los
  que él creó, pero no gestionar el resto.

## 4. Diferido a una siguiente etapa (decisión explícita, no olvido)

- **Mapa y optimización de ruta:** visualizar los puntos del día en un
  mapa, agregar tiempo estimado por parada, y un botón que sugiera el orden
  y horario óptimo de la ruta. Requiere que la empresa obtenga primero una
  cuenta/API key de un proveedor de mapas (Google Maps Platform o Mapbox)
  antes de poder construirse.

## 5. Impacto en el documento base

- **§1 (Alcance y roles):** nueva fila en la matriz — "Despacho: gestión
  completa (admin/jefe comercial/encargado), crear y ver propios
  (vendedor)".
- **§6 (Modelo de datos):** `users.es_encargado_despacho`; tablas
  `despachos` (negocio_id y caso_postventa_id opcionales, estado con enum
  fijo programado/en_ruta/completado/cancelado) y `despacho_puntos` (tipo,
  dirección, comuna, fecha, contacto, documento, `foto_respaldo_key`,
  completado); tabla `despacho_lugares_frecuentes`.
- **§11 (Integraciones externas):** tercer bucket de Cloudflare R2 (privado,
  documentos de despacho), pendiente de crear.
- **§12 (Pendientes abiertos):** bucket de R2 de despacho pendiente de
  configurar; mapa/optimización de ruta diferido a una siguiente etapa.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.14 · Borrador para validación de Gerencia*
