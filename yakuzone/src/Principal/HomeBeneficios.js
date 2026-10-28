import React from 'react';
import { Box, Container, Typography, Grid, Paper, Stack } from '@mui/material';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DevicesIcon from '@mui/icons-material/Devices';
import { motion } from 'framer-motion';

const BENEFICIOS = [
  {
    icon: HealthAndSafetyIcon,
    titulo: 'Detección temprana',
    texto: 'Identifica cambios en la calidad del agua antes de que se conviertan en un problema de salud para la comunidad.',
  },
  {
    icon: NotificationsActiveIcon,
    titulo: 'Alertas instantáneas',
    texto: 'El sistema avisa automáticamente apenas un parámetro sale del rango seguro establecido por la norma NB 512-04.',
  },
  {
    icon: TrendingUpIcon,
    titulo: 'Historial y tendencias',
    texto: 'Consulta cómo se comportó el agua a lo largo del tiempo y toma mejores decisiones de mantenimiento.',
  },
  {
    icon: DevicesIcon,
    titulo: 'Acceso desde cualquier lugar',
    texto: 'El panel es accesible desde computadora o celular, sin instalar nada adicional.',
  },
];

const HomeBeneficios = () => {
  return (
    <Box sx={{ py: 8 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" fontWeight={700} sx={{ textAlign: 'center', mb: 1 }}>
          ¿Por qué usar YakuZone?
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', mb: 5 }}>
          Beneficios reales para la cooperativa y sus residentes.
        </Typography>

        <Grid container spacing={3}>
          {BENEFICIOS.map((b, index) => (
            <Grid item xs={12} sm={6} md={3} key={b.titulo}>
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
                  sx={{
                    p: 3,
                    height: '100%',
                    textAlign: 'center',
                    transition: 'box-shadow 0.25s ease',
                    '&:hover': { boxShadow: 6 },
                  }}
                >
                  <Stack alignItems="center" spacing={1.5}>
                    <Box
                      sx={{
                        background: 'linear-gradient(135deg, #0B5E77 0%, #1CB5E0 100%)',
                        color: '#fff',
                        borderRadius: '50%',
                        width: 56,
                        height: 56,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <b.icon />
                    </Box>
                    <Typography variant="h6" fontWeight={600}>
                      {b.titulo}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {b.texto}
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

export default HomeBeneficios;
