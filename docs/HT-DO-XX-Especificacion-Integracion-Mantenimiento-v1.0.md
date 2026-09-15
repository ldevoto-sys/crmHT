# HT-DO-XX — Especificación de Integración: CRM Comercial ↔ App Mantenimiento

**Documento:** Especificación técnica para el desarrollador de la app de Mantenimiento
**Fecha:** 15-09-2026
**Clasificación:** Confidencial — incluye datos de acceso, no distribuir fuera del equipo de desarrollo
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Estado:** Implementado en `staging` de crmHT. **No está en producción.**

## 0. Advertencias antes de empezar (léase primero)

Esto no es una descripción de algo estable y terminado — es rigurosamente lo que existe hoy, con sus huecos reales:

1. **El módulo de Orden de Trabajo (OT) completo — incluyendo esta integración — vive solo en la rama `staging` del CRM, no en `main`/producción.** El CRM tiene la regla vigente de que las mejoras se acumulan en staging hasta nueva instrucción (ver `CLAUDE.md` del repo crmHT). No hay fecha comprometida de promoción a producción. Mientras tanto, todo desarrollo y prueba de la app de Mantenimiento contra esta API debe apuntar al **ambiente de staging** del CRM (URL a confirmar con Luis Devoto — no queda documentada en el repo, solo la conoce quien administra Railway).
2. **La app de Mantenimiento, a la fecha de este documento, no tiene código funcional** (repo en Etapa 1 de Requerimientos, solo andamiaje de carpetas). El endpoint receptor del webhook (§3) todavía no existe del lado de Mantenimiento — el envío saliente del CRM está construido y probado con un receptor de prueba, pero no contra la app real.
3. El endpoint de reporte de estado (§2.2) es **intencionalmente genérico y mínimo** (`pendiente` / `en_progreso` / `cerrado` + observación libre). No se adivinaron campos del modelo de datos de Mantenimiento (horas trabajadas, informe PDF, checklist, etc.) porque ese modelo todavía no está definido. Se amplía cuando el desarrollador de Mantenimiento sepa qué necesita mandar de vuelta.
4. El token de esta integración (`MANTENIMIENTO_API_KEY`) sigue el mismo patrón que la integración Cowork ya en producción: **un token estático por variable de entorno, un solo integrador**. No hay tabla de tokens múltiples revocables — si en el futuro se suman más integradores externos (Operaciones, Cobranza), es una decisión pendiente si se sigue replicando este patrón o se construye algo más robusto.

## 1. Arquitectura elegida

Se evaluaron tres opciones. Se descartó un bucket de almacenamiento de objetos (ej. Cloudflare R2) compartido entre ambas apps para "modificar tablas": un bucket no tiene transacciones ni control de concurrencia — dos procesos escribiendo el mismo objeto casi al mismo tiempo pueden pisarse sin ningún aviso, y no permite consultas. No es la herramienta correcta para datos relacionados y mutables que dos sistemas necesitan modificar.

Se implementó **API REST + Webhook**, reutilizando patrones ya construidos y en producción en el CRM:

- **API REST** (`/api/v1/mantenimiento`, autenticación Bearer): Mantenimiento consulta el detalle de una OT cuando lo necesite, y reporta su estado de ejecución. Mismo patrón de token estático que la integración Cowork (`COWORK_API_KEY`), ya probado en producción.
- **Webhook saliente** (CRM → Mantenimiento): cuando se crea una OT nueva (negocio entra a "Aceptado"), el CRM avisa de inmediato a Mantenimiento por HTTP, firmado con HMAC-SHA256 — mismo mecanismo de firma que ya usa `firmaValida()` para los webhooks de WhatsApp (`backend/routes/public.js`).

Cada sistema mantiene su propia base de datos — no hay una base compartida ni un almacenamiento común.

## 2. API REST — CRM expone (Mantenimiento consume)

| Dato | Valor |
|---|---|
| URL base | `https://<dominio-de-staging>/api/v1/mantenimiento` (dominio a confirmar — ver §0.1) |
| Autenticación | Header `Authorization: Bearer <MANTENIMIENTO_API_KEY>` |
| Token | Se entrega por separado, por canal seguro — no queda registrado en este documento |
| Límite de tasa | 60 solicitudes por minuto — `HTTP 429` si se excede (contador independiente del de Cowork) |
| Formato | JSON, UTF-8 |
| Fechas | ISO 8601 con zona horaria UTC |

### Formato de errores

```json
{ "codigo": "no_autorizado", "mensaje": "Token inválido o revocado" }
```

| HTTP | codigo | Cuándo |
|---|---|---|
| 400 | `parametro_invalido` / `estado_invalido` | negocioId no es un número, o estado no es uno de los tres válidos |
| 401 | `no_autorizado` | Token inválido, vencido o ausente |
| 404 | `no_encontrado` | El negocio no existe o todavía no tiene OT (se genera al entrar a "Aceptado") |
| 429 | `limite_excedido` | Más de 60 solicitudes en el último minuto |
| 500 | `error_interno` | Error del servidor — reintentar más tarde |
| 503 | `no_configurado` | El token de esta integración no está configurado en el servidor (no debería pasar en staging una vez activada) |

### 2.1 GET /ordenes-trabajo/{negocio_id}

Trae el detalle de la OT asociada a un negocio. **Sin precios ni información de facturación** — la OT es de ejecución en terreno, no de venta.

```json
{
  "numero": "OT-1",
  "negocio_id": "1",
  "negocio_titulo": "Mantención sala de bombas",
  "tipo_trabajo": "mantenimiento_preventivo",
  "cliente": {
    "empresa": "CLIENTE PRUEBA SPA",
    "rut": "76.999.888-8",
    "direccion": "Av Test 123",
    "comuna": "Providencia",
    "contacto": "JUAN PEREZ",
    "email": "juan@test.cl",
    "telefono": "+56911112222"
  },
  "observaciones": null,
  "estado_mantenimiento": "pendiente",
  "fecha_estado_mantenimiento": null,
  "observaciones_mantenimiento": null,
  "items": [
    { "tipo": "material", "descripcion": "Aceite hidráulico 20L", "cantidad": "2.00", "codigo": "MAT-0231" }
  ]
}
```

`tipo_trabajo` es uno de: `mantenimiento_preventivo`, `lavado`, `impermeabilizado`, `mantenimiento_correctivo`, `otro`. `items` puede venir vacío (la OT nace sin ítems si no hay plantilla ni cotización vigente para copiar).

### 2.2 PATCH /ordenes-trabajo/{negocio_id}/estado

Reporta el estado de ejecución. Body:

```json
{ "estado": "en_progreso", "observaciones": "Técnico en sitio, falta repuesto" }
```

`estado` ∈ `pendiente | en_progreso | cerrado`. `observaciones` es opcional, texto libre. Responde el mismo objeto que 2.1, ya actualizado. Cada llamada queda registrada en la línea de tiempo del negocio, visible al vendedor dueño en el CRM.

**Esto no mueve la etapa del negocio en el pipeline Operaciones del CRM** — eso lo sigue decidiendo una persona en el kanban. Es solo información de estado que Mantenimiento reporta.

## 3. Webhook — CRM notifica a Mantenimiento

Cuando se crea una OT nueva (negocio entra a "Aceptado" por primera vez — no se repite si ya existía), el CRM hace:

```
POST <MANTENIMIENTO_WEBHOOK_URL>
Content-Type: application/json
X-Hidrotecnica-Signature: sha256=<hmac-sha256 hex del body, con MANTENIMIENTO_WEBHOOK_SECRET>

{ "evento": "ot_creada", "ot": { ...mismo objeto que GET /ordenes-trabajo/{negocio_id}... } }
```

Verificación de la firma (ejemplo en Python, mismo algoritmo que ya usa el CRM para WhatsApp):

```python
import hmac, hashlib

def firma_valida(cuerpo_bytes: bytes, firma_header: str, secreto: str) -> bool:
    esperado = "sha256=" + hmac.new(secreto.encode(), cuerpo_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(firma_header, esperado)
```

Si `MANTENIMIENTO_WEBHOOK_URL` no está configurada en el CRM, el webhook simplemente no se envía (no rompe nada) — mismo criterio que el resto de las integraciones opcionales del CRM. Si el receptor responde algo distinto de `2xx`, el CRM solo lo deja en el log del servidor — **no hay reintento automático todavía**; si Mantenimiento necesita garantía de entrega, debe consultar `GET /ordenes-trabajo/{negocio_id}` como respaldo (por ejemplo, con un chequeo periódico) además de escuchar el webhook.

**Probado con un receptor de prueba (no la app real de Mantenimiento, que aún no existe):** se verificó que la firma llega correcta y que el payload coincide exactamente con el de `GET /ordenes-trabajo/{negocio_id}`.

## 4. Lo que no está implementado

- No hay endpoint para que Mantenimiento cree o modifique materiales/herramientas de la OT — esa edición sigue siendo exclusiva del vendedor/admin en el CRM (`PUT /api/ordenes-trabajo/:id/items`, autenticado con JWT de usuario, no con este token).
- No hay reintento automático del webhook si Mantenimiento no responde `2xx`.
- No hay tabla de tokens múltiples — un solo `MANTENIMIENTO_API_KEY` para toda la integración (ver §0.4).
- El campo `estado_mantenimiento` es de solo 3 valores fijos — si Mantenimiento necesita un flujo de estados más detallado, es un cambio a coordinar (no inventarlo del lado de Mantenimiento sin avisar, porque el CRM valida contra esta lista).
- No hay endpoint para que Mantenimiento consulte varias OTs a la vez (solo una por `negocio_id`) — si hace falta un listado/sincronización masiva, hay que definirlo.

## 5. Variables de entorno (lado CRM)

```
MANTENIMIENTO_API_KEY=            # Bearer token para /api/v1/mantenimiento
MANTENIMIENTO_WEBHOOK_URL=        # URL del endpoint receptor en Mantenimiento. Vacía = desactivado.
MANTENIMIENTO_WEBHOOK_SECRET=     # Secreto compartido para firmar el webhook (mismo valor en ambos lados)
```

---

*Hidrotécnica SpA · hidrotecnica.cl · info@hidrotecnica.cl · +56 2 2327 6000 · Manuel Antonio Tocornal 1906, Santiago, RM*
