import axios from 'axios';
 
// La URL puede cambiarse sin modificar el código mediante REACT_APP_API_URL.
// En desarrollo el backend se espera en el mismo equipo, puerto 3001.
const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
});
 
// Agregar interceptor para las solicitudes
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token'); // o sessionStorage
    if (token) {
      config.headers.Authorization = `Bearer ${token}`; // Agregar token a la cabecera
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
 
export default axiosInstance; // Exportar la instancia de Axios
