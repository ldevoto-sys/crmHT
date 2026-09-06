// Cuentas de WhatsApp (Cloud API) que puede usar el CRM. Hoy solo existe
// "Ventas" (la que ya está en producción). La cuenta "Oficial" (número
// oficial de la empresa, migrado con coexistencia) se activa sola apenas se
// definan sus variables de entorno — no requiere volver a tocar este archivo
// ni el código que lo usa.
const VENTAS = {
  nombre: 'Ventas',
  ambito: 'ventas',
  phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID,
  access_token: process.env.WHATSAPP_ACCESS_TOKEN,
};

const OFICIAL = process.env.WHATSAPP_PHONE_NUMBER_ID_OFICIAL ? {
  nombre: 'Oficial',
  ambito: 'oficial',
  phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID_OFICIAL,
  access_token: process.env.WHATSAPP_ACCESS_TOKEN_OFICIAL,
} : null;

const CUENTAS = [VENTAS, ...(OFICIAL ? [OFICIAL] : [])];

// Cuenta que recibió un mensaje entrante, según el phone_number_id que trae
// el webhook (value.metadata.phone_number_id). Si no coincide con ninguna
// cuenta configurada (ej. se agregó un número en Meta pero todavía no se
// desplegaron sus variables de entorno), cae a Ventas para no perder el
// mensaje, dejando un aviso en el log.
function resolverPorPhoneNumberId(phoneNumberId) {
  const cuenta = CUENTAS.find(c => c.phone_number_id && c.phone_number_id === phoneNumberId);
  if (!cuenta) {
    console.warn(`[whatsapp] phone_number_id "${phoneNumberId}" no coincide con ninguna cuenta configurada; se procesa como Ventas.`);
    return VENTAS;
  }
  return cuenta;
}

// Reenvío temporal de un número a otro entorno (ej. staging) mientras se
// prueba antes de dejarlo definitivo en producción — herramienta de
// desarrollo, no un mecanismo permanente. Se resuelve ANTES que la cuenta:
// si el phone_number_id entrante coincide, el webhook ni siquiera lo
// procesa acá, lo reenvía tal cual (mismo cuerpo, misma firma) al destino,
// que lo recibe como si Meta se lo hubiera mandado directo. Se desactiva
// solo con no definir las dos variables.
const REENVIO_PHONE_NUMBER_ID = process.env.WHATSAPP_REENVIO_PHONE_NUMBER_ID;
const REENVIO_URL = process.env.WHATSAPP_REENVIO_URL;

function urlReenvioSiCorresponde(phoneNumberId) {
  if (REENVIO_PHONE_NUMBER_ID && REENVIO_URL && phoneNumberId === REENVIO_PHONE_NUMBER_ID) {
    return REENVIO_URL;
  }
  return null;
}

module.exports = { VENTAS, OFICIAL, CUENTAS, resolverPorPhoneNumberId, urlReenvioSiCorresponde };
