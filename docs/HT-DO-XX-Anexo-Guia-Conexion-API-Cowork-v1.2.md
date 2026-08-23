# HT-DO-XX — Anexo: Guía de Conexión API CRM — Cowork

**Documento:** Anexo práctico de `HT-DO-XX_Especificacion_API_CRM_Cowork` v1.0
**Fecha:** 18-08-2026 (actualizado 23-08-2026)
**Clasificación:** Confidencial — incluye datos de acceso a producción, no distribuir fuera del equipo de integración
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)

Este documento reemplaza la especificación de diseño (v0.1) como referencia de trabajo: los ejemplos son capturas reales contra el sistema en producción — no lo que describía el borrador original. La sección 3.3 (`GET /negocios`), agregada el 19-08-2026 y verificada entonces solo en `staging`, ya está **en producción** desde el 20-08-2026 (nota de cambio v1.29). Para el detalle de diseño (qué se implementó y qué no respecto del documento v0.1), ver `HT-DO-XX_Especificacion_API_CRM_Cowork` v1.0, §7, §8.3 y §10.

## 1. Acceso

| Dato | Valor |
|---|---|
| URL base | `https://crmht-production.up.railway.app/api/v1` |
| Autenticación | Header `Authorization: Bearer <token>` |
| Token | Se entrega por separado, por canal seguro — no queda registrado en este documento |
| Límite de tasa | 60 solicitudes por minuto — `HTTP 429` si se excede |
| Formato | JSON, UTF-8 |
| Fechas | ISO 8601 con zona horaria UTC (`2026-08-18T17:58:29.540Z`) |

## 2. Formato de errores

Todo error responde JSON con esta estructura, más el código HTTP correspondiente:

```json
{ "codigo": "no_autorizado", "mensaje": "Token inválido o revocado" }
```

| HTTP | codigo | Cuándo |
|---|---|---|
| 400 | `campos_requeridos` / `parametros_insuficientes` / `origen_invalido` / `moneda_invalida` | Falta un campo obligatorio o un valor no es válido |
| 401 | `no_autorizado` | Token inválido, vencido o ausente |
| 404 | `no_encontrado` / `cliente_no_encontrado` | El recurso o el `cliente_id` no existe |
| 422 | `cliente_sin_contacto` / `sin_vendedor_disponible` | El negocio no se puede crear por una regla de negocio |
| 429 | `limite_excedido` | Más de 60 solicitudes en el último minuto |
| 500 | `error_interno` | Error del servidor — reintentar más tarde |
| 503 | `no_configurado` | La integración no tiene el token configurado en el servidor (no debería pasar en producción) |

## 3. Endpoints

### 3.1 GET /clientes?rut=&nombre=

Busca clientes existentes. Al menos uno de los dos parámetros es obligatorio. Devuelve un arreglo — `[]` si no hay coincidencias, **sin envoltorio de paginación**.

```json
[
  {
    "id": "1",
    "rut": "76.111.222-3",
    "razon_social": "Comunidad Edificio Test",
    "contactos": [
      { "id": "1", "nombre": "Juan Perez", "email": "juan@test.cl", "telefono": "+56911112222" }
    ],
    "instalaciones": [
      { "direccion": "Av Siempre Viva 123", "comuna": "Providencia" }
    ]
  }
]
```

### 3.2 POST /clientes

Alta de cliente, **idempotente por RUT** (si el RUT ya existe, devuelve el cliente existente con `HTTP 200` en vez de crear uno nuevo, que responde `HTTP 201`).

Body:
```json
{
  "rut": "76.111.222-3",
  "razon_social": "Comunidad Edificio Test",
  "contactos": [
    { "nombre": "Juan Perez", "email": "juan@test.cl", "telefono": "+56911112222" }
  ],
  "instalaciones": [
    { "direccion": "Av Siempre Viva 123", "comuna": "Providencia" }
  ]
}
```
Respuesta: mismo formato que 3.1 (un solo objeto, no arreglo).

### 3.3 GET /negocios?desde=&hasta=&estado=&vendedor_id=&cliente_id=&origen=&limit=

Agregado el 19-08-2026, **en `staging`, pendiente de promover a producción** — avisaremos cuando esté disponible en la URL base de producción. Lista negocios con filtros opcionales — sin esto solo se podía consultar un negocio si ya se conocía su `id`. Devuelve un arreglo plano (mismo formato que 3.5), ordenado por fecha de ingreso descendente, **sin `historial` ni `cotizaciones` anidados** (para eso, usar 3.5 con el `id`).

Filtros: `desde`/`hasta` (`YYYY-MM-DD`, sobre fecha de ingreso), `estado` (`abierta` | `ganada` | `perdida`), `vendedor_id`, `cliente_id`, `origen`, `limit` (por defecto 100, tope 200). Todos opcionales — sin ninguno, trae los más recientes.

Ejemplo — negocios de hoy: `GET /negocios?desde=2026-08-19&hasta=2026-08-19`

Respuesta (ejemplo ilustrativo, verificado en staging — no es una captura de producción):
```json
[
  {
    "id": "417",
    "cliente_id": "16378",
    "origen": "otro",
    "referencia_externa": null,
    "fecha_ingreso": "2026-08-19T14:02:10.000Z",
    "descripcion": "Negocio de prueba - borrar",
    "urgencia": false,
    "etapa": { "id": 1, "nombre": "Lead", "tipo": "abierta" },
    "vendedor_id": "7",
    "vendedor_nombre": "Alfredo Sánchez",
    "vendedor_codigo_softland": null
  }
]
```

`estado` con un valor distinto a `abierta`/`ganada`/`perdida` responde `400 { "codigo": "estado_invalido" }`.

### 3.4 POST /negocios

Crea un negocio, **idempotente por `referencia_externa`** (reintentar con la misma no duplica — devuelve el negocio existente con `HTTP 200`).

Body:
```json
{
  "cliente_id": "1",
  "origen": "fracttal",
  "referencia_externa": "SOL-2026-1187",
  "descripcion": "Reemplazo bomba 2 sala de bombas Torre B",
  "urgencia": true
}
```
`origen`: uno de `fracttal | correo | whatsapp | otro`. `cliente_id` y `descripcion` son obligatorios.

Respuesta:
```json
{
  "id": "417",
  "cliente_id": "16378",
  "origen": "otro",
  "referencia_externa": null,
  "fecha_ingreso": "2026-08-18T17:58:29.540Z",
  "descripcion": "Negocio de prueba - borrar",
  "urgencia": false,
  "etapa": { "id": 1, "nombre": "Lead", "tipo": "abierta" },
  "vendedor_id": "7",
  "vendedor_nombre": "Alfredo Sánchez",
  "vendedor_codigo_softland": null
}
```
El vendedor se asigna solo (misma regla de asignación que usa el CRM: cuenta, categoría, round-robin). `vendedor_codigo_softland` viene `null` si ese vendedor todavía no tiene cargado su código Softland en el CRM.

### 3.5 GET /negocios/{id}

Detalle del negocio: etapa actual, historial de etapas y sus cotizaciones.

```json
{
  "id": "1",
  "cliente_id": "1",
  "origen": "fracttal",
  "referencia_externa": "SOL-2026-1187",
  "fecha_ingreso": "2026-08-12T16:57:14.137Z",
  "descripcion": "Reemplazo bomba 2 sala de bombas Torre B",
  "urgencia": true,
  "etapa": { "id": 3, "nombre": "Cotizado", "tipo": "abierta" },
  "vendedor_id": "3",
  "vendedor_nombre": "Alfredo Sánchez",
  "vendedor_codigo_softland": "12",
  "historial": [
    { "etapa": "Lead", "entro_en": "2026-08-12T16:57:14.140Z", "salio_en": "2026-08-12T16:57:22.248Z" },
    { "etapa": "Cotizado", "entro_en": "2026-08-12T16:57:22.248Z", "salio_en": null }
  ],
  "cotizaciones": [
    {
      "id": "1",
      "numero": "000001",
      "version": 1,
      "estado": "borrador",
      "subtotal": 500000,
      "total": 595000,
      "moneda": "CLP",
      "subtotal_uf": null,
      "total_uf": null,
      "documento_final_url": "https://example.com/doc.pdf",
      "fecha_envio": null,
      "created_at": "2026-08-12T16:57:22.248Z"
    }
  ]
}
```
`salio_en` es `null` mientras el negocio siga en esa etapa. Todos los `id` son string; `subtotal`/`total`/`subtotal_uf`/`total_uf` son número.

### 3.6 POST /negocios/{id}/cotizaciones

Registra una cotización emitida. Asigna el **número real y correlativo del CRM** (formato `NNNNNN`, el mismo que usa el resto del sistema — no `[año]-NNN`) y avanza sola la etapa del negocio a **"Cotizado"**.

Body (CLP):
```json
{ "monto_neto": 500000, "moneda": "CLP", "vigencia_dias": 15, "condiciones": "...", "archivo_url": "https://..." }
```
Body (UF, requiere `valor_uf`):
```json
{ "monto_neto": 50, "moneda": "UF", "valor_uf": 39000 }
```

Respuesta:
```json
{
  "id": "1",
  "numero": "000001",
  "version": 1,
  "estado": "borrador",
  "monto_neto": 500000,
  "moneda": "CLP",
  "vigencia_dias": 15,
  "token_publico": "fc447f667cb586570ce15f02601955d9",
  "link_publico": "https://crmht-production.up.railway.app/c/fc447f667cb586570ce15f02601955d9"
}
```
`estado` es `"enviada"` si se envía `fecha_envio` en el body, `"borrador"` si no.

### 3.7 GET /reportes/{tipo}

`tipo` ∈ `embudo | causas | tiempos | ranking | cotizaciones_dia`. Filtros opcionales por query string: `desde`, `hasta`, `vendedor_id`, `cliente_id`, `pipeline_id`, y `formato=csv` para descarga directa. Sin filtro, ve todos los vendedores y clientes.

## 4. Lo que no está implementado

- No existe `PATCH /negocios/{id}` (actualizar estado).
- `cuadrante`/`tipo` del cliente y `tipo_documento` del negocio: se aceptan en el body si vienen, no se guardan.
- No hay máquina de estados fija de 8 pasos — el negocio expone su etapa real del pipeline configurable (`Lead`, `Calificado`, `Cotizado`, `Negociación`, `Ganado`, `Perdido`).

Detalle completo de estas decisiones: `HT-DO-XX_Especificacion_API_CRM_Cowork` v1.0, §7 y §8.3.

---

*Hidrotécnica SpA · hidrotecnica.cl · info@hidrotecnica.cl · +56 2 2327 6000 · Manuel Antonio Tocornal 1906, Santiago, RM*
