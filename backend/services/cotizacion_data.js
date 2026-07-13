const { db } = require('../db');

// Trae la cotización completa (cabecera, cliente, vendedor, ítems, emisor) por id o token.
async function fetchCompleta({ id, token }) {
  const where = id ? 'c.id = $1' : 'c.token_publico = $1';
  const cot = await db.get(
    `SELECT c.*, n.titulo AS negocio_titulo, n.vendedor_id,
            ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido, ct.email AS contacto_email,
            ct.cargo AS contacto_cargo,
            e.razon_social AS empresa_nombre, e.rut AS empresa_rut, e.direccion AS empresa_direccion,
            e.comuna AS empresa_comuna, e.giro AS empresa_giro,
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
    `SELECT ci.*, p.nombre AS producto_nombre, p.sku, p.url_imagen, p.ficha_tecnica_url,
            p.marca, p.categoria
     FROM cotizacion_items ci LEFT JOIN productos p ON p.id = ci.producto_id
     WHERE ci.cotizacion_id = $1 ORDER BY ci.id`, [cot.id]);
  const emisor = await db.get('SELECT * FROM config_empresa WHERE id = 1') || {};
  return {
    cot,
    items,
    cliente: {
      contacto_nombre: cot.contacto_nombre, contacto_apellido: cot.contacto_apellido,
      contacto_email: cot.contacto_email, contacto_cargo: cot.contacto_cargo,
      empresa_nombre: cot.empresa_nombre, empresa_rut: cot.empresa_rut,
      empresa_direccion: cot.empresa_direccion, empresa_comuna: cot.empresa_comuna, empresa_giro: cot.empresa_giro,
    },
    vendedor: { nombre: cot.vendedor_nombre, email: cot.vendedor_email },
    emisor,
  };
}

// Dominio público de imágenes: si la URL es de SharePoint (interna) no sirve para el cliente.
function esImagenPublica(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url) && !/sharepoint\.com/i.test(url);
}

module.exports = { fetchCompleta, esImagenPublica };
