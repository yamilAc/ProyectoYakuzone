// Validaciones de los formularios. Son las mismas reglas que aplica la API
// (node/utils/validaciones.js): aquí sirven para marcar cada campo con su
// error antes de enviar; la API las vuelve a comprobar de todas formas.
//
// Cada función devuelve un objeto { campo: mensaje } con los campos que
// tienen error (vacío si todo está bien).

export const TELEFONO_VALIDO = /^\+?[0-9][0-9\s-]{5,18}[0-9]$/;
export const CI_VALIDO = /^[0-9]{4,12}([\s-]?[0-9A-Za-z]{1,3}){0,2}$/;
export const NOMBRE_PERSONA = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]*$/;
export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const N_SERIE_VALIDO = /^[A-Za-z0-9-]{3,30}$/;

export const LARGO = {
  nombre: 100,
  apellido: 100,
  ci: 20,
  telefono: 20,
  email: 150,
  contrasenia: 72,
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

const limpio = (valor) => String(valor ?? '').trim();

export function errorContrasenia(contrasenia) {
  const c = String(contrasenia || '');
  if (c.length < 8) return 'Debe tener al menos 8 caracteres';
  if (c.length > LARGO.contrasenia) return `Puede tener hasta ${LARGO.contrasenia} caracteres`;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(c) || !/[0-9]/.test(c)) return 'Debe tener al menos una letra y un número';
  return null;
}

function errorNombre(valor, { requerido = true, min = 2, max = 100 } = {}) {
  const v = limpio(valor);
  if (!v) return requerido ? 'Campo obligatorio' : null;
  if (v.length < min || v.length > max) return `Entre ${min} y ${max} caracteres`;
  if (!NOMBRE_PERSONA.test(v)) return 'Solo letras, sin números ni símbolos';
  return null;
}

function errorTelefono(valor, requerido) {
  const v = limpio(valor);
  if (!v) return requerido ? 'Campo obligatorio' : null;
  if (!TELEFONO_VALIDO.test(v) || v.length > LARGO.telefono) return 'Número no válido (ej: 71234567)';
  return null;
}

function errorCI(valor) {
  const v = limpio(valor);
  if (!v) return 'Campo obligatorio';
  if (!CI_VALIDO.test(v) || v.length > LARGO.ci) return 'CI no válido (ej: 1234567 o 1234567 CB)';
  return null;
}

const sinNulos = (errores) => Object.fromEntries(Object.entries(errores).filter(([, v]) => v));

export function validarLogin({ email, contrasenia }) {
  const e = limpio(email);
  return sinNulos({
    email: !e ? 'Ingresa tu correo' : !EMAIL_VALIDO.test(e) ? 'Correo no válido (ej: nombre@correo.com)' : null,
    contrasenia: !contrasenia ? 'Ingresa tu contraseña' : null,
  });
}

export function validarUsuario(f, { editando }) {
  const email = limpio(f.email);
  return sinNulos({
    nombre: errorNombre(f.nombre, { max: LARGO.nombre }),
    apellido: errorNombre(f.apellido, { max: LARGO.apellido }),
    ci: errorCI(f.ci),
    email: !email ? 'Campo obligatorio' : !EMAIL_VALIDO.test(email) || email.length > LARGO.email ? 'Correo no válido (ej: nombre@correo.com)' : null,
    telefono: errorTelefono(f.telefono, f.rol === 'equipo_mitigacion'),
    contrasenia: !f.contrasenia ? (editando ? null : 'Campo obligatorio') : errorContrasenia(f.contrasenia),
    rol: ['administrador', 'empleado', 'equipo_mitigacion'].includes(f.rol) ? null : 'Selecciona un rol',
  });
}

function errorCoordenada(valor, min, max) {
  const v = limpio(valor);
  if (!v) return 'Campo obligatorio (o toca el mapa)';
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return `Número entre ${min} y ${max}`;
  return null;
}

export function validarSensor(f) {
  const serie = limpio(f.n_serie);
  const largo = (campo, requerido) => {
    const v = limpio(f[campo]);
    if (!v) return requerido ? 'Campo obligatorio' : null;
    return v.length > LARGO[campo] ? `Hasta ${LARGO[campo]} caracteres` : null;
  };
  return sinNulos({
    n_serie: !serie ? 'Campo obligatorio' : !N_SERIE_VALIDO.test(serie) ? 'De 3 a 30 letras, números o guiones, sin espacios (ej: SN-010)' : null,
    ubicacion: largo('ubicacion', true),
    descripcion: largo('descripcion', false),
    latitud: errorCoordenada(f.latitud, -90, 90),
    longitud: errorCoordenada(f.longitud, -180, 180),
    propietario_nombre: errorNombre(f.propietario_nombre, { min: 3, max: LARGO.propietario_nombre }),
    propietario_ci: errorCI(f.propietario_ci),
    propietario_telefono: errorTelefono(f.propietario_telefono, true),
    telefono_emergencia: errorTelefono(f.telefono_emergencia, true),
    propietario_direccion: largo('propietario_direccion', true),
    propietario_nro_casa: largo('propietario_nro_casa', false),
  });
}

// En los miembros, los errores van como "miembro_<i>_nombre" y "miembro_<i>_telefono".
export function validarEquipo(f) {
  const nombre = limpio(f.nombre);
  const errores = {
    nombre: !nombre ? 'Campo obligatorio' : nombre.length < 3 || nombre.length > LARGO.equipo_nombre ? `Entre 3 y ${LARGO.equipo_nombre} caracteres` : null,
    descripcion: limpio(f.descripcion).length > LARGO.descripcion ? `Hasta ${LARGO.descripcion} caracteres` : null,
    jefe_id: f.jefe_id ? null : 'Selecciona al jefe del equipo',
  };
  (f.miembros || []).forEach((m, i) => {
    if (!limpio(m.nombre) && !limpio(m.telefono)) return; // fila vacía: se ignora
    errores[`miembro_${i}_nombre`] = errorNombre(m.nombre, { min: 3, max: LARGO.miembro_nombre });
    errores[`miembro_${i}_telefono`] = errorTelefono(m.telefono, false);
  });
  return sinNulos(errores);
}

// Periodo opcional desde/hasta (AAAA-MM-DD): devuelve un mensaje o null.
export function errorPeriodo(desde, hasta) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (desde && hasta && desde > hasta) return 'La fecha "desde" no puede ser posterior a "hasta"';
  if (desde && desde > hoy) return 'La fecha "desde" no puede estar en el futuro';
  return null;
}

// Fotos del informe: JPG, PNG o WebP de hasta 5 MB (igual que la API).
export const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
export const TAMANO_MAXIMO_FOTO_MB = 5;
export function errorFoto(archivo) {
  if (!archivo) return null;
  if (!TIPOS_IMAGEN.includes(archivo.type)) return 'Solo fotos JPG, PNG o WebP';
  if (archivo.size > TAMANO_MAXIMO_FOTO_MB * 1024 * 1024) return `La foto pesa más de ${TAMANO_MAXIMO_FOTO_MB} MB`;
  return null;
}

// Texto libre con largo mínimo y máximo (instrucciones, observaciones, comentarios).
export function errorTexto(valor, { min = 0, max = LARGO.texto_largo, requerido = false } = {}) {
  const v = limpio(valor);
  if (!v) return requerido ? 'Campo obligatorio' : null;
  if (v.length < min) return `Escribe al menos ${min} caracteres`;
  if (v.length > max) return `Hasta ${max} caracteres`;
  return null;
}
