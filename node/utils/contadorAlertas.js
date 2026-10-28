// Lleva la cuenta de lecturas consecutivas fuera de rango por sensor y
// parámetro, en memoria (vive mientras el proceso del servidor esté
// corriendo). Sirve para no generar una notificación por cada lectura
// aislada fuera de rango — un solo dato raro puede ser ruido del sensor,
// no un problema real. Solo se confirma la alerta cuando el mismo
// parámetro se mantiene fuera de rango varias lecturas seguidas.
const UMBRAL_LECTURAS_CONSECUTIVAS = 10;

const contadores = new Map(); // clave: `${sensorId}_${parametro}` -> conteo actual

function clave(sensorId, parametro) {
  return `${sensorId}_${parametro}`;
}

// parametrosFueraDeRango: los que evaluarLectura() detectó fuera de rango
// EN ESTA lectura. todosLosParametros: todos los parámetros normados
// (Object.keys(UMBRALES)), para poder reiniciar el contador de los que ya
// volvieron a estar dentro de rango.
//
// Devuelve solo los parámetros que acaban de alcanzar
// UMBRAL_LECTURAS_CONSECUTIVAS lecturas seguidas fuera de rango — esos son
// los que corresponde convertir en una alerta real. Al confirmarse, el
// contador se reinicia (para volver a pedir otra racha de 10 antes de
// avisar de nuevo, en vez de notificar en cada lectura mientras el
// problema continúa).
function filtrarPorPersistencia(sensorId, parametrosFueraDeRango, todosLosParametros) {
  const confirmados = [];

  for (const parametro of todosLosParametros) {
    const k = clave(sensorId, parametro);
    const estaFueraDeRango = parametrosFueraDeRango.includes(parametro);

    if (estaFueraDeRango) {
      const actual = (contadores.get(k) || 0) + 1;
      if (actual >= UMBRAL_LECTURAS_CONSECUTIVAS) {
        confirmados.push(parametro);
        contadores.set(k, 0);
      } else {
        contadores.set(k, actual);
      }
    } else {
      contadores.set(k, 0);
    }
  }

  return confirmados;
}

module.exports = { filtrarPorPersistencia, UMBRAL_LECTURAS_CONSECUTIVAS };
