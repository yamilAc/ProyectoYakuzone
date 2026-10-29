import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { motion } from 'framer-motion';
import './App.css';
import Home from './Principal/Home';
import LoginComponent from './Login/LoginComponent';
import Lectura from './Lecturas/Lectura';
import Alerta from './Notificaciones/Alerta';
import Usuarios from './Login/Usuarios';
import DatosHistoricos from './DatosHistoricos/DatosHistoricos';
import Zonas from './Zonas/zonas';
import Dashboard from './Dashboard/Dashboard';
import Sensores from './Sensores/Sensores';
import Equipos from './Equipos/Equipos';
import Sidebar from './Sidebar';
import { isAuthenticated, getUserRole, logout } from './axios/auth';
import ProtectedRoute from './axios/ProtecteRoute';
import AvisosAlertas from './components/AvisosAlertas';
import Reporte from './Reporte';

// Transición de entrada de cada página. La página nueva se muestra apenas se
// toca el menú, sin esperar una animación de salida de la anterior (esa espera
// hacía que, en las páginas pesadas, pareciera que el primer clic no funcionaba).
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  in: { opacity: 1, y: 0 },
};

function AppContent() {
  const [isAuth, setIsAuth] = useState(isAuthenticated());
  const location = useLocation();

  useEffect(() => {
    setIsAuth(isAuthenticated());
  }, []);

  const userRole = getUserRole();

  const handleLogout = () => {
    logout();
    setIsAuth(false);
  };

  return (
    <div className="App" style={{ display: 'flex' }}>
      {isAuth && <Sidebar userRole={userRole} onLogout={handleLogout} />}
      {isAuth && <AvisosAlertas key={userRole} userRole={userRole} />}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: '100vh',
          minWidth: 0,
          pt: isAuth ? { xs: 7, md: 0 } : 0,
        }}
      >
        <motion.div
          key={location.pathname}
          initial="initial"
          animate="in"
          variants={pageVariants}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <Routes location={location}>
            <Route path="/" element={isAuth ? <Home /> : <Navigate to="/login" />} />
            <Route path="/login" element={<LoginComponent setAuth={setIsAuth} />} />
            {/* Rutas accesibles para todos los roles (el jefe de equipo de
                mitigación solo usa Inicio, Zonas y Notificaciones) */}
            <Route path="/zonas" element={isAuth ? <Zonas /> : <Navigate to="/login" />} />
            <Route path="/Alerta" element={isAuth ? <Alerta /> : <Navigate to="/login" />} />

            {/* Rutas de administradores y empleados */}
            <Route
              path="/Dashboard"
              element={<ProtectedRoute element={<Dashboard />} requiredRoles={['administrador', 'empleado']} />}
            />
            <Route
              path="/Lectura"
              element={<ProtectedRoute element={<Lectura />} requiredRoles={['administrador', 'empleado']} />}
            />
            <Route path="/Reporte" element={<Reporte />} />

            {/* Rutas accesibles solo para administradores */}
            <Route
              path="/Usuarios"
              element={<ProtectedRoute element={<Usuarios />} requiredRole="administrador" />}
            />
            {/* El empleado entra en modo solo lectura (desde el Dashboard) */}
            <Route
              path="/Sensores"
              element={<ProtectedRoute element={<Sensores />} requiredRoles={['administrador', 'empleado']} />}
            />
            <Route
              path="/Equipos"
              element={<ProtectedRoute element={<Equipos />} requiredRole="administrador" />}
            />
            <Route
              path="/DatosHistoricos"
              element={<ProtectedRoute element={<DatosHistoricos />} requiredRole="administrador" />}
            />
            <Route path="*" element={<Navigate to={isAuth ? '/' : '/login'} replace />} />
          </Routes>
        </motion.div>
      </Box>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
