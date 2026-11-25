const net = require('net');
const Aedes = require('aedes');
const { USUARIO_BACKEND, autenticacionActiva, claveCorrecta, topicoDelNodo } = require('./credenciales');

// Broker MQTT embebido en el mismo proceso del backend (librería Aedes),
// para no depender de instalar y administrar un servicio aparte (como Mosquitto)
// en la máquina donde corre el proyecto durante el desarrollo/demo.
//
// Con MQTT_SECRETO configurado, el broker exige usuario y contraseña (ver
// mqtt/credenciales.js) y cada nodo solo puede publicar en su propio tópico,
// para que ningún dispositivo de la red pueda enviar lecturas a nombre de
// otro nodo. Solo el backend puede suscribirse.
// Una lectura ocupa menos de 100 bytes; un mensaje mucho más grande es un
// error o un intento de llenar la memoria del servidor: se rechaza y se
// desconecta al cliente.
const MAXIMO_BYTES_MENSAJE = 1024;
const mensajeDemasiadoGrande = (client, paquete) => {
  if (!paquete.payload || paquete.payload.length <= MAXIMO_BYTES_MENSAJE) return false;
  console.warn(`[MQTT] Mensaje rechazado: ${(client && (client.usuario || client.id)) || '-'} envió ${paquete.payload.length} bytes (máximo ${MAXIMO_BYTES_MENSAJE})`);
  return true;
};

function iniciarBrokerMQTT(port) {
  const aedes = new Aedes();

  if (autenticacionActiva()) {
    aedes.authenticate = (client, usuario, clave, listo) => {
      if (claveCorrecta(usuario, clave && clave.toString())) {
        client.usuario = usuario;
        return listo(null, true);
      }
      console.warn(`[MQTT] Conexión rechazada: usuario o contraseña incorrectos (usuario "${usuario || '-'}", cliente ${client.id})`);
      const error = new Error('Usuario o contraseña incorrectos');
      error.returnCode = 4; // "bad user name or password" del protocolo MQTT
      return listo(error, false);
    };

    aedes.authorizePublish = (client, paquete, listo) => {
      if (client && mensajeDemasiadoGrande(client, paquete)) return listo(new Error('Mensaje demasiado grande'));
      if (!client || client.usuario === USUARIO_BACKEND) return listo(null);
      if (paquete.topic === topicoDelNodo(client.usuario)) return listo(null);
      console.warn(`[MQTT] Publicación rechazada: ${client.usuario} intentó publicar en "${paquete.topic}"`);
      return listo(new Error('Tópico no permitido'));
    };

    aedes.authorizeSubscribe = (client, suscripcion, listo) => {
      if (client.usuario === USUARIO_BACKEND) return listo(null, suscripcion);
      console.warn(`[MQTT] Suscripción rechazada: ${client.usuario} intentó suscribirse a "${suscripcion.topic}"`);
      return listo(null, null); // suscripción denegada
    };
  } else {
    console.warn('[MQTT] MQTT_SECRETO no está configurado en .env: el broker acepta conexiones sin usuario ni contraseña.');
    aedes.authorizePublish = (client, paquete, listo) =>
      listo(client && mensajeDemasiadoGrande(client, paquete) ? new Error('Mensaje demasiado grande') : null);
  }

  const servidor = net.createServer(aedes.handle);

  servidor.listen(port, () => {
    console.log(`[MQTT] Broker escuchando en el puerto ${port}${autenticacionActiva() ? ' (con autenticación)' : ''}`);
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
