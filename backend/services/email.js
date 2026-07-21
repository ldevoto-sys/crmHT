// Correos transaccionales del sistema (bienvenida, reset, cambio de contraseña)
// y envío de cotizaciones al cliente. Usa la API HTTP de Brevo, no SMTP: se
// confirmó que Railway no deja completar conexiones salientes por el puerto
// 587 hacia ningún proveedor (mismo ETIMEDOUT probado contra Microsoft 365 y
// contra el propio Brevo) — la API HTTP evita el problema por completo porque
// va sobre HTTPS/443, que sí funciona. El correo llega desde una dirección
// genérica (no desde el buzón real del vendedor), pero con "Responder a"
// apuntando al vendedor para que las respuestas del cliente le lleguen
// directo a él. El envío "nativo" desde el buzón del vendedor vía Microsoft
// Graph queda para cuando esa integración esté disponible (ver nota de
// cambio v1.8, §7).
const { numeroCompleto } = require('./cotizacion_data');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const FROM = process.env.SMTP_FROM || 'HidroTecnica CRM <no-reply@hidrotecnica.cl>';
const APP_URL = process.env.APP_URL || 'http://localhost:3001';

// "Nombre <correo@dominio>" -> {name, email}. Acepta también un correo solo.
function parseRemitente(str) {
  const m = String(str).match(/^(.*)<(.+)>$/);
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim() };
  return { email: String(str).trim() };
}

async function enviar(to, subject, html, opts = {}) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn(`[email] BREVO_API_KEY no configurada — no se envía a ${to}: "${subject}"`);
    return { enviado: false, motivo: 'BREVO_API_KEY no configurada' };
  }
  const body = {
    sender: parseRemitente(FROM),
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };
  if (opts.replyTo) body.replyTo = { email: opts.replyTo };
  if (opts.attachments && opts.attachments.length) {
    body.attachment = opts.attachments.map(a => ({
      name: a.filename,
      content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content)).toString('base64'),
    }));
  }
  console.log(`[email] Enviando a ${to} — asunto: "${subject}" (vía Brevo API)`);
  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[email] Error enviando a ${to}: HTTP ${res.status} — ${JSON.stringify(data)}`);
      return { enviado: false, motivo: data.message || `HTTP ${res.status}` };
    }
    console.log(`[email] Enviado a ${to} — messageId=${data.messageId}`);
    return { enviado: true };
  } catch (e) {
    console.error(`[email] Error enviando a ${to}: ${e.message}`);
    return { enviado: false, motivo: e.message };
  }
}

// Plantilla base: fondos claros y texto oscuro en todo el correo (mejor
// lectura si el cliente de correo no aplica el CSS, y evita la barra oscura
// que se veía mal en Outlook). Colores de marca solo como acento (navy en
// títulos, celeste en el botón principal).
function template(titulo, contenido) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background:#FFFFFF; color:#1a1a1a;">
      <div style="padding: 20px 24px 12px; border-bottom: 2px solid #34B3DE;">
        <img src="${APP_URL}/Hidrotecnica.jpg" alt="HidroTecnica SpA" width="160" style="display:block; height:auto; border:0;" />
      </div>
      <div style="padding: 24px;">
        <h2 style="color: #112548; margin-top: 0;">${titulo}</h2>
        ${contenido}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #555555; font-size: 12px; margin: 0;">
          Correo generado automáticamente por el CRM Comercial de HidroTecnica SpA.
        </p>
      </div>
    </div>
  `;
}

// Botón "a prueba de Outlook": el color de fondo va en la celda de la tabla,
// no solo en el <a> — Outlook de escritorio (motor Word) ignora
// background/border-radius en enlaces sueltos, pero sí respeta el fondo de
// una celda de tabla.
function boton(url, texto, { fondo = '#34B3DE', color = '#112548' } = {}) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
      <tr>
        <td style="background:${fondo}; border-radius:4px;">
          <a href="${url}" target="_blank" style="display:inline-block; padding:10px 22px; font-family:Arial,sans-serif; font-size:14px; font-weight:bold; color:${color}; text-decoration:none;">${texto}</a>
        </td>
      </tr>
    </table>
  `;
}

module.exports = {
  bienvenida: (user, passwordTemporal) => enviar(
    user.email,
    'Bienvenido al CRM Comercial de HidroTecnica',
    template('Tu cuenta ha sido creada', `
      <p>Hola <strong>${user.nombre}</strong>,</p>
      <p>Tu cuenta en el CRM Comercial ha sido creada con el rol <strong>${user.rol}</strong>.</p>
      <p><strong>Credenciales de acceso:</strong></p>
      <ul>
        <li>Email: ${user.email}</li>
        <li>Contraseña temporal: <code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;">${passwordTemporal}</code></li>
      </ul>
      <p>Deberás cambiar tu contraseña al primer ingreso.</p>
      ${boton(`${APP_URL}/login`, 'Ingresar al sistema')}
    `)
  ),

  passwordCambiada: (user) => enviar(
    user.email,
    'Tu contraseña fue cambiada',
    template('Contraseña actualizada', `
      <p>Hola <strong>${user.nombre}</strong>,</p>
      <p>Tu contraseña del CRM Comercial fue cambiada exitosamente.</p>
      <p>Si no fuiste tú, contacta al administrador de inmediato.</p>
    `)
  ),

  contrasenaAsignada: (user, passwordTemporal) => enviar(
    user.email,
    'Tu contraseña fue restablecida — CRM HidroTecnica',
    template('Contraseña restablecida', `
      <p>Hola <strong>${user.nombre}</strong>,</p>
      <p>Un administrador restableció tu contraseña del CRM Comercial.</p>
      <p><strong>Nueva contraseña temporal:</strong> <code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;">${passwordTemporal}</code></p>
      <p>Deberás cambiarla al ingresar.</p>
      ${boton(`${APP_URL}/login`, 'Ingresar al sistema')}
    `)
  ),

  resetPassword: (user, token) => enviar(
    user.email,
    'Recuperar contraseña — CRM HidroTecnica',
    template('Recuperar contraseña', `
      <p>Hola <strong>${user.nombre}</strong>,</p>
      <p>Solicitaste restablecer tu contraseña. El link es válido por 1 hora.</p>
      ${boton(`${APP_URL}/reset-password/${token}`, 'Restablecer contraseña')}
      <p style="color:#555555;font-size:12px;margin-top:16px;">Si no solicitaste esto, ignora este correo.</p>
    `)
  ),

  // Envío de una cotización al cliente. destinatario: email del contacto;
  // vendedor: {nombre,email} (se usa como "Responder a"); cot: fila de
  // cotizaciones (numero, titulo, total); pdfBuffer opcional para adjuntar;
  // emisor: fila de config_empresa (mensaje_cotizacion_email,
  // incluir_whatsapp_email, mensaje_whatsapp_email, whatsapp).
  cotizacion: (destinatario, vendedor, cot, linkPublico, pdfBuffer, emisor = {}) => {
    const mensaje = emisor.mensaje_cotizacion_email || 'Junto con saludar, adjuntamos la cotización solicitada';
    const numeroWa = (emisor.whatsapp || '').replace(/\D/g, '');
    const incluirWhatsapp = emisor.incluir_whatsapp_email !== false && numeroWa;
    return enviar(
      destinatario,
      `Cotización ${numeroCompleto(cot.numero, cot.version)} — HidroTecnica SpA`,
      template(`Cotización ${numeroCompleto(cot.numero, cot.version)}`, `
        <p>Estimado(a) ${cot.contacto_nombre || ''},</p>
        <p>${mensaje}${cot.titulo ? `: <strong>${cot.titulo}</strong>` : ''}.</p>
        <p>También puedes revisarla en línea:</p>
        ${boton(linkPublico, 'Ver cotización online')}
        <p style="margin-top:20px;">Quedamos atentos a tus consultas.</p>
        <p>Saludos,<br>${vendedor?.nombre || 'Equipo HidroTecnica'}</p>
        ${incluirWhatsapp ? `
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="margin-bottom:0;">${emisor.mensaje_whatsapp_email || ''}</p>
        <p style="margin-top:10px;"><a href="https://wa.me/${numeroWa}" target="_blank" style="color:#112548; font-weight:bold; text-decoration:underline;">Escríbenos por WhatsApp</a></p>
        ` : ''}
      `),
      {
        replyTo: vendedor?.email || undefined,
        attachments: pdfBuffer ? [{ filename: `${numeroCompleto(cot.numero, cot.version)}.pdf`, content: pdfBuffer }] : [],
      }
    );
  },
};
