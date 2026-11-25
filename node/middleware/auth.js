const jwt = require('jsonwebtoken');
const db = require('../db');

// Verifica el token de la sesión. Además de la firma y la vigencia, se
// consulta la base en cada petición: si el usuario fue eliminado, la sesión
// deja de valer, y si le cambiaron el rol se usa el rol actual (y no el que
// tenía al iniciar sesión, guardado en el token por hasta 8 horas).
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  let datos;
  try {
    // El algoritmo se fija para que no se acepten tokens firmados de otra forma.
    datos = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  if (!Number.isInteger(datos.id)) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  try {
    const [usuarios] = await db.query('SELECT id, rol, nombre FROM usuarios WHERE id = ?', [datos.id]);
    if (usuarios.length === 0) {
      return res.status(401).json({ error: 'La cuenta ya no existe; inicia sesión de nuevo' });
    }
    req.user = { id: usuarios[0].id, rol: usuarios[0].rol, nombre: usuarios[0].nombre };
    next();
  } catch (err) {
    console.error('[Auth] Error al verificar la sesión:', err.message);
    res.status(500).json({ error: 'Ocurrió un error interno; intenta nuevamente' });
  }
}

function authorize(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
