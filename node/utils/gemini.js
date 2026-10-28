// Cliente para la API de Google Gemini (inteligencia artificial generativa),
// usado por el módulo de mitigación para obtener una recomendación de acción
// correctiva en lenguaje natural cuando una alerta se confirma (ver
// services/mitigacionService.js y sección 7.21 del perfil de grado).
//
// Se llama por REST directamente con axios (en vez de instalar el SDK
// oficial de Google) para no sumar una dependencia extra: el proyecto ya usa
// axios para otras cosas y la API de Gemini es un simple POST HTTP.
const axios = require('axios');

const MODELO = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

// Devuelve el texto de la sugerencia, o null si la API no está configurada o
// falla (el llamador decide qué texto de respaldo usar — no se lanza una
// excepción para no interrumpir el registro de la lectura/alerta, que es lo
// crítico del flujo).
const REINTENTOS = 2; // intentos totales (1 inicial + 1 reintento)
const ESPERA_ENTRE_REINTENTOS_MS = 3000;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generarRecomendacion(contexto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Gemini] GEMINI_API_KEY no está configurada; se omite la sugerencia automática.');
    return null;
  }

  const prompt = construirPrompt(contexto);

  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      const respuesta = await axios.post(
        `${URL_BASE}/${MODELO}:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 15000 }
      );

      const texto = respuesta.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return texto ? texto.trim() : null;
    } catch (err) {
      const detalle = err.response?.data?.error?.message || err.message;
      const esUltimoIntento = intento === REINTENTOS;
      console.error(
        `[Gemini] Error al generar la recomendación (intento ${intento}/${REINTENTOS}):`,
        detalle
      );
      // Errores de modelo sobrecargado o rate-limit (503/429) suelen ser
      // pasajeros y vale la pena reintentar una vez; otros errores (clave
      // inválida, modelo inexistente) van a fallar igual en el reintento,
      // pero el costo de intentarlo de nuevo es bajo y no vale la pena
      // distinguir el tipo de error aquí.
      if (!esUltimoIntento) {
        await esperar(ESPERA_ENTRE_REINTENTOS_MS);
      }
    }
  }
  return null;
}

module.exports = { generarRecomendacion };
