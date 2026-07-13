# HT-AP-03 — Nota de cambio v1.6 → v1.7

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.6 → v1.7
**Fecha:** 2026-07-13
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Etapa 3 (3A, 3B, 3E, 3C): notas y tareas, motor de secuencias de
seguimiento, reportería y encuesta post-cierre. Puntos que requieren
validación de Gerencia se marcan explícitamente.

---

## 1. Notas y tareas (3A)

- Notas libres y tareas (con vencimiento) asociadas a contacto, empresa o
  negocio; quedan en el timeline unificado.
- Asignar una tarea a **otro** usuario: solo administrador o jefe comercial.
  Un vendedor/call center solo puede crearse tareas a sí mismo.
- Nueva ficha de contacto (`/contactos/:id`): datos, negocios, notas/tareas y
  timeline. Cierra el pendiente de versiones anteriores ("ver la historia de
  un contacto").

## 2. Motor de secuencias de seguimiento (3B)

- Secuencias configurables (admin/jefe comercial): nombre + pasos ordenados
  (días de espera, canal, mensaje/guion).
- Un negocio abierto puede iniciar una secuencia (uno a la vez). Un revisor
  interno del servidor avanza los pasos vencidos cada 15 minutos.
- **Punto importante:** como el envío de correo (Graph) y WhatsApp (Etapa 4)
  no están conectados, **cada paso vencido genera una tarea para el
  vendedor** (llamar, escribir el correo, mandar el WhatsApp) en vez de
  enviarlo solo. El día que esos canales existan, se puede cambiar para que
  el paso se envíe automáticamente sin tocar el resto del motor.
- Pausar, reactivar (reinicia el conteo de días desde ese momento), marcar
  "cliente respondió" (pensado para conectarse más adelante a un webhook de
  Graph/WhatsApp) y cancelar. Seguimiento manual también reinicia el conteo.
- Un negocio se cierra (ganado o perdido) → su secuencia activa se cancela
  automáticamente.

## 3. Reportería (3E)

- Nueva tabla `negocio_etapa_historial`: registra cuándo un negocio entra y
  sale de cada etapa, para poder calcular tiempos reales. **Se completa
  desde ahora hacia adelante**; los negocios creados antes de este cambio no
  tienen su primer tramo medido.
- Reportes: embudo por etapa, causas de no cierre, tiempo promedio por
  etapa, ranking de vendedores (ganados/perdidos, tasa de cierre, monto
  ganado). Todos exportables a CSV.
- Vendedor ve solo sus propios números; administrador, jefe comercial y
  gerencia ven todos o filtran por vendedor; call center no tiene acceso a
  reportería (según la matriz de permisos de v1.6).

## 4. Encuesta post-cierre (3C)

- Al mover un negocio a una etapa "ganada" se crea automáticamente una
  encuesta con link público (mismo estilo que el link de cotizaciones).
- **Supuesto de formato a validar con Gerencia:** una sola pregunta estilo
  NPS (puntaje 0 a 10, "¿qué tan probable es que nos recomiendes?") más un
  comentario libre opcional. Si la empresa quiere otras preguntas, se ajusta
  sin problema; se implementó así por ser el formato más simple y estándar
  para no bloquear el resto de la etapa.
- Como el envío de correo al cliente depende de Graph (bloqueado), se genera
  una tarea para que el vendedor comparta el link con el cliente por su
  canal, igual que en el motor de secuencias.
- Recordatorio único a los 5 días si no ha respondido (configurable con la
  variable de entorno `ENCUESTA_DIAS_RECORDATORIO`). No se reintenta más de
  una vez.

## 5. Pendiente: 3D — Nota de venta Softland

No se construye en esta nota. Se necesita que Gerencia comparta el
layout/columnas exacto que usa Softland hoy (o el archivo de referencia del
ingreso manual actual), para no adivinar el formato.

## 6. Impacto en el documento base

- **§6:** tablas nuevas `notas`, `tareas`, `secuencias`, `secuencia_pasos`,
  `negocio_secuencias`, `secuencia_ejecuciones`, `negocio_etapa_historial`,
  `encuestas`, `encuesta_respuestas`.
- **§7.4:** motor de seguimiento implementado en modo asistido (genera
  tareas) mientras Graph/WhatsApp no estén conectados.
- **§11:** nueva pantalla "Secuencias de seguimiento" en el engranaje;
  "Mis Tareas" y "Reportes" visibles para todos los roles operativos según
  la matriz de permisos.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.7 · Borrador para validación de Gerencia*
