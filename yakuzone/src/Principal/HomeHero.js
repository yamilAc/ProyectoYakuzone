import React from 'react';
import { Box, Container, Typography, Button, Stack } from '@mui/material';
import { Link } from 'react-router-dom';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import RoomIcon from '@mui/icons-material/Room';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { motion } from 'framer-motion';

const HomeHero = () => {
  return (
    <Box
      sx={{
        background: 'linear-gradient(135deg, #0B5E77 0%, #0E7C9B 55%, #1CB5E0 100%)',
        color: '#fff',
        py: { xs: 8, md: 12 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Container maxWidth="md" sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.6, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <WaterDropIcon sx={{ fontSize: 52, mb: 1 }} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <Typography variant="h3" fontWeight={700} gutterBottom>
            Cooperativa "Hallein"
          </Typography>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
          <Typography variant="h6" sx={{ opacity: 0.92, fontWeight: 400, maxWidth: 640, mx: 'auto' }}>
            La Cooperativa OTB Barrio Hallein proporciona agua a toda la zona de
            Condebamba-Chiquicollo, en la ciudad de Cochabamba, Bolivia. YakuZone
            monitorea la calidad de esa agua en tiempo real, para que cada
            residente pueda confiar en lo que sale del grifo.
          </Typography>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.35 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mt: 4 }}>
            <Button
              component={Link}
              to="/Lectura"
              variant="contained"
              size="large"
              startIcon={<ShowChartIcon />}
              sx={{
                bgcolor: '#fff',
                color: 'primary.dark',
                fontWeight: 700,
                px: 3,
                '&:hover': { bgcolor: '#f0f7fa' },
              }}
            >
              Ver Lecturas en Vivo
            </Button>
            <Button
              component={Link}
              to="/zonas"
              variant="outlined"
              size="large"
              startIcon={<RoomIcon />}
              sx={{
                color: '#fff',
                borderColor: 'rgba(255,255,255,0.6)',
                fontWeight: 600,
                px: 3,
                '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              Ver Zona Monitoreada
            </Button>
          </Stack>
        </motion.div>
      </Container>

      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ display: 'flex', justifyContent: 'center', marginTop: 32, position: 'relative', zIndex: 1 }}
      >
        <KeyboardArrowDownIcon sx={{ opacity: 0.75 }} />
      </motion.div>
    </Box>
  );
};

export default HomeHero;
