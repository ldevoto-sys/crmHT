# HT-AP-03 — Nota de cambio v1.27

**Fecha:** 11-08-2026
**Módulo:** Cotizaciones (Ventas Directas y Operaciones), PDF, link
público, Reportería.
**Estado:** Implementada, verificada localmente y desplegada en `staging`
→ `main` (producción) el 18-08-2026, por instrucción explícita de
Gerencia (Luis Devoto) — ver §17 del consolidado.

## Problema que resuelve

Algunos clientes (comunidades, ciertos contratos de mantención) piden
cotizar en UF, no en pesos. El sistema solo cotizaba en CLP.

## Qué hace

- Nueva opción de moneda (**CLP | UF**) al crear una cotización, en
  Ventas Directas y en Operaciones.
- En modo UF, los ítems se ingresan a mano (descripción libre): no se
  puede usar el buscador del catálogo de productos, porque esos precios
  solo existen en CLP.
- El **cliente** ve todo en UF de punta a punta — PDF, link público,
  WhatsApp y correo — **sin equivalencia en pesos**. No se le muestra un
  monto mixto que pueda confundir.
- **Internamente** (Pipeline, Reportes, Dashboard, `monto_estimado` del
  negocio) todo sigue viendo el **equivalente en CLP**, para no mezclar
  criterios de reportería entre negocios en distinta moneda. La
  conversión usa la UF del día en que se guarda la cotización
  (`uf_valor`/`uf_fecha`) — mismo mecanismo de snapshot que ya usaba el
  Cotizador de Operaciones para calcular mano de obra (v1.17), reutilizado
  ahora también para Ventas Directas en UF.

## Corrección de paso: "nueva versión" no copiaba todos los campos

Al crear una nueva versión de una cotización de Operaciones, no se
copiaban `origen`/`comuna`/`horas`/UF de la cotización base — la nueva
versión volvía a "Ventas Directas" y perdía esos datos. Corregido: ahora
"nueva versión" clona también esos campos.

### Esquema

| Tabla/columna | Cambio |
|---|---|
| `cotizaciones.moneda` | ya existía el mecanismo de `uf_valor`/`uf_fecha` (v1.17, Operaciones); se generaliza su uso a cotizaciones de Ventas Directas en UF. |

### Backend / Frontend

- `backend/routes/cotizaciones.js`: cálculo y guardado condicional según
  moneda; fix de "nueva versión".
- `backend/services/pdf.js`: formato UF (2 decimales, sin signo $) cuando
  `moneda = 'UF'`, sin línea de equivalencia en CLP.
- `backend/routes/public.js`, `frontend/.../CotizacionPublica.jsx`: el
  link público respeta la moneda de la cotización.
- `frontend/.../NuevaCotizacion.jsx`, `DetalleCotizacion.jsx`,
  `DetalleNegocio.jsx`, `Cotizaciones.jsx`: selector de moneda, badge
  "UF" en las listas, bloqueo del buscador de catálogo en modo UF.

## Verificación local

Cotización de prueba en UF creada, PDF y link público confirmados sin
equivalencia en CLP; Pipeline/Reportes confirmados mostrando el
equivalente en CLP del mismo negocio. `npm run build` del frontend sin
errores.

## Pendientes explícitos

Ninguno — cambio autocontenido.

---

*Historial completo de decisiones queda archivado junto a las notas
v1.2–v1.26 en `docs/HT-AP-03-nota-cambio-v1.X.md`.*
