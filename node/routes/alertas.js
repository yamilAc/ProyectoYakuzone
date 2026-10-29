const path = require('path');
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { equiposDelJefe, obtenerDetalleAlerta, historialDelSensor } = require('../services/alertasService');
const { notificarAsignacion, enlaceAsignacion } = require('../services/mitigacionService');
const { CARPETA_FOTOS, TIPOS_FOTO, recibirFotos, borrarArchivos, esImagenValida } = require('../utils/subidas');

router.use(authenticate);

// Seguimiento de una alerta: pendiente (sin asignar) -> asignada ->
// en_revision (el jefe del equipo envió el informe de la visita) -> mitigada
// (un administrador o empleado aprobó el informe). Si el informe no se
// aprueba, la alerta se reasigna para una nueva visita y vuelve a "asignada".
const ESTADOS = ['pendiente', 'asignada', 'en_revision', 'mitigada'];
const RESULTADOS = ['realizada', 'no_realizada'];

// El jefe de un equipo de mitigación (rol equipo_mitigacion) solo ve las
// alertas asignadas a los equipos que encabeza; administradores y empleados
// ven todas.
const FILTRO_JEFE = 'a.equipo_id IN (SELECT id FROM equipos_mitigacion WHERE jefe_id = ?)';
const esJefe = (req) => req.user.rol === 'equipo_mitigacion';

// GET /api/alertas?estado=pendiente|asignada|en_revision|mitigada&sensor_id=N
// (ambos opcionales) - alertas más recientes primero, con el último informe
// de visita (para mostrar sus fotos en la lista).
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
              ui.id AS ultimo_informe_id, ui.resultado AS ultimo_resultado,
              (SELECT COUNT(*) FROM fotos_mitigacion f WHERE f.informe_id = ui.id) AS fotos
       FROM alertas a
       JOIN sensores s ON s.id = a.sensor_id
       LEFT JOIN equipos_mitigacion e ON e.id = a.equipo_id
       LEFT JOIN informes_mitigacion ui ON ui.id = (SELECT MAX(i.id) FROM informes_mitigacion i WHERE i.alerta_id = a.id)
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
// pestañas de Notificaciones, el contador del menú y el del Dashboard).
router.get('/resumen', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.estado, COUNT(*) AS total FROM alertas a
       ${esJefe(req) ? `WHERE ${FILTRO_JEFE}` : ''}
       GROUP BY a.estado`,
      esJefe(req) ? [req.user.id] : []
    );
    const resumen = { pendiente: 0, asignada: 0, en_revision: 0, mitigada: 0 };
    rows.forEach((r) => {
      resumen[r.estado] = r.total;
    });
    res.json(resumen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alertas/:id - detalle completo de una alerta: sensor, propietario,
// sugerencia de mitigación, equipo asignado, informes de las visitas y el
// historial de alertas pendientes y mitigadas del mismo sensor.
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

// PUT /api/alertas/:id/asignar - asigna la alerta a un equipo de mitigación
// y avisa solo al jefe de ese equipo. Si la alerta estaba en revisión, el
// informe pendiente queda rechazado (con las instrucciones como motivo) y la
// alerta vuelve a "asignada" para una nueva visita, del mismo equipo u otro.
// Lo pueden hacer administradores y empleados.
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

    const conexion = await db.getConnection();
    try {
      await conexion.beginTransaction();
      const [alertas] = await conexion.query('SELECT estado FROM alertas WHERE id = ? FOR UPDATE', [req.params.id]);
      if (alertas.length === 0) {
        await conexion.rollback();
        return res.status(404).json({ error: 'Alerta no encontrada' });
      }
      if (alertas[0].estado === 'mitigada') {
        await conexion.rollback();
        return res.status(400).json({ error: 'La alerta ya fue mitigada' });
      }
      if (alertas[0].estado === 'en_revision') {
        await conexion.query(
          `UPDATE informes_mitigacion SET revision = 'rechazado', revisado_por = ?, revisado_en = NOW(), comentario_revision = ?
           WHERE alerta_id = ? AND revision = 'pendiente'`,
          [req.user.id, instrucciones || null, req.params.id]
        );
      }
      await conexion.query(
        `UPDATE alertas
         SET estado = 'asignada', equipo_id = ?, instrucciones = ?, asignado_por = ?, asignado_en = NOW(),
             correo_enviado = 0, whatsapp_enviado = 0, leida = 1
         WHERE id = ?`,
        [equipoId, instrucciones || null, req.user.id, req.params.id]
      );
      await conexion.commit();
    } catch (err) {
      await conexion.rollback();
      throw err;
    } finally {
      conexion.release();
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

// Antes de recibir archivos se comprueba que quien envía el informe es el
// jefe del equipo asignado y que la alerta sigue asignada (esperando visita).
async function verificarPuedeInformar(req, res, next) {
  try {
    const [alertas] = await db.query('SELECT estado, equipo_id FROM alertas WHERE id = ?', [req.params.id]);
    if (alertas.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    const equiposPropios = await equiposDelJefe(req.user.id);
    if (!equiposPropios.includes(alertas[0].equipo_id)) {
      return res.status(403).json({ error: 'Esta alerta no está asignada a tu equipo' });
    }
    if (alertas[0].estado !== 'asignada') {
      return res.status(400).json({
        error: alertas[0].estado === 'en_revision' ? 'Ya enviaste el informe de esta alerta; está en revisión' : 'La alerta ya fue mitigada',
      });
    }
    req.equipoDeLaAlerta = alertas[0].equipo_id;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/alertas/:id/informes (multipart/form-data) - el jefe del equipo
// asignado envía el informe de la visita: "resultado" (realizada o
// no_realizada), "observacion" y las fotos "equipo", "casa" y "trabajo". Si la
// mitigación se realizó, las 3 fotos son obligatorias; si no se pudo
// realizar, la del trabajo es opcional. La alerta pasa a "en revisión".
router.post('/:id/informes', authorize('equipo_mitigacion'), verificarPuedeInformar, recibirFotos, async (req, res) => {
  const fotos = req.files || {};
  const resultado = req.body.resultado;
  const observacion = String(req.body.observacion || '').trim();
  const obligatorias = resultado === 'realizada' ? TIPOS_FOTO : ['equipo', 'casa'];
  const subidas = TIPOS_FOTO.filter((tipo) => fotos[tipo]);

  let error = null;
  if (!RESULTADOS.includes(resultado)) {
    error = 'Indica si la mitigación se realizó o no se pudo realizar';
  } else if (!obligatorias.every((tipo) => fotos[tipo])) {
    error =
      resultado === 'realizada'
        ? 'Sube las 3 fotos: el equipo, la casa y el trabajo realizado'
        : 'Sube al menos la foto del equipo y la de la casa';
  } else if (!subidas.every((tipo) => esImagenValida(fotos[tipo][0].path))) {
    error = 'Alguno de los archivos no es una foto válida (JPG, PNG o WebP)';
  } else if (observacion.length < 5) {
    error = resultado === 'realizada' ? 'Describe brevemente qué se hizo' : 'Explica por qué no se pudo realizar la mitigación';
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
    const [cambio] = await conexion.query(`UPDATE alertas SET estado = 'en_revision' WHERE id = ? AND estado = 'asignada'`, [req.params.id]);
    if (cambio.affectedRows === 0) {
      await conexion.rollback();
      borrarArchivos(fotos);
      return res.status(400).json({ error: 'Ya enviaste el informe de esta alerta; está en revisión' });
    }
    const [informe] = await conexion.query(
      `INSERT INTO informes_mitigacion (alerta_id, equipo_id, resultado, observacion, enviado_por, enviado_en)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [req.params.id, req.equipoDeLaAlerta, resultado, observacion, req.user.id]
    );
    if (subidas.length > 0) {
      await conexion.query('INSERT INTO fotos_mitigacion (alerta_id, informe_id, tipo, archivo, subido_por) VALUES ?', [
        subidas.map((tipo) => [req.params.id, informe.insertId, tipo, fotos[tipo][0].filename, req.user.id]),
      ]);
    }
    await conexion.commit();
    res.status(201).json({ ok: true, informe_id: informe.insertId });
  } catch (err) {
    await conexion.rollback();
    borrarArchivos(fotos);
    res.status(500).json({ error: err.message });
  } finally {
    conexion.release();
  }
});

// PUT /api/alertas/:id/aprobar - un administrador o empleado aprueba el
// informe pendiente (solo si el equipo informó que la mitigación se realizó)
// y la alerta queda mitigada. "comentario" es opcional.
router.put('/:id/aprobar', authorize('administrador', 'empleado'), async (req, res) => {
  const comentario = String(req.body.comentario || '').trim();
  if (comentario.length > 500) {
    return res.status(400).json({ error: 'El comentario puede tener hasta 500 caracteres' });
  }

  const conexion = await db.getConnection();
  try {
    await conexion.beginTransaction();
    const [alertas] = await conexion.query('SELECT estado FROM alertas WHERE id = ? FOR UPDATE', [req.params.id]);
    if (alertas.length === 0) {
      await conexion.rollback();
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    const [informes] = await conexion.query(
      `SELECT * FROM informes_mitigacion WHERE alerta_id = ? AND revision = 'pendiente' ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [req.params.id]
    );
    if (alertas[0].estado !== 'en_revision' || informes.length === 0) {
      await conexion.rollback();
      return res.status(400).json({ error: 'La alerta no tiene un informe pendiente de revisión' });
    }
    const informe = informes[0];
    if (informe.resultado !== 'realizada') {
      await conexion.rollback();
      return res.status(400).json({ error: 'El equipo informó que no pudo realizar la mitigación: reasigna la alerta para una nueva visita' });
    }

    await conexion.query(
      `UPDATE informes_mitigacion SET revision = 'aprobado', revisado_por = ?, revisado_en = NOW(), comentario_revision = ? WHERE id = ?`,
      [req.user.id, comentario || null, informe.id]
    );
    await conexion.query(
      `UPDATE alertas SET estado = 'mitigada', mitigado_por = ?, mitigado_en = ?, observacion_mitigacion = ?, leida = 1 WHERE id = ?`,
      [informe.enviado_por, informe.enviado_en, informe.observacion, req.params.id]
    );
    await conexion.commit();
    res.json({ ok: true });
  } catch (err) {
    await conexion.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conexion.release();
  }
});

// GET /api/alertas/:id/informes/:informeId/fotos/:tipo - devuelve una foto
// de evidencia de un informe. Las ven administradores, empleados y el jefe
// del equipo al que está asignada la alerta.
router.get('/:id/informes/:informeId/fotos/:tipo', async (req, res) => {
  if (!TIPOS_FOTO.includes(req.params.tipo)) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }
  try {
    const [rows] = await db.query(
      `SELECT f.archivo, a.equipo_id FROM fotos_mitigacion f
       JOIN informes_mitigacion i ON i.id = f.informe_id
       JOIN alertas a ON a.id = i.alerta_id
       WHERE i.id = ? AND i.alerta_id = ? AND f.tipo = ?`,
      [req.params.informeId, req.params.id, req.params.tipo]
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
