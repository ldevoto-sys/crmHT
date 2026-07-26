# Enmienda de marca — Diferenciación visual entre aplicaciones

**Documento:** Anexo al Manual de Marca HidroTecnica
**Versión:** 2.0 (resuelto)
**Fecha:** 2026-07-25
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Ámbito:** Aplicaciones internas HidroTecnica (HT-AP-01 GastosHT, HT-AP-02 EPP, HT-AP-03 CRM, y siguientes)
**Estado:** Resuelto y aprobado por Gerencia el 2026-07-25. Reemplaza la v1.0 (borrador del 2026-07-11).

---

## 1. Propósito

Permitir que cada aplicación interna de HidroTecnica sea **identificable a golpe
de vista**, manteniéndolas reconocibles como parte de la misma familia de marca.

Esta enmienda **no modifica** ninguna otra norma del Manual de Marca (logotipo,
proporciones, usos prohibidos, colores autorizados).

## 2. Antecedente

Durante el desarrollo del CRM Comercial (HT-AP-03) se detectó que su rediseño
visual había adoptado el Azul Celeste `#34B3DE` como acento — el mismo color
que ya tenía asignado Control EPP (HT-AP-02). Un borrador previo de este
documento (v1.0) propuso resolverlo asignando un acento distinto (naranja
`#E8833A`) al CRM.

**Gerencia revisó ambas aplicaciones y determinó que esa propuesta no es
necesaria.** La resolución final es la siguiente.

## 3. Resolución

| Elemento | Regla |
|---|---|
| **Azul Marino `#112548`** | Ancla compartida por todas las apps. Logotipo, encabezados, botones primarios, títulos y textos oscuros. No cambia entre apps. |
| **Azul Celeste `#34B3DE`** | Acento secundario **compartido** — se mantiene en EPP y en el CRM. No se adopta un color de acento distinto por aplicación. |
| **Blanco `#FFFFFF` / Gris `#555555`** | Elemento diferenciador entre apps: el CRM usa una proporción visiblemente mayor de blanco y gris (fondos más claros, menos bloques de color sólido) que EPP. Esa diferencia de balance general es suficiente para distinguirlas a golpe de vista, sin necesitar un acento propio. |

No se crea una tabla de "acentos por aplicación" — el celeste `#34B3DE` queda
como acento secundario único y compartido para todas las apps internas,
salvo que Gerencia decida lo contrario para un caso futuro.

## 4. Reglas de uso del acento (sin cambios respecto al manual vigente)

**Sí se aplica el acento en:**
- Estado activo/seleccionado del menú lateral.
- Badges y etiquetas de estado.
- Enlaces y foco de campos de formulario.
- Detalles gráficos y separadores de énfasis.

**NO se aplica el acento en:**
- El logotipo — se usa siempre el archivo original, sin recolorear.
- Botones primarios y encabezados — se mantienen en Azul Marino en todas las apps.
- Texto de cuerpo — se mantiene en navy/gris para legibilidad.

Contraste: el celeste `#34B3DE` no cumple el mínimo WCAG AA (4.5:1) con texto
blanco (~2.4:1), pero sí con texto Azul Marino (~6.3:1) — los elementos con
fondo celeste deben usar texto navy, no blanco (ver HT-PL-05 §3.3).

## 5. Implementación técnica (referencia)

Ambas apps mantienen el mismo token de acento — no se requiere ningún cambio
de código a partir de esta resolución:

```js
// tailwind.config.js — igual en EPP y en CRM
colors: {
  'ht-navy':   '#112548',   // común a todas las apps
  'ht-accent': '#34B3DE',   // acento compartido, no varía por app
}
```

La diferenciación visual entre apps es responsabilidad del diseño de cada
pantalla (proporción de blanco/gris, densidad de bloques de color), no del
token de color en sí.

## 6. Para aplicaciones futuras

Antes de iniciar el diseño visual de una aplicación interna nueva, quien la
desarrolle debe revisar este documento y decidir, junto con Gerencia, si la
diferenciación se logra por balance de composición (como se resolvió aquí)
o si amerita un acento de color propio — evaluando caso a caso, no por
regla fija.

---

*HidroTecnica SpA — Anexo al Manual de Marca · v2.0, resuelto y aprobado por Gerencia el 2026-07-25*
