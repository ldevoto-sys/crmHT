# HT-AP-03 — Nota de cambio v1.37 (23/09/2026)

## Sincronización del vendedor entre contacto, chat y negocios

Pedido de Luis Devoto (23-09-2026), a partir de un caso real: un contacto
(Antonio Vicencio) mostraba "Constanza Valladares" como vendedora en su
ficha, pero el chat de WhatsApp de ese mismo contacto aparecía "Sin
asignar" en la Bandeja — y no se podía corregir desde ahí.

### Causa raíz

Existían **tres campos de vendedor completamente independientes**, sin
ninguna sincronización entre ellos:
- `contactos.vendedor_id` — "Vendedor asignado" en la ficha del contacto.
- `leads.vendedor_id` — "Asignado a" en la Bandeja (uno por chat/lead).
- `negocios.vendedor_id` — el dueño del negocio en el Pipeline.

Además, `POST /api/leads/:id/asignar` forzaba el estado del lead a
`'asignado'` en cada reasignación, incluso si ya estaba `'convertido'`
(con un negocio detrás) — por eso reasignar en una conversación cerrada
"no hacía nada visible".

### Qué se corrigió

- **`services/sincronizarVendedor.js` (nuevo)**: al cambiar el vendedor
  desde cualquiera de los dos lados (ficha de contacto o "Asignado a" en
  la Bandeja), se sincroniza automáticamente:
  - El lead más reciente del contacto (se crea uno si no existe ninguno
    — mismo caso ya resuelto para "Enviar plantilla WhatsApp": un
    contacto que nunca escribió por WhatsApp).
  - Todos los **negocios abiertos** del contacto.
  - **Los negocios ya cerrados (ganados o perdidos) nunca se tocan** —
    decisión explícita de Luis: no reasignar retroactivamente algo que
    ya se definió.
- **`routes/leads.js`**: `POST /:id/asignar` ya no fuerza el estado a
  `'asignado'` si el lead está `'convertido'` o `'descartado'`. Nuevo
  endpoint `POST /asignar-por-contacto/:contactoId` para asignar cuando
  no hay ningún lead al que apuntar (conversación cerrada sin lead, o
  contacto que nunca escribió por WhatsApp) — la Bandeja ahora siempre
  usa este endpoint en vez del anterior.
- **`routes/contactos.js`**: `PUT /:id` sincroniza hacia el lead más
  reciente y los negocios abiertos cuando cambia `vendedor_id` (incluida
  la desasignación).
- **`services/asignacion.js`**: `sugerirVendedor()` ahora mira primero si
  el contacto ya tiene vendedor propio asignado (regla nueva, antes de
  la regla de vendedor de cuenta por empresa) — un cliente que ya tiene
  contacto y vendedor asignado en el CRM se asigna automáticamente a ese
  vendedor si vuelve a escribir por WhatsApp, en vez de pasar por
  categoría o round-robin.

### Probado

Contra Postgres real (no solo sintaxis): reasignar un contacto con un
negocio abierto y uno ganado deja el abierto con el vendedor nuevo y el
ganado intacto; un contacto sin lead crea uno al sincronizar; un lead
convertido mantiene su estado al reasignarlo; `sugerirVendedor()` devuelve
el vendedor propio del contacto cuando existe.
