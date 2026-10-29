// Recepción de las fotos de evidencia de la mitigación (multipart/form-data,
// con Multer). Las fotos se guardan en node/uploads/mitigaciones/ (excluida
// de git) y en la base solo queda el nombre del archivo.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const CARPETA_FOTOS = path.join(__dirname, '..', 'uploads', 'mitigaciones');
fs.mkdirSync(CARPETA_FOTOS, { recursive: true });

// Las 3 fotos que pide cada mitigación: el equipo en el lugar, la casa y el
// trabajo realizado. Son también los nombres de los campos del formulario.
const TIPOS_FOTO = ['equipo', 'casa', 'trabajo'];
const EXTENSIONES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const TAMANO_MAXIMO_MB = 5;

const subir = multer({
  storage: multer.diskStorage({
    destination: CARPETA_FOTOS,
    // Nombre aleatorio: nunca se usa el nombre de archivo que manda el navegador.
    filename: (req, file, cb) =>
      cb(null, `alerta${Number(req.params.id)}_${file.fieldname}_${crypto.randomBytes(8).toString('hex')}${EXTENSIONES[file.mimetype]}`),
  }),
  limits: { fileSize: TAMANO_MAXIMO_MB * 1024 * 1024, files: TIPOS_FOTO.length, fields: 5 },
  fileFilter: (req, file, cb) => {
    if (!EXTENSIONES[file.mimetype]) {
      return cb(new Error('Solo se aceptan fotos JPG, PNG o WebP'));
    }
    cb(null, true);
  },
}).fields(TIPOS_FOTO.map((name) => ({ name, maxCount: 1 })));

// Borra del disco los archivos recibidos (cuando la petición termina siendo
// rechazada, para no dejar fotos huérfanas).
function borrarArchivos(files) {
  Object.values(files || {})
    .flat()
    .forEach((f) => fs.unlink(f.path, () => {}));
}

// El navegador declara el tipo de archivo, pero no se confía en eso: se
// revisa que el contenido empiece como una imagen JPG, PNG o WebP real.
function esImagenValida(ruta) {
  const cabecera = Buffer.alloc(12);
  const fd = fs.openSync(ruta, 'r');
  try {
    fs.readSync(fd, cabecera, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  const jpg = cabecera[0] === 0xff && cabecera[1] === 0xd8 && cabecera[2] === 0xff;
  const png = cabecera.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const webp = cabecera.toString('ascii', 0, 4) === 'RIFF' && cabecera.toString('ascii', 8, 12) === 'WEBP';
  return jpg || png || webp;
}

// Middleware: recibe las fotos y responde 400 con un mensaje claro si algo
// no cumple (tamaño, tipo, campos de más).
function recibirFotos(req, res, next) {
  subir(req, res, (err) => {
    if (!err) return next();
    borrarArchivos(req.files);
    let mensaje = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') mensaje = `Cada foto puede pesar hasta ${TAMANO_MAXIMO_MB} MB`;
    else if (err instanceof multer.MulterError) mensaje = 'Envía solo las 3 fotos: equipo, casa y trabajo realizado';
    res.status(400).json({ error: mensaje });
  });
}

module.exports = { CARPETA_FOTOS, TIPOS_FOTO, recibirFotos, borrarArchivos, esImagenValida };
