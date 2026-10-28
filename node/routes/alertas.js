const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

// GET /api/alertas - alertas más recientes primero.
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, s.n_serie AS numero_serie
       FROM alertas a
       JOIN sensores s ON s.id = a.sensor_id
       ORDER BY a.fecha_hora DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/alertas/:id/leida - marcar una alerta como leída.
router.put('/:id/leida', authenticate, async (req, res) => {
  try {
    await db.query('UPDATE alertas SET leida = 1 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
