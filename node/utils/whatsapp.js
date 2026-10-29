// Avisos por WhatsApp con la WhatsApp Cloud API de Meta (oficial), usados
// para avisar al jefe del equipo de mitigación cuando se le asigna una
// alerta (ver services/mitigacionService.js y la sección "Avisos por
// WhatsApp" del README).
//
// La API solo permite iniciar una conversación con una plantilla aprobada
// por Meta; su nombre e idioma se configuran en .env. Si la API no está
// configurada no se lanza error: se avisa por consola y la plataforma
// ofrece el enlace "click to chat" (enlaceWhatsapp) como respaldo.
const axios = require('axios');

const VERSION_API = process.env.WHATSAPP_API_VERSION || 'v23.0';

// Número en formato internacional, sin "+" ni espacios (lo que piden la API
// y los enlaces wa.me). Los celulares bolivianos de 8 dígitos llevan el 591.
function normalizarTelefono(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.length === 8 ? `591${digitos}` : digitos;
}

// Los parámetros de una plantilla no pueden estar vacíos ni tener saltos de
// línea, tabulaciones o más de 4 espacios seguidos.
const parametroPlantilla = (texto) => ({
  type: 'text',
  text:
    String(texto ?? '')
      .replace(/[\n\t]+/g, ' ')
      .replace(/ {4,}/g, '   ')
      .trim()
      .slice(0, 200) || '—',
});

// Envía la plantilla configurada al teléfono indicado, con los parámetros en
// el orden de sus variables {{1}}, {{2}}, ... Devuelve true si Meta aceptó
// el mensaje.
async function enviarPlantilla({ telefono, parametros }) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('[WhatsApp] API no configurada (revisa WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en .env); mensaje no enviado.');
    return false;
  }
  const numero = normalizarTelefono(telefono);
  if (!numero) {
    console.warn('[WhatsApp] El destinatario no tiene teléfono registrado; mensaje no enviado.');
    return false;
  }

  try {
    await axios.post(
      `https://graph.facebook.com/${VERSION_API}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: numero,
        type: 'template',
        template: {
          name: process.env.WHATSAPP_TEMPLATE || 'alerta_asignada',
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'es' },
          components: [{ type: 'body', parameters: parametros.map(parametroPlantilla) }],
        },
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 10000 }
    );
    return true;
  } catch (err) {
    console.error('[WhatsApp] Error al enviar el mensaje:', err.response?.data?.error?.message || err.message);
    return false;
  }
}

// Enlace "click to chat": abre WhatsApp (web o celular) con el número y el
// mensaje ya escritos; quien asignó la alerta solo tiene que pulsar Enviar.
function enlaceWhatsapp(telefono, texto) {
  const numero = normalizarTelefono(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null;
}

module.exports = { enviarPlantilla, enlaceWhatsapp, normalizarTelefono };
