// Envío de correos por SMTP (Nodemailer), usado para avisar al jefe de un
// equipo de mitigación cuando se le asigna una alerta (ver
// services/mitigacionService.js y sección 7.21.3 del perfil de grado).
const nodemailer = require('nodemailer');

let transportador = null;

// El transportador se crea una sola vez y se reutiliza (perezosamente, la
// primera vez que se necesita) en vez de en cada envío.
function obtenerTransportador() {
  if (transportador) return transportador;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  transportador = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true para el puerto 465, false (STARTTLS) para 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // La asignación de una alerta espera el resultado del envío para avisar
    // en pantalla si el correo salió; con un SMTP caído no debe quedarse
    // esperando los 2 minutos que trae Nodemailer por defecto.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transportador;
}

// Envía un correo. Si el SMTP no está configurado (todavía) en .env, no
// lanza error: solo avisa por consola y devuelve false, para no romper el
// flujo de alertas/mitigación mientras se termina de configurar el correo.
async function enviarCorreo({ to, subject, html, text }) {
  const t = obtenerTransportador();
  if (!t) {
    console.warn('[Mailer] SMTP no configurado (revisa SMTP_HOST/SMTP_USER/SMTP_PASS en .env); correo no enviado.');
    return false;
  }
  if (!to) {
    console.warn('[Mailer] No hay destinatario; correo no enviado.');
    return false;
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || SMTP_USER_FALLBACK(),
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error('[Mailer] Error al enviar correo:', err.message);
    return false;
  }
}

function SMTP_USER_FALLBACK() {
  return process.env.SMTP_USER;
}

// Escapa texto cargado por usuarios (nombres, direcciones, instrucciones)
// antes de insertarlo en el HTML de un correo.
function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { enviarCorreo, escaparHtml };
