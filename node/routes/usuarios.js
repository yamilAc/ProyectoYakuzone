const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// Toda la gestión de usuarios queda restringida a administradores.
router.use(authenticate, authorize('administrador'));

// GET /api/usuarios
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, apellido, ci, email, rol, creado_en FROM usuarios ORDER BY id DESC'
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
  try {
    const [existentes] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existentes.length > 0) {
      return res.status(400).json({ error: 'Ya existe un usuario con ese correo' });
    }
    const hash = await bcrypt.hash(contrasenia, 10);
    const [result] = await db.query(
      'INSERT INTO usuarios (nombre, apellido, ci, email, contrasenia_hash, rol) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, apellido, ci, email, hash, rol || 'empleado']
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res) => {
  const { nombre, apellido, ci, email, contrasenia, rol } = req.body;
  try {
    if (contrasenia) {
      const hash = await bcrypt.hash(contrasenia, 10);
      await db.query(
        'UPDATE usuarios SET nombre=?, apellido=?, ci=?, email=?, contrasenia_hash=?, rol=? WHERE id=?',
        [nombre, apellido, ci, email, hash, rol, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE usuarios SET nombre=?, apellido=?, ci=?, email=?, rol=? WHERE id=?',
        [nombre, apellido, ci, email, rol, req.params.id]
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
