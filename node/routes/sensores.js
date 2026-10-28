const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/sensores - lista de sensores (requiere sesión iniciada; Zonas,
// Dashboard y Datos Históricos la usan para el mapa y las tablas).
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM sensores ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sensores - registrar un nuevo sensor (solo administradores).
router.post('/', authenticate, authorize('administrador'), async (req, res) => {
  const { n_serie, ubicacion, descripcion, latitud, longitud } = req.body;
  if (!n_serie) {
    return res.status(400).json({ error: 'El número de serie es requerido' });
  }
  try {
    const [existentes] = await db.query('SELECT id FROM sensores WHERE n_serie = ?', [n_serie]);
    if (existentes.length > 0) {
      return res.status(400).json({ error: 'El número de serie ya existe' });
    }
    const [result] = await db.query(
      'INSERT INTO sensores (n_serie, ubicacion, descripcion, latitud, longitud) VALUES (?, ?, ?, ?, ?)',
      [n_serie, ubicacion || null, descripcion || null, latitud || null, longitud || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sensores/:id - editar un sensor existente (solo administradores).
router.put('/:id', authenticate, authorize('administrador'), async (req, res) => {
  const { n_serie, ubicacion, descripcion, latitud, longitud } = req.body;
  if (!n_serie) {
    return res.status(400).json({ error: 'El número de serie es requerido' });
  }
  try {
    const [existentes] = await db.query(
      'SELECT id FROM sensores WHERE n_serie = ? AND id != ?',
      [n_serie, req.params.id]
    );
    if (existentes.length > 0) {
      return res.status(400).json({ error: 'Ya existe otro sensor con ese número de serie' });
    }
    const [resultado] = await db.query(
      'UPDATE sensores SET n_serie = ?, ubicacion = ?, descripcion = ?, latitud = ?, longitud = ? WHERE id = ?',
      [n_serie, ubicacion || null, descripcion || null, latitud || null, longitud || null, req.params.id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Sensor no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sensores/:id - eliminar un sensor (solo administradores).
// ADVERTENCIA: la tabla `sensores` tiene ON DELETE CASCADE hacia `lecturas`
// y `alertas`, así que eliminar un sensor borra también todo su historial
// de lecturas y notificaciones. El frontend debe confirmar esto claramente
// antes de llamar a esta ruta.
router.delete('/:id', authenticate, authorize('administrador'), async (req, res) => {
  try {
    const [resultado] = await db.query('DELETE FROM sensores WHERE id = ?', [req.params.id]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Sensor no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
