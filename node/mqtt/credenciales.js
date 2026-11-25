// Credenciales del broker MQTT.
//
// Cada nodo se conecta con su número de serie como usuario y una contraseña
// propia, que se deriva del secreto del servidor (MQTT_SECRETO en .env) con
// HMAC-SHA256: así cada nodo tiene una contraseña distinta sin guardar nada
// en la base, y conocer la de un nodo no permite deducir la de otro ni el
// secreto. El backend se conecta como un usuario interno con su propia
// contraseña derivada. La contraseña de un nodo se obtiene con:
//   npm run clave-nodo -- SN-010
const crypto = require('crypto');

const USUARIO_BACKEND = 'yakuzone-backend';

const secreto = () => process.env.MQTT_SECRETO || '';
const autenticacionActiva = () => Boolean(secreto());

// Contraseña de un usuario: 24 caracteres (letras, números, "-" y "_").
function claveDe(usuario) {
  return crypto.createHmac('sha256', secreto()).update(String(usuario)).digest('base64url').slice(0, 24);
}

// Comparación en tiempo constante, para no dar pistas por la demora.
function claveCorrecta(usuario, clave) {
  if (!usuario || !clave) return false;
  const esperada = Buffer.from(claveDe(usuario));
  const recibida = Buffer.from(String(clave));
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

// Tópico en el que puede publicar cada nodo: solo el suyo.
const topicoDelNodo = (nSerie) => `yakuzone/sensores/${nSerie}/lecturas`;

module.exports = { USUARIO_BACKEND, autenticacionActiva, claveDe, claveCorrecta, topicoDelNodo };
