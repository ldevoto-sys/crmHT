const { db } = require('../db');

// Trae la cotización completa (cabecera, cliente, vendedor, ítems) por id o token.
async function fetchCompleta({ id, token }) {
  const where = id ? 'c.id = $1' : 'c.token_publico = $1';
  const cot = await db.get(
    `SELECT c.*, n.titulo AS negocio_titulo, n.vendedor_id,
            ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido, ct.email AS contacto_email,
            e.razon_social AS empresa_nombre, e.rut AS empresa_rut,
            u.nombre AS vendedor_nombre, u.email AS vendedor_email
     FROM cotizaciones c
     JOIN negocios n ON n.id = c.negocio_id
     JOIN contactos ct ON ct.id = n.contacto_id
     LEFT JOIN empresas e ON e.id = n.empresa_id
     LEFT JOIN users u ON u.id = n.vendedor_id
     WHERE ${where}`,
    [id || token]
  );
  if (!cot) return null;
  const items = await db.all(
    `SELECT ci.*, p.nombre AS producto_nombre, p.sku
     FROM cotizacion_items ci LEFT JOIN productos p ON p.id = ci.producto_id
     WHERE ci.cotizacion_id = $1 ORDER BY ci.id`, [cot.id]);
  return {
    cot,
    items,
    cliente: {
      contacto_nombre: cot.contacto_nombre, contacto_apellido: cot.contacto_apellido,
      contacto_email: cot.contacto_email, empresa_nombre: cot.empresa_nombre, empresa_rut: cot.empresa_rut,
    },
    vendedor: { nombre: cot.vendedor_nombre, email: cot.vendedor_email },
  };
}

module.exports = { fetchCompleta };
