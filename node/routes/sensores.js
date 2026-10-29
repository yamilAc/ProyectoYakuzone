const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { TELEFONO_VALIDO, CI_VALIDO, limpiarTexto } = require('../utils/validaciones');

// Datos obligatorios del propietario de la vivienda donde se instala el
// sensor (el número de casa es opcional). Se muestran en el detalle de cada
// alerta para que el equipo de mitigación sepa a quién contactar.
const CAMPOS_PROPIETARIO_OBLIGATORIOS = {
  propietario_nombre: 'nombre del propietario',
  propietario_ci: 'CI del propietario',
  propietario_telefono: 'teléfono del propietario',
  propietario_direccion: 'dirección',
  telefono_emergencia: 'teléfono de emergencia',
};

// Lee y valida el cuerpo del formulario de alta/edición. Devuelve
// { datos } listo para INSERT/UPDATE, o { error } con el mensaje a mostrar.
function leerDatosSensor(body) {
  const datos = {
    n_serie: limpiarTexto(body.n_serie),
    ubicacion: limpiarTexto(body.ubicacion),
    descripcion: limpiarTexto(body.descripcion),
    latitud: body.latitud || null,
    longitud: body.longitud || null,
    propietario_nombre: limpiarTexto(body.propietario_nombre),
    propietario_ci: limpiarTexto(body.propietario_ci),
    propietario_telefono: limpiarTexto(body.propietario_telefono),
    propietario_direccion: limpiarTexto(body.propietario_direccion),
    propietario_nro_casa: limpiarTexto(body.propietario_nro_casa),
    telefono_emergencia: limpiarTexto(body.telefono_emergencia),
  };

  if (!datos.n_serie) {
    return { error: 'El número de serie es requerido' };
  }
  for (const [campo, nombre] of Object.entries(CAMPOS_PROPIETARIO_OBLIGATORIOS)) {
    if (!datos[campo]) {
      return { error: `El campo "${nombre}" es requerido` };
    }
  }
  if (!CI_VALIDO.test(datos.propietario_ci)) {
    return { error: 'El CI del propietario no es válido (ej: 1234567 o 1234567 CB)' };
  }
  if (!TELEFONO_VALIDO.test(datos.propietario_telefono)) {
    return { error: 'El teléfono del propietario no es válido' };
  }
  if (!TELEFONO_VALIDO.test(datos.telefono_emergencia)) {
    return { error: 'El teléfono de emergencia no es válido' };
  }
  return { datos };
}

// GET /api/sensores - lista de sensores (requiere sesión iniciada; Zonas,
// Dashboard y Datos Históricos la usan para el mapa y las tablas).
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM sensores ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sensores - registrar un nuevo sensor (solo administradores).
router.post('/', authenticate, authorize('administrador'), async (req, res) => {
  const { datos, error } = leerDatosSensor(req.body);
  if (error) {
    return res.status(400).json({ error });
  }
  try {
    const [existentes] = await db.query('SELECT id FROM sensores WHERE n_serie = ?', [datos.n_serie]);
    if (existentes.length > 0) {
      return res.status(400).json({ error: 'El número de serie ya existe' });
    }
    const [result] = await db.query('INSERT INTO sensores SET ?', [datos]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sensores/:id - editar un sensor existente (solo administradores).
router.put('/:id', authenticate, authorize('administrador'), async (req, res) => {
  const { datos, error } = leerDatosSensor(req.body);
  if (error) {
    return res.status(400).json({ error });
  }
  try {
    const [existentes] = await db.query(
      'SELECT id FROM sensores WHERE n_serie = ? AND id != ?',
      [datos.n_serie, req.params.id]
    );
    if (existentes.length > 0) {
      return res.status(400).json({ error: 'Ya existe otro sensor con ese número de serie' });
    }
    const [resultado] = await db.query('UPDATE sensores SET ? WHERE id = ?', [datos, req.params.id]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Sensor no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sensores/:id - eliminar un sensor (solo administradores).
// ADVERTENCIA: la tabla `sensores` tiene ON DELETE CASCADE hacia `lecturas`
// y `alertas`, así que eliminar un sensor borra también todo su historial
// de lecturas y notificaciones. El frontend debe confirmar esto claramente
// antes de llamar a esta ruta.
router.delete('/:id', authenticate, authorize('administrador'), async (req, res) => {
  try {
    const [resultado] = await db.query('DELETE FROM sensores WHERE id = ?', [req.params.id]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Sensor no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
