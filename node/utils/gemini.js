// Cliente para la API de Google Gemini (inteligencia artificial generativa),
// usado por el módulo de mitigación para obtener una recomendación de acción
// correctiva en lenguaje natural cuando una alerta se confirma (ver
// services/mitigacionService.js y sección 7.21 del perfil de grado).
//
// Se llama por REST directamente con axios (en vez de instalar el SDK
// oficial de Google) para no sumar una dependencia extra: el proyecto ya usa
// axios para otras cosas y la API de Gemini es un simple POST HTTP.
const axios = require('axios');

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Modelos a probar, en orden. Los más nuevos suelen estar saturados en el
// plan gratuito (responden 503 "high demand"), así que primero va uno
// liviano y rápido (unos 2-3 s) y después los demás como respaldo. Se puede
// cambiar la lista en .env con GEMINI_MODELOS, separados por comas.
const MODELOS_POR_DEFECTO = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];
const MODELOS = (process.env.GEMINI_MODELOS || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const LISTA_MODELOS = MODELOS.length ? MODELOS : MODELOS_POR_DEFECTO;

// Tiempo máximo de espera por modelo. Un modelo saturado responde el error
// en 1-3 s; este límite corta los casos en que la API se queda sin contestar.
// Los modelos "lite" responden en 1-3 s, así que si tardan más de 6 s
// conviene pasar al siguiente; los demás tardan entre 5 y 10 s.
const tiempoMaximo = (modelo) => (modelo.includes('lite') ? 6000 : 15000);

// Arma el prompt con el contexto exacto que pide el alcance del proyecto:
// el parámetro afectado, el valor registrado y el rango de referencia de la
// NB 512-04 (ver utils/thresholds.js).
function construirPrompt({ etiquetaParametro, valor, rangoTexto, ubicacion }) {
  return `Eres un asistente de apoyo para un equipo de mitigación que gestiona la calidad del agua en un punto de monitoreo comunitario en Bolivia (${ubicacion || 'ubicación no especificada'}).

Se detectó que el siguiente parámetro se mantiene fuera de rango durante varias lecturas consecutivas de un sensor IoT:

- Parámetro: ${etiquetaParametro}
- Valor registrado: ${valor}
- Rango aceptable (Norma Boliviana NB 512-04): ${rangoTexto}

Redacta una recomendación breve (máximo 120 palabras) de acción correctiva inicial que el equipo de mitigación podría tomar ante esta situación. Usa lenguaje claro y no técnico en exceso. Aclara al final, en una frase corta, que esta sugerencia es una orientación automatizada y no reemplaza el criterio de un especialista en tratamiento de agua.`;
}

// Una llamada a un modelo. Devuelve el texto o lanza un error con el motivo.
async function consultarModelo(modelo, prompt, apiKey) {
  const respuesta = await axios.post(
    `${URL_BASE}/${modelo}:generateContent`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      // Razonamiento bajo: para un texto corto como este no hace falta que el
      // modelo "piense" mucho, y la respuesta llega bastante más rápido.
      generationConfig: { thinkingConfig: { thinkingLevel: 'low' } },
    },
    // La clave va en un header y no en la URL, para que no quede escrita en
    // los registros de errores.
    { headers: { 'x-goog-api-key': apiKey }, timeout: tiempoMaximo(modelo) }
  );
  const candidato = respuesta.data?.candidates?.[0];
  const texto = (candidato?.content?.parts || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();
  if (!texto) {
    throw new Error(`respuesta sin texto (${candidato?.finishReason || 'sin candidatos'})`);
  }
  return texto;
}

// Devuelve el texto de la sugerencia, o null si la API no está configurada o
// todos los modelos fallan (el llamador decide qué texto de respaldo usar y
// si reintentar más tarde — no se lanza una excepción para no interrumpir el
// registro de la lectura/alerta, que es lo crítico del flujo).
async function generarRecomendacion(contexto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Gemini] GEMINI_API_KEY no está configurada; se omite la sugerencia automática.');
    return null;
  }

  const prompt = construirPrompt(contexto);
  const errores = [];
  for (const modelo of LISTA_MODELOS) {
    const inicio = Date.now();
    try {
      const texto = await consultarModelo(modelo, prompt, apiKey);
      console.log(`[Gemini] Sugerencia generada con ${modelo} en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
      return texto;
    } catch (err) {
      const estado = err.response?.status;
      const detalle =
        err.code === 'ECONNABORTED'
          ? `sin respuesta en ${tiempoMaximo(modelo) / 1000} s`
          : err.response?.data?.error?.message || err.message;
      const motivo = `${estado ? `${estado} ` : ''}${detalle.slice(0, 80)}`;
      errores.push(`${modelo}: ${motivo}`);
      console.warn(`[Gemini] ${modelo} falló (${motivo})`);
      // Una clave inválida o sin permisos falla igual con cualquier modelo.
      if (estado === 400 && /api key/i.test(detalle)) break;
      if (estado === 401 || estado === 403) break;
    }
  }
  console.error(`[Gemini] No se pudo generar la sugerencia: ${errores.join(' | ')}`);
  return null;
}

module.exports = { generarRecomendacion, LISTA_MODELOS };
