# Próximos pasos — integración con el CRM Comercial

Notas de apoyo de Luis Devoto para alinear el desarrollo de Mantenimiento con
lo que necesita el CRM Comercial (crmHT). No son instrucciones de
implementación — las decisiones técnicas (cómo construirlo) quedan en manos
del desarrollador de esta app. El objetivo es coordinar temprano para que
ambos sistemas no construyan por separado cosas que después no conversan
entre sí.

## 1. Integración API/webhook con el CRM (bidireccional)

- Debe capturar todo el pipeline de Operaciones del CRM desde que un negocio
  entra a "Aceptado" (momento en que se genera la Orden de Trabajo) en
  adelante.
- **Los estados deben ser espejo entre ambos sistemas.** El pipeline
  Operaciones del CRM ya tiene sus propias etapas reales: `Aceptado →
  Programado → Ejecutado → Facturado → Ganado`. Cuando Mantenimiento marca
  una OT como programada o ejecutada, eso debe mover la etapa real del
  negocio en el CRM — no quedar en un campo aparte que el CRM ignora.
- **Falta una etapa intermedia** entre "Programado" y "Ejecutado" para
  reflejar que la OT está bloqueada / en ejecución en terreno. Se puede
  crear directamente desde `Config → Pipeline` en el CRM (staging), sin
  tocar código.
- **La OT debe quedar bloqueada mientras está en ejecución** (abierta o
  descargada por el técnico) — nadie debería poder editarla desde el CRM
  mientras el técnico trabaja en terreno. Definir el mecanismo de bloqueo y
  qué pasa si igual se edita en ambos lados casi al mismo tiempo
  (resolución de conflictos).
- La API debe traer **todos los campos de la OT, incluyendo el listado
  completo de materiales**.
- **Nota técnica pendiente de corregir:** existe una primera versión de esta
  integración (rama `mantenimiento` de crmHT) que NO implementa el espejo
  de arriba — usa un campo de estado aparte que no mueve la etapa del
  negocio. Se identificó como diseño a rehacer; todavía no se corrigió.
  Coordinar antes de construir sobre ese contrato.
- Probar viendo el flujo real completo: Aceptado (CRM) → OT visible en
  Mantenimiento → Programado (Mantenimiento) → se refleja en el CRM →
  Ejecutado (Mantenimiento) → se refleja en el CRM.

## 2. Notificación al técnico

Cuando se le asigna una OT, debe notificársele — por WhatsApp. Pendiente:
Operaciones todavía no tiene su propio número de WhatsApp dado de alta en
Meta (ver notas del CRM) — definir si Mantenimiento usa ese número cuando
exista, uno propio, u otro canal mientras tanto.

## 3. Firma digital del cliente

Debe verse integrada al desarrollo de la OT desde el principio, no como un
agregado posterior.

## 4. Protección de datos personales (Ley 21.719)

Mantenimiento maneja los mismos datos de clientes que ya protege el CRM
(contacto, dirección), más fotografías tomadas en el domicilio del
cliente — debe quedar cubierto por la misma política corporativa, no
tratarse como un tema aparte.

## 5. Almacenamiento de fotografías

Bucket en Cloudflare (R2) para las fotos de la OT. Definir compresión antes
de subir desde el celular, tiempo de retención y quién tiene acceso.

## 6. Ambientes staging / producción

Mantenimiento debe tener ambientes de staging y producción separados,
con sus propias variables de entorno y secretos (API keys, Google Maps,
secreto del webhook) — mismo criterio que ya usa el CRM.

## 7. Plan de pruebas

Se arma más adelante, en otra instancia. Pendiente, no ahora.

## 8. Alcance completo confirmado

Estos tres puntos del plan de proyecto original **siguen en el alcance**,
no se cayeron — deben coordinarse con el CRM desde temprano:
- Catálogo de activos (equipos en la instalación del cliente)
- Calendario de mantenciones (mantenciones preventivas recurrentes)
- Portal de clientes

## 9. Resto de los próximos pasos

- Conexión API con Google Maps.
- Importadores (ubicaciones, técnicos, tareas, etc.): siempre con opción de
  carga manual y por importador. Cada importador debe entregar una planilla
  de ejemplo, indicando con claridad qué campos son obligatorios y cuáles
  opcionales.
- Verificar que toda la app sea responsiva.
- Definir cómo un técnico puede "descargar" una OT para ejecutarla en una
  zona sin cobertura de red (y cómo se sincroniza al recuperar señal).
- Definir cómo un técnico puede ingresar una OT ya realizada previamente,
  indicando el horario a mano.
- Definir cómo un supervisor puede editar una OT ya realizada: cambiar
  redacciones, agregar o eliminar fotografías.
- Reporte generado con un botón para enviar directamente al cliente.
- Manejo de perfiles de usuario.
