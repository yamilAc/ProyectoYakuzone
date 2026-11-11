const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// Alertas preventivas generadas por los modelos de aprendizaje automático
// (lecturas anómalas y pronósticos fuera de la NB 512-04). Son informativas:
// no pasan por el flujo de equipos de mitigación. Administradores y empleados.
router.use(authenticate, authorize('administrador', 'empleado'));

// GET /api/alertas-preventivas?vista=0|1&origen=anomalia|pronostico (opcionales)
router.get('/', async (req, res) => {
  const condiciones = [];
  const params = [];
  if (req.query.vista === '0' || req.query.vista === '1') {
    condiciones.push('p.vista = ?');
    params.push(Number(req.query.vista));
  }
  if (['anomalia', 'pronostico'].includes(req.query.origen)) {
    condiciones.push('p.origen = ?');
    params.push(req.query.origen);
  }
  try {
    const [rows] = await db.query(
      `SELECT p.*, s.n_serie AS numero_serie, s.ubicacion, s.propietario_nombre
       FROM alertas_preventivas p
       JOIN sensores s ON s.id = p.sensor_id
       ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
       ORDER BY p.ultima_deteccion DESC
       LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alertas-preventivas/resumen - cuántas hay sin ver.
router.get('/resumen', async (req, res) => {
  try {
    const [[r]] = await db.query('SELECT COUNT(*) AS total, SUM(vista = 0) AS sin_ver FROM alertas_preventivas');
    res.json({ total: Number(r.total), sin_ver: Number(r.sin_ver || 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/alertas-preventivas/vistas - marcar todas como vistas.
router.put('/vistas', async (req, res) => {
  try {
    await db.query('UPDATE alertas_preventivas SET vista = 1 WHERE vista = 0');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/alertas-preventivas/:id/vista - marcar una como vista.
router.put('/:id/vista', async (req, res) => {
  try {
    const [resultado] = await db.query('UPDATE alertas_preventivas SET vista = 1 WHERE id = ?', [req.params.id]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Alerta preventiva no encontrada' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
