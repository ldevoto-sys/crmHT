# HT-AP-03 — Nota de cambio v1.24

**Fecha:** 07-08-2026
**Módulo:** Pipeline/Negocios (monto estimado), Reportería/Comunicación
(aviso de novedades).
**Estado:** Implementadas, verificadas localmente y desplegadas en `staging`
→ `main` (producción) el 07-08-2026.

## Contexto

Un negocio (originado por WhatsApp: "wsp +56957114354 angelica") mostraba
monto $0 en Reportería y Pipeline pese a tener una cotización real de
$472.075 detrás. Se investigó la causa y se corrigió (punto 1). En paralelo,
al promover ese fix a producción junto con el resto del trabajo acumulado en
`staging` (10 commits en total — ver detalle más abajo), surgió la pregunta
de cómo avisarles a los usuarios qué cambió sin depender de que lean esta
nota técnica; se construyó un mecanismo para eso (punto 2), que **queda
establecido como estándar**: de ahora en adelante, cada vez que se promueve
un conjunto de cambios a producción, se envía un aviso por correo a todos
los usuarios activos con un resumen en lenguaje simple.

## 1. Monto estimado: editable a mano + sincronización al cotizar

**Problema que resuelve:** `negocios.monto_estimado` solo se llenaba a mano
al crear el negocio (campo opcional). Si quedaba vacío, seguía en $0 **para
siempre** — generar una cotización movía el negocio a la etapa "Cotizado"
pero nunca actualizaba el monto. Tampoco había forma de corregirlo después:
en la ficha del negocio se mostraba como dato de solo lectura, a diferencia
de "Probabilidad de cierre" o "Fecha estimada de cierre", que sí tienen
campo editable. El caso no era aislado — afecta a cualquier negocio donde no
se haya tipeado el monto al crearlo.

**Qué hace:**
- La ficha del negocio (`DetalleNegocio.jsx`) suma un campo "Monto
  estimado" editable con botón "Guardar", mismo patrón que Probabilidad de
  cierre. El backend (`PUT /api/negocios/:id`) ya aceptaba este campo, no
  requirió cambios.
- Al generar una cotización nueva, editarla en borrador, o generar una
  nueva versión, `negocios.monto_estimado` se actualiza **siempre** con el
  total de esa cotización — sobrescribe cualquier valor cargado a mano.
  Decisión explícita (alternativa descartada: solo sincronizar si el monto
  estaba en NULL/0, para no pisar una corrección manual) — se prefirió
  sobrescribir siempre para que el monto refleje la última cotización real
  y no quede desactualizado si el total cambia.

### Backend / Frontend

- `backend/routes/cotizaciones.js`: función `sincronizarMontoEstimado(client,
  negocioId, total)`, llamada en `POST /` (nueva cotización), `PUT /:id`
  (edición en borrador) y `POST /:id/nueva-version`.
- `frontend/src/pages/ventas/DetalleNegocio.jsx`: campo editable "Monto
  estimado".

## 2. Aviso manual de novedades por correo (nuevo estándar)

**Problema que resuelve:** los cambios se documentan técnicamente en estas
notas de cambio, pero los usuarios del CRM no las leen — no había forma de
avisarles, en lenguaje simple, qué cambió cada vez que se promueve algo a
producción.

**Qué hace:** un mecanismo reutilizable, no un envío ad-hoc:
- `POST /api/novedades/enviar {titulo, cambios: string[]}`
  (administrador/jefe comercial): arma un correo con el título y la lista
  de cambios, y lo envía a todos los usuarios activos con correo — mismo
  criterio de destinatarios que el informe diario (§9 del consolidado).
- Página **"Avisar novedades"** (Configuración → administrador/jefe
  comercial): un cambio por línea, confirmación antes de enviar, y el
  resultado (X/Y enviados).

Sin persistencia de historial de envíos — es un envío puntual, no un
registro programado. El contenido lo redacta a mano quien promueve el
cambio (o se apoya en Claude para traducir los mensajes técnicos de commit
a lenguaje de usuario), nunca se genera automáticamente a partir del log de
Git.

**Estándar hacia adelante:** cada vez que se promueve un conjunto de
cambios visibles para el usuario a `main` (producción), corresponde
redactar un resumen breve y enviarlo desde esta pantalla, además de (no en
reemplazo de) la nota de cambio técnica.

### Backend / Frontend

- `backend/services/email.js`: template `novedades(usuario, titulo,
  cambios)`.
- `backend/services/novedades.js` (nuevo): `enviarNovedades(titulo,
  cambios)`.
- `backend/routes/novedades.js` (nuevo), montado en `/api/novedades`.
- `frontend/src/pages/admin/Novedades.jsx` (nuevo), ruta
  `/config/novedades`, entrada de menú "Avisar novedades".

## Otros commits promovidos a producción en este mismo despliegue

Antes de estos dos cambios, `main` estaba 10 commits atrás de `staging`
(divergencia por cherry-picks previos con hashes distintos pero mismo
contenido — se verificó con `git diff main staging` que el árbol de
archivos quedó idéntico byte a byte tras la promoción). Los otros 8 commits
ya estaban documentados en notas anteriores y no se repiten aquí:

- Fix de etapas del Pipeline del negocio (mostraba siempre las de Ventas
  Directas).
- Texto del correo de cotización editable al enviar (v1.22).
- Formas de pago en cotización + datos bancarios condicionales (v1.22).
- Fecha de compromiso en el Pipeline (v1.22).
- Módulo Servicio Técnico de bombas + rol `tecnico` (v1.22).
- Fotos al crear caso de Postventa/Servicio Técnico (v1.22).
- Adjuntos históricos multi-archivo en Despacho/Postventa/Servicio Técnico
  (v1.23).
- Las propias notas de cambio v1.22 y v1.23.

## Verificación local

Ambos puntos probados contra Postgres real (base nueva) vía API (`curl`),
sin pasar por el navegador:
- Punto 1: negocio creado sin monto (`monto_estimado: null`) → generar
  cotización → `monto_estimado` pasa al total de la cotización y la etapa
  avanza a "Cotizado". Edición de la cotización (cambia el total) →
  `monto_estimado` se actualiza de nuevo. Edición manual del monto vía el
  endpoint → se guarda, pero una nueva edición de la cotización lo
  sobrescribe (comportamiento esperado). Reportería (`GET
  /api/reportes/embudo`) refleja el monto correcto en la etapa.
- Punto 2: `POST /api/novedades/enviar` sin `titulo`/`cambios` responde 400;
  con datos válidos y sin `BREVO_API_KEY` configurada (entorno de
  desarrollo) responde `{enviados: 0, total: N}` sin errores — mismo
  comportamiento ya validado en el informe diario cuando falta esa
  variable.
- `npm run build` del frontend sin errores en ambos puntos.

El envío real del correo de novedades de esta versión a los usuarios queda
a criterio de quien administra el sistema — no se dispara automáticamente
desde este cambio.

## Pendientes explícitos (fuera de esta nota)

1. `docs/HT-AP-03-documento-consolidado.md` — actualizado junto con esta
   nota (mismo commit): §3 (monto estimado editable + sincronización) y §9
   (aviso manual de novedades, nuevo estándar).
2. Manual de usuario (HT-IN-05) — pendiente de actualizar con ambas
   funciones; sigue atrasado respecto a los cambios de v1.22/v1.23 (ver nota
   v1.23, pendiente 2).

---

*Historial completo de decisiones queda archivado junto a las notas
v1.2–v1.23 en `docs/HT-AP-03-nota-cambio-v1.X.md`.*
