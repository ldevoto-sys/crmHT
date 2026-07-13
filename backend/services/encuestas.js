// Recordatorio único de la encuesta post-cierre (HT-AP-03 §7, Etapa 3C).
// Si a los DIAS_RECORDATORIO no ha respondido, se genera UNA tarea de
// recordatorio para el vendedor (no se reintenta más de una vez).
const { db } = require('../db');
const timeline = require('./timeline');

const DIAS_RECORDATORIO = parseInt(process.env.ENCUESTA_DIAS_RECORDATORIO || '5', 10);

async function enviarRecordatorios() {
  const pendientes = await db.all(
    `SELECT en.id, en.token_publico, n.id AS negocio_id, n.vendedor_id, n.contacto_id, n.empresa_id
     FROM encuestas en JOIN negocios n ON n.id = en.negocio_id
     WHERE en.respondida_en IS NULL AND en.recordatorio_enviado_en IS NULL
       AND en.created_at <= now() - ($1 || ' days')::interval`,
    [DIAS_RECORDATORIO]
  );

  for (const en of pendientes) {
    await db.run(
      `INSERT INTO tareas (titulo, descripcion, fecha_vencimiento, asignado_a_id, creado_por_id, contacto_id, empresa_id, negocio_id)
       VALUES ($1,$2,now(),$3,$3,$4,$5,$6)`,
      [
        'Recordatorio: encuesta de satisfacción sin responder',
        `El cliente aún no responde la encuesta. Link: ${process.env.APP_URL || ''}/encuesta/${en.token_publico}`,
        en.vendedor_id, en.contacto_id, en.empresa_id, en.negocio_id,
      ]
    );
    await db.run('UPDATE encuestas SET recordatorio_enviado_en = now() WHERE id = $1', [en.id]);
    await timeline.registrar({
      negocio_id: en.negocio_id, contacto_id: en.contacto_id, empresa_id: en.empresa_id,
      tipo: 'seguimiento_auto', descripcion: 'Recordatorio de encuesta de satisfacción enviado', referencia_id: en.id,
    });
  }
  return { recordatorios: pendientes.length };
}

module.exports = { enviarRecordatorios };
