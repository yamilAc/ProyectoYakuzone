const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { registrarLectura } = require('../services/lecturasService');

// GET /api/lecturas?sensor_id=N&limite=100 - últimas lecturas registradas
// (de todos los sensores, o solo de uno con sensor_id), usada por las vistas
// de monitoreo en tiempo real. limite: entre 1 y 500, 100 por defecto.
router.get('/', authenticate, async (req, res) => {
  const sensorId = Number(req.query.sensor_id) || null;
  const limite = Math.min(500, Math.max(1, parseInt(req.query.limite, 10) || 100));
  try {
    const [rows] = await db.query(
      `SELECT l.*, s.n_serie AS numero_serie
       FROM lecturas l
       JOIN sensores s ON s.id = l.sensor_id
       ${sensorId ? 'WHERE l.sensor_id = ?' : ''}
       ORDER BY l.fecha_hora DESC
       LIMIT ?`,
      sensorId ? [sensorId, limite] : [limite]
    );
    res.json(rows.reverse()); // orden ascendente, para graficar en el tiempo
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lecturas/ultimas - la lectura más reciente de CADA sensor.
// Se usa para colorear el mapa (Zonas / Dashboard) según el estado actual de
// cada nodo, sin depender de que entre en el LIMIT 100 de arriba cuando ya
// hay varios sensores publicando al mismo tiempo.
// OJO: esta ruta debe declararse antes de "/:sensorId" para que Express no
// interprete "ultimas" como un id de sensor.
router.get('/ultimas', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT l.*, s.n_serie AS numero_serie
       FROM lecturas l
       JOIN sensores s ON s.id = l.sensor_id
       INNER JOIN (
         SELECT sensor_id, MAX(fecha_hora) AS max_fecha
         FROM lecturas
         GROUP BY sensor_id
       ) ultimas ON ultimas.sensor_id = l.sensor_id AND ultimas.max_fecha = l.fecha_hora`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lecturas/:sensorId?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
// Histórico de un sensor específico dentro de un rango de fechas.
router.get('/:sensorId', authenticate, async (req, res) => {
  const { sensorId } = req.params;
  const { fechaInicio, fechaFin } = req.query;
  try {
    let query = 'SELECT * FROM lecturas WHERE sensor_id = ?';
    const params = [sensorId];
    if (fechaInicio) {
      query += ' AND fecha_hora >= ?';
      params.push(`${fechaInicio} 00:00:00`);
    }
    if (fechaFin) {
      query += ' AND fecha_hora <= ?';
      params.push(`${fechaFin} 23:59:59`);
    }
    query += ' ORDER BY fecha_hora ASC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lecturas - inserción manual (fallback de pruebas sin MQTT).
// El flujo normal de los sensores llega por el broker MQTT (ver mqtt/subscriber.js).
router.post('/', authenticate, async (req, res) => {
  const { sensor_id, valor_temperatura, valor_turbidez, valor_ph, valor_conductividad, fecha_hora } = req.body;
  if (!sensor_id) {
    return res.status(400).json({ error: 'sensor_id es requerido' });
  }
  try {
    const { lecturaId, alertas } = await registrarLectura({
      sensorId: sensor_id,
      temperatura: valor_temperatura,
      turbidez: valor_turbidez,
      ph: valor_ph,
      conductividad: valor_conductividad,
      fechaHora: fecha_hora,
    });
    res.status(201).json({ id: lecturaId, alertasGeneradas: alertas.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
