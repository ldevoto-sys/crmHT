// Envío de mensajes automáticos de WhatsApp (cotización, seguimiento,
// vencimiento) eligiendo el formato más barato (nota de cambio v1.45).
//
// Dentro de la ventana de 24 h de servicio al cliente (contada desde el último
// mensaje ENTRANTE del cliente) el mismo contenido sale como texto libre o
// mensaje interactivo con botones, sin costo. Fuera de ella, o si Meta rechaza
// el envío libre, sale como plantilla aprobada (con cobro), como antes.
//
// Margen: se usa texto libre solo hasta WHATSAPP_VENTANA_MARGEN_HORAS (23 por
// defecto) para no arriesgar un rechazo por llegar justo al vencer la ventana.
const whatsapp = require('./whatsapp');
const mensajes = require('./whatsapp_mensajes');

const MARGEN_HORAS = (() => {
  const n = Number(process.env.WHATSAPP_VENTANA_MARGEN_HORAS);
  return n > 0 && n <= 24 ? n : 23;
})();

// libre: { texto, header?, footer?, botones? } — si no hay `libre` (o no hay
// contactoId) siempre sale la plantilla. Devuelve el resultado de Meta más
// `via`: 'libre' | 'plantilla'.
async function enviarEnVentanaOPlantilla({ contactoId, telefono, plantilla, parametros, libre }) {
  if (libre && contactoId && await mensajes.ventanaAbierta(contactoId, MARGEN_HORAS)) {
    const r = libre.botones?.length
      ? await whatsapp.enviarBotones(telefono, libre.texto, libre.botones, { header: libre.header, footer: libre.footer })
      : await whatsapp.enviar(telefono, libre.texto);
    // Solo se cae a plantilla si Meta rechazó el envío (no salió nada). Un
    // error ambiguo (red) no se reintenta, para no duplicar el mensaje.
    if (r.enviado || !r.rechazado) return { ...r, via: 'libre' };
    console.warn(`[whatsapp] Envío libre rechazado para el contacto ${contactoId} (${r.motivo}); se envía la plantilla "${plantilla}".`);
  }
  const r = await whatsapp.enviarPlantilla(telefono, plantilla, parametros);
  return { ...r, via: 'plantilla' };
}

module.exports = { enviarEnVentanaOPlantilla, MARGEN_HORAS };
