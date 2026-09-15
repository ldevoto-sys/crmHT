// API REST de integración para la app de Mantenimiento (HT-DO-XX, ver
// docs/HT-DO-XX-Especificacion-Integracion-Mantenimiento-v1.0.md).
//
// Mismo patrón que /api/v1 (Cowork, ver routes/api_v1.js): un token estático
// por variable de entorno (MANTENIMIENTO_API_KEY), sin JWT — un segundo
// integrador externo con su propio token, no un usuario del CRM. Se separa
// en su propio router (en vez de sumarse a api_v1.js) para no arriesgar esa
// integración ya en uso y porque el límite de tasa es independiente.
const express = require('express');
const router = express.Router();
const mantenimientoOT = require('../services/mantenimientoOT');

function error(res, status, codigo, mensaje) {
  return res.status(status).json({ codigo, mensaje });
}

function requireToken(req, res, next) {
  if (!process.env.MANTENIMIENTO_API_KEY) return error(res, 503, 'no_configurado', 'Integración no configurada');
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token || token !== process.env.MANTENIMIENTO_API_KEY) return error(res, 401, 'no_autorizado', 'Token inválido o revocado');
  next();
}

// Límite de tasa: 60 solicitudes/minuto, en memoria del proceso — mismo
// criterio que api_v1.js, pero contador propio (integradores independientes).
const ventanaPeticiones = [];
function rateLimit(req, res, next) {
  const ahora = Date.now();
  while (ventanaPeticiones.length && ahora - ventanaPeticiones[0] > 60000) ventanaPeticiones.shift();
  if (ventanaPeticiones.length >= 60) return error(res, 429, 'limite_excedido', 'Máximo 60 solicitudes por minuto');
  ventanaPeticiones.push(ahora);
  next();
}

router.use(requireToken, rateLimit);

// GET /api/v1/mantenimiento/ordenes-trabajo/:negocioId
router.get('/ordenes-trabajo/:negocioId', async (req, res) => {
  try {
    const negocioId = Number(req.params.negocioId);
    if (!Number.isInteger(negocioId)) return error(res, 400, 'parametro_invalido', 'negocioId debe ser un número');
    const ot = await mantenimientoOT.obtenerOTParaMantenimiento(negocioId);
    if (!ot) return error(res, 404, 'no_encontrado', 'Este negocio no tiene Orden de Trabajo (se genera al entrar a "Aceptado")');
    res.json(ot);
  } catch (err) {
    console.error('[api_mantenimiento GET /ordenes-trabajo/:negocioId]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

// PATCH /api/v1/mantenimiento/ordenes-trabajo/:negocioId/estado
// Body: { estado: 'pendiente'|'en_progreso'|'cerrado', observaciones? }
// Contrato mínimo y genérico a propósito: Mantenimiento todavía no tiene
// definido su propio modelo de datos (repo en etapa de requerimientos), así
// que no se adivinan campos (horas trabajadas, informe, etc.) que puedan no
// calzar con lo que termine construyendo. Se amplía cuando haga falta.
router.patch('/ordenes-trabajo/:negocioId/estado', async (req, res) => {
  try {
    const negocioId = Number(req.params.negocioId);
    if (!Number.isInteger(negocioId)) return error(res, 400, 'parametro_invalido', 'negocioId debe ser un número');
    const { estado, observaciones } = req.body || {};
    if (!mantenimientoOT.ESTADOS_VALIDOS.includes(estado)) {
      return error(res, 400, 'estado_invalido', `estado debe ser uno de: ${mantenimientoOT.ESTADOS_VALIDOS.join(', ')}`);
    }
    const resultado = await mantenimientoOT.actualizarEstadoMantenimiento(negocioId, { estado, observaciones });
    if (resultado.error === 'no_encontrado') return error(res, 404, 'no_encontrado', 'Este negocio no tiene Orden de Trabajo');
    if (resultado.error) return error(res, 400, resultado.error, 'Solicitud inválida');
    const ot = await mantenimientoOT.obtenerOTParaMantenimiento(negocioId);
    res.json(ot);
  } catch (err) {
    console.error('[api_mantenimiento PATCH /ordenes-trabajo/:negocioId/estado]', err);
    error(res, 500, 'error_interno', 'Error interno');
  }
});

module.exports = router;
