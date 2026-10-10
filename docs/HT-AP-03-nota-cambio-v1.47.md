# HT-AP-03 — Nota de cambio v1.47 (10/10/2026)

> **Estado: solo en `staging`.** No promovido a `main`. Requiere el OK de
> Luis Devoto (más confirmación adicional si el push cae en horario laboral).
> **Documentar como instructivo en SharePoint antes de pasar a producción**,
> según la norma de la empresa.

## Bandeja de WhatsApp: "Marcar como atendida" sin cerrar la conversación

### Problema
Para sacar una conversación de pendientes (por ejemplo, el cliente respondió
"gracias" y no requiere respuesta) había que **cerrarla**. Cerrar bloquea el
texto libre aunque la ventana de 24 h siga abierta, y desde v1.46 también hace
que los envíos automáticos salgan como plantilla (con costo).

### Qué cambia
1. **Marca nueva "atendida"** (`whatsapp_conversaciones.atendida_manual`, con
   fecha y usuario). Saca la conversación de:
   - Reportería → WhatsApp → "Conversaciones abiertas ahora".
   - Las alertas de respuesta (vendedor → callcenter → jefe comercial →
     gerencia).
   **No toca la ventana de 24 h:** se puede seguir escribiendo con texto libre.
2. **Se desmarca sola** cuando el cliente vuelve a escribir, igual que el cierre.
3. **Bandeja:** dos botones separados, "Marcar como atendida" y "Cerrar
   conversación" (este último solo si la conversación está abierta). Una
   conversación atendida muestra la insignia "✓ Atendida" en la ficha y
   "atendida" en la lista. Los filtros Abiertas/Cerradas no cambian.
4. **Cerrar no cambia:** sigue sacando de pendientes (implica atendida) y
   bloqueando el texto libre. Su mensaje de confirmación ahora lo explica.
5. Endpoint nuevo `POST /api/whatsapp/conversaciones/:contactoId/atender`, con
   los mismos permisos que cerrar. `GET /conversaciones` suma el campo
   `atendida`. Migración con `IF NOT EXISTS`.

### Alcance
- El cálculo nocturno de tiempos de respuesta no cambia (solo mide
  conversaciones que el vendedor respondió).
- La API v1 (`/whatsapp/conversaciones`) no incluye el campo `atendida`.

### Cómo se probó
Servidor real + Postgres real + token real: conversación con mensaje entrante
aparece pendiente → `atender` la saca de pendientes y la ventana sigue abierta
(`abierta: true`, texto libre permitido) → un mensaje nuevo del cliente la
desmarca y vuelve a pendientes → `cerrar` la saca de pendientes y bloquea el
texto libre → sin token, 401. Migración idempotente (2 arranques), revisión de
alertas sin error SQL y frontend compilado.
