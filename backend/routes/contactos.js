const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validarRut, validarEmail } = require('../utils/validaciones');
const { normalizarTelefono, buscarDuplicados, sugerirEmpresaPorEmail } = require('../services/dedup');
const { uploadCSV } = require('../middleware/upload');
const { parseCSV } = require('../utils/csv');
const { mapearContactos, PLANTILLA_HEADERS } = require('../services/import_contactos');
const { toCSV } = require('../utils/csv');
const { mayusculas } = require('../utils/texto');

const PUEDE_EDITAR = ['administrador', 'jefe_comercial', 'callcenter', 'vendedor'];
const PUEDE_IMPORTAR = ['administrador', 'jefe_comercial'];

router.use(authenticate);

// Filtros compartidos entre el listado y la exportación.
function filtrosContactos(query) {
  const { q, empresa_id, revisar, vendedor_id, sin_vendedor } = query;
  const clauses = ['c.activo = true'];
  const params = [];
  let i = 1;
  if (q) {
    // Cada palabra escrita debe aparecer en alguno de los campos (no la
    // frase completa como substring de una sola columna) — nombre y
    // apellido están en columnas separadas, así que buscar "gerardo godoy"
    // antes no encontraba un contacto con nombre=GERARDO apellido=GODOY.
    const palabras = q.trim().split(/\s+/).filter(Boolean);
    const porPalabra = palabras.map((palabra) => {
      const clausula = `(c.nombre ILIKE $${i} OR c.apellido ILIKE $${i} OR c.email ILIKE $${i} OR c.telefono_e164 ILIKE $${i} OR e.razon_social ILIKE $${i})`;
      params.push(`%${palabra}%`); i++;
      return clausula;
    });
    if (porPalabra.length) clauses.push(`(${porPalabra.join(' AND ')})`);
  }
  if (empresa_id) { clauses.push(`c.empresa_id = $${i++}`); params.push(empresa_id); }
  if (revisar === '1') { clauses.push('c.revisar_duplicado = true'); }
  if (sin_vendedor === '1') { clauses.push('c.vendedor_id IS NULL'); }
  else if (vendedor_id) { clauses.push(`c.vendedor_id = $${i++}`); params.push(vendedor_id); }
  return { where: clauses.join(' AND '), params };
}

// GET /api/contactos?q=&empresa_id=&revisar=1&vendedor_id=&sin_vendedor=1
router.get('/', async (req, res) => {
  try {
    const { where, params } = filtrosContactos(req.query);
    const contactos = await db.all(
      `SELECT c.id, c.nombre, c.apellido, c.email, c.telefono_e164, c.cargo, c.origen,
              c.revisar_duplicado, c.empresa_id, e.razon_social AS empresa_nombre,
              c.vendedor_id, u.nombre AS vendedor_nombre
       FROM contactos c
       LEFT JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN users u ON u.id = c.vendedor_id
       WHERE ${where}
       ORDER BY c.nombre LIMIT 500`,
      params
    );
    res.json(contactos);
  } catch (err) {
    console.error('[contactos/GET /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/contactos/exportar — CSV con los mismos filtros que el listado (sin límite de 500)
router.get('/exportar', authorize(...PUEDE_IMPORTAR), async (req, res) => {
  try {
    const { where, params } = filtrosContactos(req.query);
    const contactos = await db.all(
      `SELECT c.nombre, c.apellido, c.email, c.telefono_e164, c.cargo, c.rut_comprador, c.origen,
              e.razon_social AS empresa, u.nombre AS vendedor_asignado, c.created_at
       FROM contactos c
       LEFT JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN users u ON u.id = c.vendedor_id
       WHERE ${where}
       ORDER BY c.nombre`,
      params
    );
    const headers = ['nombre', 'apellido', 'email', 'telefono_e164', 'cargo', 'rut_comprador', 'origen', 'empresa', 'vendedor_asignado', 'created_at'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contactos.csv"');
    res.send('﻿' + toCSV(headers, contactos));
  } catch (err) {
    console.error('[contactos/exportar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/contactos/duplicados — grupos de posibles duplicados (email o nombre+empresa).
// El teléfono es UNIQUE en la tabla, así que no puede duplicarse a nivel de datos.
router.get('/duplicados', async (req, res) => {
  try {
    const porEmail = await db.all(
      `SELECT lower(email) AS clave, array_agg(id ORDER BY created_at) AS ids
       FROM contactos WHERE activo = true AND email IS NOT NULL AND email <> ''
       GROUP BY lower(email) HAVING count(*) > 1`
    );
    const porNombre = await db.all(
      `SELECT lower(nombre)||'|'||lower(coalesce(apellido,''))||'|'||empresa_id AS clave,
              array_agg(id ORDER BY created_at) AS ids
       FROM contactos WHERE activo = true AND empresa_id IS NOT NULL
       GROUP BY lower(nombre), lower(coalesce(apellido,'')), empresa_id HAVING count(*) > 1`
    );

    const grupos = [];
    for (const g of porEmail) grupos.push({ motivo: 'email', clave: g.clave, ids: g.ids });
    for (const g of porNombre) grupos.push({ motivo: 'nombre', clave: g.clave, ids: g.ids });

    // Traer detalle de los contactos involucrados.
    const allIds = [...new Set(grupos.flatMap(g => g.ids))];
    let detalle = {};
    if (allIds.length) {
      const rows = await db.all(
        `SELECT c.id, c.nombre, c.apellido, c.email, c.telefono_e164, c.origen, c.created_at,
                e.razon_social AS empresa_nombre
         FROM contactos c LEFT JOIN empresas e ON e.id = c.empresa_id
         WHERE c.id = ANY($1)`,
        [allIds]
      );
      detalle = Object.fromEntries(rows.map(r => [r.id, r]));
    }
    res.json(grupos.map(g => ({ ...g, contactos: g.ids.map(id => detalle[id]).filter(Boolean) })));
  } catch (err) {
    console.error('[contactos/GET /duplicados]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/contactos/verificar — chequeo previo de duplicados y sugerencia de empresa.
router.post('/verificar', async (req, res) => {
  try {
    const { nombre, apellido, email, telefono, empresa_id, id } = req.body;
    const telefono_e164 = normalizarTelefono(telefono);
    const candidatos = await buscarDuplicados(
      { email, telefono_e164, nombre, apellido, empresa_id }, id || null
    );
    const empresa_sugerida = empresa_id ? null : await sugerirEmpresaPorEmail(email);
    res.json({ candidatos, empresa_sugerida, telefono_e164 });
  } catch (err) {
    console.error('[contactos/POST /verificar]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Importador CSV de contactos ---

// GET /api/contactos/importar/plantilla — descarga la plantilla de columnas.
router.get('/importar/plantilla', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_contactos.csv"');
  res.send('﻿' + PLANTILLA_HEADERS.join(',') + '\n');
});

// Clasifica cada válido como nuevo/actualizar para la previsualización.
async function clasificar(validos) {
  const tels = validos.map(v => v.contacto.telefono_e164).filter(Boolean);
  const emails = validos.map(v => v.contacto.email).filter(Boolean).map(e => e.toLowerCase());
  let telsExist = new Set(), emailsExist = new Set();
  if (tels.length) {
    const r = await db.all('SELECT telefono_e164 FROM contactos WHERE telefono_e164 = ANY($1)', [tels]);
    telsExist = new Set(r.map(x => x.telefono_e164));
  }
  if (emails.length) {
    const r = await db.all('SELECT DISTINCT lower(email) AS email FROM contactos WHERE activo = true AND lower(email) = ANY($1)', [emails]);
    emailsExist = new Set(r.map(x => x.email));
  }
  let nuevos = 0, actualizar = 0;
  for (const v of validos) {
    const t = v.contacto.telefono_e164;
    const e = v.contacto.email ? v.contacto.email.toLowerCase() : null;
    if ((t && telsExist.has(t)) || (!t && e && emailsExist.has(e))) actualizar++;
    else nuevos++;
  }
  return { nuevos, actualizar };
}

// POST /api/contactos/importar/preview
router.post('/importar/preview', authorize(...PUEDE_IMPORTAR), uploadCSV.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
    const { rows } = parseCSV(req.file.buffer.toString('utf8'));
    const { validos, rechazos } = mapearContactos(rows);
    const { nuevos, actualizar } = await clasificar(validos);
    const conAdvertencia = validos.filter(v => v.advertencias.length > 0).length;
    res.json({
      resumen: {
        total_filas_validas: validos.length,
        nuevos, actualizar,
        con_advertencia: conAdvertencia,
        rechazos: rechazos.length,
      },
      muestra: validos.slice(0, 20).map(v => ({
        nombre: v.contacto.nombre, apellido: v.contacto.apellido || '',
        email: v.contacto.email || '', telefono: v.contacto.telefono_e164 || '',
        empresa: v.contacto.empresa_nombre || v.contacto.empresa_rut || '',
        advertencias: v.advertencias,
      })),
      rechazos: rechazos.slice(0, 200),
    });
  } catch (err) {
    console.error('[contactos/importar/preview]', err);
    res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
  }
});

// Tamaño de lote para los INSERT ... ON CONFLICT masivos.
const LOTE_IMPORTACION_CONTACTOS = 500;

// Resuelve (creando si hace falta) el id de empresa de cada contacto que
// referencia una por rut y/o nombre, con consultas masivas en vez de una por
// fila. Prioridad rut > nombre, igual que la versión fila a fila anterior.
async function resolverEmpresasEnBloque(client, validos) {
  const refs = validos.map(v => v.contacto).filter(c => c.empresa_rut || c.empresa_nombre);
  const rutsUnicos = [...new Set(refs.filter(c => c.empresa_rut).map(c => c.empresa_rut))];
  const nombresUnicos = [...new Set(refs.filter(c => !c.empresa_rut && c.empresa_nombre).map(c => c.empresa_nombre.toLowerCase()))];

  const empresaPorRut = new Map();
  if (rutsUnicos.length) {
    const r = await client.query('SELECT id, rut FROM empresas WHERE rut = ANY($1)', [rutsUnicos]);
    r.rows.forEach(row => empresaPorRut.set(row.rut, row.id));
  }
  const empresaPorNombre = new Map();
  if (nombresUnicos.length) {
    const r = await client.query('SELECT id, lower(razon_social) AS n FROM empresas WHERE activo=true AND lower(razon_social) = ANY($1)', [nombresUnicos]);
    r.rows.forEach(row => empresaPorNombre.set(row.n, row.id));
  }

  // Empresas que no existen todavía, dedupe por rut si tiene (si no, por nombre).
  const porCrear = new Map();
  for (const c of refs) {
    const clave = c.empresa_rut || c.empresa_nombre.toLowerCase();
    const yaExiste = c.empresa_rut ? empresaPorRut.has(c.empresa_rut) : empresaPorNombre.has(clave);
    if (yaExiste || porCrear.has(clave)) continue;
    porCrear.set(clave, { razon_social: c.empresa_nombre || c.empresa_rut, rut: c.empresa_rut || null });
  }

  const nuevas = [...porCrear.entries()];
  for (let i = 0; i < nuevas.length; i += LOTE_IMPORTACION_CONTACTOS) {
    const lote = nuevas.slice(i, i + LOTE_IMPORTACION_CONTACTOS);
    const params = [];
    const filas = lote.map(([, v], idx) => {
      const b = idx * 2;
      params.push(v.razon_social, v.rut);
      return `($${b + 1},$${b + 2})`;
    }).join(',');
    const r = await client.query(`INSERT INTO empresas (razon_social, rut) VALUES ${filas} RETURNING id, rut`, params);
    r.rows.forEach((row, idx) => {
      const [clave] = lote[idx];
      if (row.rut) empresaPorRut.set(row.rut, row.id);
      else empresaPorNombre.set(clave, row.id);
    });
  }

  const resolver = c => {
    if (!c.empresa_rut && !c.empresa_nombre) return null;
    if (c.empresa_rut) return empresaPorRut.get(c.empresa_rut) || null;
    return empresaPorNombre.get(c.empresa_nombre.toLowerCase()) || null;
  };
  return { resolver, empresasCreadas: nuevas.length };
}

// POST /api/contactos/importar/confirmar
router.post('/importar/confirmar', authorize(...PUEDE_IMPORTAR), uploadCSV.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });
  const { rows } = parseCSV(req.file.buffer.toString('utf8'));
  const { validos } = mapearContactos(rows);
  // Con teléfono (el caso normal, y es UNIQUE en la tabla): se resuelve en
  // lotes con INSERT ... ON CONFLICT. Sin teléfono (matcheo por email, con la
  // regla de "revisar" si el email ya existe en más de un contacto) se deja
  // fila a fila, igual que antes — son casos ambiguos y normalmente pocos.
  const conTelefono = validos.filter(v => v.contacto.telefono_e164);
  const sinTelefono = validos.filter(v => !v.contacto.telefono_e164);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { resolver: resolverEmpresa, empresasCreadas } = await resolverEmpresasEnBloque(client, validos);
    let insertados = 0, actualizados = 0;

    for (let i = 0; i < conTelefono.length; i += LOTE_IMPORTACION_CONTACTOS) {
      const lote = conTelefono.slice(i, i + LOTE_IMPORTACION_CONTACTOS);
      const params = [];
      const filas = lote.map(({ contacto: c }, idx) => {
        const b = idx * 8;
        params.push(c.nombre, c.apellido || null, c.email || null, c.telefono_e164, resolverEmpresa(c), c.rut_comprador || null, c.cargo || null, false);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},'importacion_csv',$${b + 8})`;
      }).join(',');
      const r = await client.query(
        `INSERT INTO contactos (nombre, apellido, email, telefono_e164, empresa_id, rut_comprador, cargo, origen, revisar_duplicado)
         VALUES ${filas}
         ON CONFLICT (telefono_e164) DO UPDATE SET
           apellido      = COALESCE(contactos.apellido, EXCLUDED.apellido),
           email         = COALESCE(contactos.email, EXCLUDED.email),
           rut_comprador = COALESCE(contactos.rut_comprador, EXCLUDED.rut_comprador),
           cargo         = COALESCE(contactos.cargo, EXCLUDED.cargo),
           empresa_id    = COALESCE(contactos.empresa_id, EXCLUDED.empresa_id)
         RETURNING (xmax = 0) AS es_nuevo`,
        params
      );
      for (const fila of r.rows) { if (fila.es_nuevo) insertados++; else actualizados++; }
    }

    for (const { contacto: c } of sinTelefono) {
      const empresaId = resolverEmpresa(c);
      let existente = null;
      if (c.email) {
        const matches = (await client.query('SELECT id FROM contactos WHERE lower(email) = lower($1) AND activo = true', [c.email])).rows;
        if (matches.length === 1) existente = matches[0];
      }

      if (existente) {
        await client.query(
          `UPDATE contactos SET apellido=COALESCE(apellido,$2), email=COALESCE(email,$3),
                  rut_comprador=COALESCE(rut_comprador,$4), cargo=COALESCE(cargo,$5),
                  empresa_id=COALESCE(empresa_id,$6) WHERE id=$1`,
          [existente.id, c.apellido || null, c.email || null, c.rut_comprador || null, c.cargo || null, empresaId]
        );
        actualizados++;
      } else {
        let revisar = false;
        if (c.email) {
          const n = (await client.query('SELECT count(*)::int AS n FROM contactos WHERE lower(email)=lower($1) AND activo=true', [c.email])).rows[0].n;
          revisar = n > 0;
        }
        await client.query(
          `INSERT INTO contactos (nombre, apellido, email, telefono_e164, empresa_id, rut_comprador, cargo, origen, revisar_duplicado)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'importacion_csv',$8)`,
          [c.nombre, c.apellido || null, c.email || null, null, empresaId, c.rut_comprador || null, c.cargo || null, revisar]
        );
        insertados++;
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Importación completada', insertados, actualizados, empresas_referenciadas: empresasCreadas });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[contactos/importar/confirmar]', err);
    res.status(500).json({ error: 'Error al importar: ' + err.message + (err.detail ? ' — ' + err.detail : '') });
  } finally {
    client.release();
  }
});

// POST /api/contactos/bulk-accion — acción en lote sobre contactos seleccionados
// body: { ids:[...], accion:'asignar_empresa'|'desactivar'|'marcar_revisado', empresa_id? }
router.post('/bulk-accion', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    const { ids, accion, empresa_id } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Sin contactos seleccionados' });

    if (accion === 'asignar_empresa') {
      if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' });
      const emp = await db.get('SELECT id FROM empresas WHERE id = $1', [empresa_id]);
      if (!emp) return res.status(400).json({ error: 'Empresa inexistente' });
      const r = await db.run('UPDATE contactos SET empresa_id = $1 WHERE id = ANY($2)', [empresa_id, ids]);
      return res.json({ message: 'Empresa asignada', afectados: r.rowCount });
    }
    if (accion === 'desactivar') {
      const r = await db.run('UPDATE contactos SET activo = false WHERE id = ANY($1)', [ids]);
      return res.json({ message: 'Contactos desactivados', afectados: r.rowCount });
    }
    if (accion === 'marcar_revisado') {
      const r = await db.run('UPDATE contactos SET revisar_duplicado = false WHERE id = ANY($1)', [ids]);
      return res.json({ message: 'Marcados como revisados', afectados: r.rowCount });
    }
    return res.status(400).json({ error: 'Acción no reconocida' });
  } catch (err) {
    console.error('[contactos/bulk-accion]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/contactos/:id
router.get('/:id', async (req, res) => {
  try {
    const contacto = await db.get(
      `SELECT c.*, e.razon_social AS empresa_nombre, u.nombre AS vendedor_nombre
       FROM contactos c
       LEFT JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN users u ON u.id = c.vendedor_id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });
    const negocios = await db.all(
      `SELECT n.id, n.titulo, n.monto_estimado, pe.nombre AS etapa_nombre, pe.tipo AS etapa_tipo
       FROM negocios n LEFT JOIN pipeline_etapas pe ON pe.id = n.etapa_id
       WHERE n.contacto_id = $1 ORDER BY n.created_at DESC`,
      [req.params.id]
    );
    const eventos = await db.all(
      `SELECT t.*, u.nombre AS usuario_nombre FROM timeline t
       LEFT JOIN users u ON u.id = t.usuario_id
       WHERE t.contacto_id = $1 ORDER BY t.created_at DESC LIMIT 200`,
      [req.params.id]
    );
    res.json({ ...contacto, negocios, timeline: eventos });
  } catch (err) {
    console.error('[contactos/GET /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/contactos
router.post('/', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    let { nombre, apellido, email, telefono, empresa_id, rut_comprador, cargo, origen, vendedor_id } = req.body;
    nombre = mayusculas(nombre); apellido = mayusculas(apellido);
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    if (rut_comprador && !validarRut(rut_comprador)) return res.status(400).json({ error: 'RUT inválido' });

    const telefono_e164 = normalizarTelefono(telefono);

    // Teléfono es UNIQUE: si ya existe, es el mismo contacto → 409 con el existente.
    if (telefono_e164) {
      const existe = await db.get(
        'SELECT id, nombre, apellido FROM contactos WHERE telefono_e164 = $1',
        [telefono_e164]
      );
      if (existe) return res.status(409).json({ error: 'Ya existe un contacto con ese teléfono', contacto_existente: existe });
    }

    // Duplicado por email o nombre+empresa: se permite crear, pero se marca para revisión.
    const candidatos = await buscarDuplicados({ email, telefono_e164, nombre, apellido, empresa_id });
    const revisar = candidatos.length > 0;

    // Un vendedor no elige a qué vendedor se asigna un contacto que crea —
    // queda asignado a sí mismo. Solo administrador/jefe comercial/call
    // center pueden asignarlo a otro vendedor.
    const vendedorIdFinal = req.user.rol === 'vendedor' ? req.user.id : (vendedor_id || null);

    const result = await db.run(
      `INSERT INTO contactos (nombre, apellido, email, telefono_e164, empresa_id, rut_comprador, cargo, origen, revisar_duplicado, vendedor_id, vendedor_asignado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [nombre, apellido || null, email || null, telefono_e164, empresa_id || null,
       rut_comprador || null, cargo || null, origen || 'manual', revisar, vendedorIdFinal,
       vendedorIdFinal ? new Date() : null]
    );
    res.status(201).json({ contacto: result.rows[0], duplicados_detectados: candidatos });
  } catch (err) {
    console.error('[contactos/POST /]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/contactos/:id
router.put('/:id', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    const { id } = req.params;
    let { nombre, apellido, email, telefono, empresa_id, rut_comprador, cargo, activo, revisar_duplicado, vendedor_id } = req.body;
    nombre = mayusculas(nombre); apellido = mayusculas(apellido);
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    if (rut_comprador && !validarRut(rut_comprador)) return res.status(400).json({ error: 'RUT inválido' });

    const contacto = await db.get('SELECT id, vendedor_id FROM contactos WHERE id = $1', [id]);
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });

    const telefono_e164 = normalizarTelefono(telefono);
    if (telefono_e164) {
      const existe = await db.get('SELECT id FROM contactos WHERE telefono_e164 = $1 AND id != $2', [telefono_e164, id]);
      if (existe) return res.status(409).json({ error: 'Otro contacto ya usa ese teléfono' });
    }

    // Un vendedor no puede reasignar el contacto a otro vendedor: al editar,
    // se ignora lo que haya mandado y se mantiene la asignación existente.
    const nuevoVendedorId = req.user.rol === 'vendedor' ? contacto.vendedor_id : (vendedor_id || null);
    const cambiaAsignacion = nuevoVendedorId && nuevoVendedorId != contacto.vendedor_id;

    await db.run(
      `UPDATE contactos SET nombre=$1, apellido=$2, email=$3, telefono_e164=$4, empresa_id=$5,
              rut_comprador=$6, cargo=$7, activo=$8, revisar_duplicado=$9, vendedor_id=$10,
              vendedor_asignado_en = CASE WHEN $12 THEN now() ELSE vendedor_asignado_en END
       WHERE id=$11`,
      [nombre, apellido || null, email || null, telefono_e164, empresa_id || null,
       rut_comprador || null, cargo || null, activo !== undefined ? activo : true,
       revisar_duplicado !== undefined ? revisar_duplicado : false, nuevoVendedorId, id, cambiaAsignacion]
    );
    res.json({ message: 'Contacto actualizado' });
  } catch (err) {
    console.error('[contactos/PUT /:id]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/contactos/:id/email — actualiza solo el email, sin tocar el resto
// de los datos del contacto. Pensado para completar el email al vuelo desde
// pantallas ajenas a la ficha (ej. al enviar una cotización a un contacto sin
// email), donde solo se cuenta con ese dato y no con el contacto completo —
// usar el PUT genérico ahí pisaría teléfono/empresa/cargo/etc. con null.
router.put('/:id/email', authorize(...PUEDE_EDITAR), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validarEmail(email)) return res.status(400).json({ error: 'Email inválido' });

    const contacto = await db.get('SELECT id FROM contactos WHERE id = $1', [req.params.id]);
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });

    await db.run('UPDATE contactos SET email = $1 WHERE id = $2', [email, req.params.id]);
    res.json({ message: 'Email actualizado' });
  } catch (err) {
    console.error('[contactos/PUT /:id/email]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/contactos/fusionar — {master_id, duplicado_ids:[...]}
// Completa datos faltantes del maestro con los de los duplicados y desactiva estos.
router.post('/fusionar', authorize('administrador', 'jefe_comercial', 'callcenter'), async (req, res) => {
  const { master_id, duplicado_ids } = req.body;
  if (!master_id || !Array.isArray(duplicado_ids) || duplicado_ids.length === 0) {
    return res.status(400).json({ error: 'master_id y duplicado_ids requeridos' });
  }
  if (duplicado_ids.includes(master_id)) {
    return res.status(400).json({ error: 'El maestro no puede estar en la lista de duplicados' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const master = (await client.query('SELECT * FROM contactos WHERE id = $1 FOR UPDATE', [master_id])).rows[0];
    if (!master) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Maestro no encontrado' }); }

    const dups = (await client.query(
      'SELECT * FROM contactos WHERE id = ANY($1) FOR UPDATE', [duplicado_ids]
    )).rows;

    // Completar campos faltantes del maestro con el primer duplicado que los tenga.
    const merged = { ...master };
    const campos = ['apellido', 'email', 'telefono_e164', 'empresa_id', 'rut_comprador', 'cargo'];
    for (const dup of dups) {
      for (const campo of campos) {
        if ((merged[campo] === null || merged[campo] === '') && dup[campo]) merged[campo] = dup[campo];
      }
    }

    // Liberar el teléfono (UNIQUE) de los duplicados antes de asignarlo al maestro.
    if (duplicado_ids.length) {
      await client.query('UPDATE contactos SET telefono_e164 = NULL WHERE id = ANY($1)', [duplicado_ids]);
    }

    await client.query(
      `UPDATE contactos SET apellido=$1, email=$2, telefono_e164=$3, empresa_id=$4,
              rut_comprador=$5, cargo=$6, revisar_duplicado=false WHERE id=$7`,
      [merged.apellido, merged.email, merged.telefono_e164, merged.empresa_id,
       merged.rut_comprador, merged.cargo, master_id]
    );

    // Desactivar los duplicados. (Cuando existan negocios/cotizaciones/conversaciones
    // se repuntarán aquí sus FKs hacia el maestro.)
    await client.query('UPDATE contactos SET activo = false WHERE id = ANY($1)', [duplicado_ids]);

    await client.query('COMMIT');
    res.json({ message: 'Contactos fusionados', master_id, fusionados: duplicado_ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[contactos/POST /fusionar]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

module.exports = router;
