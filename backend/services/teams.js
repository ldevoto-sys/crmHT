// Aviso a un canal de Microsoft Teams vía Workflow (reemplazo oficial de los
// "Incoming Webhooks" clásicos, retirados por Microsoft — ver nota de cambio
// de alertas de respuesta). El Workflow se configura una sola vez desde la
// UI de Teams (canal → Workflows → "Publicar en un canal cuando se reciba
// una solicitud webhook") y entrega una URL; acá solo se hace un POST plano
// a esa URL, sin ningún registro de aplicación en Azure AD.
// Sin TEAMS_WEBHOOK_URL configurada, no falla: registra y no hace nada,
// mismo criterio que el resto de integraciones externas (email, whatsapp, r2).
async function enviarAlertaTeams(titulo, texto) {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) {
    console.log('[teams] Sin TEAMS_WEBHOOK_URL configurada; no se envió el aviso.');
    return { enviado: false, motivo: 'Teams no configurado' };
  }
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Adaptive Card mínima — es el formato que espera un Workflow de Teams
      // con disparador "cuando se reciba una solicitud webhook".
      body: JSON.stringify({
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard', version: '1.4', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            body: [
              { type: 'TextBlock', text: titulo, weight: 'Bolder', size: 'Medium', wrap: true },
              { type: 'TextBlock', text: texto, wrap: true },
            ],
          },
        }],
      }),
    });
    if (!resp.ok) {
      const cuerpo = await resp.text().catch(() => '');
      console.error('[teams] Error al enviar aviso:', resp.status, cuerpo);
      return { enviado: false, motivo: `HTTP ${resp.status}` };
    }
    return { enviado: true };
  } catch (e) {
    console.error('[teams] Error al enviar aviso:', e.message);
    return { enviado: false, motivo: e.message };
  }
}

module.exports = { enviarAlertaTeams };
