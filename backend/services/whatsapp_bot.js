// Bot de WhatsApp — secuencia de recontacto cuando el cliente no responde a
// la pregunta de categorización (nota de cambio v1.8 §7). No escala a un
// vendedor: reintenta con el propio bot y, si se agotan los intentos, cierra
// el lead con causa identificable para poder verlo en Reportería.
//
// El tiempo de cada paso (whatsapp_recontacto_pasos.tiempo_espera_horas) es
// relativo al paso anterior (igual que secuencia_pasos.dias_espera en el
// motor de secuencias de negocios), no acumulado desde el inicio.
const { db } = require('../db');
const whatsapp = require('./whatsapp');
const { esHorarioHabil } = require('./horario');

// Avanza todos los leads en flujo de bot cuya próxima acción ya venció:
// envía el siguiente mensaje de recontacto, o cierra el lead si ya se
// enviaron todos los pasos configurados.
async function avanzarRecontactosPendientes() {
  const pendientes = await db.all(
    `SELECT * FROM leads WHERE bot_estado IN ('esperando_categoria','recontactando') AND bot_proxima_accion <= now()`
  );
  if (!pendientes.length) return { procesados: 0, enviados: 0, cerrados: 0 };

  const cfg = await db.get('SELECT recontacto_respeta_horario FROM whatsapp_bot_config WHERE id = 1');
  const pasos = await db.all('SELECT * FROM whatsapp_recontacto_pasos ORDER BY orden');
  const dentroDeHorario = cfg?.recontacto_respeta_horario ? await esHorarioHabil() : true;

  let enviados = 0, cerrados = 0;
  for (const lead of pendientes) {
    if (!dentroDeHorario) continue; // espera al próximo tick dentro de horario

    const paso = pasos[lead.bot_paso_recontacto];
    if (!paso) {
      // Ya se enviaron todos los pasos configurados en un tick anterior; cierre defensivo.
      await db.run(
        `UPDATE leads SET estado='descartado', causa_descarte='sin_respuesta_bot', bot_estado='cerrado', bot_proxima_accion=NULL WHERE id=$1`,
        [lead.id]
      );
      cerrados++;
      continue;
    }

    const contacto = await db.get('SELECT telefono_e164 FROM contactos WHERE id = $1', [lead.contacto_id]);
    if (contacto?.telefono_e164) await whatsapp.enviar(contacto.telefono_e164, paso.mensaje);

    const esUltimoPaso = lead.bot_paso_recontacto + 1 >= pasos.length;
    if (esUltimoPaso) {
      await db.run(
        `UPDATE leads SET estado='descartado', causa_descarte='sin_respuesta_bot',
                bot_estado='cerrado', bot_paso_recontacto=$1, bot_proxima_accion=NULL WHERE id=$2`,
        [lead.bot_paso_recontacto + 1, lead.id]
      );
      cerrados++;
    } else {
      const siguiente = pasos[lead.bot_paso_recontacto + 1];
      const proximaAccion = new Date(Date.now() + siguiente.tiempo_espera_horas * 3600000);
      await db.run(
        `UPDATE leads SET bot_estado='recontactando', bot_paso_recontacto=$1, bot_proxima_accion=$2 WHERE id=$3`,
        [lead.bot_paso_recontacto + 1, proximaAccion, lead.id]
      );
    }
    enviados++;
  }
  return { procesados: pendientes.length, enviados, cerrados };
}

module.exports = { avanzarRecontactosPendientes };
