const path = require('path');
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { equiposDelJefe, obtenerDetalleAlerta, historialDelSensor } = require('../services/alertasService');
const { notificarAsignacion, enlaceAsignacion } = require('../services/mitigacionService');
const { CARPETA_FOTOS, TIPOS_FOTO, recibirFotos, borrarArchivos, esImagenValida } = require('../utils/subidas');

router.use(authenticate);

const ESTADOS = ['pendiente', 'asignada', 'mitigada'];

// El jefe de un equipo de mitigación (rol equipo_mitigacion) solo ve las
// alertas asignadas a los equipos que encabeza; administradores y empleados
// ven todas.
const FILTRO_JEFE = 'a.equipo_id IN (SELECT id FROM equipos_mitigacion WHERE jefe_id = ?)';
const esJefe = (req) => req.user.rol === 'equipo_mitigacion';

// GET /api/alertas?estado=pendiente|asignada|mitigada&sensor_id=N (ambos
// opcionales) - alertas más recientes primero.
router.get('/', async (req, res) => {
  const { estado, sensor_id } = req.query;
  const condiciones = [];
  const params = [];
  if (esJefe(req)) {
    condiciones.push(FILTRO_JEFE);
    params.push(req.user.id);
  }
  if (ESTADOS.includes(estado)) {
    condiciones.push('a.estado = ?');
    params.push(estado);
  }
  if (sensor_id) {
    condiciones.push('a.sensor_id = ?');
    params.push(sensor_id);
  }

  try {
    const [rows] = await db.query(
      `SELECT a.id, a.sensor_id, a.parametro, a.valor, a.descripcion, a.fecha_hora, a.estado,
              a.equipo_id, a.asignado_en, a.mitigado_en,
              s.n_serie AS numero_serie, s.ubicacion, s.propietario_nombre, e.nombre AS equipo_nombre,
              (SELECT COUNT(*) FROM fotos_mitigacion f WHERE f.alerta_id = a.id) AS fotos
       FROM alertas a
       JOIN sensores s ON s.id = a.sensor_id
       LEFT JOIN equipos_mitigacion e ON e.id = a.equipo_id
       ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
       ORDER BY a.fecha_hora DESC
       LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alertas/resumen - cantidad de alertas por estado (para las
// pestañas de Notificaciones y el contador del Dashboard).
router.get('/resumen', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.estado, COUNT(*) AS total FROM alertas a
       ${esJefe(req) ? `WHERE ${FILTRO_JEFE}` : ''}
       GROUP BY a.estado`,
      esJefe(req) ? [req.user.id] : []
    );
    const resumen = { pendiente: 0, asignada: 0, mitigada: 0 };
    rows.forEach((r) => {
      resumen[r.estado] = r.total;
    });
    res.json(resumen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alertas/:id - detalle completo de una alerta: sensor, propietario,
// sugerencia de mitigación, equipo asignado y el historial de alertas
// pendientes y mitigadas del mismo sensor.
router.get('/:id', async (req, res) => {
  try {
    const detalle = await obtenerDetalleAlerta(req.params.id);
    if (!detalle) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    // Para el jefe de equipo: solo las alertas de su equipo, y en el
    // historial del sensor se marcan cuáles puede abrir.
    let equiposPropios = null;
    if (esJefe(req)) {
      equiposPropios = await equiposDelJefe(req.user.id);
      if (!equiposPropios.includes(detalle.alerta.equipo_id)) {
        return res.status(403).json({ error: 'Esta alerta no está asignada a tu equipo' });
      }
    }
    const marcarAccesibles = (lista) =>
      lista.map((a) => ({ ...a, accesible: !equiposPropios || equiposPropios.includes(a.equipo_id) }));

    const historial = await historialDelSensor(detalle.sensor.id, detalle.alerta.id);
    res.json({
      ...detalle,
      // Enlace que abre WhatsApp con el aviso listo para el jefe del equipo
      // (respaldo del envío automático, para quien asigna alertas).
      whatsapp_url: esJefe(req) ? null : enlaceAsignacion(detalle),
      historial: {
        pendientes: marcarAccesibles(historial.pendientes),
        mitigadas: marcarAccesibles(historial.mitigadas),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/alertas/:id/asignar - asigna (o reasigna) la alerta a un equipo de
// mitigación y avisa por correo solo al jefe de ese equipo. Lo pueden hacer
// administradores y empleados.
router.put('/:id/asignar', authorize('administrador', 'empleado'), async (req, res) => {
  const equipoId = Number(req.body.equipo_id);
  const instrucciones = String(req.body.instrucciones || '').trim();
  if (!equipoId) {
    return res.status(400).json({ error: 'Selecciona un equipo de mitigación' });
  }
  if (instrucciones.length > 500) {
    return res.status(400).json({ error: 'Las instrucciones pueden tener hasta 500 caracteres' });
  }

  try {
    const [equipos] = await db.query('SELECT jefe_id FROM equipos_mitigacion WHERE id = ?', [equipoId]);
    if (equipos.length === 0) {
      return res.status(400).json({ error: 'El equipo seleccionado no existe' });
    }
    if (!equipos[0].jefe_id) {
      return res.status(400).json({ error: 'El equipo no tiene jefe; asígnale uno en Equipos de mitigación' });
    }

    const [resultado] = await db.query(
      `UPDATE alertas
       SET estado = 'asignada', equipo_id = ?, instrucciones = ?, asignado_por = ?, asignado_en = NOW(),
           correo_enviado = 0, leida = 1
       WHERE id = ? AND estado <> 'mitigada'`,
      [equipoId, instrucciones || null, req.user.id, req.params.id]
    );
    if (resultado.affectedRows === 0) {
      const [existe] = await db.query('SELECT id FROM alertas WHERE id = ?', [req.params.id]);
      return existe.length === 0
        ? res.status(404).json({ error: 'Alerta no encontrada' })
        : res.status(400).json({ error: 'La alerta ya fue mitigada' });
    }

    // La asignación ya quedó guardada: si el correo o el WhatsApp fallan
    // (sin configurar, etc.), el jefe igual ve la alerta en Notificaciones.
    const avisos = await notificarAsignacion(req.params.id).catch((err) => {
      console.error('[Mitigación] Error al avisar al jefe del equipo:', err.message);
      return { correo: false, whatsapp: false };
    });
    const detalle = await obtenerDetalleAlerta(req.params.id);
    res.json({
      ok: true,
      correo_enviado: avisos.correo,
      whatsapp_enviado: avisos.whatsapp,
      whatsapp_url: detalle ? enlaceAsignacion(detalle) : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Antes de recibir archivos se comprueba que quien cierra la alerta es el
// jefe del equipo asignado y que la alerta sigue asignada.
async function verificarPuedeMitigar(req, res, next) {
  try {
    const [alertas] = await db.query('SELECT estado, equipo_id FROM alertas WHERE id = ?', [req.params.id]);
    if (alertas.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    if (alertas[0].estado === 'mitigada') {
      return res.status(400).json({ error: 'La alerta ya fue marcada como mitigada' });
    }
    const equiposPropios = await equiposDelJefe(req.user.id);
    if (alertas[0].estado !== 'asignada' || !equiposPropios.includes(alertas[0].equipo_id)) {
      return res.status(403).json({ error: 'Esta alerta no está asignada a tu equipo' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/alertas/:id/mitigada (multipart/form-data) - el jefe del equipo
// asignado registra qué se hizo (campo "observacion") y sube las 3 fotos de
// evidencia obligatorias: "equipo", "casa" y "trabajo".
router.put('/:id/mitigada', authorize('equipo_mitigacion'), verificarPuedeMitigar, recibirFotos, async (req, res) => {
  const fotos = req.files || {};
  const observacion = String(req.body.observacion || '').trim();

  let error = null;
  if (!TIPOS_FOTO.every((tipo) => fotos[tipo])) {
    error = 'Sube las 3 fotos: el equipo, la casa y el trabajo realizado';
  } else if (!TIPOS_FOTO.every((tipo) => esImagenValida(fotos[tipo][0].path))) {
    error = 'Alguno de los archivos no es una foto válida (JPG, PNG o WebP)';
  } else if (observacion.length < 5) {
    error = 'Describe brevemente qué se hizo para mitigar la alerta';
  } else if (observacion.length > 500) {
    error = 'La descripción puede tener hasta 500 caracteres';
  }
  if (error) {
    borrarArchivos(fotos);
    return res.status(400).json({ error });
  }

  const conexion = await db.getConnection();
  try {
    await conexion.beginTransaction();
    const [resultado] = await conexion.query(
      `UPDATE alertas
       SET estado = 'mitigada', mitigado_por = ?, mitigado_en = NOW(), observacion_mitigacion = ?, leida = 1
       WHERE id = ? AND estado = 'asignada'`,
      [req.user.id, observacion, req.params.id]
    );
    if (resultado.affectedRows === 0) {
      await conexion.rollback();
      borrarArchivos(fotos);
      return res.status(400).json({ error: 'La alerta ya fue marcada como mitigada' });
    }
    await conexion.query('INSERT INTO fotos_mitigacion (alerta_id, tipo, archivo, subido_por) VALUES ?', [
      TIPOS_FOTO.map((tipo) => [req.params.id, tipo, fotos[tipo][0].filename, req.user.id]),
    ]);
    await conexion.commit();
    res.json({ ok: true });
  } catch (err) {
    await conexion.rollback();
    borrarArchivos(fotos);
    res.status(500).json({ error: err.message });
  } finally {
    conexion.release();
  }
});

// GET /api/alertas/:id/fotos/:tipo - devuelve una foto de evidencia. Las ven
// administradores, empleados y el jefe del equipo que atendió la alerta.
router.get('/:id/fotos/:tipo', async (req, res) => {
  if (!TIPOS_FOTO.includes(req.params.tipo)) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }
  try {
    const [rows] = await db.query(
      `SELECT f.archivo, a.equipo_id FROM fotos_mitigacion f
       JOIN alertas a ON a.id = f.alerta_id
       WHERE f.alerta_id = ? AND f.tipo = ?`,
      [req.params.id, req.params.tipo]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Foto no encontrada' });
    }
    if (esJefe(req)) {
      const equiposPropios = await equiposDelJefe(req.user.id);
      if (!equiposPropios.includes(rows[0].equipo_id)) {
        return res.status(403).json({ error: 'Esta alerta no está asignada a tu equipo' });
      }
    }
    res.set('Cache-Control', 'private, max-age=3600');
    res.sendFile(path.join(CARPETA_FOTOS, path.basename(rows[0].archivo)), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'El archivo de la foto ya no existe' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
