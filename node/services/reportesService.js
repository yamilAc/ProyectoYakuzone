const db = require('../db');
const { UMBRALES } = require('../utils/thresholds');
const { construirFiltrosAlertas } = require('./alertasService');

// Datos de los reportes descargables de Datos Históricos (ver routes/reportes.js
// y la carpeta reportes/, que les da formato PDF o Excel).

const nombreCompleto = (nombre, apellido) => (nombre ? `${nombre} ${apellido || ''}`.trim() : null);

// Alertas filtradas con su equipo y quién las mitigó, de la más antigua a la
// más reciente (orden de lectura de un reporte).
async function listarAlertas(filtros) {
  const { condiciones, params } = construirFiltrosAlertas(filtros);
  const [rows] = await db.query(
    `SELECT a.id, a.parametro, a.valor, a.fecha_hora, a.estado, a.asignado_en, a.mitigado_en,
            a.observacion_mitigacion, s.n_serie, s.ubicacion, e.nombre AS equipo_nombre,
            um.nombre AS mitigado_por_nombre, um.apellido AS mitigado_por_apellido
     FROM alertas a
     JOIN sensores s ON s.id = a.sensor_id
     LEFT JOIN equipos_mitigacion e ON e.id = a.equipo_id
     LEFT JOIN usuarios um ON um.id = a.mitigado_por
     ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
     ORDER BY a.fecha_hora ASC
     LIMIT 5000`,
    params
  );
  return rows.map((r) => ({ ...r, mitigado_por: nombreCompleto(r.mitigado_por_nombre, r.mitigado_por_apellido) }));
}

// Cuenta alertas por estado y por parámetro.
function resumirAlertas(alertas) {
  const porEstado = { pendiente: 0, asignada: 0, mitigada: 0 };
  const porParametro = {};
  for (const a of alertas) {
    porEstado[a.estado] = (porEstado[a.estado] || 0) + 1;
    porParametro[a.parametro] = (porParametro[a.parametro] || 0) + 1;
  }
  return { total: alertas.length, porEstado, porParametro };
}

// Reporte de alertas de un sensor (botón "Reporte de alertas" junto a
// "Verificar"). Devuelve null si el sensor no existe.
async function datosReporteAlertas({ sensorId, desde, hasta }) {
  const [sensores] = await db.query('SELECT * FROM sensores WHERE id = ?', [sensorId]);
  if (sensores.length === 0) return null;
  const alertas = await listarAlertas({ sensor_id: sensorId, desde, hasta });
  return { sensor: sensores[0], desde, hasta, alertas, resumen: resumirAlertas(alertas) };
}

// Condición SQL de rango de fechas sobre una columna, para usarla dentro de
// un JOIN (así los sensores o equipos sin datos en el periodo igual aparecen).
function rangoFechas(columna, desde, hasta) {
  const partes = [];
  const params = [];
  if (desde) {
    partes.push(`${columna} >= ?`);
    params.push(`${desde} 00:00:00`);
  }
  if (hasta) {
    partes.push(`${columna} <= ?`);
    params.push(`${hasta} 23:59:59`);
  }
  return { sql: partes.length ? ` AND ${partes.join(' AND ')}` : '', params };
}

// Reporte general (botón "Reporte general"): calidad del agua por sensor,
// alertas por parámetro y estado, desempeño de los equipos de mitigación y
// el detalle de todas las alertas del periodo.
async function datosReporteGeneral({ desde, hasta }) {
  const rangoLecturas = rangoFechas('l.fecha_hora', desde, hasta);
  const rangoAlertas = rangoFechas('a.fecha_hora', desde, hasta);
  const { ph, turbidez, conductividad } = UMBRALES;

  const [sensores] = await db.query(
    `SELECT s.id, s.n_serie, s.ubicacion, s.propietario_nombre,
            COUNT(l.id) AS lecturas,
            AVG(l.valor_temperatura) AS temp_prom,
            AVG(l.valor_ph) AS ph_prom, MIN(l.valor_ph) AS ph_min, MAX(l.valor_ph) AS ph_max,
            AVG(l.valor_turbidez) AS turb_prom, MAX(l.valor_turbidez) AS turb_max,
            AVG(l.valor_conductividad) AS cond_prom, MAX(l.valor_conductividad) AS cond_max,
            SUM(l.valor_ph < ? OR l.valor_ph > ? OR l.valor_turbidez > ? OR l.valor_conductividad > ?) AS fuera_de_rango,
            MAX(l.fecha_hora) AS ultima_lectura
     FROM sensores s
     LEFT JOIN lecturas l ON l.sensor_id = s.id${rangoLecturas.sql}
     GROUP BY s.id
     ORDER BY s.n_serie`,
    [ph.min, ph.max, turbidez.max, conductividad.max, ...rangoLecturas.params]
  );

  const [equipos] = await db.query(
    `SELECT e.id, e.nombre, u.nombre AS jefe_nombre, u.apellido AS jefe_apellido,
            COUNT(a.id) AS asignadas,
            SUM(a.estado = 'mitigada') AS mitigadas,
            SUM(a.estado = 'asignada') AS en_curso,
            AVG(CASE WHEN a.estado = 'mitigada' THEN TIMESTAMPDIFF(MINUTE, a.asignado_en, a.mitigado_en) END) AS minutos_prom
     FROM equipos_mitigacion e
     LEFT JOIN usuarios u ON u.id = e.jefe_id
     LEFT JOIN alertas a ON a.equipo_id = e.id${rangoAlertas.sql}
     GROUP BY e.id
     ORDER BY e.nombre`,
    rangoAlertas.params
  );

  const alertas = await listarAlertas({ desde, hasta });
  const alertasPorSensor = {};
  for (const a of alertas) {
    alertasPorSensor[a.n_serie] = (alertasPorSensor[a.n_serie] || 0) + 1;
  }

  // Tiempo desde que se generó la alerta hasta que se mitigó, en horas.
  const mitigadas = alertas.filter((a) => a.estado === 'mitigada' && a.mitigado_en);
  const horasMitigacion = mitigadas.length
    ? mitigadas.reduce((suma, a) => suma + (new Date(a.mitigado_en) - new Date(a.fecha_hora)) / 3600000, 0) / mitigadas.length
    : null;

  const totalLecturas = sensores.reduce((suma, s) => suma + Number(s.lecturas), 0);
  const totalFueraDeRango = sensores.reduce((suma, s) => suma + Number(s.fuera_de_rango || 0), 0);

  return {
    desde,
    hasta,
    resumen: {
      sensores: sensores.length,
      lecturas: totalLecturas,
      porcentajeFueraDeRango: totalLecturas ? (totalFueraDeRango / totalLecturas) * 100 : null,
      equipos: equipos.length,
      horasMitigacion,
      ...resumirAlertas(alertas),
    },
    sensores: sensores.map((s) => ({
      ...s,
      alertas: alertasPorSensor[s.n_serie] || 0,
      porcentaje_fuera: Number(s.lecturas) ? (Number(s.fuera_de_rango) / Number(s.lecturas)) * 100 : null,
    })),
    equipos: equipos.map((e) => ({ ...e, jefe: nombreCompleto(e.jefe_nombre, e.jefe_apellido) })),
    alertas,
  };
}

module.exports = { datosReporteAlertas, datosReporteGeneral };
