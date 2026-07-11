const multer = require('multer');

// Subida en memoria para archivos CSV (los parseamos directo del buffer).
const uploadCSV = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.csv$/i.test(file.originalname) || file.mimetype.includes('csv') || file.mimetype === 'text/plain';
    if (!ok) return cb(new Error('Solo se aceptan archivos CSV'));
    cb(null, true);
  },
});

module.exports = { uploadCSV };
