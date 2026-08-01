# HT-AP-03 — Nota de cambio v1.18

**Fecha:** 30-07-2026 (implementada 31-07-2026)
**Módulo:** Cotizador Operaciones — continuación de v1.17 (Fases 2-4) + plantillas de propuesta en Word
**Estado:** Implementada y verificada localmente (schema, motor de cálculo, parser Fracttal, generación de Word, subida de documento final, frontend). Pendiente: push a staging.

## Contexto

v1.17 dejó implementada solo la Fase 1 (schema + mantenedores de configuración) del
Cotizador Operaciones, y documentó como pendientes las Fases 2 (cálculo + integración
con negocio/pipeline), 3 (parser Fracttal + matching) y 4 (bloques del PDF).

En paralelo, la empresa maneja 4 plantillas Word corporativas para propuestas de
servicio (`HTCO01` Simple Suministro, `HTCO02` Estándar Suministro y Montaje, `HTCO03`
Llave en Mano Regulado, `HTCO04` Lavado y Sanitización de Estanques) que hoy se llenan
a mano fuera del CRM — no comparten nada con el motor de cálculo de v1.17 ni con el PDF
plano de Cotizaciones (§4), a pesar de que casos reales (ej. cotización de mantención
"Plaza Rugendas") ya mezclan ambos: números calculados + secciones narrativas tipo
propuesta.

Esta nota cierra ambos pendientes en un solo diseño: termina las Fases 2-4 de v1.17
**portando la lógica ya construida y probada** en la herramienta standalone
`cotizador_hidrotecnica.html` (no se reescribe a ciegas), y agrega una Fase 5 nueva:
generar el documento final como **Word** (no PDF del sistema) a partir de las 4
plantillas, para que el operador lo retoque (fotos, información adicional) antes de
convertirlo a PDF y enviarlo.

## Decisiones tomadas al validar el plan

1. **Parser Fracttal (Fase 3): sí se construye ahora**, portado literalmente desde
   `cotizador_hidrotecnica.html` (heurísticas ya probadas en producción), no
   reimplementado desde la especificación en prosa de v1.17.
2. **Secciones narrativas de las plantillas** (Alcances, Condiciones de Ejecución,
   Exclusiones, Otras Consideraciones): **texto libre editable por cotización**, con
   valor por defecto igual al texto tipo de la plantilla elegida. No se modela cada
   sección como campos estructurados.
3. **Pago por hitos (%) de HTCO03**: fuera de alcance por ahora. Esa plantilla cotiza
   con el mismo modelo de suma alzada simple que HTCO01/02; si se necesita el detalle
   de hitos, se agrega a mano en el Word ya descargado.
4. **Envío final**: el vendedor descarga el Word, lo retoca (fotos, ajustes), lo
   convierte a PDF y **lo sube al sistema**; desde ahí se envía con el botón
   "Enviar cotización" (correo/WhatsApp) ya existente, conservando la secuencia
   post-envío. No se envía directamente el Word.
5. **Moneda de materiales**: los materiales se cotizan en **CLP**, tomando
   `productos.precio_lista` tal como hace Cotizaciones Ventas Directas hoy — no se
   convierte a UF. La mano de obra, traslado y elementos de furgón se calculan en UF
   (igual que la herramienta actual) y se convierten a CLP multiplicando por la UF del
   día (`uf_valor`, ya cacheada por `services/uf.js`) antes de sumarse al total.
6. **Factor por ítem**: se incorpora la columna `factor` (multiplicador de línea, ej.
   0.5 para media unidad) a `cotizacion_items`, pero **solo se usa/muestra en el flujo
   de Operaciones** — Ventas Directas no cambia.
7. **Alcance de las plantillas Word**: disponibles para **cualquier cotización**, sea
   de origen `venta_directa` u `operaciones` — el cálculo de mano de obra/comuna sigue
   siendo exclusivo de Operaciones, pero el documento Word es independiente de eso (un
   vendedor de Ventas Directas puede necesitar una propuesta formal para una venta de
   equipos con instalación, por ejemplo).

## 1. Lógica portada desde `cotizador_hidrotecnica.html` (no reinventada)

Fuente: herramienta standalone en uso actual del equipo de Operaciones. Se porta tal
cual, adaptando solo lo indicado en la decisión 5 (moneda) y el reemplazo del array
`BBDD` propio por el maestro `productos` (ya resuelto como decisión explícita en
v1.17 — "no se crea un catálogo paralelo").

- **`parseFracttal(texto)`**: extrae por regex — N° solicitud, fecha de creación,
  solicitante, descripción, urgente, activo asociado, ubicación → cliente (primer
  segmento antes de "/"), detección de comuna fuera de RM (lista de 20 ciudades),
  **hallazgo** (heurística de verbos de falla en la descripción — falla, avería,
  bloqueado, quemado, dañado, roto, no funciona, desgaste, colapso — o primera oración
  útil de las observaciones si no hay verbo de falla), **ítems de materiales** (dos
  patrones: lista numerada tras un marcador "cotizar:"/"hay que cotizar:", o frases
  "se requiere de N..."; normaliza fracciones unicode ½ ¾ ⅜ etc. antes de matchear),
  **horas de mano de obra** (patrón "N personas/técnicos ... M horas"), **notas de
  ejecución** (líneas con llevar/conseguir/coordinar/escalera/camión).
- **`fuzzyMatchBBDD(query)` → matching contra `productos`**: normaliza (minúsculas,
  sin tildes, fracciones a texto), expande con la tabla de sinónimos, separa
  "tokens de modelo" (con dígito o ≤4 letras, peso ×3) de "palabras descriptivas"
  (sin dígito, >2 letras, peso ×1), puntúa cada producto por coincidencia de texto
  contra `nombre`/`descripcion`, exige score ≥ 30% del largo de la búsqueda **y**
  rechaza matches que solo coincidan por tokens cortos/genéricos sin ninguna palabra
  descriptiva real compartida (el filtro de confianza que ya evitó falsos positivos
  en producción). Sin match → línea con precio 0, editable a mano.
- **Fórmula de mano de obra y totales** (constantes reales de la herramienta en uso,
  no las de v1.17 que están en 0 — se resiembran `config_operaciones_mo` con estos
  valores):
  ```
  HH_UF = 0.456426 UF · HM_UF = 0.069477 UF · MARKUP = 1.47
  ELEM_MAT_PCT = 0.07 · ELEM_FURG_UF = 0.358 UF

  HH normales    = HH_UF × horas_normales × 2 técnicos
  HH fuera horario = HH_UF × 1.5 × horas_extra × 2 técnicos
  HM en trabajo   = HM_UF × (horas_normales + horas_extra)
  HM en tránsito  = HM_UF × horas_transito_comuna × 2
  Traslado        = costo_traslado_uf_comuna × 2
  Elem. furgón    = ELEM_FURG_UF (fijo)
  MO total (UF)   = suma de lo anterior
  — si horas_normales = 0 y horas_extra = 0 → MO total = 0 completo (gate explícito,
    ya evitó un bug: no cobrar traslado sin visita real) —

  Subtotal materiales (CLP) = Σ cantidad × precio_lista × factor
  Elementos menores (CLP)    = subtotal materiales × ELEM_MAT_PCT
  Materiales × Markup (CLP)  = (subtotal + elementos) × MARKUP
  MO total (CLP)             = MO total (UF) × uf_valor
  Total neto CLP             = materiales×markup + MO total (CLP)
  IVA                        = total neto CLP × iva_pct
  Total con IVA              = neto + IVA
  ```
- **31 comunas RM** (nombre, km, horas_transito, costo_traslado_uf) y **~20 pares de
  sinónimos** (ej. `tripolar → automatico`, `chapaleta → valvula chapaleta`): se
  resiembran tal cual en `comunas_operaciones` y `cotizacion_sinonimos_operaciones`.
- **Modalidad de precio**: desglosado muestra PU/total por ítem; suma alzada solo
  muestra cantidad + descripción (sin precios) más una nota fija "Precio suma alzada:
  valor fijo e invariante para el alcance definido" — igual que hoy.
- **Consideraciones de ejecución**: 6 tags (`info`, `atencion`, `corte_agua`,
  `horario_no_habil`, `acceso`, `otro` — ya definidos en `cotizacion_consideraciones`
  desde v1.17), con nota fija "las variaciones de alcance no previstas se cotizan por
  separado".

## 2. Esquema de datos — cambios sobre lo ya existente en v1.17

| Tabla | Cambio |
|---|---|
| `cotizacion_items` | + `factor` NUMERIC(6,3) NOT NULL DEFAULT 1 (multiplicador de línea; solo se edita/muestra en el flujo de Operaciones) |
| `cotizaciones` | + `tipo_plantilla` TEXT CHECK IN ('ninguna','simple_suministro','estandar_suministro_montaje','llave_en_mano_regulado','lavado_sanitizacion') DEFAULT 'ninguna' |
| `cotizaciones` | + `objeto_propuesta`, `alcances_texto`, `exclusiones_texto`, `condiciones_ejecucion_texto`, `otras_consideraciones_texto` (todos TEXT, nullable — se inicializan con el texto tipo de la plantilla al elegirla, luego editables) |
| `cotizaciones` | + `documento_final_url` TEXT, `documento_final_subido_en` TIMESTAMP (PDF ya retocado, subido antes de poder enviar) |
| `config_operaciones_mo` | resiembra con los valores reales de arriba (hoy en 0) |
| `comunas_operaciones` | resiembra con las 31 comunas RM reales (hoy vacía) |
| `cotizacion_sinonimos_operaciones` | resiembra con los ~20 pares reales (hoy vacía) |

## 3. Backend

- `services/parserFracttal.js` — puerto de `parseFracttal` + `fuzzyMatchBBDD`
  (adaptado a `productos`/CLP según decisión 5).
- `services/operacionesCalculo.js` — la fórmula de MO/totales de la sección 1, para
  reutilizar entre guardado, vista previa y documento final.
- `POST /api/cotizaciones/parse-fracttal` `{texto}` → estructura parseada + ítems ya
  matcheados contra `productos` (con `producto_id`/`precio_lista` si hubo match, o
  `null` si quedó "sin match").
- Extensión de `POST/PUT /api/cotizaciones` para aceptar, cuando `origen='operaciones'`:
  `fracttal_numero/fecha_solicitud/solicitante`, `hallazgo`, `justificacion_tecnica`,
  `modalidad_precio`, `comuna_id`, `horas_normales`, `horas_extra` — y tomar/guardar
  snapshot de `uf_valor`/`uf_fecha` del día al guardar.
- CRUD de `cotizacion_consideraciones` bajo `/api/cotizaciones/:id/consideraciones`
  (hoy no existe ninguno).
- **Relleno de Word**: conversión única (no repetida por cotización) de los 4 `.docx`
  corporativos, reemplazando sus placeholders `[Cliente]`, `[MONTO]`, etc. por tags
  `{cliente}`, `{monto}`, etc. de `docxtemplater`, guardados como plantilla base del
  repo. `services/wordPropuesta.js` arma el `.docx` final con `docxtemplater` +
  `pizzip` (npm nuevas dependencias) a partir de `tipo_plantilla` + los 5 campos
  narrativos + ítems + montos calculados.
- `GET /api/cotizaciones/:id/word` → descarga el `.docx` relleno (requiere
  `tipo_plantilla ≠ 'ninguna'`).
- `POST /api/cotizaciones/:id/documento-final` (multipart) → sube el PDF ya retocado a
  R2, guarda `documento_final_url`.
- `POST /:id/enviar` y `/:id/enviar-whatsapp`: si `tipo_plantilla ≠ 'ninguna'`, exigen
  `documento_final_url` ya subido y adjuntan **ese** PDF en vez de generarlo con
  `generarCotizacionPDFBuffer` (sin tocar el flujo actual de Ventas Directas sin
  plantilla).

## 4. Frontend

- Extensión de la pantalla de cotización (o pantalla nueva de Operaciones) con:
  panel "Importar desde Fracttal" (pegar correo → extraer → vista previa → aplicar,
  igual UX que la herramienta actual), hallazgo/justificación técnica, selector de
  modalidad de precio, panel comuna + horas normales/extra + desglose de MO, tabla de
  ítems (con `factor`), editor de consideraciones (tag + texto + orden), selector
  "Tipo de plantilla" con las 5 secciones narrativas (textarea con default de la
  plantilla, editable), botones "Descargar Word", "Subir documento final" y luego
  "Enviar cotización" (ya existente).
- Configuración → Cotizador Operaciones: los mantenedores de Mano de obra/Comunas/
  Sinónimos (ya construidos en v1.17) pasan a partir con los valores reales en vez
  de 0/vacío.

## 5. Pendiente explícito (fuera de este alcance)

- Pago por hitos (%) de HTCO03 — decisión 3.
- Integración de valor UF automática: **ya resuelto**, `services/uf.js` ya consulta
  y cachea desde findic.cl (no es un pendiente de v1.17, se confirma en esta nota).

---

*Historial completo de decisiones queda archivado junto a las notas v1.2–v1.17 en
`docs/HT-AP-03-nota-cambio-v1.X.md`. El contenido vigente de esta nota se consolidará
en HT-AP-03 (sección "Cotizador Operaciones") una vez construida.*
