// Validaciones comunes de la API. Las mismas reglas están en el frontend
// (yakuzone/src/utils/validaciones.js) para avisar al usuario antes de
// enviar el formulario; aquí se vuelven a comprobar porque la API puede
// recibir peticiones que no pasen por la plataforma web.

// Teléfonos fijos (7 dígitos) o celulares (8 dígitos) de Bolivia, admitiendo
// prefijo internacional, espacios o guiones: "4 4123456", "+591 71234567".
const TELEFONO_VALIDO = /^\+?[0-9][0-9\s-]{5,18}[0-9]$/;

// CI boliviano con extensión o complemento opcional: "1234567", "1234567 CB", "1234567-1A".
const CI_VALIDO = /^[0-9]{4,12}([\s-]?[0-9A-Za-z]{1,3}){0,2}$/;

// Nombres y apellidos de personas: letras (con tildes y ñ), espacios, punto,
// apóstrofo y guion.
const NOMBRE_PERSONA = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]*$/;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Número de serie del nodo: también es su usuario y parte de su tópico MQTT,
// así que no puede tener espacios ni "/", "+" o "#".
const N_SERIE_VALIDO = /^[A-Za-z0-9-]{3,30}$/;

const ROLES = ['administrador', 'empleado', 'equipo_mitigacion'];

// Largos máximos, iguales a los de las columnas de la base de datos.
const LARGO = {
  nombre: 100,
  apellido: 100,
  ci: 20,
  telefono: 20,
  email: 150,
  n_serie: 30,
  ubicacion: 150,
  descripcion: 255,
  propietario_nombre: 150,
  propietario_direccion: 200,
  propietario_nro_casa: 20,
  equipo_nombre: 100,
  miembro_nombre: 150,
  texto_largo: 500,
};

// Contraseña: entre 8 y 72 caracteres (bcrypt ignora lo que pase de 72), con
// al menos una letra y un número.
function errorContrasenia(contrasenia) {
  const c = String(contrasenia || '');
  if (c.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (c.length > 72) return 'La contraseña puede tener hasta 72 caracteres';
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(c) || !/[0-9]/.test(c)) return 'La contraseña debe tener al menos una letra y un número';
  return null;
}

// Recorta espacios y convierte cadenas vacías en null (para guardar NULL en la base).
const limpiarTexto = (valor) => {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim().replace(/\s+/g, ' ');
  return texto === '' ? null : texto;
};

// Fecha AAAA-MM-DD que existe en el calendario (rechaza 2026-02-31).
function fechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d && a >= 2000 && a <= 2100;
}

// Periodo opcional desde/hasta (AAAA-MM-DD). Devuelve un mensaje de error o null.
function errorPeriodo(desde, hasta) {
  if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta))) {
    return 'Las fechas deben ser válidas y tener el formato AAAA-MM-DD';
  }
  if (desde && hasta && desde > hasta) return 'La fecha "desde" no puede ser posterior a "hasta"';
  return null;
}

const esIdValido = (valor) => /^[1-9][0-9]{0,9}$/.test(String(valor));

// Para router.param: rechaza identificadores que no sean enteros positivos.
function validarId(req, res, next, valor) {
  if (!esIdValido(valor)) {
    return res.status(400).json({ error: 'Identificador no válido' });
  }
  next();
}

module.exports = {
  TELEFONO_VALIDO,
  CI_VALIDO,
  NOMBRE_PERSONA,
  EMAIL_VALIDO,
  N_SERIE_VALIDO,
  ROLES,
  LARGO,
  errorContrasenia,
  limpiarTexto,
  fechaValida,
  errorPeriodo,
  esIdValido,
  validarId,
};
