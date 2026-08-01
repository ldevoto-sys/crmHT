# HT-AP-03 — Nota de cambio v1.19

**Fecha:** 01-08-2026
**Módulo:** Puesta en producción del CRM (go-live) — secuencias por etapa, Dashboard,
fix de importadores masivos, ajustes de envío de cotización, búsqueda en vivo.
**Estado:** Implementada, verificada localmente para cada punto y desplegada en
`staging` → `main` (producción) el 01-08-2026.

## Contexto

Esta nota agrupa todo lo construido y desplegado el día del corte a producción
(fin de semana viernes-lunes acordado con el equipo), en el orden en que se hizo.
No es una sola feature: son 7 cambios independientes, cada uno probado por separado
antes de subir. Rango de commits en `main`: `b607040`..`7d07906`.

## 1. Secuencias de seguimiento por etapa de pipeline

**Problema que reemplaza:** hasta ahora existía un solo toggle global
`secuencias.es_default_post_cotizacion` — una secuencia marcada como "default" se
disparaba sola al **enviar una cotización**, sin importar en qué etapa del pipeline
estuviera el negocio, y reemplazaba cualquier otra secuencia activa.

**Mecanismo nuevo:** cualquier etapa del pipeline (`pipeline_etapas`) puede tener una
secuencia asociada (`pipeline_etapas.secuencia_id`). Al mover un negocio a una etapa:
- Si la etapa tiene secuencia asociada → se dispara esa secuencia, reemplazando
  cualquier otra que estuviera activa o pausada en el negocio (misma lógica de
  "prevalece" que el mecanismo viejo, pero generalizada a cualquier etapa, no solo
  al envío de cotización).
- Si la etapa **no** tiene secuencia asociada → se detiene la secuencia que viniera
  corriendo (no queda una secuencia de una etapa anterior corriendo indefinidamente
  en una etapa que no la necesita).
- Al cerrar el negocio (ganado/perdido) la secuencia se detiene siempre.

Ver `backend/services/secuencias.js#alCambiarEtapa`.

### Esquema

| Tabla | Cambio |
|---|---|
| `pipeline_etapas` | + `secuencia_id INTEGER REFERENCES secuencias(id) ON DELETE SET NULL` |
| `secuencias` | se elimina `es_default_post_cotizacion` y su índice único parcial |

**Migración automática al arrancar** (`initDb`, una sola vez, detecta la columna
vieja): si existía una secuencia marcada `es_default_post_cotizacion = true`, se
asocia automáticamente a toda etapa de tipo `abierta` cuyo nombre sea "Cotizado"
(ILIKE) y que todavía no tuviera secuencia asignada. Así ningún negocio pierde su
secuencia post-cotización solo por el cambio de mecanismo.

### Backend/Frontend

- `backend/routes/config.js` — CRUD de `pipeline_etapas` acepta/devuelve
  `secuencia_id`.
- `backend/routes/negocios.js` — al cambiar `etapa_id` de un negocio, llama a
  `alCambiarEtapa` en vez de la lógica vieja de "post-cotización".
- `backend/routes/secuencias.js` — se quita el endpoint/campo de marcar una
  secuencia como default global (ya no existe ese concepto).
- `frontend/src/pages/admin/ConfigPipeline.jsx` — selector de secuencia por etapa.
- `frontend/src/pages/admin/ConfigSecuencias.jsx` — se quita el toggle "Predeterminada
  (post-cotización)".

**Nota:** el §4 y §7 de `HT-AP-03-documento-consolidado.md` todavía describen el
mecanismo viejo (`es_default_post_cotizacion`) — pendiente actualizarlos (ver
Pendientes, punto 8).

## 2. Dashboard con actividad del mes + limpieza del menú

El Dashboard era un texto estático ("CRM Comercial — Bloque A (andamiaje)") desde el
Bloque A original. Se reemplaza por un resumen real del mes en curso:

- **Backend:** `GET /api/reportes/actividad-mes?desde=&hasta=&pipeline_id=` (nuevo,
  `backend/routes/reportes.js`) — agrupa por vendedor, en un solo query con `FULL
  JOIN` de dos subconsultas: monto/cantidad de **cotizaciones emitidas** (mismo
  filtro de fecha `c.created_at` que ya usaba `cotizaciones-por-dia`, tomando solo
  la última versión de cada cotización) y monto/cantidad de **negocios pasados a
  cerrado-ganado** (mismo filtro `n.fecha_cierre` que ya usaba `ranking-vendedores`).
  Respeta el mismo `vendedorFiltro()` que el resto de `/reportes` (un vendedor solo
  ve lo propio).
- **Frontend:** `frontend/src/pages/Dashboard.jsx` reescrito — 2 tarjetas de total
  (Cotizado / Cerrado ganado del mes) + gráfico de barras horizontales (librería
  **recharts**, dependencia nueva) comparando cotizado vs. cerrado-ganado por
  vendedor + tabla de detalle debajo. Colores de marca exactos (`#34B3DE` cotizado,
  `#112548` cerrado-ganado) — son los únicos dos colores autorizados, así que el
  gráfico usa contraste + leyenda + tabla como respaldo de accesibilidad en vez de
  una paleta categórica de más colores.
- **Menú lateral** (`frontend/src/components/Layout.jsx`): se quitan las entradas
  "Bandeja WhatsApp" y "Cola de asignación" de los 4 roles que las tenían (el canal
  de WhatsApp no está operativo). Las rutas `/bandeja` y `/cola` siguen existiendo
  en `App.jsx` — solo se ocultó el acceso desde el menú, no se bloqueó por URL
  directa (decisión explícita, ver conversación de esa fecha).

## 3. Versión de build visible (diagnóstico de despliegue)

Problema real encontrado al probar: no había forma de confirmar, mirando la
pantalla, si un ambiente (staging/producción) ya tenía la última versión desplegada
o seguía con el deploy anterior.

- `frontend/vite.config.js` — inyecta en build time (`define`) el commit corto y la
  fecha de build. Prioriza `process.env.RAILWAY_GIT_COMMIT_SHA` (variable que
  Railway sí inyecta en el build) sobre `git rev-parse --short HEAD`, porque Railway
  arma el build **sin** carpeta `.git` — el primer intento con `git rev-parse` caía
  siempre al fallback `"dev"` en Railway (funcionaba solo en local).
- `frontend/src/components/Layout.jsx` — pie del menú lateral: `v{commit}`, con la
  fecha de build en el `title` (tooltip).

## 4. Importadores de Empresas y Contactos: se colgaban con archivos grandes

**Síntoma real:** al importar el CSV de empresas (49.116 filas, carga inicial de
clientes para el go-live), la pantalla quedaba en "Procesando…" sin terminar nunca.

**Causa:** `POST /api/empresas/importar/confirmar` y
`POST /api/contactos/importar/confirmar` hacían hasta 2-3 consultas a la base **por
fila**, en un `for` secuencial, todas dentro de una sola transacción. Con 49.116
filas eso son hasta ~100.000 *round-trips* seguidos a Postgres — nunca se cuelga
"para siempre", pero tarda tantos minutos que el proxy/navegador corta la conexión
antes de que llegue la respuesta (el import puede terminar solo, en segundo plano,
mucho después de que el usuario dejó de mirar la pantalla — confirmado en este caso:
una ejecución vieja terminó de insertar casi todo el archivo horas después).

**Fix — `backend/routes/empresas.js`:** las filas con RUT (el caso normal, RUT es
`UNIQUE` en la tabla) se agrupan en lotes de 500 y se resuelven con un solo
`INSERT ... ON CONFLICT (rut) DO UPDATE` por lote (agrega/actualiza sin pisar datos
ya cargados, vía `COALESCE(empresas.campo, EXCLUDED.campo)`). Se usa el truco
`RETURNING (xmax = 0) AS es_nuevo` para saber, por fila, si fue inserción o
actualización, y así seguir devolviendo el mismo conteo que antes. Las filas sin RUT
(matcheo por razón social) se dejan fila a fila, igual que antes — son pocas y la
lógica de "una fila puede actualizar a otra recién insertada del mismo archivo"
necesita ver los cambios dentro de la misma transacción.

**Fix — `backend/routes/contactos.js`:** mismo patrón. Además, la resolución de la
empresa asociada a cada contacto (por `empresa_rut`/`empresa_nombre`) se hace **una
sola vez en bloque** al principio (`resolverEmpresasEnBloque`) en vez de una
consulta+posible-insert por contacto — se deduplican las empresas nuevas a crear
(por rut si tiene, por nombre si no) y se insertan también en lotes de 500. Los
contactos con teléfono (único en la tabla) se resuelven en lotes con
`INSERT ... ON CONFLICT (telefono_e164) DO UPDATE`; los contactos sin teléfono
(matcheo por email, con la regla de marcar `revisar_duplicado` si el email ya
existía en más de un contacto) se dejan fila a fila.

**Medido en local** (Postgres 16, misma forma de datos que producción):

| Escenario | Antes | Después |
|---|---|---|
| 49.116 empresas nuevas | (no llegó a terminar en la prueba real) | ~1,7 s |
| 49.116 empresas, todas ya existentes (reimport) | — | ~1,4 s |
| 30.000 contactos + 10.000 empresas nuevas referenciadas | — | ~1,5 s |
| Reimport de los mismos 30.000 contactos | — | ~1,1 s |

**Causa raíz real del primer reintento fallido (error "duplicate key value violates
unique constraint" al confirmar en staging):** el mismo RUT aparecía en el archivo
real en dos formatos de texto distintos (ej. `77.131.014-1` y `77131014-1`, según el
sistema de origen del dato). Como la comparación era texto plano, ambas variantes
pasaban la deduplicación "RUT duplicado dentro del archivo" (que compara strings
exactos) como si fueran RUTs distintos — ambas nuevas, cayendo en el mismo lote de
inserción, y chocando entre sí contra la restricción única de la base al ser
literalmente el mismo RUT.

**Fix:** `backend/utils/validaciones.js` — nueva función `normalizarRut(rut)`, lleva
todo RUT ya validado (`validarRut`) a un formato único `XX.XXX.XXX-X` (con puntos,
DV en mayúscula — es el formato que ya usan los placeholders de Usuarios/Empresas/
Contactos en el resto del sistema). Se aplica en `backend/services/import_empresas.js`
y `backend/services/import_contactos.js`, antes de deduplicar/comparar/guardar. Con
esto, dos filas del mismo RUT en distinto formato se detectan como duplicado real
dentro del archivo (rechazadas con el mismo motivo de siempre) en vez de llegar a
chocar contra la base.

De paso, se agregó al mensaje de error de ambos importadores el `err.detail` de
Postgres (ej. "Key (rut)=(...) already exists.") — antes solo se mostraba
`err.message`, que no incluye el valor exacto que chocó.

## 5. Enviar cotización: se quita el canal WhatsApp, advertencia si falta email

`frontend/src/pages/ventas/DetalleCotizacion.jsx` — el panel "Enviar cotización"
tenía dos casillas (Correo/WhatsApp). Se quita la casilla y el envío por WhatsApp
(el canal no está operativo todavía — sin credenciales de Meta). El backend
(`POST /:id/enviar-whatsapp`) no se tocó, solo se dejó de invocar desde esta
pantalla.

Como consecuencia directa de sacar WhatsApp: si un contacto no tiene email
registrado, ya no queda **ningún** canal para enviar la cotización desde el
sistema. Antes esto se indicaba con un texto gris chico junto a la casilla
deshabilitada ("(sin email registrado)"); ahora se muestra una advertencia visible
(fondo ámbar) explicando la situación y qué hacer ("Agrégalo en la ficha del
contacto"), para que no pase desapercibido.

## 6. Búsqueda en vivo + búsqueda de contactos por empresa asociada

**Búsqueda en vivo (Empresas, Contactos, Productos):** estas 3 pantallas requerían
Enter o el botón "Buscar" para filtrar; Cotizaciones ya buscaba sola mientras se
escribe (debounce de 300 ms). Se aplicó el mismo patrón — `useEffect` con
`setTimeout`/`clearTimeout` de 300 ms sobre el estado del input — a
`frontend/src/pages/maestros/Empresas.jsx`, `Contactos.jsx` y `Productos.jsx`,
quitando el `<form onSubmit>`/botón "Buscar" manual. **Sin cambios en el backend**
— mismo endpoint `ILIKE ... LIMIT 500` de siempre en los 4 casos.

**Búsqueda de contactos por nombre de empresa:** se detectó que buscar en Contactos
por el nombre de una empresa (ej. "banco santander") no encontraba nada, aunque la
columna "Empresa" del listado mostraba exactamente ese texto. Causa: el filtro de
`GET /api/contactos` (`filtrosContactos` en `backend/routes/contactos.js`) solo
comparaba `nombre`/`apellido`/`email`/`telefono_e164` **del contacto**, nunca la
razón social de la empresa asociada (aunque la consulta ya hace `LEFT JOIN
empresas e` para mostrarla). Se agrega `e.razon_social` al `OR` del filtro.

## 7. Puesta en producción (go-live)

- **Deploy:** todo lo anterior se probó y desplegó primero en `staging`
  (verificación manual de cada punto por el usuario), y luego se hizo
  fast-forward `staging` → `main`, lo que dispara el deploy de producción en
  Railway (mismo mecanismo de siempre, sin pipeline de CI/CD — ver README).
- **Correlativo de cotización:** la base de datos de producción estaba limpia
  (sin negocios/cotizaciones reales todavía, solo el catálogo de productos), así
  que `cotizacion_correlativo_global` no tenía fila. Se insertó manualmente contra
  la base de producción (vía consola de Railway → `psql`):
  ```sql
  INSERT INTO cotizacion_correlativo_global (id, ultimo) VALUES (1, 714838);
  ```
  para que la numeración de cotizaciones nuevas continúe desde donde quedó el
  sistema anterior (**714839** en adelante), en vez de reiniciar en 1.
- **Fuera de esta puesta en producción:** WhatsApp (sin credenciales todavía);
  carga de la base de clientes/empresas reales, creación de usuarios/perfiles y
  verificación de las secuencias de seguimiento con datos reales quedan a cargo
  del equipo comercial, usando los importadores ya corregidos en el punto 4.

## Pendientes explícitos (fuera de esta nota)

1. `docs/HT-AP-03-documento-consolidado.md` **todavía no incluye** el Cotizador
   Operaciones (v1.17/v1.18) ni ninguno de los 7 puntos de esta nota — sigue
   describiendo el mecanismo viejo de secuencias (`es_default_post_cotizacion`,
   §4 y §7) y el Dashboard como estaba en el Bloque A (no tiene sección propia).
   Consolidarlo es un trabajo aparte (revisar cada sección afectada, no solo
   agregar texto al final) — no se hizo en esta nota para no apurarlo.
2. Manual de usuario (HT-IN-05) — no se tocó en esta sesión; vive en SharePoint,
   no en este repositorio.
3. Carga real de clientes/empresas, usuarios y verificación de secuencias con
   datos reales — a cargo del equipo, no depende de código.

---

*Historial completo de decisiones queda archivado junto a las notas v1.2–v1.18 en
`docs/HT-AP-03-nota-cambio-v1.X.md`.*
