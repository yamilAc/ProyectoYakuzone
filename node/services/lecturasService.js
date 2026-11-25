const db = require('../db');
const { UMBRALES, evaluarLectura } = require('../utils/thresholds');
const { filtrarPorPersistencia } = require('../utils/contadorAlertas');
const { generarSugerencia } = require('./mitigacionService');

// Guarda una lectura y genera automáticamente las alertas que correspondan
// según los umbrales de la NB 512-04. La usan tanto el suscriptor MQTT
// (lecturas que llegan de los sensores) como la ruta POST /api/lecturas
// (inserción manual, útil para pruebas sin hardware).
//
// Una lectura fuera de rango NO genera una alerta de inmediato: se registra
// igual en `lecturas` (para que el mapa/dashboard reflejen el valor actual
// en tiempo real), pero la alerta solo se confirma y se guarda en `alertas`
// cuando el mismo parámetro se mantiene fuera de rango varias lecturas
// seguidas (ver utils/contadorAlertas.js) — así se evita notificar por una
// lectura aislada y ruidosa del sensor.
// Rangos físicamente posibles de cada parámetro (y de los sensores usados).
// Un valor fuera de ellos o que no sea un número es un error de medición o
// un mensaje mal formado: se descarta ese parámetro y se registran los demás.
const RANGOS_VALIDOS = {
  temperatura: { min: -10, max: 60 },
  ph: { min: 0, max: 14 },
  turbidez: { min: 0, max: 4000 },
  conductividad: { min: 0, max: 20000 },
};

function valorValido(nombre, valor, sensorId) {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(String(valor).trim());
  const { min, max } = RANGOS_VALIDOS[nombre];
  if (!Number.isFinite(numero) || numero < min || numero > max) {
    console.warn(`[Lecturas] Valor descartado del sensor ${sensorId}: ${nombre} = ${JSON.stringify(valor)} (válido: ${min} a ${max})`);
    return null;
  }
  return numero;
}

// La fecha la pone el servidor; solo se acepta la que viene en el mensaje si
// es válida y razonable (hasta un día atrás y no en el futuro).
function fechaDeLectura(fechaHora) {
  const ahora = new Date();
  if (!fechaHora) return ahora;
  const fecha = new Date(fechaHora);
  if (Number.isNaN(fecha.getTime()) || fecha > new Date(ahora.getTime() + 5 * 60 * 1000) || fecha < new Date(ahora.getTime() - 24 * 3600 * 1000)) {
    return ahora;
  }
  return fecha;
}

async function registrarLectura(entrada) {
  const { sensorId } = entrada;
  const temperatura = valorValido('temperatura', entrada.temperatura, sensorId);
  const turbidez = valorValido('turbidez', entrada.turbidez, sensorId);
  const ph = valorValido('ph', entrada.ph, sensorId);
  const conductividad = valorValido('conductividad', entrada.conductividad, sensorId);
  if ([temperatura, turbidez, ph, conductividad].every((v) => v === null)) {
    const error = new Error('La lectura no tiene ningún valor válido');
    error.esValidacion = true;
    throw error;
  }
  const fecha = fechaDeLectura(entrada.fechaHora);

  const [resultado] = await db.query(
    `INSERT INTO lecturas (sensor_id, valor_temperatura, valor_turbidez, valor_ph, valor_conductividad, fecha_hora)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sensorId, temperatura ?? null, turbidez ?? null, ph ?? null, conductividad ?? null, fecha]
  );
  const lecturaId = resultado.insertId;

  const candidatas = evaluarLectura({
    valor_ph: ph,
    valor_turbidez: turbidez,
    valor_conductividad: conductividad,
  });

  const parametrosFueraDeRango = candidatas.map((c) => c.parametro);
  const parametrosConfirmados = filtrarPorPersistencia(sensorId, parametrosFueraDeRango, Object.keys(UMBRALES));
  const alertasGeneradas = candidatas.filter((c) => parametrosConfirmados.includes(c.parametro));

  for (const alerta of alertasGeneradas) {
    const [resultadoAlerta] = await db.query(
      `INSERT INTO alertas (lectura_id, sensor_id, parametro, tipo_alerta, valor, descripcion, fecha_hora)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [lecturaId, sensorId, alerta.parametro, alerta.tipo_alerta, alerta.valor, alerta.descripcion, fecha]
    );

    // Módulo de mitigación (objetivo 9 del alcance): se dispara sin esperar
    // (fire-and-forget, con .catch) para no bloquear el registro de la
    // lectura/alerta —que es la parte crítica de este flujo— con la latencia
    // de la llamada a la API de Gemini y el envío de correo. Un fallo ahí
    // solo se registra en consola.
    generarSugerencia({
      alertaId: resultadoAlerta.insertId,
      sensorId,
      parametro: alerta.parametro,
      valor: alerta.valor,
    }).catch((err) => {
      console.error('[Mitigación] Error al generar la sugerencia:', err.message);
    });
  }

  return { lecturaId, alertas: alertasGeneradas };
}

module.exports = { registrarLectura, RANGOS_VALIDOS };
