const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// POST /api/login
router.post('/login', async (req, res) => {
  const { email, contrasenia } = req.body;
  if (!email || !contrasenia) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = rows[0];
    const valido = await bcrypt.compare(contrasenia, usuario.contrasenia_hash);
    if (!valido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Error en /login:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

module.exports = router;
