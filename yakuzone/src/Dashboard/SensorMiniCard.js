import React from 'react';
import { Paper, Typography, Chip, Divider } from '@mui/material';
import SensorsOffIcon from '@mui/icons-material/SensorsOff';
import PlaceIcon from '@mui/icons-material/Place';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import HomeIcon from '@mui/icons-material/Home';
import { motion } from 'framer-motion';

const Linea = ({ icon: Icon, children, color = 'text.secondary' }) => (
  <Typography variant="body2" color={color} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.6 }}>
    <Icon sx={{ fontSize: 16, mt: '2px', flexShrink: 0 }} />
    <span>{children}</span>
  </Typography>
);

// Tarjeta de un sensor en la "Red de sensores" del Dashboard: datos del
// sensor (número, ubicación) y del propietario de la vivienda.
// seleccionado / onClick: al tocarla se elige ese sensor en "Actividad en
// tiempo real" y en el mapa.
export const SensorMiniCardReal = ({ index, sensor, seleccionado = false, onClick }) => {
  const direccion = [sensor.propietario_direccion, sensor.propietario_nro_casa && `Casa Nº ${sensor.propietario_nro_casa}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.div
      custom={index}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      whileHover={{ y: -4 }}
      style={{ height: '100%' }}
    >
      <Paper
        elevation={seleccionado ? 6 : 2}
        onClick={onClick}
        sx={{
          p: 2,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.6,
          borderTop: '3px solid',
          borderColor: 'primary.main',
          cursor: onClick ? 'pointer' : 'default',
          outline: seleccionado ? '2px solid' : 'none',
          outlineColor: 'primary.main',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          {sensor.n_serie}
        </Typography>

        <Linea icon={PlaceIcon}>{sensor.ubicacion || 'Sin ubicación registrada'}</Linea>
        {sensor.descripcion && (
          <Typography variant="caption" color="text.secondary">
            {sensor.descripcion}
          </Typography>
        )}

        <Divider sx={{ my: 0.6 }} />
        {sensor.propietario_nombre ? (
          <>
            <Linea icon={PersonIcon} color="text.primary">
              {sensor.propietario_nombre}
            </Linea>
            {sensor.propietario_telefono && <Linea icon={PhoneIcon}>{sensor.propietario_telefono}</Linea>}
            {direccion && <Linea icon={HomeIcon}>{direccion}</Linea>}
          </>
        ) : (
          <Linea icon={PersonIcon} color="warning.main">
            Sin datos del propietario
          </Linea>
        )}
      </Paper>
    </motion.div>
  );
};

export const SensorMiniCardPlaceholder = ({ index, numero }) => (
  <motion.div
    custom={index}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay: index * 0.08 }}
    style={{ height: '100%' }}
  >
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        borderStyle: 'dashed',
        borderColor: 'divider',
        bgcolor: 'rgba(0,0,0,0.015)',
        minHeight: 150,
      }}
    >
      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
        <SensorsOffIcon sx={{ fontSize: 30, color: 'text.disabled', mb: 1 }} />
      </motion.div>
      <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
        Sensor {numero}
      </Typography>
      <Chip label="Próximamente" size="small" sx={{ mt: 1 }} />
    </Paper>
  </motion.div>
);
