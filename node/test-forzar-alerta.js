// Script de prueba: fuerza una alerta y su sugerencia de mitigación al
// instante, insertando 10 lecturas de pH fuera de rango seguidas para un
// sensor por la ruta manual POST /api/lecturas — sin esperar al simulador
// (que genera eventos fuera de rango de forma aleatoria, ~3% por lectura).
//
// Requiere que el backend ya esté corriendo (npm start), en otra terminal.
//
// Uso:
//   node test-forzar-alerta.js            -> usa SN-001
//   node test-forzar-alerta.js SN-002     -> usa el sensor que le pases
require('dotenv').config();
const axios = require('axios');

const PORT = process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}/api`;
// n_serie y contraseña se pueden pasar como argumentos (más simple que usar
// "set" en la terminal, donde un espacio de más al final rompe la contraseña
// sin que se note). Si no se especifican, usa los valores del usuario de
// ejemplo del schema.sql original.
const N_SERIE = process.argv[2] || 'SN-001';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@yakuzone.com';
const PASSWORD = process.argv[3] || process.env.ADMIN_PASSWORD || 'Admin123!';

async function main() {
  console.log(`Iniciando sesión como ${EMAIL} (contraseña de ${PASSWORD.length} caracteres)...`);
  const { data: { token } } = await axios.post(`${BASE_URL}/login`, {
    email: EMAIL,
    contrasenia: PASSWORD,
  });
  const headers = { Authorization: `Bearer ${token}` };

  const { data: sensores } = await axios.get(`${BASE_URL}/sensores`, { headers });
  const sensor = sensores.find((s) => s.n_serie === N_SERIE);
  if (!sensor) {
    console.error(`No se encontró el sensor "${N_SERIE}". Sensores disponibles: ${sensores.map((s) => s.n_serie).join(', ')}`);
    process.exit(1);
  }

  console.log(`Enviando 10 lecturas de pH fuera de rango (valor 3.0, rango aceptable 6.5-8.5) para ${N_SERIE}...`);
  for (let i = 0; i < 10; i++) {
    const { data } = await axios.post(
      `${BASE_URL}/lecturas`,
      {
        sensor_id: sensor.id,
        valor_ph: 3.0,
        valor_temperatura: 20,
        valor_turbidez: 0.5,
        valor_conductividad: 500,
      },
      { headers }
    );
    console.log(`  Lectura ${i + 1}/10 registrada (id ${data.id}, alertas generadas: ${data.alertasGeneradas})`);
  }

  console.log('\nListo. En la app deberías ver ahora:');
  console.log('  - Una alerta nueva en "Notificaciones".');
  console.log('  - Una sugerencia nueva (pendiente) en "Mitigación".');
  console.log('\n(Si GEMINI_API_KEY no está configurada todavía, la sugerencia sale con un texto de respaldo — eso es normal.)');
}

main().catch((err) => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
