const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// Todo el módulo de mitigación queda restringido a administradores y al
// equipo de mitigación (el nuevo rol), tal como lo pide el punto 9 del
// alcance ("acceso restringido a este apartado").
router.use(authenticate, authorize('administrador', 'equipo_mitigacion'));

// GET /api/mitigacion?estado=pendiente|atendida (opcional)
router.get('/', async (req, res) => {
  const { estado } = req.query;
  try {
    let query = `
      SELECT m.*, s.n_serie AS numero_serie, s.ubicacion,
             u.nombre AS atendido_por_nombre, u.apellido AS atendido_por_apellido
      FROM sugerencias_mitigacion m
      JOIN sensores s ON s.id = m.sensor_id
      LEFT JOIN usuarios u ON u.id = m.atendido_por
    `;
    const params = [];
    if (estado === 'pendiente' || estado === 'atendida') {
      query += ' WHERE m.estado = ?';
      params.push(estado);
    }
    query += ' ORDER BY m.creado_en DESC LIMIT 200';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/mitigacion/:id/atendida - marca una sugerencia como atendida por
// el usuario autenticado (administrador o equipo de mitigación).
router.put('/:id/atendida', async (req, res) => {
  try {
    const [resultado] = await db.query(
      `UPDATE sugerencias_mitigacion SET estado = 'atendida', atendido_por = ?, atendido_en = NOW() WHERE id = ?`,
      [req.user.id, req.params.id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Sugerencia no encontrada' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
