const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validarRut } = require('../utils/validaciones');
const { normalizarTelefono } = require('../services/dedup');
const { uploadCSV } = require('../middleware/upload');
const { parseCSV } = require('../utils/csv');
const { mapearEmpresas, PLANTILLA_HEADERS } = require('../services/import_empresas');

// Roles que pueden crear/editar maestros. Gerencia es solo lectura (§5).
const PUEDE_EDITAR = ['administrador', 'callcenter', 'vendedor'];

router.use(authenticate);

// GET /api/empresas?q=&vendedor_id=
router.get('/', async (req, res) => {
  try {
    const { q, vendedor_id } = req.query;
    const clauses = ['e.activo = true'];
    const params = [];
    let i = 1;
    if (q) {
      clauses.push(`(e.razon_social ILIKE $${i} OR e.rut ILIKE $${i} OR e.dominio_correo ILIKE $${i})`);
      params.push(`%${q}%`); i++;
    }
    if (vendedor_id) { clauses.push(`e.vendedor_id = $${i++}`); params.push(vendedor_id); }

    const empresas = await db.all(
      `SELECT e.id, e.razon_social, e.rut, e.dominio_correo, e.comuna, e.ciudad,
              e.vendedor_id, u.nombre AS vendedor_nombre,
              (SELECT count(*) FROM contactos c WHERE c.empresa_id = e.id AND c.activo = true) AS contactos_count
       FROM empresas e
       LEFT JOIN users u ON u.id = e.vendedor_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY e.razon_social LIMIT 500`,
      params
    );
    res.json(empresas);
  } catch (err) {
    console.error('[empresas/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Importador CSV de empresas ---

router.get('/importar/plantilla', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_empresas.csv"');
  res.send('﻿' + PLANTILLA_HEADERS.join(',') + '\n');
});

async function clasificarEmpresas(validos) {
  const ruts = validos.map(v => v.empresa.rut).filter(Boolean);
  const nombres = validos.filter(v => !v.empresa.rut).map(v => v.empresa.razon_social.toLowerCase());
  let rutsExist = new Set(), nombresExist = new Set();
  if (ruts.length) {
    const r = await db.all('SELECT rut FROM empresas WHERE rut = ANY($1)', [ruts]);
    rutsExist = new Set(r.map(x => x.rut));
  }
  if (nombres.length) {
    const r = await db.all('SELECT DISTINCT lower(razon_social) AS n FROM empresas WHERE activo=true AND lower(razon_social) = ANY($1)', [nombres]);
    nombresExist = new Set(r.map(x => x.n));
  }
  let nuevos = 0, actualizar = 0;
  for (const v of validos) {
    const r = v.empresa.rut;
    const n = v.empresa.razon_social.toLowerCase();
    if ((r && rutsExist.has(r)) || (!r && nombresExist.has(n))) actualizar++;
    else nuevos++;
  }
  return { nuevos, actualizar };
}

// POST /api/empresas/importar/preview
router.post('/importar/preview', authorize('administrador', 'callcenter'), uploadCSV.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
    const { rows } = parseCSV(req.file.buffer.toString('utf8'));
    const { validos, rechazos } = mapearEmpresas(rows);
    const { nuevos, actualizar } = await clasificarEmpresas(validos);
    res.json({
      resumen: {
        total_filas_validas: validos.length, nuevos, actualizar,
        con_advertencia: validos.filter(v => v.advertencias.length).length,
        rechazos: rechazos.length,
      },
      muestra: validos.slice(0, 20).map(v => ({
        razon_social: v.empresa.razon_social, rut: v.empresa.rut || '',
        dominio_correo: v.empresa.dominio_correo || '', telefono: v.empresa.telefono_e164 || '',
        advertencias: v.advertencias,
      })),
      rechazos: rechazos.slice(0, 200),
    });
  } catch (err) {
    console.error('[empresas/importar/preview]', err);
    res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
  }
});

// POST /api/empresas/importar/confirmar
router.post('/importar/confirmar', authorize('administrador', 'callcenter'), uploadCSV.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
  const { rows } = parseCSV(req.file.buffer.toString('utf8'));
  const { validos } = mapearEmpresas(rows);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let insertados = 0, actualizados = 0;
    for (const { empresa: e } of validos) {
      let existente = null;
      if (e.rut) existente = (await client.query('SELECT id FROM empresas WHERE rut=$1', [e.rut])).rows[0];
      if (!existente && !e.rut) existente = (await client.query('SELECT id FROM empresas WHERE lower(razon_social)=lower($1) AND activo=true LIMIT 1', [e.razon_social])).rows[0];
      if (existente) {
        await client.query(
          `UPDATE empresas SET dominio_correo=COALESCE(dominio_correo,$2), telefono_e164=COALESCE(telefono_e164,$3),
                  giro=COALESCE(giro,$4), direccion=COALESCE(direccion,$5), comuna=COALESCE(comuna,$6), ciudad=COALESCE(ciudad,$7)
           WHERE id=$1`,
          [existente.id, e.dominio_correo || null, e.telefono_e164 || null, e.giro || null, e.direccion || null, e.comuna || null, e.ciudad || null]
        );
        actualizados++;
      } else {
        await client.query(
          `INSERT INTO empresas (razon_social, rut, dominio_correo, telefono_e164, giro, direccion, comuna, ciudad)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [e.razon_social, e.rut || null, e.dominio_correo || null, e.telefono_e164 || null, e.giro || null, e.direccion || null, e.comuna || null, e.ciudad || null]
        );
        insertados++;
      }
    }
    await client.query('COMMIT');
    res.json({ message: 'Importación completada', insertados, actualizados });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[empresas/importar/confirmar]', err);
    res.status(500).json({ error: 'Error al importar: ' + err.message });
  } finally {
    client.release();
  }
});

// GET /api/empresas/:id — ficha con contactos
router.get('/:id', async (req, res) => {
  try {
    const empresa = await db.get(
      `SELECT e.*, u.nombre AS vendedor_nombre
       FROM empresas e LEFT JOIN users u ON u.id = e.vendedor_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const contactos = await db.all(
      `SELECT id, nombre, apellido, email, telefono_e164, cargo, activo
       FROM contactos WHERE empresa_id = $1 AND activo = true ORDER BY nombre`,
      [req.params.id]
    );
    res.json({ ...empresa, contactos });
  } catch (err) {
    console.error('[empresas/GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/empresas
router.post('/', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    const { razon_social, rut, dominio_correo, giro, direccion, comuna, ciudad, telefono, vendedor_id } = req.body;
    if (!razon_social) return res.status(400).json({ error: 'Razón social requerida' });
    if (rut && !validarRut(rut)) return res.status(400).json({ error: 'RUT inválido' });

    if (rut) {
      const existe = await db.get('SELECT id FROM empresas WHERE rut = $1', [rut]);
      if (existe) return res.status(409).json({ error: 'Ya existe una empresa con ese RUT' });
    }

    const result = await db.run(
      `INSERT INTO empresas (razon_social, rut, dominio_correo, giro, direccion, comuna, ciudad, telefono_e164, vendedor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [razon_social, rut || null, dominio_correo || null, giro || null, direccion || null,
       comuna || null, ciudad || null, normalizarTelefono(telefono), vendedor_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[empresas/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/empresas/:id
router.put('/:id', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    const { id } = req.params;
    const { razon_social, rut, dominio_correo, giro, direccion, comuna, ciudad, telefono, vendedor_id, activo } = req.body;
    if (!razon_social) return res.status(400).json({ error: 'Razón social requerida' });
    if (rut && !validarRut(rut)) return res.status(400).json({ error: 'RUT inválido' });

    const empresa = await db.get('SELECT id FROM empresas WHERE id = $1', [id]);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (rut) {
      const existe = await db.get('SELECT id FROM empresas WHERE rut = $1 AND id != $2', [rut, id]);
      if (existe) return res.status(409).json({ error: 'Otra empresa ya usa ese RUT' });
    }

    await db.run(
      `UPDATE empresas SET razon_social=$1, rut=$2, dominio_correo=$3, giro=$4, direccion=$5,
              comuna=$6, ciudad=$7, telefono_e164=$8, vendedor_id=$9, activo=$10 WHERE id=$11`,
      [razon_social, rut || null, dominio_correo || null, giro || null, direccion || null,
       comuna || null, ciudad || null, normalizarTelefono(telefono), vendedor_id || null,
       activo !== undefined ? activo : true, id]
    );
    res.json({ message: 'Empresa actualizada' });
  } catch (err) {
    console.error('[empresas/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
