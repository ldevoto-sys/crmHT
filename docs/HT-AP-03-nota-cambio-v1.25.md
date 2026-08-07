# HT-AP-03 — Nota de cambio v1.25

**Fecha:** 07-08-2026
**Módulo:** Cotizaciones (autoguardado, sesión), Postventa (aviso de
vencidos).
**Estado:** Implementadas, verificadas localmente y desplegadas en `staging`
→ `main` (producción) el 07-08-2026, fuera del horario de trabajo (ver
§17 del consolidado y `CLAUDE.md`).

## Contexto

Un usuario (Nicolás Quezada) reportó por correo haber sido desconectado de
su sesión dos veces mientras cotizaba, perdiendo el borrador de una
cotización extensa (ver nota v1.24, donde se registró la regla de
despliegue fuera de horario que surgió de este mismo incidente). Se
investigó el código para identificar la causa; los puntos 1 y 2 de esta
nota corrigen lo que se confirmó en el código. Por separado, se agregó el
punto 3 (aviso de Postventa vencido), pedido independiente de Gerencia.

## 1. Autoguardado de borrador de cotización

**Problema que resuelve:** el formulario de Nueva Cotización
(`NuevaCotizacion.jsx`) no tenía ninguna persistencia local — todo el
estado vivía en memoria de React. Cualquier interrupción antes de apretar
"Guardar" (sesión expirada, refresh, cierre accidental de la pestaña)
perdía el 100% de lo tecleado, sin posibilidad de recuperación. Esto es
independiente de qué cause la interrupción.

**Qué hace:** el formulario se autoguarda en `localStorage` del navegador
(con un pequeño debounce de 0.8s) mientras se edita. Al volver a entrar a
esa misma cotización (o a cotizar para el mismo negocio), si encuentra un
borrador guardado pregunta si se quiere recuperar — de ser así, reemplaza
lo recién cargado del servidor con lo que había en el borrador. El
borrador se limpia automáticamente al guardar la cotización con éxito.

La key del borrador identifica de forma única la cotización en curso:
editar una ya existente, o crear una nueva para un negocio (nuevo o ya
existente) — no se mezcla el borrador de una cotización con el de otra.

### Backend / Frontend

Sin cambios de backend.
- `frontend/src/pages/ventas/NuevaCotizacion.jsx`: dos `useEffect` nuevos
  (restaurar borrador al cargar, autoguardar en cada cambio relevante) y
  limpieza del borrador tras `guardar()` exitoso.

## 2. Interceptor de sesión expirada: aviso en vez de corte silencioso

**Problema que resuelve:** ante cualquier 401 del servidor, el frontend
(`api.js`) redirigía de inmediato a `/login` con recarga completa de
página, sin ningún aviso. Combinado con el punto 1 (sin autoguardado),
cualquier corte de sesión costaba el trabajo completo sin que la persona
supiera qué pasó.

**Qué hace:** antes de limpiar la sesión y redirigir, muestra un aviso
explicando que la sesión expiró y que, si se estaba armando una
cotización, el borrador se guardó y se ofrecerá recuperarlo al volver a
entrar (aprovechando el punto 1). El aviso es honesto sobre el alcance:
solo cubre lo que realmente se autoguarda hoy (cotizaciones), no todos los
formularios del sistema.

### Backend / Frontend

Sin cambios de backend.
- `frontend/src/api.js`: el interceptor de 401 agrega un `alert()` antes
  de redirigir, solo si había una sesión activa.

## Nota sobre la causa raíz del corte de sesión

Estos dos puntos corrigen el problema de fondo (pérdida de trabajo ante
cualquier interrupción) pero **no confirman ni descartan** qué causó el
corte de sesión original de Nicolás. La investigación de código (ver nota
v1.24) descartó el rate limiting como causa y no encontró cambios
recientes en la lógica de autenticación; quedó como hipótesis no
verificada que `JWT_SECRET` no esté fijada de forma persistente en
Railway (lo que invalidaría todas las sesiones activas en cada
despliegue) — pendiente de confirmar directamente en el panel de Railway,
fuera del alcance de este repositorio.

## 3. Aviso diario de casos de Postventa vencidos

**Problema que resuelve:** no había ninguna alerta proactiva cuando un
caso de Postventa se pasaba de su fecha límite de respuesta — solo se
notaba si alguien entraba a revisar el tablero manualmente.

**Qué hace:** todos los días, en la ventana de las 8:30 a las 8:44 hora de
Chile (el chequeo corre cada 15 minutos, igual que el informe diario —
cae en algún punto de esa ventana, no exactamente al minuto 30), si hay al
menos un caso de Postventa **abierto** (etapa tipo `abierta`, no
resuelto/rechazado) con la fecha límite de respuesta ya vencida, se envía
un correo con asunto **"CASO DE POSTVENTA VENCIDO"** y una tabla con el
detalle de cada caso (título, cliente, técnico asignado, fecha vencida,
días de atraso). Si no hay ningún caso vencido ese día, no se envía nada.

**Destinatarios:** usuarios activos con el atributo `es_encargado_postventa`,
o rol `administrador`, `jefe_comercial` o `gerencia` — independiente de si
gestionan Postventa día a día.

### Esquema

| Tabla | Cambio |
|---|---|
| `postventa_vencidos_envios` | nueva — `fecha DATE PRIMARY KEY`, `enviado_en`. Evita reenviar el aviso dos veces el mismo día (mismo patrón que `informe_diario_envios`). |

### Backend

- `backend/services/postventaVencidos.js` (nuevo): `casosVencidos()`,
  `destinatarios()`, `enviarPostventaVencidosSiHay()`,
  `enviarPostventaVencidosSiCorresponde()`.
- `backend/services/email.js`: template `postventaVencido`.
- `backend/routes/postventa.js`: `POST /vencidos/enviar-ahora`
  (administrador/jefe comercial) para pruebas o reenvíos.
- `backend/server.js`: chequeo horario agregado al mismo ciclo de 15 min
  que ya usan el informe diario y las secuencias.

## Verificación local

Ambos frentes probados contra Postgres real:
- Punto 1 y 2: probado en navegador real (Playwright) — ciclo completo
  escribir → autoguardar → recargar → confirmar restauración → título e
  ítem recuperados → guardar → borrador se limpia; y el aviso del
  interceptor ante un 401 forzado (token inválido).
- Punto 3: caso creado con fecha límite vencida y etapa abierta →
  `POST /vencidos/enviar-ahora` lo detecta (`casos: 1`) y arma el correo
  correctamente (sin `BREVO_API_KEY` en el entorno de desarrollo, el envío
  real no sale pero no hay errores). Al mover el caso a la etapa terminal
  "Resuelto", deja de contar (`casos: 0`).
- `npm run build` del frontend sin errores.

## Pendientes explícitos (fuera de esta nota)

1. `docs/HT-AP-03-documento-consolidado.md` — actualizado junto con esta
   nota (mismo commit): §4 (autoguardado de cotización) y §5 (aviso de
   Postventa vencido).
2. Confirmar en Railway si `JWT_SECRET` está fijada de forma persistente —
   sigue sin confirmarse (ver nota v1.24 y la sección "Nota sobre la causa
   raíz" arriba).
3. Manual de usuario (HT-IN-05) — pendiente de actualizar con ambas
   funciones.

---

*Historial completo de decisiones queda archivado junto a las notas
v1.2–v1.24 en `docs/HT-AP-03-nota-cambio-v1.X.md`.*
