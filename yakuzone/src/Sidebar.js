import React, { useEffect, useState } from 'react';
import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Avatar, Typography, Divider, IconButton, Badge } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import DashboardIcon from '@mui/icons-material/Dashboard';
import RoomIcon from '@mui/icons-material/Room';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import NotificationsIcon from '@mui/icons-material/Notifications';
import HistoryIcon from '@mui/icons-material/History';
import PeopleIcon from '@mui/icons-material/People';
import SensorsIcon from '@mui/icons-material/Sensors';
import GroupsIcon from '@mui/icons-material/Groups';
import LogoutIcon from '@mui/icons-material/Logout';
import logo from './images/logoYakuzone.png';
import axios from './axios/axiosConfig';
import { EVENTO_ALERTAS_CAMBIARON } from './utils/alertas';

export const SIDEBAR_WIDTH = 240;

const buildLinks = (userRole) => {
  // El jefe de un equipo de mitigación solo necesita ver la zona y las
  // alertas asignadas a su equipo.
  if (userRole === 'equipo_mitigacion') {
    return [
      { to: '/', label: 'Inicio', icon: HomeIcon },
      { to: '/zonas', label: 'Zonas', icon: RoomIcon },
      { to: '/Alerta', label: 'Notificaciones', icon: NotificationsIcon },
    ];
  }
  const base = [
    { to: '/', label: 'Inicio', icon: HomeIcon },
    { to: '/Dashboard', label: 'Dashboard', icon: DashboardIcon },
    { to: '/zonas', label: 'Zonas', icon: RoomIcon },
    { to: '/Lectura', label: 'Lecturas', icon: ShowChartIcon },
    { to: '/Alerta', label: 'Notificaciones', icon: NotificationsIcon },
  ];
  if (userRole === 'administrador') {
    base.push({ to: '/DatosHistoricos', label: 'Datos Históricos', icon: HistoryIcon });
    base.push({ to: '/Sensores', label: 'Sensores', icon: SensorsIcon });
    base.push({ to: '/Equipos', label: 'Equipos', icon: GroupsIcon });
    base.push({ to: '/Usuarios', label: 'Usuarios', icon: PeopleIcon });
  }
  // La mitigación se gestiona desde Notificaciones: ahí se asigna cada alerta
  // a un equipo y su jefe la marca como mitigada.
  return base;
};

// Alertas que esperan acción: sin asignar (administrador y empleado) o
// asignadas a su equipo (jefe). Se muestran en un círculo junto a
// Notificaciones por si no se vio el aviso emergente.
const useAlertasPorAtender = (userRole) => {
  const [cantidad, setCantidad] = useState(0);
  useEffect(() => {
    if (!userRole) return undefined;
    let activo = true;
    const actualizar = async () => {
      try {
        const res = await axios.get('/alertas/resumen');
        if (activo) setCantidad(userRole === 'equipo_mitigacion' ? res.data.asignada : res.data.pendiente);
      } catch {
        // Sin conexión: se vuelve a intentar en el próximo ciclo.
      }
    };
    actualizar();
    const interval = setInterval(actualizar, 10000);
    window.addEventListener(EVENTO_ALERTAS_CAMBIARON, actualizar);
    return () => {
      activo = false;
      clearInterval(interval);
      window.removeEventListener(EVENTO_ALERTAS_CAMBIARON, actualizar);
    };
  }, [userRole]);
  return cantidad;
};

const SidebarContent = ({ links, pathname, onNavigate, onLogout }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'linear-gradient(180deg, #0B5E77 0%, #0E7C9B 55%, #1CB5E0 100%)',
      color: '#fff',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2.5 }}>
      <Avatar src={logo} alt="Logo" variant="rounded" sx={{ width: 40, height: 40, bgcolor: 'rgba(255,255,255,0.15)' }} />
      <Typography variant="h6" fontWeight={700}>
        YakuZone
      </Typography>
    </Box>
    <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />

    <List sx={{ flex: 1, px: 1.5, py: 2 }}>
      {links.map((link, i) => {
        const active = pathname.toLowerCase() === link.to.toLowerCase();
        return (
          <motion.div
            key={link.to}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
          >
            <ListItemButton
              component={Link}
              to={link.to}
              onClick={onNavigate}
              sx={{
                position: 'relative',
                borderRadius: 2,
                mb: 0.5,
                color: '#fff',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  style={{
                    position: 'absolute',
                    inset: 4,
                    background: 'rgba(255,255,255,0.18)',
                    borderRadius: 8,
                  }}
                />
              )}
              <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', width: '100%' }}>
                <ListItemIcon sx={{ color: '#fff', minWidth: 40 }}>
                  <Badge
                    badgeContent={link.badge}
                    color="error"
                    max={99}
                    sx={{ '& .MuiBadge-badge': { fontWeight: 700, border: '2px solid #0E7C9B' } }}
                  >
                    <link.icon fontSize="small" />
                  </Badge>
                </ListItemIcon>
                <ListItemText primary={link.label} primaryTypographyProps={{ fontWeight: active ? 700 : 500 }} />
              </Box>
            </ListItemButton>
          </motion.div>
        );
      })}
    </List>

    <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />
    <List sx={{ px: 1.5, py: 1.5 }}>
      <ListItemButton onClick={onLogout} sx={{ borderRadius: 2, color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}>
        <ListItemIcon sx={{ color: '#fff', minWidth: 40 }}>
          <LogoutIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primary="Cerrar Sesión" />
      </ListItemButton>
    </List>
  </Box>
);

const Sidebar = ({ userRole, onLogout }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const porAtender = useAlertasPorAtender(userRole);
  const links = buildLinks(userRole).map((link) => (link.to === '/Alerta' ? { ...link, badge: porAtender } : link));

  return (
    <>
      <IconButton
        onClick={() => setMobileOpen(true)}
        sx={{
          display: { xs: 'inline-flex', md: 'none' },
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 1300,
          bgcolor: 'primary.main',
          color: '#fff',
          boxShadow: 3,
          '&:hover': { bgcolor: 'primary.dark' },
        }}
      >
        <MenuIcon />
      </IconButton>

      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box', border: 'none' },
        }}
      >
        <SidebarContent links={links} pathname={location.pathname} onLogout={onLogout} />
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box', border: 'none' },
        }}
      >
        <SidebarContent
          links={links}
          pathname={location.pathname}
          onNavigate={() => setMobileOpen(false)}
          onLogout={onLogout}
        />
      </Drawer>
    </>
  );
};

export default Sidebar;
