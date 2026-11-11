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

app.use(cors());
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

app.listen(PORT, () => {
  console.log(`[HTTP] Servidor Yakuzone escuchando en el puerto ${PORT}`);
});

// Broker MQTT embebido + suscriptor que persiste las lecturas entrantes.
iniciarBrokerMQTT(MQTT_PORT);
iniciarSuscriptorMQTT(MQTT_PORT);

// Clasificación, anomalías y pronóstico con el servicio de aprendizaje
// automático (carpeta ml/); si no está levantado, se reintenta en cada ciclo.
iniciarAnalisisML();
