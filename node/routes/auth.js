const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { EMAIL_VALIDO, LARGO } = require('../utils/validaciones');

// ------------------------------------------------ límite de intentos
// Contra la fuerza bruta: después de 5 intentos fallidos para una misma
// cuenta desde un mismo equipo, o de 20 desde un mismo equipo para cualquier
// cuenta, se bloquea el inicio de sesión durante 15 minutos. Se guarda en
// memoria (se reinicia con el servidor).
const MAX_POR_CUENTA = 5;
const MAX_POR_EQUIPO = 20;
const VENTANA_MS = 15 * 60 * 1000;
const fallos = new Map(); // clave -> { cantidad, desde }

function registro(clave) {
  const r = fallos.get(clave);
  if (r && Date.now() - r.desde > VENTANA_MS) {
    fallos.delete(clave);
    return null;
  }
  return r || null;
}
function minutosDeBloqueo(clave, maximo) {
  const r = registro(clave);
  if (!r || r.cantidad < maximo) return 0;
  return Math.ceil((VENTANA_MS - (Date.now() - r.desde)) / 60000);
}
function sumarFallo(clave) {
  const r = registro(clave);
  if (r) r.cantidad += 1;
  else fallos.set(clave, { cantidad: 1, desde: Date.now() });
}
// Limpieza periódica de los registros vencidos.
setInterval(() => [...fallos.keys()].forEach(registro), VENTANA_MS).unref();

// Si el correo no existe, igual se compara la contraseña contra un hash de
// relleno, para que la respuesta tarde lo mismo y no se pueda averiguar por
// el tiempo qué correos están registrados.
const HASH_DE_RELLENO = bcrypt.hashSync('cuenta-inexistente', 10);

// POST /api/login
router.post('/login', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const contrasenia = typeof req.body.contrasenia === 'string' ? req.body.contrasenia : '';
  if (!email || !contrasenia) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos' });
  }

  const claveEquipo = `ip|${req.ip}`;
  const claveCuenta = `cuenta|${req.ip}|${email}`;
  const bloqueo = Math.max(minutosDeBloqueo(claveCuenta, MAX_POR_CUENTA), minutosDeBloqueo(claveEquipo, MAX_POR_EQUIPO));
  if (bloqueo > 0) {
    return res.status(429).json({ error: `Demasiados intentos fallidos. Espera ${bloqueo} minuto(s) e intenta de nuevo.` });
  }
  const rechazar = () => {
    sumarFallo(claveCuenta);
    sumarFallo(claveEquipo);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  };

  // Un correo con formato inválido no puede estar registrado: se responde
  // igual que a unas credenciales incorrectas, sin consultar la base.
  if (!EMAIL_VALIDO.test(email) || email.length > LARGO.email || contrasenia.length > 200) {
    return rechazar();
  }

  try {
    const [rows] = await db.query('SELECT id, rol, nombre, contrasenia_hash FROM usuarios WHERE email = ?', [email]);
    const usuario = rows[0];
    const valido = await bcrypt.compare(contrasenia, usuario ? usuario.contrasenia_hash : HASH_DE_RELLENO);
    if (!usuario || !valido) {
      return rechazar();
    }
    fallos.delete(claveCuenta);

    const token = jwt.sign({ id: usuario.id, rol: usuario.rol, nombre: usuario.nombre }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '8h',
    });
    res.json({ token });
  } catch (err) {
    console.error('[Login] Error al iniciar sesión:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

module.exports = router;
