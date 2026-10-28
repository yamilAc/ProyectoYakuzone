import React from 'react';
import { Box, Container, Typography, Grid, Paper, Stack } from '@mui/material';
import SensorsIcon from '@mui/icons-material/Sensors';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { motion } from 'framer-motion';

const PASOS = [
  {
    icon: SensorsIcon,
    titulo: 'Captura',
    texto: 'El nodo con sensor de temperatura, turbidez, pH y conductividad mide el agua de forma continua en el punto de monitoreo.',
  },
  {
    icon: WifiTetheringIcon,
    titulo: 'Transmisión',
    texto: 'Cada lectura viaja por MQTT desde el dispositivo hasta el servidor central, sin necesidad de cableado adicional.',
  },
  {
    icon: QueryStatsIcon,
    titulo: 'Análisis',
    texto: 'El backend compara cada valor contra los umbrales de la norma boliviana NB 512-04 de agua potable.',
  },
  {
    icon: NotificationsActiveIcon,
    titulo: 'Alerta',
    texto: 'Si algún parámetro sale de rango, se genera una alerta automática visible al instante en el panel.',
  },
];

const HomeComoFunciona = () => {
  return (
    <Box sx={{ py: 8 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" fontWeight={700} sx={{ textAlign: 'center', mb: 1 }}>
          ¿Cómo funciona YakuZone?
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', mb: 5, maxWidth: 640, mx: 'auto' }}>
          De la fuente de agua a tu pantalla, en cuatro pasos.
        </Typography>

        <Grid container spacing={2} alignItems="stretch" justifyContent="center">
          {PASOS.map((paso, index) => (
            <React.Fragment key={paso.titulo}>
              <Grid item xs={12} sm={6} md={2.6}>
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.45, delay: index * 0.12 }}
                  style={{ height: '100%' }}
                >
                  <Paper elevation={2} sx={{ p: 3, height: '100%', textAlign: 'center', position: 'relative' }}>
                    <Typography
                      variant="caption"
                      sx={{
                        position: 'absolute',
                        top: 10,
                        right: 14,
                        color: 'text.disabled',
                        fontWeight: 700,
                      }}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </Typography>
                    <Stack alignItems="center" spacing={1.5}>
                      <Box sx={{ bgcolor: 'primary.main', color: '#fff', borderRadius: '50%', p: 1.4, display: 'flex' }}>
                        <paso.icon />
                      </Box>
                      <Typography variant="h6" fontWeight={600}>
                        {paso.titulo}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {paso.texto}
                      </Typography>
                    </Stack>
                  </Paper>
                </motion.div>
              </Grid>
              {index < PASOS.length - 1 && (
                <Grid
                  item
                  md={0.4}
                  sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center' }}
                >
                  <ArrowForwardIcon sx={{ color: 'text.disabled' }} />
                </Grid>
              )}
            </React.Fragment>
          ))}
        </Grid>
      </Container>
    </Box>
  );
};

export default HomeComoFunciona;
