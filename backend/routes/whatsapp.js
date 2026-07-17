// Bandeja WhatsApp (Etapa 4): lista de conversaciones, hilo de mensajes y
// envío de respuestas por un vendedor desde la plataforma. HT-AP-03 §7.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const whatsapp = require('../services/whatsapp');
const mensajes = require('../services/whatsapp_mensajes');

router.use(authenticate);

// Administrador, jefe_comercial, callcenter y gerencia siempre ven todas las
// conversaciones (no son dueños de leads, necesitan visión completa para
// triage/supervisión). El toggle bandeja_acceso solo restringe a vendedor:
// 'todos' = ve todas, 'asignado' = solo las de sus propios leads.
async function puedeVerTodo(req) {
  if (req.user.rol !== 'vendedor') return true;
  const cfg = await db.get('SELECT bandeja_acceso FROM whatsapp_bot_config WHERE id = 1');
  return cfg?.bandeja_acceso !== 'asignado';
}

// GET /api/whatsapp/conversaciones?vendedor_id=&estado=&abierta=true|false
router.get('/conversaciones', async (req, res) => {
  try {
    const verTodo = await puedeVerTodo(req);
    const { vendedor_id, estado, abierta } = req.query;
    const clauses = [];
    const params = [];
    let i = 1;

    if (!verTodo) { clauses.push(`l.vendedor_id = $${i++}`); params.push(req.user.id); }
    else if (vendedor_id) { clauses.push(`l.vendedor_id = $${i++}`); params.push(vendedor_id); }
    if (estado) { clauses.push(`l.estado = $${i++}`); params.push(estado); }
    if (abierta === 'true') clauses.push(`abierta.abierta = true`);
    else if (abierta === 'false') clauses.push(`abierta.abierta = false`);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const conversaciones = await db.all(
      `SELECT c.id AS contacto_id, c.nombre AS contacto_nombre, c.apellido AS contacto_apellido, c.telefono_e164,
              l.id AS lead_id, l.estado AS lead_estado, l.vendedor_id, u.nombre AS vendedor_nombre,
              ult.texto AS ultimo_mensaje, ult.direccion AS ultimo_direccion, ult.created_at AS ultimo_at,
              COALESCE(abierta.abierta, false) AS abierta
       FROM (SELECT DISTINCT contacto_id FROM whatsapp_mensajes) base
       JOIN contactos c ON c.id = base.contacto_id
       LEFT JOIN LATERAL (
         SELECT * FROM leads WHERE contacto_id = c.id ORDER BY created_at DESC LIMIT 1
       ) l ON true
       LEFT JOIN users u ON u.id = l.vendedor_id
       LEFT JOIN LATERAL (
         SELECT texto, direccion, created_at FROM whatsapp_mensajes WHERE contacto_id = c.id ORDER BY created_at DESC LIMIT 1
       ) ult ON true
       LEFT JOIN whatsapp_conversaciones wc ON wc.contacto_id = c.id
       LEFT JOIN LATERAL (
         SELECT EXISTS (
           SELECT 1 FROM whatsapp_mensajes
           WHERE contacto_id = c.id AND direccion = 'entrante' AND created_at > now() - interval '24 hours'
         ) AND NOT COALESCE(wc.cerrada_manual, false) AS abierta
       ) abierta ON true
       ${where}
       ORDER BY ult.created_at DESC LIMIT 300`,
      params
    );
    res.json(conversaciones);
  } catch (err) {
    console.error('[whatsapp/GET /conversaciones]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

async function accesoConversacion(req, contactoId) {
  const lead = await db.get('SELECT * FROM leads WHERE contacto_id = $1 ORDER BY created_at DESC LIMIT 1', [contactoId]);
  const verTodo = await puedeVerTodo(req);
  if (verTodo) return { permitido: true, lead };
  return { permitido: lead?.vendedor_id === req.user.id, lead };
}

// GET /api/whatsapp/conversaciones/:contactoId/mensajes
router.get('/conversaciones/:contactoId/mensajes', async (req, res) => {
  try {
    const { permitido } = await accesoConversacion(req, req.params.contactoId);
    if (!permitido) return res.status(403).json({ error: 'Sin permiso para ver esta conversación' });
    const hilo = await db.all(
      `SELECT wm.id, wm.direccion, wm.texto, wm.created_at, u.nombre AS enviado_por_nombre
       FROM whatsapp_mensajes wm
       LEFT JOIN users u ON u.id = wm.enviado_por_id
       WHERE wm.contacto_id = $1 ORDER BY wm.created_at ASC`,
      [req.params.contactoId]
    );
    res.json(hilo);
  } catch (err) {
    console.error('[whatsapp/GET /conversaciones/:id/mensajes]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/whatsapp/conversaciones/:contactoId/mensajes {texto}
router.post('/conversaciones/:contactoId/mensajes', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'El mensaje no puede estar vacío' });

    const { permitido, lead } = await accesoConversacion(req, req.params.contactoId);
    if (!permitido) return res.status(403).json({ error: 'Sin permiso para responder esta conversación' });

    const abierta = await mensajes.ventanaAbierta(req.params.contactoId);
    if (!abierta) {
      return res.status(409).json({ error: 'Conversación cerrada: pasaron más de 24 h desde el último mensaje del cliente, no se puede enviar texto libre' });
    }

    const contacto = await db.get('SELECT telefono_e164 FROM contactos WHERE id = $1', [req.params.contactoId]);
    if (!contacto?.telefono_e164) return res.status(400).json({ error: 'El contacto no tiene teléfono registrado' });

    const resultado = await whatsapp.enviar(contacto.telefono_e164, texto.trim());
    if (!resultado.enviado) {
      // No se guarda en el hilo como si se hubiera mandado: evita que la
      // Bandeja muestre un mensaje que en realidad nunca llegó al cliente.
      return res.status(502).json({ error: `No se pudo enviar el mensaje a WhatsApp: ${resultado.motivo || 'error desconocido'}` });
    }
    await mensajes.registrar({
      contacto_id: req.params.contactoId, lead_id: lead?.id ?? null,
      direccion: 'saliente', texto: texto.trim(), enviado_por_id: req.user.id,
    });
    res.status(201).json({ message: 'Mensaje enviado' });
  } catch (err) {
    console.error('[whatsapp/POST /conversaciones/:id/mensajes]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/whatsapp/conversaciones/:contactoId/cerrar — cierre manual (se
// reabre solo si el cliente vuelve a escribir, ver whatsapp_mensajes.registrar).
router.post('/conversaciones/:contactoId/cerrar', async (req, res) => {
  try {
    const { permitido } = await accesoConversacion(req, req.params.contactoId);
    if (!permitido) return res.status(403).json({ error: 'Sin permiso para cerrar esta conversación' });
    await mensajes.cerrarManual(req.params.contactoId, req.user.id);
    res.json({ message: 'Conversación cerrada' });
  } catch (err) {
    console.error('[whatsapp/POST /conversaciones/:id/cerrar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
