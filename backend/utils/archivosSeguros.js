// Validación de tipo de archivo para adjuntos subidos por usuarios (Postventa,
// Servicio Técnico, Despacho). El navegador declara el mimetype al subir, así
// que no es confiable por sí solo — solo se acepta un tipo que además calce
// con la extensión declarada. Todo lo que no sea imagen/video/audio/PDF se
// sirve forzando la descarga, para que un HTML o SVG subido no se ejecute en
// el origen del CRM cuando alguien lo abre (ver auditoría 23-09-2026, M-A1).

const MIME_A_EXTENSIONES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/3gpp': ['.3gp'],
  'audio/mpeg': ['.mp3'],
  'audio/ogg': ['.ogg'],
  'audio/mp4': ['.m4a'],
  'application/pdf': ['.pdf'],
};

// Se sirven "inline" (el navegador las muestra directo) solo imagen/video/audio/PDF.
const TIPOS_INLINE = new Set(Object.keys(MIME_A_EXTENSIONES));

function mimeYExtensionValidos(mimetype, nombreOriginal) {
  const extensiones = MIME_A_EXTENSIONES[mimetype];
  if (!extensiones) return false;
  const ext = (nombreOriginal.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  return extensiones.includes(ext);
}

// Multer fileFilter: rechaza el archivo si el tipo no está en la lista blanca
// o no calza con su extensión (ej. informe.html con Content-Type falseado).
function filtroTipoPermitido(req, file, cb) {
  if (!mimeYExtensionValidos(file.mimetype, file.originalname)) {
    return cb(new Error('Tipo de archivo no permitido. Se aceptan imágenes, video, audio y PDF.'));
  }
  cb(null, true);
}

// Fija los encabezados de respuesta al servir un adjunto ya subido. Si el
// tipo guardado no es de la lista blanca (adjuntos subidos antes de este
// cambio), se fuerza descarga igual, por si el mimetype guardado no es de
// fiar.
function headersDescargaSegura(res, mime, nombreArchivo) {
  const seguro = TIPOS_INLINE.has(mime);
  res.setHeader('Content-Type', seguro ? mime : 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const disposicion = seguro ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposicion}; filename="${(nombreArchivo || 'adjunto').replace(/"/g, '')}"`);
}

module.exports = { filtroTipoPermitido, headersDescargaSegura, mimeYExtensionValidos };
