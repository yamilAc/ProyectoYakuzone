import { jwtDecode } from 'jwt-decode';

// La sesión se guarda en sessionStorage y no en localStorage: se borra al
// cerrar la pestaña o el navegador, así que al abrir el sistema de nuevo
// siempre se empieza por el inicio de sesión. Recargar la página (F5) la
// mantiene.
const CLAVE = 'token';

// Si quedó un token de versiones anteriores en localStorage, se descarta.
try {
  localStorage.removeItem(CLAVE);
} catch (e) {
  // almacenamiento no disponible: no hay nada que limpiar
}

export const getToken = () => {
  try {
    return sessionStorage.getItem(CLAVE);
  } catch (e) {
    return null;
  }
};

export const setToken = (token) => {
  sessionStorage.setItem(CLAVE, token);
};

const decodificar = () => {
  const token = getToken();
  if (!token) return null;
  try {
    return jwtDecode(token);
  } catch (error) {
    console.error('Error decodificando el token:', error);
    return null;
  }
};

// Hay sesión solo si el token existe y no venció (dura 8 horas).
export const isAuthenticated = () => {
  const datos = decodificar();
  if (!datos) return false;
  if (datos.exp && datos.exp * 1000 <= Date.now()) {
    logout();
    return false;
  }
  return true;
};

export const getUserRole = () => {
  const datos = decodificar();
  return datos ? datos.rol : null;
};

// Id del usuario logueado (para, por ejemplo, no dejar que se elimine a sí
// mismo desde la gestión de usuarios).
export const getUserId = () => {
  const datos = decodificar();
  return datos ? datos.id : null;
};

export const logout = () => {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch (e) {
    // almacenamiento no disponible
  }
};
