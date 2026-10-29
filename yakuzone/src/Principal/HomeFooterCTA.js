import React from 'react';
import { Box, Container, Typography, Button, Stack } from '@mui/material';
import { Link } from 'react-router-dom';
import RoomIcon from '@mui/icons-material/Room';
import SchoolIcon from '@mui/icons-material/School';
import { motion } from 'framer-motion';
import { getUserRole } from '../axios/auth';

const HomeFooterCTA = () => {
  const esJefe = getUserRole() === 'equipo_mitigacion';
  return (
    <Box
      sx={{
        py: 7,
        textAlign: 'center',
        background: 'linear-gradient(135deg, #0B5E77 0%, #0E7C9B 55%, #1CB5E0 100%)',
        color: '#fff',
      }}
    >
      <Container maxWidth="sm">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
        >
          <Typography variant="h5" fontWeight={700} gutterBottom>
            El agua de tu comunidad, siempre bajo control
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9, mb: 3 }}>
            Explora el panel de monitoreo y revisa el estado actual de la zona.
          </Typography>
          <Button
            component={Link}
            to={esJefe ? '/Alerta' : '/Lectura'}
            variant="contained"
            size="large"
            sx={{ bgcolor: '#fff', color: 'primary.dark', fontWeight: 700, '&:hover': { bgcolor: '#f0f7fa' } }}
          >
            {esJefe ? 'Ir a mis alertas' : 'Ir al Panel de Monitoreo'}
          </Button>

          <Stack
            direction="row"
            spacing={3}
            justifyContent="center"
            alignItems="center"
            sx={{ mt: 4, opacity: 0.85, flexWrap: 'wrap', rowGap: 1 }}
          >
            <Stack direction="row" spacing={0.7} alignItems="center">
              <RoomIcon fontSize="small" />
              <Typography variant="caption">OTB Urbanización Halein, Chiquicollo — Cochabamba</Typography>
            </Stack>
            <Stack direction="row" spacing={0.7} alignItems="center">
              <SchoolIcon fontSize="small" />
              <Typography variant="caption">Proyecto de Grado · Universidad del Valle</Typography>
            </Stack>
          </Stack>
        </motion.div>
      </Container>
    </Box>
  );
};

export default HomeFooterCTA;
