// Almacenamiento de adjuntos y medios de WhatsApp en Cloudflare R2 (API
// compatible con S3). Sin credenciales configuradas, no falla: registra y no
// hace nada, igual que el resto de servicios externos (email, whatsapp).
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function configurado() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
}

function cliente() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function subir(key, buffer, contentType) {
  if (!configurado()) {
    console.log(`[r2] Sin credenciales configuradas; no se subió ${key}.`);
    return { subido: false, motivo: 'R2 no configurado' };
  }
  try {
    await cliente().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType,
    }));
    return { subido: true };
  } catch (e) {
    console.error('[r2] Error subiendo', key, ':', e.message);
    return { subido: false, motivo: e.message };
  }
}

// Descarga el objeto completo (para servirlo al frontend autenticado).
async function descargar(key) {
  if (!configurado()) return null;
  try {
    const resp = await cliente().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    const chunks = [];
    for await (const chunk of resp.Body) chunks.push(chunk);
    return { buffer: Buffer.concat(chunks), contentType: resp.ContentType };
  } catch (e) {
    console.error('[r2] Error descargando', key, ':', e.message);
    return null;
  }
}

// URL firmada de corta duración, solo para que Meta descargue el adjunto al
// enviarlo — el bucket sigue siendo privado, no hace falta exponerlo público.
async function urlFirmada(key, expiraSegundos = 600) {
  if (!configurado()) return null;
  return getSignedUrl(cliente(), new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }), { expiresIn: expiraSegundos });
}

module.exports = { configurado, subir, descargar, urlFirmada };
