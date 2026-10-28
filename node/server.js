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
const mitigacionRoutes = require('./routes/mitigacion');

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
app.use('/api/mitigacion', mitigacionRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Servidor Yakuzone escuchando en el puerto ${PORT}`);
});

// Broker MQTT embebido + suscriptor que persiste las lecturas entrantes.
iniciarBrokerMQTT(MQTT_PORT);
iniciarSuscriptorMQTT(MQTT_PORT);
