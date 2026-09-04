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

module.exports = { VENTAS, OFICIAL, CUENTAS, resolverPorPhoneNumberId };
