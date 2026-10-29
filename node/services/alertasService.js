const db = require('../db');
const { rangoTexto } = require('../utils/thresholds');

// Consultas compartidas por las rutas de alertas (routes/alertas.js) y por el
// aviso por correo al jefe del equipo asignado (services/mitigacionService.js).

const nombreCompleto = (nombre, apellido) => (nombre ? `${nombre} ${apellido || ''}`.trim() : null);

// Ids de los equipos de mitigación que encabeza un usuario (rol equipo_mitigacion).
async function equiposDelJefe(usuarioId) {
  const [rows] = await db.query('SELECT id FROM equipos_mitigacion WHERE jefe_id = ?', [usuarioId]);
  return rows.map((r) => r.id);
}

// Alerta con todo lo que se muestra en su detalle: sensor, propietario de la
// vivienda, sugerencia de mitigación, equipo asignado (jefe y miembros) y
// quién la asignó o mitigó. Devuelve null si la alerta no existe.
async function obtenerDetalleAlerta(id) {
  const [rows] = await db.query(
    `SELECT a.*,
            s.n_serie, s.ubicacion, s.descripcion AS sensor_descripcion, s.latitud, s.longitud,
            s.propietario_nombre, s.propietario_ci, s.propietario_telefono, s.propietario_direccion,
            s.propietario_nro_casa, s.telefono_emergencia,
            m.sugerencia,
            e.nombre AS equipo_nombre, e.jefe_id,
            uj.nombre AS jefe_nombre, uj.apellido AS jefe_apellido, uj.email AS jefe_email, uj.telefono AS jefe_telefono,
            ua.nombre AS asignado_por_nombre, ua.apellido AS asignado_por_apellido,
            um.nombre AS mitigado_por_nombre, um.apellido AS mitigado_por_apellido
     FROM alertas a
     JOIN sensores s ON s.id = a.sensor_id
     LEFT JOIN sugerencias_mitigacion m ON m.alerta_id = a.id
     LEFT JOIN equipos_mitigacion e ON e.id = a.equipo_id
     LEFT JOIN usuarios uj ON uj.id = e.jefe_id
     LEFT JOIN usuarios ua ON ua.id = a.asignado_por
     LEFT JOIN usuarios um ON um.id = a.mitigado_por
     WHERE a.id = ?
     LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];

  let miembros = [];
  if (r.equipo_id) {
    [miembros] = await db.query('SELECT nombre, telefono FROM miembros_equipo WHERE equipo_id = ? ORDER BY id', [r.equipo_id]);
  }
  const [fotos] = await db.query('SELECT tipo FROM fotos_mitigacion WHERE alerta_id = ?', [id]);

  return {
    alerta: {
      id: r.id,
      parametro: r.parametro,
      valor: r.valor,
      descripcion: r.descripcion,
      fecha_hora: r.fecha_hora,
      estado: r.estado,
      // Rango vigente de la NB 512-04 (utils/thresholds.js), no el que se
      // usaba cuando se generó la alerta.
      rango_referencia: rangoTexto(r.parametro),
      sugerencia: r.sugerencia,
      equipo_id: r.equipo_id,
      instrucciones: r.instrucciones,
      asignado_por: nombreCompleto(r.asignado_por_nombre, r.asignado_por_apellido),
      asignado_en: r.asignado_en,
      correo_enviado: r.correo_enviado,
      whatsapp_enviado: r.whatsapp_enviado,
      mitigado_por: nombreCompleto(r.mitigado_por_nombre, r.mitigado_por_apellido),
      mitigado_en: r.mitigado_en,
      observacion_mitigacion: r.observacion_mitigacion,
      // Tipos de foto de evidencia subidos ('equipo', 'casa', 'trabajo');
      // cada una se descarga aparte desde GET /api/alertas/:id/fotos/:tipo.
      fotos: fotos.map((f) => f.tipo),
    },
    sensor: {
      id: r.sensor_id,
      n_serie: r.n_serie,
      ubicacion: r.ubicacion,
      descripcion: r.sensor_descripcion,
      latitud: r.latitud,
      longitud: r.longitud,
    },
    propietario: r.propietario_nombre
      ? {
          nombre: r.propietario_nombre,
          ci: r.propietario_ci,
          telefono: r.propietario_telefono,
          direccion: r.propietario_direccion,
          nro_casa: r.propietario_nro_casa,
          telefono_emergencia: r.telefono_emergencia,
        }
      : null,
    equipo: r.equipo_id
      ? {
          id: r.equipo_id,
          nombre: r.equipo_nombre,
          jefe: nombreCompleto(r.jefe_nombre, r.jefe_apellido),
          jefe_email: r.jefe_email,
          jefe_telefono: r.jefe_telefono,
          miembros,
        }
      : null,
  };
}

// Las demás alertas del mismo sensor, separadas en pendientes (todavía sin
// mitigar, asignadas o no) y mitigadas, las más recientes primero.
async function historialDelSensor(sensorId, excluirAlertaId) {
  const consulta = (condicionEstado) =>
    db.query(
      `SELECT a.id, a.parametro, a.valor, a.fecha_hora, a.estado, a.equipo_id, a.mitigado_en,
              e.nombre AS equipo_nombre
       FROM alertas a
       LEFT JOIN equipos_mitigacion e ON e.id = a.equipo_id
       WHERE a.sensor_id = ? AND a.id <> ? AND ${condicionEstado}
       ORDER BY a.fecha_hora DESC
       LIMIT 50`,
      [sensorId, excluirAlertaId]
    );

  const [[pendientes], [mitigadas]] = await Promise.all([
    consulta("a.estado <> 'mitigada'"),
    consulta("a.estado = 'mitigada'"),
  ]);
  return { pendientes, mitigadas };
}

const ESTADOS = ['pendiente', 'asignada', 'mitigada'];
const PARAMETROS = ['ph', 'turbidez', 'conductividad'];
const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

// Condiciones SQL (sobre el alias `a` de alertas) para los filtros del
// historial de alertas y de los reportes: sensor, estado, parámetro y rango
// de fechas (YYYY-MM-DD, ambos extremos incluidos). Los valores no válidos
// se ignoran.
function construirFiltrosAlertas({ sensor_id, estado, parametro, desde, hasta }) {
  const condiciones = [];
  const params = [];
  if (Number(sensor_id)) {
    condiciones.push('a.sensor_id = ?');
    params.push(Number(sensor_id));
  }
  if (ESTADOS.includes(estado)) {
    condiciones.push('a.estado = ?');
    params.push(estado);
  }
  if (PARAMETROS.includes(parametro)) {
    condiciones.push('a.parametro = ?');
    params.push(parametro);
  }
  if (FECHA_VALIDA.test(desde || '')) {
    condiciones.push('a.fecha_hora >= ?');
    params.push(`${desde} 00:00:00`);
  }
  if (FECHA_VALIDA.test(hasta || '')) {
    condiciones.push('a.fecha_hora <= ?');
    params.push(`${hasta} 23:59:59`);
  }
  return { condiciones, params };
}

module.exports = { equiposDelJefe, obtenerDetalleAlerta, historialDelSensor, construirFiltrosAlertas, FECHA_VALIDA };
