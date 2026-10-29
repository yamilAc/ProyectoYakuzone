const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { equiposDelJefe, obtenerDetalleAlerta, historialDelSensor } = require('../services/alertasService');
const { notificarAsignacion } = require('../services/mitigacionService');

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
              s.n_serie AS numero_serie, s.ubicacion, e.nombre AS equipo_nombre
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

    // La asignación ya quedó guardada: si el correo falla (SMTP sin
    // configurar, etc.), el jefe igual ve la alerta en Notificaciones.
    const correoEnviado = await notificarAsignacion(req.params.id).catch((err) => {
      console.error('[Mitigación] Error al avisar al jefe del equipo:', err.message);
      return false;
    });
    res.json({ ok: true, correo_enviado: correoEnviado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/alertas/:id/mitigada - registra que la alerta ya se atendió y
// qué se hizo. Lo puede hacer el jefe del equipo asignado o un administrador.
router.put('/:id/mitigada', authorize('administrador', 'equipo_mitigacion'), async (req, res) => {
  const observacion = String(req.body.observacion || '').trim();
  if (observacion.length < 5) {
    return res.status(400).json({ error: 'Describe brevemente qué se hizo para mitigar la alerta' });
  }
  if (observacion.length > 500) {
    return res.status(400).json({ error: 'La descripción puede tener hasta 500 caracteres' });
  }

  try {
    const [alertas] = await db.query('SELECT estado, equipo_id FROM alertas WHERE id = ?', [req.params.id]);
    if (alertas.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    if (esJefe(req)) {
      const equiposPropios = await equiposDelJefe(req.user.id);
      if (!equiposPropios.includes(alertas[0].equipo_id)) {
        return res.status(403).json({ error: 'Esta alerta no está asignada a tu equipo' });
      }
    }

    const [resultado] = await db.query(
      `UPDATE alertas
       SET estado = 'mitigada', mitigado_por = ?, mitigado_en = NOW(), observacion_mitigacion = ?, leida = 1
       WHERE id = ? AND estado <> 'mitigada'`,
      [req.user.id, observacion, req.params.id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(400).json({ error: 'La alerta ya fue marcada como mitigada' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
