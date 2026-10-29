const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { TELEFONO_VALIDO, limpiarTexto } = require('../utils/validaciones');

// Equipos de mitigación: cada equipo tiene un jefe, el único integrante con
// usuario en el sistema (rol equipo_mitigacion), que es quien recibe las
// alertas que se le asignan al equipo; los demás miembros se registran solo
// con nombre y teléfono.
router.use(authenticate);

const MAX_MIEMBROS = 20;

// Equipos con su jefe, sus miembros y cuántas alertas asignadas tienen
// todavía sin mitigar.
async function listarEquipos() {
  const [equipos] = await db.query(
    `SELECT e.id, e.nombre, e.descripcion, e.jefe_id, e.creado_en,
            u.nombre AS jefe_nombre, u.apellido AS jefe_apellido, u.email AS jefe_email, u.telefono AS jefe_telefono,
            (SELECT COUNT(*) FROM alertas a WHERE a.equipo_id = e.id AND a.estado = 'asignada') AS alertas_activas
     FROM equipos_mitigacion e
     LEFT JOIN usuarios u ON u.id = e.jefe_id
     ORDER BY e.nombre`
  );
  if (equipos.length === 0) return [];

  const [miembros] = await db.query(
    'SELECT id, equipo_id, nombre, telefono FROM miembros_equipo WHERE equipo_id IN (?) ORDER BY id',
    [equipos.map((e) => e.id)]
  );
  return equipos.map((e) => ({ ...e, miembros: miembros.filter((m) => m.equipo_id === e.id) }));
}

// Lee y valida el formulario de alta/edición. Devuelve { datos, miembros }
// o { error } con el mensaje a mostrar.
async function leerDatosEquipo(body) {
  const datos = {
    nombre: limpiarTexto(body.nombre),
    descripcion: limpiarTexto(body.descripcion),
    jefe_id: Number(body.jefe_id) || null,
  };
  if (!datos.nombre) {
    return { error: 'El nombre del equipo es requerido' };
  }
  if (!datos.jefe_id) {
    return { error: 'Selecciona al jefe del equipo' };
  }

  const [jefes] = await db.query('SELECT rol FROM usuarios WHERE id = ?', [datos.jefe_id]);
  if (jefes.length === 0 || jefes[0].rol !== 'equipo_mitigacion') {
    return { error: 'El jefe debe ser un usuario con rol "Equipo de mitigación"' };
  }

  const lista = Array.isArray(body.miembros) ? body.miembros : [];
  if (lista.length > MAX_MIEMBROS) {
    return { error: `Un equipo puede tener hasta ${MAX_MIEMBROS} miembros` };
  }
  const miembros = [];
  for (const m of lista) {
    const nombre = limpiarTexto(m && m.nombre);
    const telefono = limpiarTexto(m && m.telefono);
    if (!nombre && !telefono) continue; // fila vacía del formulario
    if (!nombre) {
      return { error: 'Cada miembro necesita un nombre' };
    }
    if (telefono && !TELEFONO_VALIDO.test(telefono)) {
      return { error: `El teléfono de ${nombre} no es válido` };
    }
    miembros.push([nombre, telefono]);
  }
  return { datos, miembros };
}

// Guarda el equipo y reemplaza su lista de miembros en una sola transacción.
async function guardarEquipo(id, datos, miembros) {
  const conexion = await db.getConnection();
  try {
    await conexion.beginTransaction();
    let equipoId = id;
    if (id) {
      await conexion.query('UPDATE equipos_mitigacion SET ? WHERE id = ?', [datos, id]);
      await conexion.query('DELETE FROM miembros_equipo WHERE equipo_id = ?', [id]);
    } else {
      const [resultado] = await conexion.query('INSERT INTO equipos_mitigacion SET ?', [datos]);
      equipoId = resultado.insertId;
    }
    if (miembros.length > 0) {
      await conexion.query('INSERT INTO miembros_equipo (equipo_id, nombre, telefono) VALUES ?', [
        miembros.map(([nombre, telefono]) => [equipoId, nombre, telefono]),
      ]);
    }
    await conexion.commit();
    return equipoId;
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }
}

// GET /api/equipos - administradores y empleados (los dos pueden asignar
// alertas a un equipo desde Notificaciones).
router.get('/', authorize('administrador', 'empleado'), async (req, res) => {
  try {
    res.json(await listarEquipos());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/equipos - crear un equipo (solo administradores).
router.post('/', authorize('administrador'), async (req, res) => {
  try {
    const { datos, miembros, error } = await leerDatosEquipo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    const id = await guardarEquipo(null, datos, miembros);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/equipos/:id - editar un equipo y su lista de miembros (solo administradores).
router.put('/:id', authorize('administrador'), async (req, res) => {
  try {
    const [existentes] = await db.query('SELECT id FROM equipos_mitigacion WHERE id = ?', [req.params.id]);
    if (existentes.length === 0) {
      return res.status(404).json({ error: 'Equipo no encontrado' });
    }
    const { datos, miembros, error } = await leerDatosEquipo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    await guardarEquipo(req.params.id, datos, miembros);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/equipos/:id - eliminar un equipo (solo administradores). No se
// permite mientras tenga alertas asignadas sin mitigar, para que ninguna
// quede sin responsable; el historial de alertas ya mitigadas se conserva.
router.delete('/:id', authorize('administrador'), async (req, res) => {
  try {
    const [[{ activas }]] = await db.query(
      "SELECT COUNT(*) AS activas FROM alertas WHERE equipo_id = ? AND estado = 'asignada'",
      [req.params.id]
    );
    if (activas > 0) {
      return res.status(400).json({
        error: `El equipo tiene ${activas} alerta(s) asignada(s) sin mitigar; reasígnalas a otro equipo antes de eliminarlo`,
      });
    }
    const [resultado] = await db.query('DELETE FROM equipos_mitigacion WHERE id = ?', [req.params.id]);
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Equipo no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
