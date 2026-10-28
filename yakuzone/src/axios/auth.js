import { jwtDecode } from 'jwt-decode'; // Importación corregida
 
export const getToken = () => localStorage.getItem('token');
 
export const isAuthenticated = () => !!getToken();
 
export const getUserRole = () => {
  const token = getToken();
  if (!token) return null;
 
  try {
    const decoded = jwtDecode(token); // Decodificamos el token
    return decoded.rol;
  } catch (error) {
    console.error('Error decodificando el token:', error);
    return null;
  }
};
 
// Id del usuario logueado (para, por ejemplo, no dejar que se elimine a sí
// mismo desde la gestión de usuarios).
export const getUserId = () => {
  const token = getToken();
  if (!token) return null;

  try {
    const decoded = jwtDecode(token);
    return decoded.id;
  } catch (error) {
    console.error('Error decodificando el token:', error);
    return null;
  }
};

export const logout = () => {
  localStorage.clear();
};