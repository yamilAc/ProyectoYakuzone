const mqtt = require('mqtt');
const db = require('../db');
const { registrarLectura } = require('../services/lecturasService');

// Tópico que publican los nodos ESP32 (o el simulador): yakuzone/sensores/<n_serie>/lecturas
const TOPICO = 'yakuzone/sensores/+/lecturas';

function iniciarSuscriptorMQTT(mqttPort) {
  const client = mqtt.connect(`mqtt://localhost:${mqttPort}`);

  client.on('connect', () => {
    console.log('[MQTT] Backend conectado al broker como suscriptor');
    client.subscribe(TOPICO, (err) => {
      if (err) console.error('[MQTT] Error al suscribirse:', err.message);
    });
  });

  client.on('message', async (topico, mensaje) => {
    try {
      const nSerie = topico.split('/')[2];
      const payload = JSON.parse(mensaje.toString());
      const { temperatura, turbidez, ph, conductividad, fecha_hora } = payload;

      const [sensores] = await db.query('SELECT id FROM sensores WHERE n_serie = ?', [nSerie]);
      if (sensores.length === 0) {
        console.warn(`[MQTT] Lectura descartada: el sensor "${nSerie}" no está registrado en la tabla sensores`);
        return;
      }

      const { lecturaId, alertas } = await registrarLectura({
        sensorId: sensores[0].id,
        temperatura,
        turbidez,
        ph,
        conductividad,
        fechaHora: fecha_hora,
      });

      console.log(`[MQTT] Lectura #${lecturaId} registrada de ${nSerie} (${alertas.length} alerta(s) generada(s))`);
    } catch (err) {
      console.error('[MQTT] Error al procesar mensaje:', err.message);
    }
  });

  client.on('error', (err) => {
    console.error('[MQTT] Error de conexión del suscriptor:', err.message);
  });

  return client;
}

module.exports = { iniciarSuscriptorMQTT };
