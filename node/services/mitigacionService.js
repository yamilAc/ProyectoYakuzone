// Módulo de mitigación (objetivo 9 del alcance / sección 7.21 del perfil):
// cuando el módulo de alertas confirma que un parámetro se mantiene fuera
// de rango, se consulta la API de Gemini para obtener una recomendación de
// acción correctiva, se guarda como sugerencia (pendiente/atendida) y se
// notifica por correo al equipo de mitigación.
const db = require('../db');
const { ETIQUETAS, rangoTexto } = require('../utils/thresholds');
const { generarRecomendacion } = require('../utils/gemini');
const { enviarCorreo } = require('../utils/mailer');

// Texto de respaldo si la API de Gemini no está configurada o falla, para
// que la sugerencia igual quede registrada (con estado pendiente) y el
// equipo de mitigación sepa que hay que revisarla manualmente.
function sugerenciaDeRespaldo({ etiquetaParametro, valor, rango }) {
  return `No se pudo generar una recomendación automática en este momento. Revisar manualmente: ${etiquetaParametro} = ${valor} (rango aceptable: ${rango}).`;
}

// Se llama desde services/lecturasService.js, sin bloquear el registro de la
// lectura/alerta (ver el comentario en ese archivo) — un fallo aquí (Gemini
// caído, SMTP mal configurado, etc.) no debe impedir que la lectura y la
// alerta queden guardadas, que es lo crítico del flujo de ingesta.
async function generarSugerencia({ alertaId, sensorId, parametro, valor }) {
  const etiquetaParametro = ETIQUETAS[parametro] || parametro;
  const rango = rangoTexto(parametro);

  const [sensores] = await db.query('SELECT ubicacion FROM sensores WHERE id = ?', [sensorId]);
  const ubicacion = sensores[0]?.ubicacion || null;

  let sugerenciaTexto = await generarRecomendacion({ etiquetaParametro, valor, rangoTexto: rango, ubicacion });
  if (!sugerenciaTexto) {
    sugerenciaTexto = sugerenciaDeRespaldo({ etiquetaParametro, valor, rango });
  }

  const [resultado] = await db.query(
    `INSERT INTO sugerencias_mitigacion (alerta_id, sensor_id, parametro, valor, rango_referencia, sugerencia)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [alertaId, sensorId, parametro, valor, rango, sugerenciaTexto]
  );
  const sugerenciaId = resultado.insertId;

  const correoEnviado = await notificarEquipoMitigacion({
    etiquetaParametro,
    valor,
    rango,
    ubicacion,
    sugerenciaTexto,
  });

  if (correoEnviado) {
    await db.query('UPDATE sugerencias_mitigacion SET correo_enviado = 1 WHERE id = ?', [sugerenciaId]);
  }

  return sugerenciaId;
}

// Envía la sugerencia por correo a todos los usuarios con rol
// 'equipo_mitigacion'. Devuelve true si se pudo enviar a al menos uno.
async function notificarEquipoMitigacion({ etiquetaParametro, valor, rango, ubicacion, sugerenciaTexto }) {
  const [usuarios] = await db.query("SELECT email, nombre FROM usuarios WHERE rol = 'equipo_mitigacion'");
  if (usuarios.length === 0) {
    console.warn('[Mitigación] No hay usuarios con rol "equipo_mitigacion" registrados; no se envía correo.');
    return false;
  }

  const asunto = `Yakuzone — Nueva sugerencia de mitigación (${etiquetaParametro})`;
  const html = `
    <p>Se generó una nueva sugerencia de mitigación para el punto de monitoreo <strong>${ubicacion || 'sin ubicación registrada'}</strong>.</p>
    <ul>
      <li><strong>Parámetro afectado:</strong> ${etiquetaParametro}</li>
      <li><strong>Valor registrado:</strong> ${valor}</li>
      <li><strong>Rango aceptable (NB 512-04):</strong> ${rango}</li>
    </ul>
    <p><strong>Recomendación:</strong><br/>${sugerenciaTexto.replace(/\n/g, '<br/>')}</p>
    <p style="color:#888;font-size:12px;">Esta sugerencia es una orientación inicial automatizada y no reemplaza el criterio profesional de un especialista en tratamiento de agua. Puedes revisarla y marcarla como atendida desde el apartado de Mitigación en la plataforma.</p>
  `;

  const resultados = await Promise.all(
    usuarios.map((u) => enviarCorreo({ to: u.email, subject: asunto, html }))
  );
  return resultados.some(Boolean);
}

module.exports = { generarSugerencia };
