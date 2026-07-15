// Secreto para firmar/verificar JWT. Debe venir de la variable de entorno
// JWT_SECRET en cualquier ambiente persistente (producción, staging). Si no
// está definida, se genera un valor aleatorio para este proceso en vez de
// usar un valor fijo conocido: es más seguro invalidar las sesiones que
// dejar el sistema firmando tokens con un secreto adivinable desde el código.
const crypto = require('crypto');

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[SEGURIDAD] JWT_SECRET no está definida. Se generó un valor temporal solo para este proceso: ' +
    'las sesiones no sobrevivirán un reinicio y cada instancia firmará con un secreto distinto. ' +
    'Configura JWT_SECRET como variable de entorno permanente antes de usar en producción.'
  );
}

module.exports = { JWT_SECRET };
