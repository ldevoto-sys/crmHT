const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const PUEDE_CONFIGURAR = ['administrador', 'jefe_comercial'];

router.use(authenticate);

function validarPasos(pasos) {
  if (!Array.isArray(pasos) || pasos.length === 0) return 'Debes definir al menos un paso';
  for (const p of pasos) {
    if (!p.canal || !['correo', 'whatsapp', 'llamada', 'tarea'].includes(p.canal)) return 'Canal inválido en un paso';
    if (!p.mensaje || !p.mensaje.trim()) return 'Cada paso requiere un mensaje';
    if (p.dias_espera === undefined || p.dias_espera === null || Number(p.dias_espera) < 0) return 'dias_espera inválido en un paso';
  }
  return null;
}

// GET /api/secuencias
router.get('/', async (req, res) => {
  try {
    const secuencias = await db.all(
      `SELECT s.*, (SELECT count(*)::int FROM secuencia_pasos sp WHERE sp.secuencia_id = s.id) AS total_pasos
       FROM secuencias s ORDER BY s.nombre`
    );
    res.json(secuencias);
  } catch (err) {
    console.error('[secuencias/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/secuencias/:id (con pasos)
router.get('/:id', async (req, res) => {
  try {
    const secuencia = await db.get('SELECT * FROM secuencias WHERE id = $1', [req.params.id]);
    if (!secuencia) return res.status(404).json({ error: 'Secuencia no encontrada' });
    const pasos = await db.all('SELECT * FROM secuencia_pasos WHERE secuencia_id = $1 ORDER BY orden', [req.params.id]);
    res.json({ ...secuencia, pasos });
  } catch (err) {
    console.error('[secuencias/GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/secuencias {nombre, descripcion, pasos:[{orden,dias_espera,canal,asunto,mensaje}]}
router.post('/', authorize(...PUEDE_CONFIGURAR), async (req, res) => {
  const { nombre, descripcion, pasos } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  const errPasos = validarPasos(pasos);
  if (errPasos) return res.status(400).json({ error: errPasos });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      'INSERT INTO secuencias (nombre, descripcion, creado_por_id) VALUES ($1,$2,$3) RETURNING id',
      [nombre.trim(), descripcion || null, req.user.id]
    );
    const secuenciaId = r.rows[0].id;
    let orden = 1;
    for (const p of pasos) {
      await client.query(
        `INSERT INTO secuencia_pasos (secuencia_id, orden, dias_espera, canal, asunto, mensaje)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [secuenciaId, orden++, p.dias_espera, p.canal, p.asunto || null, p.mensaje.trim()]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: secuenciaId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[secuencias/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// PUT /api/secuencias/:id {nombre, descripcion, pasos} — reemplaza los pasos completos
router.put('/:id', authorize(...PUEDE_CONFIGURAR), async (req, res) => {
  const { nombre, descripcion, pasos } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  const errPasos = validarPasos(pasos);
  if (errPasos) return res.status(400).json({ error: errPasos });

  const existe = await db.get('SELECT id FROM secuencias WHERE id = $1', [req.params.id]);
  if (!existe) return res.status(404).json({ error: 'Secuencia no encontrada' });

  const enUso = await db.get(
    `SELECT 1 FROM secuencia_ejecuciones se
     JOIN secuencia_pasos sp ON sp.id = se.paso_id
     WHERE sp.secuencia_id = $1 LIMIT 1`,
    [req.params.id]
  );
  if (enUso) return res.status(409).json({ error: 'Esta secuencia ya se usó en algún negocio; desactívala y crea una nueva en vez de editar sus pasos' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE secuencias SET nombre=$1, descripcion=$2 WHERE id=$3', [nombre.trim(), descripcion || null, req.params.id]);
    await client.query('DELETE FROM secuencia_pasos WHERE secuencia_id = $1', [req.params.id]);
    let orden = 1;
    for (const p of pasos) {
      await client.query(
        `INSERT INTO secuencia_pasos (secuencia_id, orden, dias_espera, canal, asunto, mensaje)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, orden++, p.dias_espera, p.canal, p.asunto || null, p.mensaje.trim()]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Secuencia actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[secuencias/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// PUT /api/secuencias/:id/activo {activo}
router.put('/:id/activo', authorize(...PUEDE_CONFIGURAR), async (req, res) => {
  try {
    const { activo } = req.body;
    const r = await db.run('UPDATE secuencias SET activo=$1 WHERE id=$2', [activo === true, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Secuencia no encontrada' });
    res.json({ message: 'Secuencia actualizada' });
  } catch (err) {
    console.error('[secuencias/PUT /:id/activo]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
