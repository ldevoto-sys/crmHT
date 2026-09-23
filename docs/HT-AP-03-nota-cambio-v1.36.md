# HT-AP-03 — Nota de cambio v1.36 (23/09/2026)

## Corrección de hallazgos de la auditoría de seguridad del 23-09-2026

Sesión de auditoría (solo lectura, ramas `main` y `staging`) seguida de
corrección de los hallazgos que Luis Devoto marcó como "corregir" en la
hoja de notas. Subido a `staging`, commits `e946eb8`..`7de42b0`. **Nada de
esto está en `main` todavía** — según la regla vigente, solo se promueve
por corrección de error, no por mejora; falta decidir cuáles de estos
hallazgos cuentan como error crítico para promoverlos antes de la próxima
ventana fuera de horario.

### Crítico (`e946eb8`)
- Un error no capturado en `PUT /cotizaciones/:id` y en
  `PUT /ordenes-trabajo/:id/items` podía tumbar el proceso completo del
  servidor (Express 4 no captura promesas rechazadas fuera de un
  try/catch). Se corrigieron ambos puntos y se agregó un manejador global
  (`process.on('unhandledRejection'/'uncaughtException')`) como red de
  seguridad.
- Un adjunto HTML/SVG subido a Postventa, Servicio Técnico o Despacho se
  servía con el tipo declarado por quien lo sube, sin validar — se podía
  robar el token de sesión de quien lo abre. Ahora solo se aceptan
  imagen/video/audio/PDF al subir, y se fuerza tipo seguro al servir
  cualquier adjunto (incluidos los subidos antes de este cambio).
- El rol de solo lectura para BI tenía acceso completo a `users`,
  incluido el token de restablecimiento de contraseña (en texto plano).
  Ahora ese token se guarda con hash, y el rol BI solo ve columnas no
  sensibles de `users`.
  **Pendiente para Luis: rotar `BI_READONLY_PASSWORD` en Railway y en la
  skill `ht-in-02-skill-consultas-sql-crmht`** — el código ya no expone el
  token en texto plano, pero la clave sigue siendo la misma que antes de
  esta corrección.

### Permisos (`a925111`)
Sesiones que no se revocaban al desactivar un usuario o cambiarle el rol
(caché de 60 s ahora consulta la base); contraseña temporal que no
forzaba el cambio en el backend; un vendedor podía quedarse con un lead
de otro vendedor o descartarlo; roles técnico/integrador con acceso de
más a la Bandeja de WhatsApp; huecos donde un vendedor veía secuencia,
encuesta, notas, tareas o negocios de otro vendedor; `GET /api/users`
exponía RUT/email/teléfono de todos a cualquier rol (ahora solo
administrador/jefe comercial).

### Entradas externas e integraciones (`40cafcf`)
Datos de WhatsApp sin escapar en correos internos; inyección de fórmulas
en exportaciones CSV; el webhook de WhatsApp aceptaba cualquier POST sin
firma si faltaba `WHATSAPP_APP_SECRET`; el secreto de reenvío entre
entornos (mismo valor en staging y producción) ahora requiere
`WHATSAPP_REENVIO_ACEPTAR=true` en el entorno que recibe.
**Pendiente para Luis: definir `WHATSAPP_REENVIO_ACEPTAR=true` en
staging** — sin esa variable, el reenvío de producción a staging deja de
funcionar (queda igual de desactivado que antes en el sentido contrario).
También: comparación de claves de tiempo constante en la API de Cowork y
en el canal web de leads; deduplicación de mensajes de WhatsApp
reenviados; SSRF acotado en la descarga de imágenes para PDF.

### Cobranza — solo en `staging` (`7de42b0`)
Conciliación manual transaccional (antes podía duplicar aplicaciones si
fallaba a medio camino, o con dos personas conciliando a la vez); el
CHECK de `cobranza_ajustes.tipo` solo tenía 3 de los 5 tipos reales de la
configuración (causa raíz del fallo de arriba); tope de redondeo subido
de 500 a 5.000 y aplicado también cuando el ajuste viene explícito en el
body; validación de folio/saldo al aplicar un pago a una factura.

## Pendiente, no incluido en esta tanda
- Ley 21.719 (M-A3, M-M6, M-M7 de la auditoría): revisado con Luis, sin
  cambios de código — la purga automática sigue aplicando aunque el
  contacto tenga negocios (confirmado, la facturación queda en Softland),
  y el hilo de WhatsApp no se toca al anonimizar. Si eso cumple la ley
  para el caso del hilo es una pregunta para Gerencia/DPO, no de código.
- Cobranza: folios repetidos entre facturas afectas/exentas (S-M3),
  transacción al pasar un negocio a "Aceptado" (S-M5), validación de la
  etapa "Aceptado" en el importador CSV (S-M6), y el caso de cartolas
  incrementales (S-B1) — necesitan datos reales o un cambio de esquema
  más grande; ver detalle en el commit `7de42b0`.
- Dependencias con `npm audit fix` disponible (backend: xmldom,
  ip-address, express/qs/body-parser; frontend: react-router) — no se
  tocaron, quedan pendientes de decisión.
- Enmascarar teléfonos/emails en los logs — cosmético, quedó fuera de
  alcance.
- Separar la API key de Cowork en lectura/escritura — requiere
  reconfigurar el conector MCP.

Ver el informe completo de la auditoría (hallazgos, severidad, y las
notas de Luis por cada uno) en el artifact que se generó en la sesión —
pendiente de subir a SharePoint según norma de la empresa.
