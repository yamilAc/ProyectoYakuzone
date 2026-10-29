import React from 'react';
import { Box, Container, Typography, Grid, Paper, Stack, Chip } from '@mui/material';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import OpacityIcon from '@mui/icons-material/Opacity';
import ScienceIcon from '@mui/icons-material/Science';
import BoltIcon from '@mui/icons-material/Bolt';
import { motion } from 'framer-motion';

// Mismos colores y umbrales que utils/thresholds.js del backend (NB 512-04),
// para que la página informativa y el panel de monitoreo cuenten la misma historia.
const PARAMETROS = [
  {
    icon: ThermostatIcon,
    color: '#0E7C9B',
    titulo: 'Temperatura',
    rango: 'Sin umbral normado',
    texto: 'Afecta el sabor del agua, la solubilidad del oxígeno y la velocidad de crecimiento de microorganismos. Se registra como referencia.',
  },
  {
    icon: OpacityIcon,
    color: '#9C27B0',
    titulo: 'Turbidez',
    rango: '0 – 5 NTU',
    texto: 'Mide las partículas en suspensión. Niveles altos pueden ocultar microorganismos patógenos y afectar la desinfección.',
  },
  {
    icon: ScienceIcon,
    color: '#ED6C02',
    titulo: 'pH',
    rango: '6.5 – 9.0',
    texto: 'Indica el equilibrio ácido-base del agua. Fuera de rango puede corroer tuberías o irritar la piel.',
  },
  {
    icon: BoltIcon,
    color: '#009688',
    titulo: 'Conductividad eléctrica',
    rango: '0 – 1500 µS/cm',
    texto: 'Refleja la cantidad de sólidos disueltos en el agua. Valores muy altos suelen indicar contaminación.',
  },
];

const HomeParametros = () => {
  return (
    <Box sx={{ py: 8, bgcolor: 'background.paper' }}>
      <Container maxWidth="lg">
        <Typography variant="h4" fontWeight={700} sx={{ textAlign: 'center', mb: 1 }}>
          Parámetros que monitoreamos
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', mb: 5, maxWidth: 640, mx: 'auto' }}>
          Cuatro indicadores clave, evaluados según la Norma Boliviana NB 512-04
          de Agua Potable.
        </Typography>

        <Grid container spacing={3}>
          {PARAMETROS.map((p, index) => (
            <Grid item xs={12} sm={6} md={3} key={p.titulo}>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, delay: index * 0.1 }}
                whileHover={{ y: -6 }}
                style={{ height: '100%' }}
              >
                <Paper
                  elevation={2}
                  sx={{ p: 3, height: '100%', transition: 'box-shadow 0.25s ease', '&:hover': { boxShadow: 6 } }}
                >
                  <Stack spacing={1.5}>
                    <Box sx={{ bgcolor: `${p.color}22`, color: p.color, borderRadius: '50%', p: 1.2, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <p.icon />
                    </Box>
                    <Typography variant="h6" fontWeight={600}>
                      {p.titulo}
                    </Typography>
                    <Chip label={p.rango} size="small" sx={{ alignSelf: 'flex-start', bgcolor: `${p.color}18`, color: p.color, fontWeight: 600 }} />
                    <Typography variant="body2" color="text.secondary">
                      {p.texto}
                    </Typography>
                  </Stack>
                </Paper>
              </motion.div>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
};

export default HomeParametros;
