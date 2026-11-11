// Conexión del backend con el servicio de aprendizaje automático (ml/):
//   - cada minuto, analiza las lecturas nuevas de cada sensor (clasificación
//     apta / en riesgo / no apta y detección de anomalías) y guarda el
//     resultado en `analisis_lecturas`;
//   - cada 15 minutos, pide el pronóstico a 3 horas de los sensores que están
//     enviando lecturas y lo guarda en `pronosticos`;
//   - las lecturas anómalas y los pronósticos fuera de la NB 512-04 generan
//     alertas preventivas (informativas, ver `alertas_preventivas`).
// Si el servicio no está levantado, los ciclos simplemente esperan al
// siguiente intento: el monitoreo y las alertas normativas siguen igual.
const db = require('../db');
const { cliente, servicioDisponible } = require('../utils/ml');

const INTERVALO_ANALISIS_MS = 60 * 1000;
const INTERVALO_PRONOSTICO_MS = 15 * 60 * 1000;
const LECTURAS_POR_PEDIDO = 2000;
// Una misma situación detectada otra vez dentro de este tiempo se acumula en
// la alerta preventiva existente en lugar de crear una nueva.
const MINUTOS_AGRUPAR = { anomalia: 30, pronostico: 60 };

const NOMBRES = { temperatura: 'temperatura', conductividad: 'conductividad', ph: 'pH', turbidez: 'turbidez' };
const listaParametros = (lista) => {
  const nombres = (lista || []).map((p) => NOMBRES[p] || p);
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0] || '';
};

const DESCRIPCION_ANOMALIA = {
  lectura_congelada: () => 'el sensor repite exactamente los mismos valores (posible falla del nodo o del sensor)',
  pico_aislado: (p) => `salto brusco de ${p} en una sola lectura (posible ruido o falla puntual del sensor)`,
  variacion_real: (p) => `cambio simultáneo de ${p} (posible cambio real en la calidad del agua)`,
  deriva: (p) => `${p} se aleja de a poco de su nivel habitual (posible descalibración del sensor)`,
  atipica: (p) => `comportamiento inusual${p ? ` de ${p}` : ''} en las lecturas`,
};

// Estado de los ciclos, para mostrarlo en la página de Análisis.
const estado = { ultimoAnalisis: null, ultimoPronostico: null, ultimoError: null, servicio: null };
const ultimoAnalizado = new Map(); // sensor_id -> id de la última lectura analizada

async function registrarAlertaPreventiva({ sensorId, origen, tipo, parametros, lecturaId, valor, fechaPrevista, descripcion, fecha, cantidad = 1 }) {
  const [existentes] = await db.query(
    `SELECT id FROM alertas_preventivas
     WHERE sensor_id = ? AND origen = ? AND tipo = ? AND ultima_deteccion >= ? - INTERVAL ? MINUTE
     ORDER BY id DESC LIMIT 1`,
    [sensorId, origen, tipo, fecha, MINUTOS_AGRUPAR[origen]]
  );
  if (existentes.length > 0) {
    await db.query(
      `UPDATE alertas_preventivas
       SET ultima_deteccion = ?, detecciones = detecciones + ?, descripcion = ?, valor = ?, fecha_prevista = ?,
           lectura_id = COALESCE(?, lectura_id), parametros = ?
       WHERE id = ?`,
      [fecha, cantidad, descripcion, valor, fechaPrevista, lecturaId, parametros, existentes[0].id]
    );
    return;
  }
  await db.query(
    `INSERT INTO alertas_preventivas
       (sensor_id, origen, tipo, parametros, lectura_id, valor, fecha_prevista, descripcion, creada_en, ultima_deteccion, detecciones)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sensorId, origen, tipo, parametros, lecturaId, valor, fechaPrevista, descripcion, fecha, fecha, cantidad]
  );
}

// Primera vez que se analiza un sensor: se retoma donde quedó el análisis
// anterior o, si nunca se analizó, se empieza por la última hora (no todo el
// historial).
async function idInicial(sensorId) {
  const [[analizado]] = await db.query('SELECT MAX(lectura_id) AS id FROM analisis_lecturas WHERE sensor_id = ?', [sensorId]);
  if (analizado.id) return analizado.id;
  const [[previa]] = await db.query(
    'SELECT MAX(id) AS id FROM lecturas WHERE sensor_id = ? AND fecha_hora < NOW() - INTERVAL 1 HOUR',
    [sensorId]
  );
  return previa.id || 0;
}

async function guardarAnalisis(sensorId, resultados) {
  const filas = resultados.map((r) => {
    const c = r.clasificacion || {};
    const a = r.anomalia || {};
    return [
      r.lectura_id,
      sensorId,
      new Date(r.fecha_hora),
      c.clase || null,
      c.clase_modelo || null,
      c.probabilidad_apta ?? null,
      c.cumple_nb512 === undefined ? null : c.cumple_nb512 ? 1 : 0,
      a.puntaje ?? null,
      a.es_anomalia ? 1 : 0,
      a.tipo || null,
      a.parametros && a.parametros.length ? a.parametros.join(',') : null,
    ];
  });
  await db.query(
    `INSERT INTO analisis_lecturas
       (lectura_id, sensor_id, fecha_hora, clase, clase_modelo, probabilidad_apta, cumple_nb512,
        puntaje_anomalia, es_anomalia, tipo_anomalia, parametros_anomalia)
     VALUES ?
     ON DUPLICATE KEY UPDATE clase = VALUES(clase), clase_modelo = VALUES(clase_modelo),
       probabilidad_apta = VALUES(probabilidad_apta), cumple_nb512 = VALUES(cumple_nb512),
       puntaje_anomalia = VALUES(puntaje_anomalia), es_anomalia = VALUES(es_anomalia),
       tipo_anomalia = VALUES(tipo_anomalia), parametros_anomalia = VALUES(parametros_anomalia)`,
    [filas]
  );

  // Una alerta preventiva por cada causa de anomalía del lote (la más reciente),
  // contando cuántas lecturas anómalas de esa causa hubo.
  const porTipo = new Map();
  for (const r of resultados) {
    if (r.anomalia && r.anomalia.es_anomalia) {
      const previo = porTipo.get(r.anomalia.tipo);
      porTipo.set(r.anomalia.tipo, { ultima: r, cantidad: (previo ? previo.cantidad : 0) + 1 });
    }
  }
  for (const [tipo, { ultima, cantidad }] of porTipo) {
    const describir = DESCRIPCION_ANOMALIA[tipo] || DESCRIPCION_ANOMALIA.atipica;
    await registrarAlertaPreventiva({
      sensorId,
      origen: 'anomalia',
      tipo,
      parametros: ultima.anomalia.parametros.join(',') || null,
      lecturaId: ultima.lectura_id,
      valor: ultima.anomalia.puntaje,
      fechaPrevista: null,
      descripcion: `Lectura anómala: ${describir(listaParametros(ultima.anomalia.parametros))}.`,
      fecha: new Date(ultima.fecha_hora),
      cantidad,
    });
  }
}

async function analizarSensor(sensorId) {
  if (!ultimoAnalizado.has(sensorId)) ultimoAnalizado.set(sensorId, await idInicial(sensorId));
  // Hasta 5 pedidos por ciclo para ponerse al día si se acumularon lecturas.
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const { data } = await cliente.post('/analizar', {
      sensor_id: sensorId,
      desde_id: ultimoAnalizado.get(sensorId),
      limite: LECTURAS_POR_PEDIDO,
    });
    if (data.resultados.length === 0) break;
    await guardarAnalisis(sensorId, data.resultados);
    ultimoAnalizado.set(sensorId, data.ultimo_id);
    if (data.resultados.length < LECTURAS_POR_PEDIDO) break;
  }
}

async function pronosticarSensor(sensorId) {
  const { data } = await cliente.post('/pronosticar', { sensor_id: sensorId });
  const generado = new Date(data.generado_en);
  for (const [parametro, pronostico] of Object.entries(data.pronosticos)) {
    await db.query(
      'INSERT INTO pronosticos (sensor_id, parametro, metodo, generado_en, puntos, fuera_de_rango) VALUES (?, ?, ?, ?, ?, ?)',
      [sensorId, parametro, pronostico.metodo, generado, JSON.stringify(pronostico.puntos), pronostico.fuera_de_rango ? JSON.stringify(pronostico.fuera_de_rango) : null]
    );
    const fuera = pronostico.fuera_de_rango;
    if (fuera) {
      const hora = new Date(fuera.fecha_hora).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
      await registrarAlertaPreventiva({
        sensorId,
        origen: 'pronostico',
        tipo: parametro,
        parametros: parametro,
        lecturaId: null,
        valor: fuera.valor,
        fechaPrevista: new Date(fuera.fecha_hora),
        descripcion: `Pronóstico: se prevé que ${NOMBRES[parametro] || parametro} llegue a ${fuera.valor} alrededor de las ${hora} (límite NB 512-04: ${fuera.limite}).`,
        fecha: generado,
      });
    }
  }
}

// Ejecuta `tarea` sin que se superponga consigo misma si una vuelta tarda
// más que el intervalo.
function cicloSinSuperposicion(nombre, tarea) {
  let ocupado = false;
  return async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      estado.servicio = await servicioDisponible();
      if (estado.servicio) await tarea();
    } catch (err) {
      estado.ultimoError = { ciclo: nombre, mensaje: err.response?.data?.detail || err.message, fecha: new Date() };
      console.error(`[ML] Error en el ciclo de ${nombre}:`, estado.ultimoError.mensaje);
    } finally {
      ocupado = false;
    }
  };
}

const cicloAnalisis = cicloSinSuperposicion('análisis', async () => {
  const [sensores] = await db.query('SELECT id FROM sensores');
  for (const { id } of sensores) {
    await analizarSensor(id);
  }
  estado.ultimoAnalisis = new Date();
});

const cicloPronostico = cicloSinSuperposicion('pronóstico', async () => {
  const [activos] = await db.query('SELECT DISTINCT sensor_id FROM lecturas WHERE fecha_hora >= NOW() - INTERVAL 1 HOUR');
  for (const { sensor_id: sensorId } of activos) {
    await pronosticarSensor(sensorId);
  }
  await db.query('DELETE FROM pronosticos WHERE generado_en < NOW() - INTERVAL 7 DAY');
  estado.ultimoPronostico = new Date();
});

function iniciarAnalisisML() {
  if (process.env.ML_URL === 'desactivado') {
    console.log('[ML] Análisis con aprendizaje automático desactivado (ML_URL=desactivado)');
    return;
  }
  setTimeout(cicloAnalisis, 10 * 1000);
  setTimeout(cicloPronostico, 20 * 1000);
  setInterval(cicloAnalisis, INTERVALO_ANALISIS_MS);
  setInterval(cicloPronostico, INTERVALO_PRONOSTICO_MS);
  console.log('[ML] Ciclos de análisis (cada 1 min) y pronóstico (cada 15 min) iniciados');
}

module.exports = { iniciarAnalisisML, estado };
