const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { registrarLectura } = require('../services/lecturasService');
const { UMBRALES } = require('../utils/thresholds');

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PUNTOS_SERIE = 300;

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
       ) ultimas ON ultimas.sensor_id = l.sensor_id AND ultimas.max_fecha = l.fecha_hora
       ORDER BY l.id DESC`
    );
    // Si un sensor tiene varias lecturas con la misma fecha y hora, se
    // devuelve solo la última registrada (una fila por sensor).
    const vistos = new Set();
    res.json(rows.filter((r) => !vistos.has(r.sensor_id) && vistos.add(r.sensor_id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lecturas/:sensorId/serie?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Serie de tiempo de un sensor para los gráficos de Datos Históricos, más sus
// estadísticas (mínimo, promedio, máximo y lecturas fuera de rango) calculadas
// sobre todas las lecturas. Si el periodo tiene más de 300 lecturas, se
// agrupan de a N lecturas consecutivas (hasta 300 puntos) y cada punto es el
// promedio de su grupo, para que el gráfico se pueda leer. Se agrupa por
// cantidad y no por tiempo porque las lecturas pueden llegar en ráfagas
// (horas con datos y días sin ellos).
router.get('/:sensorId/serie', authenticate, async (req, res) => {
  const { desde, hasta } = req.query;
  if ((desde && !FECHA_VALIDA.test(desde)) || (hasta && !FECHA_VALIDA.test(hasta))) {
    return res.status(400).json({ error: 'Las fechas deben tener el formato AAAA-MM-DD' });
  }
  const condiciones = ['sensor_id = ?'];
  const params = [req.params.sensorId];
  if (desde) {
    condiciones.push('fecha_hora >= ?');
    params.push(`${desde} 00:00:00`);
  }
  if (hasta) {
    condiciones.push('fecha_hora <= ?');
    params.push(`${hasta} 23:59:59`);
  }
  const where = condiciones.join(' AND ');
  const { ph, turbidez, conductividad } = UMBRALES;

  try {
    const [[e]] = await db.query(
      `SELECT COUNT(*) AS total, MIN(fecha_hora) AS inicio, MAX(fecha_hora) AS fin,
              MIN(valor_temperatura) AS temp_min, AVG(valor_temperatura) AS temp_prom, MAX(valor_temperatura) AS temp_max,
              MIN(valor_ph) AS ph_min, AVG(valor_ph) AS ph_prom, MAX(valor_ph) AS ph_max,
              SUM(valor_ph < ? OR valor_ph > ?) AS ph_fuera,
              MIN(valor_turbidez) AS turb_min, AVG(valor_turbidez) AS turb_prom, MAX(valor_turbidez) AS turb_max,
              SUM(valor_turbidez > ?) AS turb_fuera,
              MIN(valor_conductividad) AS cond_min, AVG(valor_conductividad) AS cond_prom, MAX(valor_conductividad) AS cond_max,
              SUM(valor_conductividad > ?) AS cond_fuera
       FROM lecturas WHERE ${where}`,
      [ph.min, ph.max, turbidez.max, conductividad.max, ...params]
    );
    const estadistica = (prefijo, fuera) => ({
      min: e[`${prefijo}_min`] === null ? null : Number(e[`${prefijo}_min`]),
      prom: e[`${prefijo}_prom`] === null ? null : Number(e[`${prefijo}_prom`]),
      max: e[`${prefijo}_max`] === null ? null : Number(e[`${prefijo}_max`]),
      fuera: fuera === undefined ? null : Number(e[fuera] || 0),
    });
    const respuesta = {
      total: Number(e.total),
      inicio: e.inicio,
      fin: e.fin,
      agrupado: false,
      estadisticas: {
        valor_temperatura: estadistica('temp'),
        valor_ph: estadistica('ph', 'ph_fuera'),
        valor_turbidez: estadistica('turb', 'turb_fuera'),
        valor_conductividad: estadistica('cond', 'cond_fuera'),
      },
      puntos: [],
    };

    if (respuesta.total > 0 && respuesta.total <= MAX_PUNTOS_SERIE) {
      [respuesta.puntos] = await db.query(
        `SELECT fecha_hora, valor_temperatura, valor_ph, valor_turbidez, valor_conductividad
         FROM lecturas WHERE ${where} ORDER BY fecha_hora ASC`,
        params
      );
    } else if (respuesta.total > MAX_PUNTOS_SERIE) {
      // MySQL 5.6 no tiene funciones de ventana: el número de fila se lleva con
      // una variable, en el orden del índice (sensor_id, fecha_hora).
      const porGrupo = Math.ceil(respuesta.total / MAX_PUNTOS_SERIE);
      [respuesta.puntos] = await db.query(
        `SELECT MIN(t.fecha_hora) AS fecha_hora,
                AVG(t.valor_temperatura) AS valor_temperatura, AVG(t.valor_ph) AS valor_ph,
                AVG(t.valor_turbidez) AS valor_turbidez, AVG(t.valor_conductividad) AS valor_conductividad
         FROM (
           SELECT fecha_hora, valor_temperatura, valor_ph, valor_turbidez, valor_conductividad, (@fila := @fila + 1) AS fila
           FROM lecturas, (SELECT @fila := -1) inicio
           WHERE ${where}
           ORDER BY fecha_hora
         ) t
         GROUP BY FLOOR(t.fila / ?)
         ORDER BY fecha_hora`,
        [...params, porGrupo]
      );
      respuesta.agrupado = true;
    }
    res.json(respuesta);
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
