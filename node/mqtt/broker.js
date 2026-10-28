const net = require('net');
const Aedes = require('aedes');

// Broker MQTT embebido en el mismo proceso del backend (librería Aedes),
// para no depender de instalar y administrar un servicio aparte (como Mosquitto)
// en la máquina donde corre el proyecto durante el desarrollo/demo.
function iniciarBrokerMQTT(port) {
  const aedes = new Aedes();
  const servidor = net.createServer(aedes.handle);

  servidor.listen(port, () => {
    console.log(`[MQTT] Broker escuchando en el puerto ${port}`);
  });

  aedes.on('client', (client) => {
    console.log(`[MQTT] Cliente conectado: ${client.id}`);
  });
  aedes.on('clientError', (client, err) => {
    console.warn(`[MQTT] Error de cliente ${client.id}:`, err.message);
  });

  return aedes;
}

module.exports = { iniciarBrokerMQTT };
