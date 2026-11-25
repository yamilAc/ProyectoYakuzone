import axios from 'axios';
import { getToken, logout } from './auth';

// La URL puede cambiarse sin modificar el código mediante REACT_APP_API_URL.
// En desarrollo el backend se espera en el mismo equipo, puerto 3001.
const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
});

// Cada petición lleva el token de la sesión.
axiosInstance.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Si el backend responde 401 (token vencido o inválido), se cierra la sesión
// y se vuelve al inicio de sesión. En el propio login, un 401 solo significa
// que las credenciales son incorrectas, y lo maneja ese formulario.
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const esLogin = (error.config?.url || '').endsWith('/login');
    if (error.response?.status === 401 && !esLogin) {
      logout();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
