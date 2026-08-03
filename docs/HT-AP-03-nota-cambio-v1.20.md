# HT-AP-03 — Nota de cambio v1.20

**Fecha:** 03-08-2026
**Módulo:** Informe diario por correo (cotizaciones generadas + negocios ganados).
**Estado:** Implementado y verificado localmente contra Postgres real (datos de
prueba). **Pendiente de commit/push a `staging` y de despliegue a producción** —
esta nota describe código que hoy solo existe en el árbol de trabajo local.

## Contexto

Surge como alternativa más simple a conectar una herramienta de BI externa
(Power BI / Looker Studio) directo a la base de datos: la conexión pública de
Railway (usuario `bi_readonly`, ver v1.9 §"Rol de solo lectura para BI") estaba
fallando desde la red de la oficina (firewall corporativo bloqueando el puerto
no estándar del proxy de Railway). En vez de depurar esa conexión, se optó por
un job programado dentro del propio backend — evita el problema por completo
porque usa la conexión interna de Railway a Postgres, no el proxy público.

## Qué hace

Todos los días a las **8:00 AM hora de Chile**, a **todos los usuarios activos**
con correo registrado, se envía un correo con:

- **Cotizaciones generadas el día anterior** (ambos pipelines, Ventas Directas y
  Operaciones): fecha de creación de la última versión de cada cotización —
  mismo criterio que ya usa `routes/reportes.js#cotizacionesPorDia` (no
  requiere que la cotización ya esté en estado "enviada").
- **Negocios ganados el día anterior** (ambos pipelines): mismo criterio que
  `rankingVendedores`/`cotizacionesPorDiaDetalle` — `fecha_cierre` = ayer,
  etapa de tipo `ganada`, monto = total de la última cotización del negocio.

El correo trae un resumen (cantidad y monto de cada grupo), el detalle en 2
tablas, y **2 archivos CSV adjuntos** con el mismo detalle.

## Esquema

| Tabla | Cambio |
|---|---|
| `informe_diario_envios` | nueva — `fecha DATE PRIMARY KEY, enviado_en TIMESTAMP DEFAULT now()`. Un registro por día ya informado, para que el chequeo horario no reenvíe el mismo informe dos veces. |

## Backend

- **`backend/services/informeDiario.js`** (nuevo):
  - `cotizacionesGeneradas(fecha)` / `negociosGanados(fecha)` — las 2 consultas
    descritas arriba, sin filtro de pipeline (junta ambos).
  - `fechaChileHoy()` / `diaAnterior(fecha)` — calculan "ayer" en hora de Chile
    (`Intl.DateTimeFormat` con `timeZone: 'America/Santiago'`), sin importar el
    huso horario del servidor — mismo patrón que `services/horario.js`.
  - `enviarInformeDiario(fecha)` — arma los 2 CSV (`utils/csv.toCSV`, con BOM
    para que Excel abra bien los acentos) y envía un correo a cada usuario
    activo (secuencial, no en paralelo, para no saturar la API de Brevo).
  - `enviarInformeDiarioSiCorresponde()` — se llama desde el chequeo horario;
    solo actúa si la hora de Chile es las 8 y no hay registro en
    `informe_diario_envios` para el día de hoy.
- **`backend/services/email.js`** — nueva plantilla `informeDiario()`: reusa
  `template()`/`boton()` existentes (mismo logo, mismos colores de marca), con
  2 tablas (`filaInforme`/`tablaInforme`, helpers nuevos) y los 2 CSV como
  adjuntos vía la API de Brevo (ya soportaba adjuntos, usado hoy para el PDF de
  cotización).
- **`backend/server.js`** — un `setInterval` más (mismo período de 15 min que
  ya usan secuencias y el bot de WhatsApp) llamando a
  `enviarInformeDiarioSiCorresponde()`.
- **`backend/routes/reportes.js`** — `POST /api/reportes/informe-diario/enviar-ahora`
  (administrador/jefe comercial), para disparar el envío manualmente sin
  esperar a las 8 AM — pensado para pruebas y para reenviar si un día falló.
  Acepta `?fecha=YYYY-MM-DD` para forzar otro día.

## Verificación local

Contra un Postgres 16 local (base nueva, vacía), con datos de prueba
sembrados a mano (2 usuarios, 1 negocio ganado ayer, 2 cotizaciones generadas
ayer en pipelines distintos): el endpoint manual devolvió los conteos y montos
correctos, y se confirmó —volcando el HTML y los CSV a disco antes del punto
donde se corta el envío real por falta de `BREVO_API_KEY`— que el correo y los
adjuntos se arman exactamente como se validó con el usuario antes de
implementar. Sin acceso a `BREVO_API_KEY` ni a la base de producción desde este
entorno, no se pudo probar un envío real a una casilla de correo.

## Pendientes explícitos (fuera de esta nota)

1. **Commit y push a `staging`** — no hecho todavía; el código descrito acá
   vive solo en el árbol de trabajo local.
2. **Despliegue a producción** y prueba con datos y `BREVO_API_KEY` reales.
3. Manual de usuario (HT-IN-05) — sí se actualizó (v04), con la sección 5.12
   marcada explícitamente "Próximamente" hasta que este punto 1-2 se resuelva.
4. `docs/HT-AP-03-documento-consolidado.md` — pendiente incorporar esta nota
   (ver tarea aparte).

---

*Historial completo de decisiones queda archivado junto a las notas v1.2–v1.19 en
`docs/HT-AP-03-nota-cambio-v1.X.md`.*
