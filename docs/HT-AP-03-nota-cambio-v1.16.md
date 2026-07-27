# HT-AP-03 — Nota de cambio v1.15 → v1.16

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.15 → v1.16
**Fecha:** 2026-07-27
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Primer punto del backlog priorizado (v1.15, §14) resuelto — ya
se contaba con la API key de Google Maps Platform.

---

## 1. Optimización de ruta de Despacho

- Botón **"Optimizar ruta"** en el detalle de un despacho (visible al
  gestor cuando hay 2 o más paradas pendientes): calcula el orden más
  eficiente para visitarlas, ida y vuelta desde la dirección de la
  empresa (Configuración → Datos de empresa), usando Directions API de
  Google (`optimizeWaypoints`).
- Muestra la sugerencia (orden, tiempo y distancia por tramo, total) antes
  de aplicarla — el encargado decide si la usa o la descarta. Al aplicarla,
  reordena las paradas (`orden`); no cambia nada más.
- **Restricción explícita:** solo opera sobre paradas **pendientes de un
  mismo día**. Si detecta fechas distintas entre las paradas pendientes,
  avisa y no calcula la ruta — no tiene sentido rutear junto paradas de
  días distintos.
- **Geocodificación:** cada dirección se convierte a coordenadas
  (Geocoding API) la primera vez que se necesita, y se cachea en
  `despacho_puntos.lat/lng` para no repetir la consulta. Si se edita la
  dirección o comuna de una parada, el caché se invalida automáticamente.
- Si falta la API key, o Google no puede ubicar alguna dirección, el error
  se muestra tal cual (nombrando la parada específica que falló) — no hay
  fallback silencioso ni orden aproximado.

## 2. Hora de llegada estimada por parada

- Al optimizar, se puede indicar una **hora de salida** (por defecto, la
  hora de apertura configurada en Configuración → Horario de atención).
  Con eso, la sugerencia muestra la **hora de llegada estimada a cada
  parada** y la hora estimada de vuelta a la empresa, sumando el tiempo de
  viaje de cada tramo más el tiempo estimado que cada parada toma en sitio
  (`duracion_estimada_min`, si está cargado).
- Es una estimación informativa para que el encargado decida — no bloquea
  ni valida nada automáticamente todavía (eso es el siguiente paso: marcar
  en rojo si una parada tiene una ventana horaria propia y la hora
  estimada no calza).

## 3. Primer paso hacia casos reales de ruteo (en construcción)

Se identificaron con Gerencia tres variables que la optimización todavía
no resuelve del todo: **uno o dos vehículos**, **restricciones horarias
por parada** y **orden fijo obligatorio para algunas paradas**. Se acordó
partir con un enfoque simple (el sistema sugiere, el encargado ajusta a
mano) en vez de un solver de ruteo con restricciones duras — eso último
requeriría otra API de Google (Route Optimization / fleet routing),
bastante más compleja y cara. Quedan por construir: campo de vehículo por
parada (optimizar por grupo), ventana horaria opcional por parada
(marcando en rojo si no calza con la hora estimada), candado de "orden
fijo" por parada, y reordenar paradas a mano (hoy solo se puede aceptar o
descartar la sugerencia completa).

## 4. Configuración pendiente

- **Cargar en Railway** la variable `GOOGLE_MAPS_API_KEY` (restringida en
  Google Cloud Console a Directions API + Geocoding API, sin restricción
  de sitio/IP porque la usa el backend, nunca el navegador). Mientras no
  esté, el botón "Optimizar ruta" responde con un error claro ("no
  configurado todavía"), sin bloquear el resto del módulo.

## 5. Impacto en el documento base

- **§6 (Modelo de datos):** `despacho_puntos.lat`, `despacho_puntos.lng`
  (nullable, cacheados).
- **§13 (Integraciones externas):** nueva integración — Google Maps
  Platform (Directions API, Geocoding API), uso exclusivamente server-side.
- **§14 (Pendientes abiertos):** punto 1 del backlog (v1.15) resuelto;
  queda pendiente solo cargar la variable de entorno en Railway.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.16 · Borrador para validación de Gerencia*
