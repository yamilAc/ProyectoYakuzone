const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { cliente, servicioDisponible } = require('../utils/ml');
const { estado } = require('../services/analisisService');

// Resultados de los modelos de aprendizaje automático (página "Análisis"):
// clasificación de cada lectura, anomalías, pronósticos y métricas de
// desempeño de los modelos. Administradores y empleados.
router.use(authenticate, authorize('administrador', 'empleado'));

// GET /api/analisis/estado - si el servicio de Python está levantado, qué
// modelos tiene cargados y cuándo corrieron los ciclos por última vez.
router.get('/estado', async (req, res) => {
  res.json({ servicio: await servicioDisponible(), ciclos: estado });
});

// GET /api/analisis/resumen - por sensor: última clasificación, anomalías de
// las últimas 24 h y si su último pronóstico sale de la NB 512-04.
router.get('/resumen', async (req, res) => {
  try {
    const [sensores] = await db.query('SELECT id, n_serie, ubicacion FROM sensores ORDER BY n_serie');
    const [ultimos] = await db.query(
      `SELECT a.* FROM analisis_lecturas a
       JOIN (SELECT sensor_id, MAX(lectura_id) AS ultimo FROM analisis_lecturas GROUP BY sensor_id) u
         ON u.ultimo = a.lectura_id`
    );
    const [anomalias] = await db.query(
      `SELECT sensor_id, COUNT(*) AS total FROM analisis_lecturas
       WHERE es_anomalia = 1 AND fecha_hora >= NOW() - INTERVAL 24 HOUR GROUP BY sensor_id`
    );
    const [pronosticos] = await db.query(
      `SELECT p.sensor_id, MAX(p.generado_en) AS generado_en, SUM(p.fuera_de_rango IS NOT NULL) AS fuera
       FROM pronosticos p
       JOIN (SELECT sensor_id, MAX(generado_en) AS ultimo FROM pronosticos GROUP BY sensor_id) u
         ON u.sensor_id = p.sensor_id AND u.ultimo = p.generado_en
       GROUP BY p.sensor_id`
    );
    const porSensor = (lista) => Object.fromEntries(lista.map((f) => [f.sensor_id, f]));
    const u = porSensor(ultimos);
    const a = porSensor(anomalias);
    const p = porSensor(pronosticos);
    res.json(
      sensores.map((s) => ({
        ...s,
        ultimo_analisis: u[s.id] || null,
        anomalias_24h: a[s.id] ? Number(a[s.id].total) : 0,
        pronostico: p[s.id] ? { generado_en: p[s.id].generado_en, parametros_fuera: Number(p[s.id].fuera) } : null,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analisis/sensores/:id?horas=24 - detalle de un sensor: última
// clasificación, evolución de la probabilidad y del puntaje de anomalía,
// lecturas anómalas, último pronóstico de cada parámetro y las lecturas de
// las últimas horas (promedios de 15 min) para graficarlo a continuación.
router.get('/sensores/:id', async (req, res) => {
  const horas = Math.min(168, Math.max(1, parseInt(req.query.horas, 10) || 24));
  const sensorId = req.params.id;
  try {
    const [[sensor]] = await db.query('SELECT id, n_serie, ubicacion FROM sensores WHERE id = ?', [sensorId]);
    if (!sensor) {
      return res.status(404).json({ error: 'Sensor no encontrado' });
    }
    const [[ultimo]] = await db.query('SELECT * FROM analisis_lecturas WHERE sensor_id = ? ORDER BY lectura_id DESC LIMIT 1', [sensorId]);
    const [distribucion] = await db.query(
      `SELECT clase, COUNT(*) AS total FROM analisis_lecturas
       WHERE sensor_id = ? AND fecha_hora >= NOW() - INTERVAL ? HOUR AND clase IS NOT NULL GROUP BY clase`,
      [sensorId, horas]
    );
    // Evolución en promedios de 5 minutos (con lecturas cada pocos segundos
    // serían miles de puntos).
    const [evolucion] = await db.query(
      `SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(fecha_hora) / 300) * 300) AS fecha_hora,
              AVG(probabilidad_apta) AS probabilidad_apta, MAX(puntaje_anomalia) AS puntaje_anomalia,
              MAX(es_anomalia) AS es_anomalia
       FROM analisis_lecturas
       WHERE sensor_id = ? AND fecha_hora >= NOW() - INTERVAL ? HOUR
       GROUP BY FLOOR(UNIX_TIMESTAMP(fecha_hora) / 300)
       ORDER BY 1`,
      [sensorId, horas]
    );
    const [anomalias] = await db.query(
      `SELECT a.lectura_id, a.fecha_hora, a.puntaje_anomalia, a.tipo_anomalia, a.parametros_anomalia,
              l.valor_temperatura, l.valor_ph, l.valor_turbidez, l.valor_conductividad
       FROM analisis_lecturas a JOIN lecturas l ON l.id = a.lectura_id
       WHERE a.sensor_id = ? AND a.es_anomalia = 1 AND a.fecha_hora >= NOW() - INTERVAL ? HOUR
       ORDER BY a.fecha_hora DESC LIMIT 100`,
      [sensorId, horas]
    );
    const [pronosticos] = await db.query(
      `SELECT p.* FROM pronosticos p
       JOIN (SELECT parametro, MAX(generado_en) AS ultimo FROM pronosticos WHERE sensor_id = ? GROUP BY parametro) u
         ON u.parametro = p.parametro AND u.ultimo = p.generado_en
       WHERE p.sensor_id = ?`,
      [sensorId, sensorId]
    );
    const [recientes] = await db.query(
      `SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(fecha_hora) / 900) * 900) AS fecha_hora,
              AVG(valor_ph) AS ph, AVG(valor_turbidez) AS turbidez, AVG(valor_conductividad) AS conductividad
       FROM lecturas
       WHERE sensor_id = ? AND fecha_hora >= NOW() - INTERVAL 6 HOUR
       GROUP BY FLOOR(UNIX_TIMESTAMP(fecha_hora) / 900)
       ORDER BY 1`,
      [sensorId]
    );
    res.json({
      sensor,
      ultimo: ultimo || null,
      distribucion: Object.fromEntries(distribucion.map((d) => [d.clase, Number(d.total)])),
      evolucion,
      anomalias,
      pronosticos: pronosticos.map((p) => ({
        parametro: p.parametro,
        metodo: p.metodo,
        generado_en: p.generado_en,
        puntos: JSON.parse(p.puntos),
        fuera_de_rango: p.fuera_de_rango ? JSON.parse(p.fuera_de_rango) : null,
      })),
      recientes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analisis/metricas - desempeño de los tres modelos (los reportes
// que generan los scripts de entrenamiento).
router.get('/metricas', async (req, res) => {
  try {
    const { data } = await cliente.get('/metricas', { timeout: 10000 });
    res.json(data);
  } catch {
    res.status(503).json({ error: 'El servicio de aprendizaje automático no está disponible' });
  }
});

// GET /api/analisis/figuras/:nombre - figuras del entrenamiento (matriz de
// confusión, curvas ROC, etc.), servidas desde el servicio de Python.
router.get('/figuras/:nombre', async (req, res) => {
  if (!/^[a-z0-9_]+$/.test(req.params.nombre)) {
    return res.status(404).json({ error: 'Figura no encontrada' });
  }
  try {
    const respuesta = await cliente.get(`/figuras/${req.params.nombre}`, { responseType: 'stream', timeout: 10000 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'private, max-age=600');
    respuesta.data.pipe(res);
  } catch (err) {
    res.status(err.response?.status === 404 ? 404 : 503).json({ error: 'Figura no disponible' });
  }
});

module.exports = router;
