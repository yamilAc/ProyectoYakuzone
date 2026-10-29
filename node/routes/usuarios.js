const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { TELEFONO_VALIDO, limpiarTexto } = require('../utils/validaciones');

// Toda la gestión de usuarios queda restringida a administradores.
router.use(authenticate, authorize('administrador'));

// El celular es obligatorio para los jefes de equipo de mitigación (reciben
// por WhatsApp las alertas asignadas a su equipo) y opcional para el resto.
// Devuelve el teléfono limpio, o { error }.
function leerTelefono(telefono, rol) {
  const valor = limpiarTexto(telefono);
  if (!valor) {
    return rol === 'equipo_mitigacion' ? { error: 'El celular es obligatorio para los jefes de equipo de mitigación (avisos por WhatsApp)' } : { valor: null };
  }
  return TELEFONO_VALIDO.test(valor) ? { valor } : { error: 'El número de celular no es válido' };
}

// GET /api/usuarios
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, apellido, ci, telefono, email, rol, creado_en FROM usuarios ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/usuarios
router.post('/', async (req, res) => {
  const { nombre, apellido, ci, email, contrasenia, rol } = req.body;
  if (!nombre || !apellido || !ci || !email || !contrasenia) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  const telefono = leerTelefono(req.body.telefono, rol);
  if (telefono.error) {
    return res.status(400).json({ error: telefono.error });
  }
  try {
    const [existentes] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existentes.length > 0) {
      return res.status(400).json({ error: 'Ya existe un usuario con ese correo' });
    }
    const hash = await bcrypt.hash(contrasenia, 10);
    const [result] = await db.query(
      'INSERT INTO usuarios (nombre, apellido, ci, telefono, email, contrasenia_hash, rol) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nombre, apellido, ci, telefono.valor, email, hash, rol || 'empleado']
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res) => {
  const { nombre, apellido, ci, email, contrasenia, rol } = req.body;
  const telefono = leerTelefono(req.body.telefono, rol);
  if (telefono.error) {
    return res.status(400).json({ error: telefono.error });
  }
  try {
    if (contrasenia) {
      const hash = await bcrypt.hash(contrasenia, 10);
      await db.query(
        'UPDATE usuarios SET nombre=?, apellido=?, ci=?, telefono=?, email=?, contrasenia_hash=?, rol=? WHERE id=?',
        [nombre, apellido, ci, telefono.valor, email, hash, rol, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE usuarios SET nombre=?, apellido=?, ci=?, telefono=?, email=?, rol=? WHERE id=?',
        [nombre, apellido, ci, telefono.valor, email, rol, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/usuarios/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
