require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { iniciarBrokerMQTT } = require('./mqtt/broker');
const { iniciarSuscriptorMQTT } = require('./mqtt/subscriber');

const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const sensoresRoutes = require('./routes/sensores');
const lecturasRoutes = require('./routes/lecturas');
const alertasRoutes = require('./routes/alertas');
const equiposRoutes = require('./routes/equipos');
const reportesRoutes = require('./routes/reportes');
const analisisRoutes = require('./routes/analisis');
const alertasPreventivasRoutes = require('./routes/alertasPreventivas');
const { iniciarAnalisisML } = require('./services/analisisService');

const app = express();
const PORT = process.env.PORT || 3001;
const MQTT_PORT = process.env.MQTT_PORT || 1883;

// No anunciar que el servidor usa Express.
app.disable('x-powered-by');

// Cabeceras de seguridad: el navegador no debe adivinar el tipo de los
// archivos (fotos), mostrar la API dentro de un marco de otro sitio ni
// enviar la dirección de la página de origen.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  next();
});

// CORS: solo la plataforma web puede llamar a la API desde el navegador: el
// frontend en el puerto 3000 de esta computadora o de la red local (por
// ejemplo, desde un celular o con el punto de acceso de la defensa), más los
// orígenes que se agreguen en CORS_ORIGENES (separados por comas).
const ORIGENES_EXTRA = (process.env.CORS_ORIGENES || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const ORIGEN_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):3000$/;
app.use(
  cors({
    origin: (origen, listo) => listo(null, !origen || ORIGEN_LOCAL.test(origen) || ORIGENES_EXTRA.includes(origen)),
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ estado: 'ok' }));

app.use('/api', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/sensores', sensoresRoutes);
app.use('/api/lecturas', lecturasRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/equipos', equiposRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/analisis', analisisRoutes);
app.use('/api/alertas-preventivas', alertasPreventivasRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Cuerpos mal formados o demasiado grandes: respuesta JSON clara en vez de la
// página de error de Express.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La petición es demasiado grande' });
  }
  console.error('[HTTP] Error no controlado:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Servidor Yakuzone escuchando en el puerto ${PORT}`);
});

// Broker MQTT embebido + suscriptor que persiste las lecturas entrantes.
iniciarBrokerMQTT(MQTT_PORT);
iniciarSuscriptorMQTT(MQTT_PORT);

// Clasificación, anomalías y pronóstico con el servicio de aprendizaje
// automático (carpeta ml/); si no está levantado, se reintenta en cada ciclo.
iniciarAnalisisML();
