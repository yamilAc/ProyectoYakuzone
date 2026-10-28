require('dotenv').config();
const db = require('./db');

(async () => {
  try {
    const [[{ totalLecturas }]] = await db.query('SELECT COUNT(*) AS totalLecturas FROM lecturas');
    const [[{ totalAlertas }]] = await db.query('SELECT COUNT(*) AS totalAlertas FROM alertas');
    const [porSensor] = await db.query(
      `SELECT s.n_serie, COUNT(l.id) AS lecturas, MAX(l.fecha_hora) AS ultima
       FROM sensores s LEFT JOIN lecturas l ON l.sensor_id = s.id
       GROUP BY s.id ORDER BY s.n_serie`
    );
    console.log('--- Verificación de datos guardados en MySQL (yakuDB) ---');
    console.log('Total lecturas:', totalLecturas);
    console.log('Total alertas:', totalAlertas);
    console.log('Por sensor:');
    porSensor.forEach((r) => console.log(`  ${r.n_serie}: ${r.lecturas} lecturas, última: ${r.ultima}`));
  } catch (err) {
    console.error('Error al verificar:', err.message);
  } finally {
    process.exit(0);
  }
})();
