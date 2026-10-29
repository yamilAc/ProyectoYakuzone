const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { FECHA_VALIDA } = require('../services/alertasService');
const { datosReporteAlertas, datosReporteGeneral } = require('../services/reportesService');
const reporteAlertasSensor = require('../reportes/alertasSensor');
const reporteGeneral = require('../reportes/general');

// Reportes descargables de Datos Históricos, en PDF o Excel (solo administradores).
router.use(authenticate, authorize('administrador'));

const FORMATOS = ['pdf', 'xlsx'];

// Lee formato y periodo (desde/hasta en YYYY-MM-DD, opcionales) del query.
function leerParametros(query) {
  const formato = query.formato;
  const desde = query.desde || null;
  const hasta = query.hasta || null;
  if (!FORMATOS.includes(formato)) return { error: 'El formato debe ser pdf o xlsx' };
  if ((desde && !FECHA_VALIDA.test(desde)) || (hasta && !FECHA_VALIDA.test(hasta))) {
    return { error: 'Las fechas deben tener el formato AAAA-MM-DD' };
  }
  if (desde && hasta && desde > hasta) return { error: 'La fecha "desde" no puede ser posterior a "hasta"' };
  return { formato, desde, hasta };
}

const hoy = () => new Date().toISOString().slice(0, 10);
const nombreSeguro = (texto) => String(texto).replace(/[^A-Za-z0-9_-]/g, '_');

// Nombre y apellido de quien genera el reporte, para el encabezado.
async function nombreUsuario(id) {
  const [rows] = await db.query('SELECT nombre, apellido FROM usuarios WHERE id = ?', [id]);
  return rows.length ? `${rows[0].nombre} ${rows[0].apellido}` : null;
}

// GET /api/reportes/alertas?sensor_id=N&desde=&hasta=&formato=pdf|xlsx
router.get('/alertas', async (req, res) => {
  const { formato, desde, hasta, error } = leerParametros(req.query);
  const sensorId = Number(req.query.sensor_id);
  if (error || !sensorId) {
    return res.status(400).json({ error: error || 'Falta el sensor' });
  }
  try {
    const datos = await datosReporteAlertas({ sensorId, desde, hasta });
    if (!datos) {
      return res.status(404).json({ error: 'Sensor no encontrado' });
    }
    const opciones = {
      nombreArchivo: `reporte_alertas_${nombreSeguro(datos.sensor.n_serie)}_${hoy()}.${formato}`,
      generadoPor: await nombreUsuario(req.user.id),
    };
    if (formato === 'pdf') reporteAlertasSensor.pdf(res, datos, opciones);
    else await reporteAlertasSensor.excel(res, datos, opciones);
  } catch (err) {
    console.error('[Reportes] Error en el reporte de alertas:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET /api/reportes/general?desde=&hasta=&formato=pdf|xlsx
router.get('/general', async (req, res) => {
  const { formato, desde, hasta, error } = leerParametros(req.query);
  if (error) {
    return res.status(400).json({ error });
  }
  try {
    const datos = await datosReporteGeneral({ desde, hasta });
    const opciones = {
      nombreArchivo: `reporte_general_${hoy()}.${formato}`,
      generadoPor: await nombreUsuario(req.user.id),
    };
    if (formato === 'pdf') reporteGeneral.pdf(res, datos, opciones);
    else await reporteGeneral.excel(res, datos, opciones);
  } catch (err) {
    console.error('[Reportes] Error en el reporte general:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
