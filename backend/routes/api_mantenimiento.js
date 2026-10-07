// API de integración con la app de Mantenimiento, segunda versión (ver
// docs/HT-DO-XX-Especificacion-Integracion-Mantenimiento-v2.md). Mantenimiento
// se queda con toda la ejecución en terreno (decisión de Luis Devoto,
// 06-10-2026): consulta acá el detalle de la OT y avisa cuando programa o
// ejecuta, y el CRM mueve la etapa real del pipeline Operaciones.
//
// Auth: mismo patrón que /api/v1 (Cowork) — Bearer token estático por
// variable de entorno, pero con su propia clave (MANTENIMIENTO_API_KEY_ENTRANTE):
// son dos integradores distintos, no deben compartir token.
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mantenimientoOT = require('../services/mantenimientoOT');

function error(res, status, codigo, mensaje) {
  return res.status(status).json({ codigo, mensaje });
}

function requireToken(req, res, next) {
  if (!process.env.MANTENIMIENTO_API_KEY_ENTRANTE) return error(res, 503, 'no_configurado', 'Integración no configurada');
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  // Comparación de tiempo constante — mismo motivo que api_v1.js (auditoría 23-09-2026, M-M9).
  const esperado = Buffer.from(process.env.MANTENIMIENTO_API_KEY_ENTRANTE);
  const recibido = Buffer.from(token || '');
  const valido = token && recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado);
  if (!valido) return error(res, 401, 'no_autorizado', 'Token inválido o revocado');
  next();
}

// Límite de tasa: 60 solicitudes/minuto, en memoria del proceso — mismo
// patrón que api_v1.js, contando toda solicitud (haya o no token correcto).
const ventanaPeticiones = [];
function rateLimit(req, res, next) {
  const ahora = Date.now();
  while (ventanaPeticiones.length && ahora - ventanaPeticiones[0] > 60000) ventanaPeticiones.shift();
  if (ventanaPeticiones.length >= 60) return error(res, 429, 'limite_excedido', 'Máximo 60 solicitudes por minuto');
  ventanaPeticiones.push(ahora);
  next();
}

router.use(rateLimit, requireToken);

function negocioIdDe(req, res) {
  const negocioId = Number(req.params.negocioId);
  if (!Number.isInteger(negocioId) || negocioId <= 0) { error(res, 400, 'negocio_invalido', 'negocioId inválido'); return null; }
  return negocioId;
}

router.get('/ordenes-trabajo/:negocioId', async (req, res) => {
  const negocioId = negocioIdDe(req, res);
  if (negocioId === null) return;
  const ot = await mantenimientoOT.obtenerOTParaMantenimiento(negocioId);
  if (!ot) return error(res, 404, 'no_encontrado', 'No existe una OT para ese negocio');
  res.json(ot);
});

function registrarCambioEtapa(nombreEtapa) {
  return async (req, res) => {
    const negocioId = negocioIdDe(req, res);
    if (negocioId === null) return;
    const r = await mantenimientoOT.registrarEtapaDesdeMantenimiento(negocioId, nombreEtapa, req.body || {});
    if (r.error === 'no_encontrado') return error(res, 404, 'no_encontrado', 'No existe un negocio u OT para ese id');
    if (r.error === 'etapa_no_configurada') {
      return error(res, 409, 'etapa_no_configurada', `La etapa "${nombreEtapa}" no existe o está inactiva en el pipeline Operaciones`);
    }
    if (r.error) return error(res, 400, 'datos_invalidos', r.mensaje || 'Datos inválidos');
    res.json({ message: 'Etapa actualizada' });
  };
}

// Body esperado (todas las claves opcionales salvo lo que ya exige el flujo
// de OT en services/ot.js — acá no aplica porque mantenimiento_gestiona
// salta ese gate, ver registrarEtapaDesdeMantenimiento): fecha_programada
// (AAAA-MM-DD), horas_programadas.
router.patch('/ordenes-trabajo/:negocioId/programacion', registrarCambioEtapa('Programado'));

// Body esperado: fecha_ejecucion (AAAA-MM-DD), horas_ejecutadas.
router.patch('/ordenes-trabajo/:negocioId/ejecucion', registrarCambioEtapa('Ejecutado'));

// POST /negocios — Mantenimiento avisa que creó una OT allá (no vino del
// CRM) y necesita su negocio_id, para que los dos ambientes usen el mismo
// número de OT (decisión de Luis Devoto 07-10-2026: nunca dos numeraciones
// independientes). Body: { referencia_externa (obligatorio, id de la OT en
// Mantenimiento), titulo, tipo_tarea, cliente: { empresa, rut (obligatorio),
// email }, sucursal_nombre }. Idempotente: reintentar con la misma
// referencia_externa devuelve el mismo negocio_id, nunca duplica.
router.post('/negocios', async (req, res) => {
  try {
    const resultado = await mantenimientoOT.crearNegocioDesdeMantenimiento(req.body || {});
    res.status(201).json(resultado);
  } catch (err) {
    if (err.status) return error(res, err.status, err.status === 400 ? 'datos_invalidos' : 'error', err.message);
    console.error('[api_mantenimiento] Error al crear negocio desde Mantenimiento', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

module.exports = router;
