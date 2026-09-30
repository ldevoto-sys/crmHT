# HT-AP-03 — Nota de cambio v1.38 (30/09/2026)

## API de integración: endpoints de solo lectura para análisis de oportunidades

Pedido de Luis Devoto (30-09-2026): poder analizar las oportunidades que
llegan de clientes sin depender de consultas manuales. Un agente (Cowork)
correrá después los análisis e informes periódicos. Alcance de esta
versión: **solo lectura** — no se modifica ningún dato ni se envía nada.

Datos pedidos: CRM desde agosto-2026 y la historia de Softland que el CRM ya
replica (desde 2023-01-01).

### Endpoints nuevos y cambios (`/api/v1`, mismo token y límite de tasa)

Convención de los listados nuevos: `?limit=&offset=` →
`{ total, limit, offset, siguiente_offset, datos }`. `siguiente_offset` es
`null` cuando no quedan más filas. Fechas `YYYY-MM-DD`, extremos incluidos.

| Endpoint | Qué entrega |
|---|---|
| `GET /negocios` (ampliado) | Se agrega `offset` y el tope sube de 200 a 500. El orden ahora desempata por `id` (antes, filas con la misma fecha podían repetirse o saltarse entre páginas). La respuesta suma `monto_estimado` (**neto**), `causa_no_cierre`, `causa_no_cierre_detalle`, `fecha_cierre`, `ultima_actividad`, `contacto_id`, `pipeline_id`. Sigue devolviendo una lista simple, compatible con lo anterior. |
| `GET /cotizaciones` (nuevo) | Cotizaciones del CRM, con filtros `desde`, `hasta`, `estado`, `origen`, `negocio_id`, `vendedor_id`, `solo_ultima_version=true`. No expone `token_publico` ni la ruta del PDF. `total` incluye IVA; el `monto_estimado` del negocio es neto. |
| `GET /whatsapp/mensajes` (nuevo) | Mensajes por rango de fechas (`desde` y `hasta` obligatorios), filtros `contacto_id`, `negocio_id`, `direccion`. Cada mensaje trae `lead_id` y `negocio_id`. **Incluye conversaciones archivadas. Excluye contactos anonimizados.** Sin archivos adjuntos (solo nombre y tipo). |
| `GET /whatsapp/conversaciones/:id/mensajes` (ampliado) | Se agregan `lead_id` y `negocio_id` a cada mensaje. |
| `GET /softland/cotizaciones`, `/notas-venta`, `/facturas` (nuevo) | Tablas `reporte_softland_*`, con filtros `desde`, `hasta`, `vencod`, `cod_cliente`. `meta` informa la cobertura real y la última sincronización. |
| `GET /seguimientos` (nuevo) | Registro del seguimiento automático, filtros `desde`, `hasta`, `negocio_id`, `fuente`, `ventana_dias`. Ver abajo. |

### Cosas que conviene saber al interpretar los datos

- **Softland**: las cotizaciones llegan solo hasta jul-2026 (por diseño de la
  sincronización, ver `services/softlandSync.js`); desde ago-2026 las
  cotizaciones son las del CRM. Notas de venta y facturas llegan hasta la última
  sincronización nocturna (23:00). **Lo anterior a 2023 no está replicado.**
- **Seguimientos — "si el cliente respondió"**: el CRM no tiene un detector de
  respuesta general (para correo no existe). Se entregan dos datos de distinto
  valor:
  - `pausada_por_respuesta_cliente`: dato real (la secuencia se pausó porque el
    cliente respondió). Solo aplica a `fuente=secuencia`.
  - `respuesta_whatsapp_inferida`: **dato inferido**, no una prueba. Indica si
    hubo *algún* mensaje entrante del contacto dentro de `ventana_dias`
    (por defecto 7) después del envío.
- **Seguimientos — `resultado`**: `enviado_automatico` (correo o WhatsApp que
  salió solo), `tarea_generada` (el envío falló o el canal es llamada/tarea) o
  `cambio_etapa`.
- **Anonimizados**: `anonimizarContacto()` guarda el nombre como
  `(Eliminado)`, pero `initDb()` pasa a mayúsculas todos los nombres de
  contactos en cada arranque, así que tras cualquier reinicio queda
  `(ELIMINADO)`. El filtro de esta versión compara sin distinguir mayúsculas.
  Quien consulte esos datos por otro camino (por ejemplo SQL directo) debe
  hacer lo mismo.
- **Pendiente conocido, fuera de alcance**: la anonimización no toca los
  mensajes (alcance acotado validado con Gerencia, ver
  `services/privacidad.js`). El endpoint ya
  existente `GET /whatsapp/conversaciones/:id/mensajes` sigue devolviendo el
  hilo de un contacto anonimizado si se conoce su id. Requiere decisión.

### Pruebas realizadas

Contra un Postgres local con el schema real (`initDb()`), servidor real y token
real, con datos ficticios: autenticación, paginación (`offset`, `siguiente_offset`),
validaciones de parámetros (fechas, enums, ventana), filtros de cada endpoint,
exclusión de anonimizados, ausencia de `token_publico` en la respuesta, y el
cálculo de respuesta inferida con distintas ventanas. La prueba detectó y se
corrigió el problema de mayúsculas de los anonimizados descrito arriba.
**No se ha probado contra datos reales de producción.**

### Fuera de esta versión

Causa de pérdida con comentario obligatorio para "Otro" y su análisis fino
(incluidos los perdidos sin respuesta), y el envío de informes por correo:
quedan para una versión posterior (decisión de Luis Devoto, 30-09-2026).
