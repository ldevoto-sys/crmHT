# HT-AP-03 — Nota de cambio v1.5 → v1.6

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.5 → v1.6
**Fecha:** 2026-07-12
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Rol Jefe Comercial, menú de configuración (engranaje) y matriz de permisos.

---

## 1. Nuevo rol: Jefe Comercial (`jefe_comercial`)

Se agrega a los roles (§5). Perfil de jefatura comercial sin ser administrador
de sistema. Configura pipeline, reglas de asignación, WhatsApp/flujos y datos
de empresa; ve todo el pipeline/cotizaciones/reportes y puede aprobar
descuentos; **no** gestiona usuarios ni configuración del bot/horarios.

Roles del sistema: `administrador`, `jefe_comercial`, `vendedor`, `callcenter`, `gerencia`.

## 2. Menú de configuración (engranaje)

Ícono ⚙️ en el header (junto al usuario). Dos secciones, filtradas por rol:
- **Mi cuenta** (todos): cambiar contraseña; conectar correo (vendedores, con Graph).
- **Configuración** (según rol): los ítems de la matriz.

La configuración deja de estar en el sidebar (que queda solo con operación).

## 3. Matriz de permisos

| Función | Admin | Jefe Comercial | Vendedor | Call center | Gerencia |
|---|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pipeline / negocios | ✅ | ✅ (cualquiera) | propios | ver | ver |
| Cotizaciones | ✅ | ✅ | propias | — | ver |
| Aprobar descuento sobre tope | ✅ | ✅ | — | — | — |
| Cola de asignación | ✅ | ✅ | — | ✅ | — |
| Bandeja WhatsApp *(E4)* | ✅ | ✅ | sus conv. | ✅ | ver |
| Bandeja de correos 1-a-1 *(E3/E4, Graph)* | ✅ | ✅ | sus correos | ✅ | ver |
| Empresas / Contactos | ✅ | ✅ | ✅ | ✅ | ver |
| Duplicados | ✅ | ✅ | — | ✅ | — |
| Import/Export de maestros (empresas, contactos, productos) | ✅ | ✅ | — | — | — |
| Productos (consulta) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reportes *(E3)* | ✅ | ✅ | sus números | — | ✅ |
| Configurar flujos/automatizaciones *(E3/E4)* | ✅ | ✅ | — | — | — |
| Gatillar/pausar un flujo | ✅ | ✅ | propios | — | — |
| ⚙️ Config pipeline | ✅ | ✅ | — | — | — |
| ⚙️ Reglas de asignación | ✅ | ✅ | — | — | — |
| ⚙️ Datos de empresa (emisor/banco) | ✅ | ✅ | — | — | — |
| ⚙️ Config WhatsApp/plantillas *(E4)* | ✅ | ✅ | — | — | — |
| ⚙️ Usuarios | ✅ | — | — | — | — |
| ⚙️ Config bot / horarios *(E5)* | ✅ | — | — | — | — |
| ⚙️ Cambiar contraseña | ✅ | ✅ | ✅ | ✅ | ✅ |

**Cambio respecto de versiones previas:** import/export de maestros pasa de
`admin/callcenter` a **admin + jefe_comercial**.

## 4. Módulos nuevos en el roadmap (no se construyen en esta nota)

- **Configuración de flujos/automatizaciones** (motor de seguimiento §7.4):
  Etapa 3 (motor) + Etapa 4 (canal WhatsApp). Config admin/jefe; gatillar/pausar
  el vendedor sobre sus negocios.
- **Bandeja de correos 1-a-1** (hilos con el cliente vía Microsoft Graph),
  hermana de la bandeja de WhatsApp. Requiere app en Entra ID. Etapa 3/4.
  Es **alcance nuevo** respecto del documento original (que solo contemplaba
  Graph para enviar cotizaciones y detectar respuestas).

## 5. Impacto en el documento base

- **§5:** nuevo rol `jefe_comercial` y matriz de permisos (esta nota).
- **§11:** menú de configuración (engranaje); el sidebar queda operativo.
- **§6:** `users.rol` admite `jefe_comercial`.

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.6 · Borrador para validación de Gerencia*
