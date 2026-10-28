// Envío de correos por SMTP (Nodemailer), usado por el módulo de mitigación
// para notificar al equipo de mitigación cuando se genera una sugerencia
// (ver sección 7.21.3 del perfil de grado).
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

module.exports = { enviarCorreo };
