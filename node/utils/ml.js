// Cliente del servicio de aprendizaje automático (FastAPI, carpeta ml/ del
// proyecto). Si el servicio no está levantado, las llamadas fallan sin
// romper el backend: el monitoreo y las alertas normativas siguen igual.
const axios = require('axios');

const URL_ML = process.env.ML_URL || 'http://127.0.0.1:8000';

const cliente = axios.create({ baseURL: URL_ML, timeout: 120000 });

// true si el servicio responde (se consulta antes de cada ciclo de análisis).
async function servicioDisponible() {
  try {
    const res = await cliente.get('/salud', { timeout: 3000 });
    return res.data;
  } catch {
    return null;
  }
}

module.exports = { cliente, servicioDisponible, URL_ML };
