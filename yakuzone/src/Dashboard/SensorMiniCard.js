import React from 'react';
import { Box, Paper, Typography, Chip, Stack } from '@mui/material';
import { Line } from 'react-chartjs-2';
import SensorsOffIcon from '@mui/icons-material/SensorsOff';
import { motion } from 'framer-motion';
import { evaluarEstadoSensor, COLORES_ESTADO, ETIQUETAS_ESTADO } from '../utils/estadoSensor';

const sparklineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 500 },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  elements: { point: { radius: 0 } },
  scales: { x: { display: false }, y: { display: false } },
};

export const SensorMiniCardReal = ({ index, sensor, lecturas, ultima }) => {
  const lecturasDelSensor = lecturas.filter((l) => l.sensor_id === sensor.id);
  const estado = evaluarEstadoSensor(ultima);
  const color = estado ? COLORES_ESTADO[estado] : '#9e9e9e';

  const sparkData = {
    labels: lecturasDelSensor.map((l) => l.fecha_hora),
    datasets: [
      {
        data: lecturasDelSensor.map((l) => l.valor_temperatura),
        borderColor: '#0E7C9B',
        backgroundColor: 'rgba(14,124,155,0.15)',
        fill: true,
        tension: 0.35,
        borderWidth: 2,
      },
    ],
  };

  return (
    <motion.div
      custom={index}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      whileHover={{ y: -4 }}
      style={{ height: '100%' }}
    >
      <Paper elevation={2} sx={{ p: 2, height: '100%', borderTop: '3px solid', borderColor: color }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {sensor.n_serie}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {sensor.ubicacion || 'Sin ubicación'}
            </Typography>
          </Box>
          <Chip
            label={estado ? ETIQUETAS_ESTADO[estado] : 'Sin datos'}
            size="small"
            sx={{
              bgcolor: `${color}18`,
              color,
              fontWeight: 700,
              '&::before': {
                content: '""',
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: color,
                mr: 0.6,
              },
            }}
          />
        </Stack>

        {ultima ? (
          <Stack direction="row" spacing={0.7} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            <Chip label={`${Number(ultima.valor_temperatura).toFixed(1)}°C`} size="small" variant="outlined" />
            <Chip label={`pH ${Number(ultima.valor_ph).toFixed(1)}`} size="small" variant="outlined" />
            <Chip label={`${Number(ultima.valor_turbidez).toFixed(1)} NTU`} size="small" variant="outlined" />
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Sin lecturas todavía.
          </Typography>
        )}

        <Box sx={{ height: 50 }}>
          {lecturasDelSensor.length > 1 && <Line data={sparkData} options={sparklineOptions} />}
        </Box>
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
