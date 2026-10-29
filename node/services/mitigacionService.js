// Módulo de mitigación (objetivo 9 del alcance / sección 7.21 del perfil):
// cuando el módulo de alertas confirma que un parámetro se mantiene fuera
// de rango, se consulta la API de Gemini para obtener una recomendación de
// acción correctiva y se guarda como sugerencia de la alerta. Cuando un
// administrador o empleado asigna la alerta a un equipo de mitigación (desde
// Notificaciones), se avisa por correo solo al jefe de ese equipo.
const db = require('../db');
const { ETIQUETAS, rangoTexto } = require('../utils/thresholds');
const { generarRecomendacion } = require('../utils/gemini');
const { enviarCorreo, escaparHtml } = require('../utils/mailer');
const { obtenerDetalleAlerta } = require('./alertasService');

// Texto de respaldo si la API de Gemini no está configurada o falla, para
// que la sugerencia igual quede registrada y el equipo de mitigación sepa
// que hay que revisar la alerta manualmente.
function sugerenciaDeRespaldo({ etiquetaParametro, valor, rango }) {
  return `No se pudo generar una recomendación automática en este momento. Revisar manualmente: ${etiquetaParametro} = ${valor} (rango aceptable: ${rango}).`;
}

// Se llama desde services/lecturasService.js, sin bloquear el registro de la
// lectura/alerta (ver el comentario en ese archivo) — un fallo aquí (Gemini
// caído, etc.) no debe impedir que la lectura y la alerta queden guardadas,
// que es lo crítico del flujo de ingesta.
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
  return resultado.insertId;
}

// Avisa por correo al jefe del equipo al que se acaba de asignar la alerta,
// con lo necesario para ir a atenderla: parámetro y valor, ubicación,
// datos del propietario, instrucciones de quien asignó y la sugerencia de la
// IA. Devuelve true si el correo salió (y lo deja registrado en la alerta).
async function notificarAsignacion(alertaId) {
  const detalle = await obtenerDetalleAlerta(alertaId);
  if (!detalle || !detalle.equipo || !detalle.equipo.jefe_email) {
    console.warn(`[Mitigación] La alerta ${alertaId} no tiene un jefe de equipo con correo; no se envía aviso.`);
    return false;
  }

  const { alerta, sensor, propietario, equipo } = detalle;
  const etiquetaParametro = ETIQUETAS[alerta.parametro] || alerta.parametro;
  const fila = (titulo, valor) => (valor ? `<li><strong>${titulo}:</strong> ${escaparHtml(valor)}</li>` : '');

  const asunto = `Yakuzone — Alerta asignada a tu equipo: ${etiquetaParametro} en ${sensor.n_serie}`;
  const html = `
    <p>Hola ${escaparHtml(equipo.jefe)},</p>
    <p>Se asignó al equipo <strong>${escaparHtml(equipo.nombre)}</strong> una alerta de calidad del agua del sensor <strong>${escaparHtml(sensor.n_serie)}</strong>.</p>
    <p><strong>Alerta</strong></p>
    <ul>
      ${fila('Parámetro afectado', etiquetaParametro)}
      ${fila('Valor registrado', alerta.valor)}
      ${fila('Rango aceptable (NB 512-04)', alerta.rango_referencia)}
      ${fila('Fecha y hora', new Date(alerta.fecha_hora).toLocaleString('es-BO'))}
    </ul>
    <p><strong>Dónde y a quién contactar</strong></p>
    <ul>
      ${fila('Ubicación del sensor', sensor.ubicacion)}
      ${fila('Dirección', propietario && propietario.direccion)}
      ${fila('Nro. de casa', propietario && propietario.nro_casa)}
      ${fila('Propietario', propietario && propietario.nombre)}
      ${fila('Teléfono', propietario && propietario.telefono)}
      ${fila('Teléfono de emergencia', propietario && propietario.telefono_emergencia)}
    </ul>
    ${propietario ? '' : '<p>El sensor todavía no tiene registrados los datos del propietario.</p>'}
    ${alerta.instrucciones ? `<p><strong>Instrucciones (${escaparHtml(alerta.asignado_por)}):</strong><br/>${escaparHtml(alerta.instrucciones)}</p>` : ''}
    ${alerta.sugerencia ? `<p><strong>Sugerencia de mitigación (IA):</strong><br/>${escaparHtml(alerta.sugerencia).replace(/\n/g, '<br/>')}</p>` : ''}
    <p style="color:#888;font-size:12px;">Ingresa a Yakuzone, sección Notificaciones, para ver el detalle y marcar la alerta como mitigada cuando tu equipo termine. La sugerencia de la IA es una orientación inicial automatizada y no reemplaza el criterio profesional de un especialista en tratamiento de agua.</p>
  `;

  const enviado = await enviarCorreo({ to: equipo.jefe_email, subject: asunto, html });
  if (enviado) {
    await db.query('UPDATE alertas SET correo_enviado = 1 WHERE id = ?', [alertaId]);
  }
  return enviado;
}

module.exports = { generarSugerencia, notificarAsignacion };
