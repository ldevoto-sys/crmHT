# HT-AP-03 — Nota de cambio v1.7 → v1.8

**Documento:** CRM Comercial HidroTecnica (HT-AP-03)
**Cambio:** v1.7 → v1.8
**Fecha:** 2026-07-15
**Responsable:** Gerencia General — Luis Devoto (ldevoto@hidrotecnica.cl)
**Motivo:** Exportación de datos maestros, reportería de cotizaciones por
vendedor, acceso de solo lectura para BI externo, buscador de equivalencias
técnicas (reemplaza el HTML independiente) y ajustes de criterio en el
pipeline. Puntos que requieren validación de Gerencia se marcan
explícitamente.

---

## 1. Exportación de contactos y negocios (CSV)

- `Contactos` y `Pipeline` tienen botón **"Exportar CSV"**, restringido a
  administrador y jefe comercial (misma restricción que el importador,
  §9.5/v1.3).
- La exportación respeta los mismos filtros que el listado en pantalla
  (búsqueda, vendedor, etapa, rango de fechas), sin el límite de 500/1.000
  filas que sí aplica al listado.

## 2. Cotizaciones por día, con detalle por vendedor

- Botón **"Cotizaciones por día"** en Reportes, visible solo para
  administrador y jefe comercial: cantidad y monto de cotizaciones
  generadas por fecha de creación, exportable a CSV.
- Cada día es expandible y muestra el detalle por vendedor: contactos
  recién **asignados** ese día, cotizaciones **generadas** (cantidad y
  monto) y cotizaciones **ganadas** (cantidad y monto — negocio cerrado
  ganado ese día, usando la última cotización del negocio como monto).
- Para medir "asignados por día" se agrega `contactos.vendedor_asignado_en`.
  **No se rellena hacia atrás**: para asignaciones anteriores a este cambio
  no hay forma de saber cuándo ocurrieron, así que ese campo queda vacío
  para datos históricos y solo se completa desde ahora en adelante.

## 3. Acceso de solo lectura para BI externo

- **Punto validado con Gerencia:** se descartó levantar una base de datos
  réplica. En su lugar, el sistema aprovisiona automáticamente (al
  arrancar, si está definida la variable de entorno
  `BI_READONLY_PASSWORD`) un rol de PostgreSQL de solo lectura
  (`bi_readonly` por defecto) con `SELECT` sobre todas las tablas actuales
  **y futuras**.
- Pensado para conectar una herramienta externa (Power BI, Looker Studio,
  etc.) que combine esta fuente con los datos de Softland (notas de venta y
  facturación), para un dashboard diario de actividad comercial.
- La contraseña se resincroniza en cada arranque: para rotarla basta con
  cambiar la variable de entorno y volver a desplegar.

## 4. Buscador de equivalencias técnicas (nueva pestaña en Productos)

Se incorpora al CRM el buscador de alternativas/equivalentes que antes
vivía como un HTML independiente ("Buscador de Alternativas — Hidrotécnica
SpA"), como subpestaña **"Búsqueda de equivalentes"** dentro de Productos.

- **Bombas:** filtro por tipo/voltaje/marca/precio máximo; búsqueda por
  caudal, altura manométrica y potencia con tolerancia ajustable (±5/10/20/
  30%); interpolación de la curva Q/H real cuando existe; sustitutos
  declarados por código (siempre primero, sin excepción, igual que la
  herramienta original).
- **Hidroneumáticos:** búsqueda por litros, presión mínima, orientación y
  marca.
- **Filtros de piscina:** búsqueda por código/modelo o por volumen de
  piscina (±30% del modelo base, o ±5 m³ manual).
- Cada resultado tiene checkbox de selección; con uno o más elegidos
  aparece **"Generar cotización"**, que reutiliza el selector de negocio
  existente/nuevo y navega a Nueva cotización con esos productos
  precargados como líneas — el usuario solo completa negocio/contacto y el
  resto de los campos.
- Los criterios de coincidencia (tolerancias, prioridad de voltaje
  trifásico del modelo base, límite de 10 resultados al buscar por
  sustitución de un código vs. 200 en búsqueda manual) se verificaron
  contra el catálogo técnico completo (2.479 productos) para igualar el
  comportamiento de la herramienta original.

### 4.1 Importador de productos extendido

- Las hojas **"Hidroneumáticos"** y **"Filtros Piscina"** del Excel nunca
  habían sido parte del importador (solo la hoja "Catálogo", v1.3). Ahora
  se detectan automáticamente por sus columnas propias (Litros/Bar
  máx./Orientación → hidroneumático; m³/h máx./Volumen piscina → filtro de
  arena) y se les asigna la categoría, ya que esas hojas no traen columna
  Tipo.
- El importador ahora ofrece **3 plantillas de descarga** (Bombas,
  Hidroneumáticos, Filtros de piscina), cada una con todas las columnas que
  reconoce — la plantilla de bombas antes solo traía un subconjunto básico,
  lo que hacía perder en silencio los sustitutos declarados y la curva Q/H
  si se armaba el archivo a partir de ella en vez de exportar la hoja
  completa.
- **Modo "catálogo completo"** (checkbox opcional en el importador): si se
  marca, desactiva los productos activos que no estén incluidos en el
  archivo — acotado por categoría, para que subir solo bombas no desactive
  hidroneumáticos ni filtros de piscina, que se cargan en archivos
  separados. Por defecto queda destildado, así una carga parcial nunca
  desactiva nada por accidente. Un producto que reaparece en una carga
  posterior se reactiva automáticamente.

## 5. Ajustes de criterio en el pipeline y las cotizaciones

- **Cotización generada → etapa "Cotizado":** al crear una cotización
  (nueva o nueva versión) el negocio avanza automáticamente a la etapa
  "Cotizado" — solo hacia adelante (si ya está en una etapa posterior, como
  Negociación, no se toca; tampoco se toca un negocio ya cerrado).
- **Editar pipeline desde la cotización:** el detalle de una cotización
  agrega un panel para que el vendedor dueño, el jefe comercial y el
  administrador cambien la etapa del negocio (pidiendo la causa de no
  cierre si se elige una etapa "perdida", igual que en el kanban) y el % de
  cierre, sin salir de la pantalla. El monto del negocio **no** se edita
  ahí, porque va asociado a la cotización.
- **Lead con vendedor ya asignado → "Calificado":** al convertir un lead a
  negocio, si el lead ya tenía vendedor asignado (vía la cola de
  asignación), el negocio nace directo en la etapa "Calificado" en vez de
  "Lead" — ya no está sin dueño. Si se convierte sin vendedor asignado,
  sigue entrando en "Lead" igual que antes.

## 6. Impacto en el documento base

- **§6 (Modelo de datos):** `contactos` incorpora
  `vendedor_asignado_en`; se agrega el rol de PostgreSQL de solo lectura
  `bi_readonly` (fuera del modelo de aplicación, a nivel de base de datos).
- **§9 / Productos:** el importador de productos pasa a cubrir las 3 hojas
  del catálogo técnico (Catálogo, Hidroneumáticos, Filtros Piscina), con
  modo de sincronización completa por categoría.
- **§11:** nueva subpestaña "Búsqueda de equivalentes" dentro de Productos;
  botones de exportación CSV en Contactos y Pipeline; botón "Cotizaciones
  por día" en Reportes (administrador/jefe comercial).
- **§7 (Pipeline):** se documenta el criterio "cotización generada avanza a
  Cotizado" y "lead con vendedor asignado entra en Calificado", antes
  implícitos y no aplicados de forma consistente.

## 7. Pendiente para una próxima nota

- Canal de correo como fuente de leads (paralelo al canal web ya
  existente), para que un contacto que escribe por correo entre
  automáticamente como lead — en evaluación, requiere definir la
  integración con el proveedor de correo (Microsoft 365/Graph).

---

*HidroTecnica SpA — HT-AP-03 Nota de cambio v1.8 · Borrador para validación de Gerencia*
