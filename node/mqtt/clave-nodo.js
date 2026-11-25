// Muestra la contraseña MQTT de un nodo, para copiarla en el credenciales.h
// de su firmware (#define MQTT_CLAVE "...").
//
// Uso (desde la carpeta node):
//   npm run clave-nodo -- SN-010
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { autenticacionActiva, claveDe } = require('./credenciales');

const nSerie = (process.argv[2] || '').trim();
if (!nSerie) {
  console.error('Indica el número de serie del nodo. Ejemplo: npm run clave-nodo -- SN-010');
  process.exit(1);
}
if (!autenticacionActiva()) {
  console.error('MQTT_SECRETO no está configurado en .env: el broker no pide contraseña.');
  process.exit(1);
}
console.log(`Nodo ${nSerie}. En credenciales.h:`);
console.log(`#define MQTT_CLAVE "${claveDe(nSerie)}"`);
