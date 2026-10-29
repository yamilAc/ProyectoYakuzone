// Validaciones comunes para los formularios de sensores (datos del
// propietario) y de equipos de mitigación (teléfonos de los miembros).

// Teléfonos fijos (7 dígitos) o celulares (8 dígitos) de Bolivia, admitiendo
// prefijo internacional, espacios o guiones: "4 4123456", "+591 71234567".
const TELEFONO_VALIDO = /^\+?[0-9][0-9\s-]{5,18}[0-9]$/;

// CI boliviano con extensión o complemento opcional: "1234567", "1234567 CB", "1234567-1A".
const CI_VALIDO = /^[0-9]{4,12}([\s-]?[0-9A-Za-z]{1,3}){0,2}$/;

// Recorta espacios y convierte cadenas vacías en null (para guardar NULL en la base).
const limpiarTexto = (valor) => {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
};

module.exports = { TELEFONO_VALIDO, CI_VALIDO, limpiarTexto };
