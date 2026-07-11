# HT-AP-03 — Nota de cambio v1.1 → v1.2

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.1 → v1.2
**Fecha:** 2026-07-11
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Incorporar el importador de contactos por archivo y registrar las
decisiones de alcance de la migración desde HubSpot, tomadas al revisar los
datos reales.

---

## 1. Nueva funcionalidad — Importador de contactos por archivo (CSV)

Se agrega a la **Etapa 1 (Maestros)**. Permite cargar y actualizar contactos
desde un archivo CSV, tanto para la carga inicial como para cargas posteriores
que haga el equipo comercial.

Reutiliza el mismo patrón ya definido en §9.5 (carga de stock del proveedor):

**Flujo:** subir archivo → previsualización (primeras filas + conteo) →
validación fila a fila → confirmar → inserta las filas válidas y entrega un
**informe de rechazos** con el motivo de cada fila descartada.

**Validaciones por fila (reutilizan §7.2 y §16):**
- RUT chileno con dígito verificador (`validarRut`).
- Email con formato válido.
- Teléfono normalizable a E.164 (`+56…`).
- Detección de duplicados por teléfono o email contra el maestro existente
  (marca la fila como "actualiza" o "duplicado" según corresponda).

**Plantilla de columnas (CSV):**

```
nombre, apellido, email, telefono, empresa_rut, empresa_nombre, rut_comprador, cargo
```

- `empresa_rut` / `empresa_nombre`: para asociar el contacto a una empresa
  existente (o crearla si no existe, según regla de negocio).
- Columnas vacías se permiten salvo `nombre` y al menos uno de `email`/`telefono`.

**Formato:** CSV (el usuario exporta su Excel a CSV). Se entrega una plantilla
descargable. No se implementa lectura nativa de `.xlsx` en esta versión.

**Acceso:** `administrador` y `callcenter`.

## 2. Decisiones de alcance de la migración desde HubSpot

Registradas tras revisar los datos reales de la cuenta (2026-07-11):

| Objeto | En HubSpot | Se migra |
|---|---|---|
| Productos | 1.836 (con SKU, nombre, descripción, precio) | **Todos** → catálogo |
| Empresas | 1.570 (con RUT, teléfono, dominio) | **Todas**, con validación dry-run |
| Contactos | 46.509 | **Solo los que tengan teléfono O estén asociados a una empresa** (~3.500–4.000) |
| Negocios (deals) | 7 (mayoría demo) | **Ninguno** — el pipeline arranca limpio |

**Fundamento del filtro de contactos:** los ~43.000 contactos restantes
provienen de las bases de Constant Contact y Saaspro (difusión/marketing), no
son compradores. Migrarlos contradice el anti-alcance (§1). Quedan en sus
sistemas de origen; si se necesitan, se cargan luego con el importador CSV.

## 3. Impacto en el documento base

- **§9 (Integraciones):** agregar subsección "Importador de contactos CSV" (esta nota, punto 1).
- **§13 / §17 Etapa 1:** agregar ítem al checklist:
  `[ ] Importador de contactos CSV (previsualización, validación RUT/E.164/duplicados, informe de rechazos)`.
- **§14 (Decisiones tomadas):** agregar filas:
  - *Importación de contactos* → CSV con plantilla; patrón previsualizar → validar → confirmar → rechazos (igual §9.5).
  - *Alcance migración contactos* → solo con teléfono o asociados a empresa; el resto (difusión) no se migra.

Sin cambios en el resto del documento.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.2 · Borrador para validación de Gerencia*
