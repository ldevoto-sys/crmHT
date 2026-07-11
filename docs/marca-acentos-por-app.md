# Enmienda de marca — Sistema de acentos por aplicación

**Documento:** Anexo al Manual de Marca HidroTecnica
**Versión:** 1.0 (borrador para validación)
**Fecha:** 2026-07-11
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Ámbito:** Aplicaciones internas HidroTecnica (HT-AP-01 GastosHT, HT-AP-02 EPP, HT-AP-03 CRM, y siguientes)

---

## 1. Propósito

Permitir que cada aplicación interna de HidroTecnica sea **identificable a golpe
de vista**, manteniéndolas reconocibles como parte de la misma familia de marca.

El Manual de Marca vigente autoriza cuatro colores y asigna al Azul Celeste el
rol de color secundario/acento. Esta enmienda **extiende** esa regla para el
caso específico de las aplicaciones internas: el acento secundario deja de ser
único y pasa a variar por aplicación, bajo las reglas de este documento.

Esta enmienda **no modifica** ninguna otra norma del manual (logotipo,
proporciones, usos prohibidos).

## 2. Principio

| Elemento | Regla |
|---|---|
| **Azul Marino `#112548`** | Ancla compartida por TODAS las apps. Logotipo, encabezados, botones primarios, títulos y textos oscuros. No cambia entre apps. |
| **Acento secundario** | **Varía por aplicación.** Badges, highlights, estado activo del menú, enlaces, indicadores. Es el elemento diferenciador. |
| **Blanco `#FFFFFF` / Gris `#555555`** | Sin cambios. Fondos, espacios de respiro y textos secundarios en todas las apps. |

Resultado: dos aplicaciones abiertas lado a lado se leen como hermanas (mismo
navy, mismo logotipo, misma estructura) pero se distinguen por el acento.

## 3. Mapa de acentos por aplicación

| Aplicación | Código | Acento | Hex | Estado |
|---|---|---|---|---|
| GastosHT | HT-AP-01 | (por definir) | — | Pendiente |
| Control EPP | HT-AP-02 | Azul Celeste | `#34B3DE` | Vigente (color del manual) |
| CRM Comercial | HT-AP-03 | Naranja HT | `#E8833A` | Propuesto en esta enmienda |

El Azul Celeste `#34B3DE` queda asignado a EPP. Los acentos de nuevas apps se
agregan a esta tabla al iniciarse su desarrollo.

## 4. Reglas de uso del acento

**Sí se aplica el acento en:**
- Estado activo/seleccionado del menú lateral.
- Badges y etiquetas de estado.
- Enlaces y foco de campos de formulario.
- Detalles gráficos y separadores de énfasis.

**NO se aplica el acento en:**
- El logotipo — se usa siempre el archivo original, sin recolorear (regla del manual sin cambios).
- Botones primarios y encabezados — se mantienen en Azul Marino en todas las apps.
- Texto de cuerpo — se mantiene en navy/gris para legibilidad.

## 5. Accesibilidad (contraste)

El acento se usa principalmente como **relleno o indicador**, no como texto fino.
Contrastes del Naranja HT `#E8833A` (WCAG 2.1, ratio):

| Combinación | Ratio | Uso recomendado |
|---|---|---|
| Texto **Azul Marino** sobre relleno naranja | ~5.6:1 | ✅ Apto para texto e íconos sobre superficies naranjas |
| Texto **Blanco** sobre relleno naranja | ~2.7:1 | ⚠️ No usar para texto |
| Naranja como texto/línea fina sobre blanco | ~2.7:1 | ⚠️ Solo áreas grandes o decorativas, no texto |

Regla práctica: sobre superficies naranjas, el texto y los íconos van en
**Azul Marino `#112548`**, no en blanco.

## 6. Implementación técnica (referencia)

Cada app define su acento como token de Tailwind, manteniendo el nombre del
color principal común:

```js
// tailwind.config.js
colors: {
  'ht-navy':   '#112548',   // común a todas las apps
  'ht-accent': '#E8833A',   // acento propio de esta app (CRM). En EPP sería #34B3DE
}
```

El resto del manual de marca permanece sin cambios.

---

*HidroTecnica SpA — Anexo al Manual de Marca · Borrador v1.0 para validación de Gerencia*
