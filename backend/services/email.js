// Correos transaccionales del sistema (bienvenida, reset, cambio de contraseña)
// y envío de cotizaciones al cliente. Usa Brevo vía SMTP, igual que
// GastosHT/EPP (HT-AP-03 §3, §15). El correo llega desde una dirección
// genérica (no desde el buzón real del vendedor), pero con "Responder a"
// apuntando al vendedor para que las respuestas del cliente le lleguen
// directo a él. El envío "nativo" desde el buzón del vendedor vía Microsoft
// Graph queda para cuando esa integración esté disponible (ver nota de
// cambio v1.8, §7).
const nodemailer = require('nodemailer');
const { numeroCompleto } = require('./cotizacion_data');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || 'HidroTecnica CRM <no-reply@hidrotecnica.cl>';
const APP_URL = process.env.APP_URL || 'http://localhost:3001';

async function enviar(to, subject, html, opts = {}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(`[email] SMTP no configurado (falta SMTP_USER o SMTP_PASS) — no se envía a ${to}: "${subject}"`);
    return { enviado: false, motivo: 'SMTP no configurado' };
  }
  const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  console.log(`[email] Enviando a ${to} — asunto: "${subject}" (host=${host}, puerto=${port}, usuario=${process.env.SMTP_USER})`);
  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html, replyTo: opts.replyTo, attachments: opts.attachments });
    console.log(`[email] Enviado a ${to} — messageId=${info.messageId}, respuesta SMTP: ${info.response}`);
    return { enviado: true };
  } catch (e) {
    console.error(
      `[email] Error enviando a ${to}: ${e.message}`,
      `| code=${e.code || '—'} responseCode=${e.responseCode || '—'} response=${e.response || '—'} command=${e.command || '—'}`
    );
    return { enviado: false, motivo: e.message };
  }
}

// Plantilla base con colores de marca (navy #112548 / cyan #34B3DE / gris #555).
function template(titulo, contenido) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #112548; color: #FFFFFF; padding: 20px 24px;">
        <h1 style="margin: 0; font-size: 18px;">HidroTecnica SpA</h1>
        <p style="margin: 4px 0 0; font-size: 13px; color: #34B3DE;">CRM Comercial</p>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
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

function boton(url, texto) {
  return `<a href="${url}" style="display:inline-block;background:#112548;color:#FFFFFF;padding:10px 20px;border-radius:4px;text-decoration:none;margin-top:8px;">${texto}</a>`;
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
  // cotizaciones (numero, titulo, total); pdfBuffer opcional para adjuntar.
  cotizacion: (destinatario, vendedor, cot, linkPublico, pdfBuffer) => enviar(
    destinatario,
    `Cotización ${numeroCompleto(cot.numero, cot.version)} — HidroTecnica SpA`,
    template(`Cotización ${numeroCompleto(cot.numero, cot.version)}`, `
      <p>Estimado(a) ${cot.contacto_nombre || ''},</p>
      <p>Junto con saludar, adjuntamos la cotización solicitada${cot.titulo ? `: <strong>${cot.titulo}</strong>` : ''}.</p>
      <p>También puedes revisarla en línea:</p>
      ${boton(linkPublico, 'Ver cotización online')}
      <p style="margin-top:20px;">Quedamos atentos a tus consultas.</p>
      <p>Saludos,<br>${vendedor?.nombre || 'Equipo HidroTecnica'}</p>
    `),
    {
      replyTo: vendedor?.email || undefined,
      attachments: pdfBuffer ? [{ filename: `${numeroCompleto(cot.numero, cot.version)}.pdf`, content: pdfBuffer }] : [],
    }
  ),
};
