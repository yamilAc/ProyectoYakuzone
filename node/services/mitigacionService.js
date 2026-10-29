// Módulo de mitigación (objetivo 9 del alcance / sección 7.21 del perfil):
// cuando el módulo de alertas confirma que un parámetro se mantiene fuera
// de rango, se consulta la API de Gemini para obtener una recomendación de
// acción correctiva y se guarda como sugerencia de la alerta. Cuando un
// administrador o empleado asigna la alerta a un equipo de mitigación (desde
// Notificaciones), se avisa solo al jefe de ese equipo, por correo y por WhatsApp.
const db = require('../db');
const { ETIQUETAS, UMBRALES, rangoTexto } = require('../utils/thresholds');
const { generarRecomendacion } = require('../utils/gemini');
const { enviarCorreo, escaparHtml } = require('../utils/mailer');
const { enviarPlantilla, enlaceWhatsapp } = require('../utils/whatsapp');
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

const valorConUnidad = (alerta) => `${Number(alerta.valor)}${(UMBRALES[alerta.parametro] || {}).unidad || ''}`;
const direccionCompleta = (propietario) =>
  propietario
    ? [propietario.direccion, propietario.nro_casa && `Casa Nº ${propietario.nro_casa}`].filter(Boolean).join(' · ')
    : null;

// Mensaje de WhatsApp de una alerta asignada, para el enlace "click to chat"
// (el envío automático usa la plantilla aprobada en Meta, ver avisarPorWhatsapp).
function textoWhatsapp({ alerta, sensor, propietario, equipo }) {
  return [
    '*Yakuzone - Alerta asignada a tu equipo*',
    `Equipo: ${equipo.nombre}`,
    `Sensor: ${sensor.n_serie}${sensor.ubicacion ? ` (${sensor.ubicacion})` : ''}`,
    `${ETIQUETAS[alerta.parametro] || alerta.parametro}: ${valorConUnidad(alerta)} (rango aceptable NB 512: ${alerta.rango_referencia})`,
    propietario ? `Dirección: ${direccionCompleta(propietario)}` : 'El sensor no tiene datos del propietario registrados.',
    propietario ? `Propietario: ${propietario.nombre} · Tel. ${propietario.telefono}` : null,
    propietario && propietario.telefono_emergencia ? `Teléfono de emergencia: ${propietario.telefono_emergencia}` : null,
    alerta.instrucciones ? `Instrucciones: ${alerta.instrucciones}` : null,
    'Ingresa a Yakuzone > Notificaciones para ver el detalle y registrar la mitigación con sus 3 fotos.',
  ]
    .filter(Boolean)
    .join('\n');
}

// Enlace que abre WhatsApp con el mensaje listo para el jefe del equipo, o
// null si la alerta no está asignada o el jefe no tiene teléfono.
function enlaceAsignacion(detalle) {
  if (!detalle.equipo || !detalle.equipo.jefe_telefono) return null;
  return enlaceWhatsapp(detalle.equipo.jefe_telefono, textoWhatsapp(detalle));
}

// Envío automático por la WhatsApp Cloud API. Los parámetros siguen el orden
// de las variables de la plantilla "alerta_asignada" (ver README).
function avisarPorWhatsapp({ alerta, sensor, propietario, equipo }) {
  if (!equipo.jefe_telefono) {
    console.warn(`[Mitigación] El jefe del equipo ${equipo.nombre} no tiene teléfono registrado; no se envía WhatsApp.`);
    return Promise.resolve(false);
  }
  return enviarPlantilla({
    telefono: equipo.jefe_telefono,
    parametros: [
      equipo.nombre,
      sensor.n_serie,
      ETIQUETAS[alerta.parametro] || alerta.parametro,
      valorConUnidad(alerta),
      alerta.rango_referencia,
      direccionCompleta(propietario) || 'sin registrar',
      propietario ? propietario.nombre : 'sin registrar',
      propietario ? propietario.telefono : 'sin registrar',
    ],
  });
}

// Avisa al jefe del equipo al que se acaba de asignar la alerta, por correo
// y por WhatsApp, con lo necesario para ir a atenderla: parámetro y valor,
// ubicación, datos del propietario, instrucciones de quien asignó y la
// sugerencia de la IA. Devuelve { correo, whatsapp } (true si cada aviso
// salió) y lo deja registrado en la alerta.
async function notificarAsignacion(alertaId) {
  const detalle = await obtenerDetalleAlerta(alertaId);
  if (!detalle || !detalle.equipo) {
    console.warn(`[Mitigación] La alerta ${alertaId} no está asignada a un equipo; no se envía aviso.`);
    return { correo: false, whatsapp: false };
  }

  const [correo, whatsapp] = await Promise.all([
    avisarPorCorreo(detalle),
    avisarPorWhatsapp(detalle).catch((err) => {
      console.error('[Mitigación] Error al avisar por WhatsApp:', err.message);
      return false;
    }),
  ]);
  await db.query('UPDATE alertas SET correo_enviado = ?, whatsapp_enviado = ? WHERE id = ?', [correo ? 1 : 0, whatsapp ? 1 : 0, alertaId]);
  return { correo, whatsapp };
}

// Correo HTML al jefe del equipo con todos los datos de la alerta.
async function avisarPorCorreo(detalle) {
  const { alerta, sensor, propietario, equipo } = detalle;
  if (!equipo.jefe_email) {
    console.warn(`[Mitigación] El equipo ${equipo.nombre} no tiene un jefe con correo; no se envía correo.`);
    return false;
  }
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

  return enviarCorreo({ to: equipo.jefe_email, subject: asunto, html });
}

module.exports = { generarSugerencia, notificarAsignacion, enlaceAsignacion };
