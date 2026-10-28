import { Navigate } from 'react-router-dom';
import { isAuthenticated, getUserRole } from './auth'; // Importamos funciones desde auth.js

// requiredRole: un solo rol (compatibilidad con el código existente).
// requiredRoles: lista de roles permitidos, para páginas a las que puede
// entrar más de un rol (por ejemplo, Mitigación: administrador y equipo_mitigacion).
const ProtectedRoute = ({ element, requiredRole, requiredRoles }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" />; // Redirige si no está autenticado
  }

  const rolesPermitidos = requiredRoles || (requiredRole ? [requiredRole] : null);

  if (rolesPermitidos && !rolesPermitidos.includes(getUserRole())) {
    alert('No tienes permisos para acceder a esta página.');
    return <Navigate to="/" />;
  }

  return element;
};

export default ProtectedRoute;
