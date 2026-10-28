// Simulador de sensores IoT: publica lecturas por MQTT como si fueran ESP32
// reales, para poder probar y hacer la demo del sistema mientras no se
// tenga el firmware/hardware físico conectado.
//
// Uso:
//   npm run simulate                        -> simula SN-001, SN-002, SN-003 y SN-004
//   node simulator.js SN-001                -> simula solo un sensor
//   node simulator.js SN-001,SN-002         -> simula una lista específica
//
// Si un sensor de la lista todavía no existe en la tabla `sensores` (por
// ejemplo, no corriste seed_sensores_adicionales.sql), el backend
// simplemente descarta esa lectura con una advertencia en consola — no
// rompe nada, solo no aparece en el mapa/dashboard hasta que lo registres.

require('dotenv').config();
const mqtt = require('mqtt');

const MQTT_PORT = process.env.MQTT_PORT || 1883;
const INTERVALO_MS = 5000;

// El backend solo confirma una alerta real después de 10 lecturas seguidas
// fuera de rango (ver utils/contadorAlertas.js) — la falla simulada dura
// más que eso, para poder demostrar el flujo completo: el valor se sale de
// rango, se mantiene un rato (como pasaría con un problema real de agua, no
// un dato suelto y ruidoso), dispara la notificación, y después se
// recupera solo.
const DURACION_EVENTO_MIN_TICKS = 12;
const DURACION_EVENTO_MAX_TICKS = 18;
const PROBABILIDAD_NUEVO_EVENTO = 0.03; // por sensor, por lectura (~5s)

const listaArgumento = process.argv[2];
const SENSORES = listaArgumento
  ? listaArgumento.split(',').map((s) => s.trim()).filter(Boolean)
  : ['SN-001', 'SN-002', 'SN-003', 'SN-004'];

function numeroAleatorio(min, max, decimales = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimales));
}

function enteroAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(valor, min, max) {
  return Math.min(Math.max(valor, min), max);
}

// Estado inicial "sano" por sensor: valores base para la caminata aleatoria
// y el control de si hay (o no) una falla sostenida en curso.
const estado = {};
SENSORES.forEach((nSerie) => {
  estado[nSerie] = {
    temperatura: numeroAleatorio(16, 20),
    turbidez: numeroAleatorio(0.2, 0.6),
    ph: numeroAleatorio(7, 7.5),
    conductividad: numeroAleatorio(400, 700),
    evento: null, // { parametro: 'turbidez' | 'ph', ticksRestantes }
  };
});

function siguienteLectura(nSerie) {
  const actual = estado[nSerie];

  // Caminata aleatoria suave de fondo para temperatura (no participa de los
  // eventos de falla simulados: la norma no le da un umbral).
  actual.temperatura = clamp(actual.temperatura + numeroAleatorio(-0.4, 0.4), 12, 26);

  // ¿Arranca una falla nueva? Solo si no hay una en curso.
  if (!actual.evento && Math.random() < PROBABILIDAD_NUEVO_EVENTO) {
    // Solo un parámetro falla a la vez por sensor (así cada notificación
    // sigue siendo clara: "SN-00X — turbidez", no varias encimadas).
    const parametro = ['turbidez', 'ph', 'conductividad'][enteroAleatorio(0, 2)];
    // La dirección/base del evento se decide UNA sola vez al iniciar, no en
    // cada tick, para que el valor se mantenga sostenido de un solo lado
    // (ej. "pH alto") durante todo el evento en vez de saltar entre alto y
    // bajo lectura a lectura.
    const direccion = parametro === 'ph' ? (Math.random() < 0.5 ? 'bajo' : 'alto') : 'alto';
    actual.evento = {
      parametro,
      direccion,
      ticksRestantes: enteroAleatorio(DURACION_EVENTO_MIN_TICKS, DURACION_EVENTO_MAX_TICKS),
    };
    // Punto de partida ya dentro de la zona de falla, para que arranque
    // sostenido desde el primer tick del evento.
    if (parametro === 'turbidez') {
      actual.turbidez = numeroAleatorio(1.4, 1.8);
    } else if (parametro === 'conductividad') {
      actual.conductividad = numeroAleatorio(1600, 1900);
    } else if (direccion === 'bajo') {
      actual.ph = numeroAleatorio(5.2, 5.8);
    } else {
      actual.ph = numeroAleatorio(9.0, 9.3);
    }
    console.log(`⚠️  (${nSerie}) inicia evento simulado de "${parametro}" (${direccion}) fuera de rango (~${actual.evento.ticksRestantes * (INTERVALO_MS / 1000)}s)`);
  }

  if (actual.evento) {
    const { parametro, direccion } = actual.evento;
    if (parametro === 'turbidez') {
      // Camina suavemente dentro de la banda de falla, sin volver a rango
      // normal hasta que el evento termine (ni tocar los demás parámetros).
      actual.turbidez = clamp(actual.turbidez + numeroAleatorio(-0.15, 0.15), 1.2, 3);
    } else if (parametro === 'conductividad') {
      actual.conductividad = clamp(actual.conductividad + numeroAleatorio(-40, 40), 1550, 2200);
    } else {
      // Camina suavemente dentro de la banda "alta" o "baja" ya elegida,
      // sin cruzar al otro lado del rango normal.
      if (direccion === 'bajo') {
        actual.ph = clamp(actual.ph + numeroAleatorio(-0.15, 0.15), 4.5, 6.3);
      } else {
        actual.ph = clamp(actual.ph + numeroAleatorio(-0.15, 0.15), 8.7, 9.5);
      }
    }

    // Los parámetros que NO están fallando en este evento siguen su
    // caminata normal en rango, para que la falla sea de un solo tipo.
    if (parametro !== 'turbidez') actual.turbidez = clamp(actual.turbidez + numeroAleatorio(-0.08, 0.08), 0.05, 0.95);
    if (parametro !== 'ph') actual.ph = clamp(actual.ph + numeroAleatorio(-0.15, 0.15), 6.6, 8.2);
    if (parametro !== 'conductividad') actual.conductividad = clamp(actual.conductividad + numeroAleatorio(-40, 40), 150, 1200);

    actual.evento.ticksRestantes -= 1;
    if (actual.evento.ticksRestantes <= 0) {
      console.log(`✅ (${nSerie}) el evento simulado de "${parametro}" terminó, vuelve a rango normal`);
      actual.evento = null;
    }
  } else {
    actual.turbidez = clamp(actual.turbidez + numeroAleatorio(-0.08, 0.08), 0.05, 0.95);
    actual.ph = clamp(actual.ph + numeroAleatorio(-0.15, 0.15), 6.6, 8.2);
  }

  return {
    temperatura: Number(actual.temperatura.toFixed(2)),
    turbidez: Number(actual.turbidez.toFixed(2)),
    ph: Number(actual.ph.toFixed(2)),
    conductividad: Number(actual.conductividad.toFixed(2)),
    fecha_hora: new Date().toISOString(),
  };
}

const client = mqtt.connect(`mqtt://localhost:${MQTT_PORT}`);

client.on('connect', () => {
  console.log(`Simulador conectado al broker. Publicando lecturas de: ${SENSORES.join(', ')} (cada ${INTERVALO_MS / 1000}s)`);
  console.log('Presiona Ctrl+C para detener.\n');

  SENSORES.forEach((nSerie, i) => {
    const topico = `yakuzone/sensores/${nSerie}/lecturas`;
    // Pequeño desfase inicial entre sensores para que no publiquen todos
    // exactamente en el mismo milisegundo.
    setTimeout(() => {
      setInterval(() => {
        const payload = siguienteLectura(nSerie);
        client.publish(topico, JSON.stringify(payload));
        console.log(`Publicado (${nSerie}):`, payload);
      }, INTERVALO_MS);
    }, i * 400);
  });
});

client.on('error', (err) => {
  console.error('Error de conexión del simulador:', err.message);
});
