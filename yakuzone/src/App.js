import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
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
import Mitigacion from './Mitigacion/Mitigacion';
import Sidebar from './Sidebar';
import { isAuthenticated, getUserRole, logout } from './axios/auth';
import ProtectedRoute from './axios/ProtecteRoute';
import GraficoSensor from './DatosHistoricos/graficoSensor';
import Reporte from './Reporte';

const pageVariants = {
  initial: { opacity: 0, y: 14 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -14 },
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

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: '100vh',
          minWidth: 0,
          pt: isAuth ? { xs: 7, md: 0 } : 0,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <Routes location={location}>
              <Route path="/" element={isAuth ? <Home /> : <Navigate to="/login" />} />
              <Route path="/login" element={<LoginComponent setAuth={setIsAuth} />} />
              {/* Rutas accesibles para ambos roles */}
              <Route path="/Dashboard" element={isAuth ? <Dashboard /> : <Navigate to="/login" />} />
              <Route path="/zonas" element={isAuth ? <Zonas /> : <Navigate to="/login" />} />
              <Route path="/Lectura" element={isAuth ? <Lectura /> : <Navigate to="/login" />} />
              <Route path="/Alerta" element={isAuth ? <Alerta /> : <Navigate to="/login" />} />
              <Route path="/Reporte" element={<Reporte />} />

              {/* Rutas accesibles solo para administradores */}
              <Route
                path="/Usuarios"
                element={<ProtectedRoute element={<Usuarios />} requiredRole="administrador" />}
              />
              <Route
                path="/Sensores"
                element={<ProtectedRoute element={<Sensores />} requiredRole="administrador" />}
              />
              <Route
                path="/Mitigacion"
                element={<ProtectedRoute element={<Mitigacion />} requiredRoles={['administrador', 'equipo_mitigacion']} />}
              />
              <Route
                path="/DatosHistoricos"
                element={<ProtectedRoute element={<DatosHistoricos />} requiredRole="administrador" />}
              />
              <Route
                path="/graficoSensor"
                element={<ProtectedRoute element={<GraficoSensor />} requiredRole="administrador" />}
              />
              <Route path="*" element={<Navigate to={isAuth ? '/' : '/login'} replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
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
