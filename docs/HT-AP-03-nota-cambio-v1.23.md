# HT-AP-03 — Nota de cambio v1.23

**Fecha:** 07-08-2026
**Módulo:** Adjuntos de Despacho, Postventa y Servicio Técnico.
**Estado:** Implementado, verificado localmente y en `staging`. Pendiente
de aprobación explícita para promover a `main` (producción).

## Contexto

Pedido de Gerencia tras revisar la entrega de la nota v1.22: en Despacho,
cada parada solo guardaba **una** foto de respaldo, que se **perdía** al
subir una nueva ("Reemplazar foto"). En Postventa y Servicio Técnico el
historial ya se conservaba (varios archivos por caso, ninguno se borra al
subir otro), pero el control para agregar un archivo **después** de creado
el caso solo aceptaba uno a la vez.

## 1. Despacho: historial de archivos por parada (antes, una sola foto que se reemplazaba)

**Problema que resuelve:** subir una foto nueva en una parada borraba la
anterior — si se necesitaba, por ejemplo, la foto de la guía **y** la de la
factura firmada de la misma parada, no había forma de guardar ambas.

**Qué hace:** cada parada ahora guarda **todos** los archivos que se le
suban, igual que ya funcionaba en Postventa y Servicio Técnico. La foto que
ya existiera en una parada (columna `foto_respaldo_key`) se migra
automáticamente como el primer archivo de su historial, sin perderse. El
control para marcar una parada como "completada" sigue exigiendo al menos
un archivo, pero ya no exige que sea una foto específica — puede haber
varios.

### Esquema

| Tabla | Cambio |
|---|---|
| `despacho_adjuntos` | nueva — `punto_id` (FK a `despacho_puntos`), `archivo_key`, `archivo_nombre`, `archivo_mime`, `subido_por_id`, `created_at`. Mismo patrón que `postventa_adjuntos`/`servicio_tecnico_adjuntos`. |
| `despacho_puntos.foto_respaldo_key` | se mantiene sin uso (no se borra la columna) — la migración de arranque copia su valor a `despacho_adjuntos` una sola vez, sin duplicar si se ejecuta de nuevo. |

### Backend / Frontend

- `backend/db.js`: tabla `despacho_adjuntos` + migración de backfill desde
  `foto_respaldo_key`.
- `backend/routes/despacho.js`: se reemplazan las rutas de una sola foto
  (`POST/GET /puntos/:id/foto`) por un CRUD de historial —
  `GET/POST /puntos/:id/adjuntos` (subida múltiple en una sola solicitud,
  hasta 20 archivos), `GET /adjuntos/:id/archivo` (descarga autenticada),
  `DELETE /adjuntos/:id`. El listado de paradas expone `tiene_adjuntos`
  (antes `tiene_foto`) para saber si ya hay al menos un archivo. El gate de
  "completar" pasó de revisar una columna a revisar si existe al menos una
  fila en `despacho_adjuntos`.
- `frontend/src/pages/despacho/Despacho.jsx`: el componente `FotoPunto` (una
  foto, botón "Reemplazar foto") se reemplaza por `AdjuntosPunto` — lista de
  archivos históricos con acción "Ver" y "Eliminar" por archivo, y un
  selector "+ Agregar archivo(s)" que admite varios a la vez. Mismos
  permisos que antes (gestor de despacho sube/elimina; quien no gestiona
  solo ve).

## 2. Postventa y Servicio Técnico: selección múltiple al agregar adjuntos a un caso ya creado

**Problema que resuelve:** el historial de archivos de un caso ya se
conservaba completo, pero el formulario para agregar uno nuevo (dentro del
detalle del caso, distinto del que se usa al **crear** el caso) solo
aceptaba un archivo por envío — subir 3 fotos exigía repetir la acción 3
veces.

**Qué hace:** ese mismo formulario ahora permite elegir varios archivos de
una vez; se suben todos con la misma "tipo"/descripción elegida, uno tras
otro. Sin cambios en la base de datos ni en las rutas — cada archivo sigue
llegando al backend por separado (el backend ya aceptaba uno por solicitud),
solo cambia que el frontend hace varias solicitudes en vez de obligar a
repetir la acción a mano.

### Backend / Frontend

Sin cambios de esquema ni de rutas.
- `frontend/src/pages/postventa/Postventa.jsx`: el input de archivo del
  componente `AdjuntosCaso` pasa a admitir selección múltiple; sube cada
  archivo con una solicitud separada.
- `frontend/src/pages/servicio_tecnico/ServicioTecnico.jsx`: mismo cambio.

## Verificación local

Probado contra Postgres real (base nueva) y navegador real (Playwright),
con el servicio de almacenamiento (Cloudflare R2) simulado — mismo patrón
ya usado en notas anteriores, sin credenciales reales en este entorno de
desarrollo:
- Despacho: subida de 2 archivos en una sola solicitud a una parada, luego
  un tercero en una solicitud aparte — se confirmó que los 3 quedan
  (ninguno se pierde ni se reemplaza). Descarga y eliminación de un
  archivo puntual. Bloqueo de "completar" en una parada sin archivos, con
  el mensaje de error actualizado; desbloqueo al subir el primero.
- Postventa: caso creado sin negocio asociado, luego 2 archivos agregados
  en una sola selección desde el panel de adjuntos del caso ya creado —
  confirmado que ambos quedan registrados con el mismo tipo/descripción
  elegido.
- Servicio Técnico: mismo flujo de adjuntos verificado a nivel de backend
  (2 archivos subidos por separado, ninguno reemplaza al otro) — sin
  cambios de backend en este módulo, solo de frontend.
- `npm run build` del frontend sin errores tras los cambios.

## Pendientes explícitos (fuera de esta nota)

1. `docs/HT-AP-03-documento-consolidado.md` — actualizado junto con esta
   nota (mismo commit): §5 (Postventa — selección múltiple), §6 (Despacho —
   historial de adjuntos en vez de una sola foto), §13 (tabla
   `despacho_adjuntos`), §15 (Servicio Técnico — selección múltiple).
2. Manual de usuario (HT-IN-05) — pendiente de actualizar; además de este
   cambio, quedó atrás en varias funciones ya en `staging`/producción
   desde su última versión (v03) — ver conversación con Gerencia sobre el
   alcance de la próxima actualización.
3. Promoción a producción — pendiente de confirmación explícita de
   Gerencia tras revisar en `staging`.

---

*Historial completo de decisiones queda archivado junto a las notas
v1.2–v1.22 en `docs/HT-AP-03-nota-cambio-v1.X.md`.*
