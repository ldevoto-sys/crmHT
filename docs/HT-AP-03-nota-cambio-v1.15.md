# HT-AP-03 — Nota de cambio v1.14 → v1.15

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.14 → v1.15
**Fecha:** 2026-07-27
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Ajuste de UX en Despacho detectado en pruebas de usuario, y
definición del backlog priorizado post-lanzamiento.

---

## 1. Despacho: un solo control de estado completado

- Antes existían dos controles que parecían solaparse: el desplegable de
  estado de la ruta (arriba, con la opción "Completado" seleccionable a
  mano) y el check "Parada completada" por cada parada (abajo, exige foto
  de respaldo). Se detectó en pruebas de usuario.
- **Corrección:** el desplegable ya no permite elegir "Completado" a mano
  — solo Programado / En ruta / Cancelado. El estado "Completado" sale
  solo cuando todas las paradas quedan completadas, y se muestra como
  texto (no editable) mientras dure esa condición. Si se agrega una
  parada nueva o se destilda alguna, vuelve a "En ruta" automáticamente.
  Si la ruta fue cancelada a mano, no se revierte sola.
- Se agregó un botón **"Cerrar"** al pie del modal, y un aviso breve
  **"Guardado ✓"** tras cada acción (marcar parada, cambiar estado, editar,
  agregar/eliminar parada), para que quede claro que la acción se guardó.

## 2. Backlog priorizado (acordado con Gerencia, 27-07-2026)

Ninguno de estos 8 puntos bloquea la salida a producción del 01-08-2026.
Quedan como backlog, en este orden de prioridad:

1. Mapa y optimización de ruta de Despacho (Google Maps Platform) —
   rápido una vez esté la API key.
2. Bucket de Cloudflare R2 para documentos de Despacho — rápido, solo
   crear el bucket y cargar variables en Railway.
3. Publicar la app de WhatsApp en Meta (salir de modo de desarrollo,
   máx. 5 destinatarios de prueba). Requisito previo del punto 4.
4. Bot con IA fuera de horario: asesorar al cliente, ayudarlo a elegir
   una bomba y guiarlo hasta la ficha de compra (hoy, fuera de horario,
   el bot solo envía un mensaje automático y registra el lead). Falta
   definir con Gerencia el alcance de lo que responde solo.
5. Plantillas de mensaje aprobadas por Meta (para responder fuera de la
   ventana de 24 h).
6. Correo del vendedor como remitente real de las cotizaciones.
7. Correo como canal de leads (paralelo al canal web).
8. Envío de correos masivos a clientes (requiere separar el envío de
   marketing de la cuenta Brevo transaccional actual).

## 3. Impacto en el documento base

- **§6 (Módulo de Despacho):** ajuste de UX descrito en el punto 1.
- **§14 (Pendientes abiertos):** reemplazada la lista plana por el
  backlog priorizado del punto 2, agregando el bot IA fuera de horario y
  el envío de correos masivos como pendientes nuevos.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.15 · Borrador para validación de Gerencia*
