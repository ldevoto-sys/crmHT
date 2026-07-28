# HT-AP-03 — Nota de cambio v1.17

**Fecha:** 28-07-2026
**Módulo:** Cotizador Operaciones (pipeline "Operaciones", §3 de HT-AP-03 v1.16)
**Estado:** En desarrollo por fases (acordado 28-07-2026). **Fase 1 — Schema + mantenedores: implementada.** Fases 2 (cálculo manual + integración con negocio/pipeline), 3 (parser Fracttal + matching) y 4 (bloques del PDF) — pendientes.

### Fase 1 — implementada

- Schema: columnas nuevas en `cotizaciones` (`origen`, `fracttal_numero`, `fracttal_fecha_solicitud`, `fracttal_solicitante`, `hallazgo`, `justificacion_tecnica`, `modalidad_precio`, `comuna_id`, `horas_normales`, `horas_extra`); tablas nuevas `comunas_operaciones`, `config_operaciones_mo` (fila única, seed en 0), `cotizacion_sinonimos_operaciones`, `cotizacion_consideraciones`.
- Mantenedores en Configuración → Cotizador Operaciones (administrador y jefe comercial): pestañas Mano de obra, Comunas, Sinónimos — backend en `backend/routes/config.js` (`/operaciones-mo`, `/comunas-operaciones`, `/sinonimos-operaciones`), frontend en `frontend/src/pages/admin/ConfigOperaciones.jsx`.
- Decisiones tomadas al validar el plan (no estaban en la especificación original):
  - El negocio que vincula cada cotización de Operaciones a un pipeline debe ser una tarjeta gestionable en el Kanban, con al menos una etapa "Cotizado" — se crea vía Configuración → Config pipeline(s) (ya existente), no requiere desarrollo nuevo.
  - Un ítem sin match en el parser se resuelve como línea libre en la propia cotización (reutiliza la capacidad ya existente en Cotizaciones), sin dar de alta el producto en el maestro — el alta al maestro sigue siendo únicamente vía el importador de Productos (§2).
  - Mantenedores editables por administrador y jefe comercial (mismo criterio que Secuencias).

### Especificación original (Fases 2-4, aún no implementadas)

---

## Contexto

HT-AP-03 §3 menciona el pipeline **Operaciones** con la nota: *"cotizador propio
que considera horas de trabajo, desplazamiento y otros gastos, en evaluación de
integrarse a futuro con el de Ventas Directas"*. Esa lógica nunca se documentó
en detalle porque hasta ahora vive en una herramienta HTML standalone
(`cotizador_hidrotecnica.html`), usada por el equipo de Operaciones/Mantención
para cotizar trabajos que se originan en solicitudes del sistema **Fracttal**
(gestión de mantenimiento), no en negociación directa de venta de equipos.

Esta nota formaliza esa lógica como especificación para incorporarla al CRM,
resolviendo además un problema operativo real: la herramienta standalone
mantenía su propio catálogo de precios en un array embebido (411 productos,
actualización manual, sin fuente de verdad única). **Al integrarse al CRM, el
precio de cada material/equipo debe salir siempre de `productos.precio`** —
la misma tabla que ya usa Cotizaciones Ventas Directas (§2, §4 de HT-AP-03) —
en vez de un catálogo paralelo.

## Decisión explícita

No se crea un catálogo de productos propio para Operaciones. Toda cotización
de Operaciones resuelve precio contra el maestro `productos` único del CRM.
Si un producto cotizado por Operaciones no existe ahí, se completa por el
importador de Productos existente (§2) — no se agrega por fuera.

---

## 1. Diferencias vs. Cotizaciones Ventas Directas (§4)

| | Ventas Directas | Operaciones |
|---|---|---|
| Origen | Negociación directa / pipeline Ventas Directas | Solicitud Fracttal (mantención/reparación) |
| Precio de materiales | `productos.precio` | `productos.precio` (mismo maestro) |
| Mano de obra | No aplica | Sí — horas normales/extra, 2 técnicos, furgón, traslado por comuna |
| Markup | No aplica sobre productos individuales (precio ya es de venta) | Markup configurable aplicado sobre subtotal de materiales |
| Modalidad de precio | Siempre desglosado | Configurable: **desglosado** o **suma alzada** |
| Documento/PDF | Formato general §4 | Mismo formato base + bloques propios (hallazgo, consideraciones de ejecución) |
| Envío/seguimiento | Botón "Enviar cotización", secuencia post-envío | Reutiliza el mismo mecanismo |

## 2. Importador / parser de solicitudes Fracttal

Entrada: texto del correo Fracttal ("Nueva solicitud creada"), pegado manualmente
(no hay integración API con Fracttal todavía).

Extrae:
- N° de solicitud, fecha de creación, solicitante, urgente (sí/no)
- Activo asociado y ubicación → cliente
- Descripción de la solicitud
- **Hallazgo**: detección heurística por verbos de falla en la descripción
  (falla, avería, bloqueado, quemado, dañado, roto, no funciona, desgaste...);
  si no se detecta, se completa manualmente
- **Ítems de materiales**: patrones "N + descripción" o "se requiere de N...";
  normaliza fracciones unicode (½ ¾ ⅜ etc.) a texto plano antes de matchear
- **Horas de mano de obra**: patrones "N personas/técnicos ... M horas"
- **Notas de ejecución**: líneas con "llevar/conseguir/coordinar/escalera/camión"
- **Fuera de Región Metropolitana**: lista de comunas no-RM conocida, matcheada
  contra el texto completo del correo

## 3. Motor de matching de productos (cambio clave respecto a la herramienta standalone)

- **Antes:** array JS estático `BBDD` (411 productos embebidos en el HTML).
- **Ahora:** matching corre contra `productos` (maestro CRM, ~2.481 productos,
  alimentado por el importador de Catálogo Técnico §2). El precio nunca se
  hardcodea ni se ingresa por un catálogo paralelo.

**Algoritmo** (determinístico, auditable, sin IA/LLM eligiendo el producto —
mantiene la política de la empresa de no adivinar):
1. Normalizar texto (minúsculas, sin tildes, fracciones unicode → texto)
2. Tokenizar; aplicar tabla de sinónimos (`cotizacion_sinonimos_operaciones`:
   término_fracttal → término_bbdd, ej. `tripolar → automatico`,
   `chapaleta → valvula chapaleta`)
3. Score = palabras descriptivas coincidentes (>2 letras) + tokens de
   modelo/numéricos coincidentes (peso ×3)
4. **Filtro de confianza reforzado**: rechazar matches que solo coincidan por
   tokens cortos/genéricos (`220v`, `2`, `inox`) sin ninguna palabra
   descriptiva real compartida — evita falsos positivos tipo
   "amarra inox" → "bomba ... inox" (detectado en pruebas reales)
5. Umbral mínimo: score ≥ 30% de la longitud de la búsqueda
6. Sin match → línea queda con precio 0 y estado "sin match", editable
   manualmente antes de emitir

**Tabla nueva:** `cotizacion_sinonimos_operaciones` (termino_fracttal,
termino_bbdd, activo) — reemplaza el objeto JS hardcodeado `SINONIMOS`;
editable por administrador/jefe comercial.

## 4. Cálculo de mano de obra (MO)

**Tabla de configuración nueva** `config_operaciones_mo` (fila única, editable
por administrador — mismo patrón que `config_empresa`):
- `hh_uf` — costo hora-hombre por técnico (UF)
- `hm_uf` — costo hora-máquina furgón (UF)
- `markup` — factor de venta sobre materiales
- `elem_mat_pct` — % elementos menores sobre subtotal materiales
- `elem_furg_uf` — elementos menores furgón (UF fijos por trabajo)

**Tabla nueva** `comunas_operaciones` (nombre, km, horas_transito,
costo_traslado_uf, activo) — reemplaza el array `COMUNAS` hardcodeado.

**Fórmula** (igual a la herramienta actual, para no reintroducir bugs ya
resueltos):
```
HH normales   = hh_uf × horas_normales × 2 técnicos
HH extra      = hh_uf × 1.5 × horas_extra × 2 técnicos
HM en trabajo = hm_uf × (horas_normales + horas_extra)
HM en tránsito= hm_uf × horas_transito_comuna × 2
Traslado      = costo_traslado_uf_comuna × 2
Elem. furgón  = elem_furg_uf (fijo)
```
**Importante:** si horas_normales = 0 y horas_extra = 0 → MO total = 0
completo (no se cobra traslado si no hay visita real). Este gate ya causó un
bug en una iteración anterior de la herramienta standalone — replicar el
gate, no solo omitir las horas.

## 5. Cálculo de totales

```
Subtotal materiales = Σ (cantidad × precio_unitario × factor) por línea
Elementos menores    = subtotal materiales × elem_mat_pct
Materiales × Markup  = (subtotal materiales + elementos menores) × markup
Total neto UF        = materiales×markup + MO total
Total neto CLP       = total neto UF × valor UF del día
IVA                  = total neto CLP × iva_pct   (reutiliza cotizaciones.iva_pct, §4)
Total con IVA        = neto + IVA
```
Valor UF del día: input manual por ahora (igual que la herramienta
standalone). Integración con mindicador.cl queda como pendiente no
bloqueante.

## 6. Modalidad de precio

Campo nuevo `cotizaciones.modalidad_precio` (enum: `desglosado` / `alzada`):
- **Desglosado**: PDF/vista pública muestra subtotal materiales, elementos
  menores, markup y MO por separado.
- **Suma alzada**: solo se muestra el total.

## 7. Formato de documento (PDF / vista pública)

Reutiliza el formato general de Cotizaciones (§4: encabezado emisor, cliente,
condiciones, IVA). Agrega:
- Bloque **Hallazgo** (entre comillas) — campo nuevo `cotizaciones.hallazgo`
- Bloque **Justificación técnica / Observaciones** — campo nuevo
  `cotizaciones.justificacion_tecnica`
- Bloque **Consideraciones de ejecución**: lista de ítems con tag
  (Info / Atención / Corte agua / Horario no hábil / Acceso / Otro) — tabla
  nueva `cotizacion_consideraciones` (cotizacion_id, tag, texto, orden)
- Nota fija: "las variaciones de alcance no previstas se cotizan por separado"
- Marca "URGENTE" si la solicitud Fracttal de origen venía marcada como tal

## 8. Envío y seguimiento

Reutiliza el botón único "Enviar cotización" (Correo/WhatsApp) y el motor de
secuencias post-envío ya existentes (§4) — sin lógica nueva. Solo cambia la
plantilla de texto del correo (saludo + hallazgo entre comillas +
observaciones + llamado a aprobar la cotización), configurable igual que la
plantilla de WhatsApp en Configuración → Datos de empresa.

## 9. Modelo de datos — resumen

| Tabla | Cambio |
|---|---|
| `cotizaciones` | + `origen` (enum: venta_directa / operaciones), `fracttal_numero`, `fracttal_fecha_solicitud`, `fracttal_solicitante`, `hallazgo`, `justificacion_tecnica`, `modalidad_precio` (enum), `comuna_id` (FK), `horas_normales`, `horas_extra` |
| `cotizacion_consideraciones` | **nueva** — cotizacion_id, tag, texto, orden |
| `comunas_operaciones` | **nueva** — nombre, km, horas_transito, costo_traslado_uf, activo |
| `config_operaciones_mo` | **nueva**, fila única — hh_uf, hm_uf, markup, elem_mat_pct, elem_furg_uf |
| `cotizacion_sinonimos_operaciones` | **nueva** — termino_fracttal, termino_bbdd, activo |
| `productos` | **sin cambios de esquema** — se reutiliza tal cual (§2); el matching de Operaciones consulta esta misma tabla |

## 10. Pendientes / decisiones abiertas para Gerencia

1. ¿El pipeline Operaciones reemplaza por completo la herramienta HTML
   standalone, o convive en paralelo durante una transición corta?
2. ¿Un ítem "sin match" puede dar de alta un producto nuevo directamente
   desde la cotización, o siempre debe pasar por el importador de Productos
   (§2)?
3. ¿`config_operaciones_mo` y `comunas_operaciones` los edita solo
   administrador, o también jefe_comercial (mismo criterio que Configuración
   → Secuencias)?
4. Integración de valor UF automática (mindicador.cl) — no bloqueante para
   la v1 de este módulo.

---

*Historial completo de decisiones de esta nota queda archivado junto a las
notas v1.2–v1.16 en `docs/HT-AP-03-nota-cambio-v1.X.md`. El contenido vigente
de esta nota se consolida en HT-AP-03 (sección "Cotizador Operaciones").*
