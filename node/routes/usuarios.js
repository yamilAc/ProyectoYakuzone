const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { errorInterno } = require('../utils/errores');
const {
  TELEFONO_VALIDO,
  CI_VALIDO,
  NOMBRE_PERSONA,
  EMAIL_VALIDO,
  ROLES,
  LARGO,
  errorContrasenia,
  limpiarTexto,
  validarId,
} = require('../utils/validaciones');

// Toda la gestión de usuarios queda restringida a administradores.
router.use(authenticate, authorize('administrador'));
router.param('id', validarId);

// Lee y valida el formulario de alta/edición. Devuelve { datos } o { error }.
// En la edición la contraseña es opcional (vacía = no se cambia).
function leerDatosUsuario(body, { nuevo }) {
  const datos = {
    nombre: limpiarTexto(body.nombre),
    apellido: limpiarTexto(body.apellido),
    ci: limpiarTexto(body.ci),
    email: (limpiarTexto(body.email) || '').toLowerCase() || null,
    telefono: limpiarTexto(body.telefono),
    rol: body.rol || (nuevo ? 'empleado' : null),
  };
  const contrasenia = typeof body.contrasenia === 'string' ? body.contrasenia : '';

  if (!datos.nombre || !datos.apellido || !datos.ci || !datos.email || !datos.rol || (nuevo && !contrasenia)) {
    return { error: 'Completa nombre, apellidos, CI, correo, rol' + (nuevo ? ' y contraseña' : '') };
  }
  for (const [campo, nombreCampo] of [['nombre', 'El nombre'], ['apellido', 'El apellido']]) {
    if (datos[campo].length < 2 || datos[campo].length > LARGO[campo] || !NOMBRE_PERSONA.test(datos[campo])) {
      return { error: `${nombreCampo} debe tener entre 2 y ${LARGO[campo]} letras, sin números ni símbolos` };
    }
  }
  if (!CI_VALIDO.test(datos.ci) || datos.ci.length > LARGO.ci) {
    return { error: 'El CI no es válido (ej: 1234567 o 1234567 CB)' };
  }
  if (!EMAIL_VALIDO.test(datos.email) || datos.email.length > LARGO.email) {
    return { error: 'El correo electrónico no es válido' };
  }
  if (!ROLES.includes(datos.rol)) {
    return { error: 'El rol no es válido' };
  }
  // El celular es obligatorio para los jefes de equipo de mitigación (reciben
  // por WhatsApp las alertas asignadas a su equipo) y opcional para el resto.
  if (!datos.telefono && datos.rol === 'equipo_mitigacion') {
    return { error: 'El celular es obligatorio para los jefes de equipo de mitigación (avisos por WhatsApp)' };
  }
  if (datos.telefono && (!TELEFONO_VALIDO.test(datos.telefono) || datos.telefono.length > LARGO.telefono)) {
    return { error: 'El número de celular no es válido' };
  }
  if (contrasenia) {
    const error = errorContrasenia(contrasenia);
    if (error) return { error };
  }
  return { datos, contrasenia };
}

// Correo y CI no se pueden repetir entre usuarios (sin contar al que se edita).
async function errorDuplicado(datos, idActual = 0) {
  const [rows] = await db.query('SELECT email, ci FROM usuarios WHERE (LOWER(email) = ? OR ci = ?) AND id <> ?', [
    datos.email,
    datos.ci,
    idActual,
  ]);
  if (rows.some((r) => r.email.toLowerCase() === datos.email)) return 'Ya existe un usuario con ese correo';
  if (rows.some((r) => r.ci === datos.ci)) return 'Ya existe un usuario con ese CI';
  return null;
}

const contarAdministradores = async () =>
  (await db.query("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'administrador'"))[0][0].n;
const equiposQueEncabeza = async (id) =>
  (await db.query('SELECT nombre FROM equipos_mitigacion WHERE jefe_id = ?', [id]))[0].map((e) => e.nombre);

// GET /api/usuarios
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, apellido, ci, telefono, email, rol, creado_en FROM usuarios ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    errorInterno(res, err);
  }
});

// POST /api/usuarios
router.post('/', async (req, res) => {
  const { datos, contrasenia, error } = leerDatosUsuario(req.body, { nuevo: true });
  if (error) {
    return res.status(400).json({ error });
  }
  try {
    const duplicado = await errorDuplicado(datos);
    if (duplicado) {
      return res.status(400).json({ error: duplicado });
    }
    const hash = await bcrypt.hash(contrasenia, 10);
    const [result] = await db.query('INSERT INTO usuarios SET ?', [{ ...datos, contrasenia_hash: hash }]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    errorInterno(res, err);
  }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res) => {
  const { datos, contrasenia, error } = leerDatosUsuario(req.body, { nuevo: false });
  if (error) {
    return res.status(400).json({ error });
  }
  try {
    const [actuales] = await db.query('SELECT rol FROM usuarios WHERE id = ?', [req.params.id]);
    if (actuales.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const rolActual = actuales[0].rol;
    if (rolActual !== datos.rol) {
      // No dejar el sistema sin administradores ni equipos sin jefe.
      if (Number(req.params.id) === req.user.id) {
        return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
      }
      if (rolActual === 'administrador' && (await contarAdministradores()) <= 1) {
        return res.status(400).json({ error: 'Debe quedar al menos un administrador' });
      }
      const equipos = rolActual === 'equipo_mitigacion' ? await equiposQueEncabeza(req.params.id) : [];
      if (equipos.length > 0) {
        return res.status(400).json({
          error: `Es jefe de ${equipos.join(', ')}: asigna otro jefe a ese equipo antes de cambiarle el rol`,
        });
      }
    }
    const duplicado = await errorDuplicado(datos, req.params.id);
    if (duplicado) {
      return res.status(400).json({ error: duplicado });
    }
    const cambios = { ...datos };
    if (contrasenia) cambios.contrasenia_hash = await bcrypt.hash(contrasenia, 10);
    await db.query('UPDATE usuarios SET ? WHERE id = ?', [cambios, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    errorInterno(res, err);
  }
});

// DELETE /api/usuarios/:id
router.delete('/:id', async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }
    const [usuarios] = await db.query('SELECT rol FROM usuarios WHERE id = ?', [req.params.id]);
    if (usuarios.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (usuarios[0].rol === 'administrador' && (await contarAdministradores()) <= 1) {
      return res.status(400).json({ error: 'Debe quedar al menos un administrador' });
    }
    const equipos = await equiposQueEncabeza(req.params.id);
    if (equipos.length > 0) {
      return res.status(400).json({
        error: `Es jefe de ${equipos.join(', ')}: asigna otro jefe a ese equipo antes de eliminarlo`,
      });
    }
    await db.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(400).json({ error: 'No se puede eliminar: el usuario tiene reportes registrados' });
    }
    errorInterno(res, err);
  }
});

module.exports = router;
