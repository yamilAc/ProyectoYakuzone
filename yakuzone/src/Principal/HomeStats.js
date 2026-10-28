import React, { useEffect, useState } from 'react';
import { Box, Container, Grid, Paper, Typography, Stack } from '@mui/material';
import SensorsIcon from '@mui/icons-material/Sensors';
import ScienceIcon from '@mui/icons-material/Science';
import GavelIcon from '@mui/icons-material/Gavel';
import TimelineIcon from '@mui/icons-material/Timeline';
import { motion } from 'framer-motion';
import axios from '../axios/axiosConfig';

// Cuenta ascendente simple (sin dependencias extra) desde 0 hasta el valor
// objetivo, disparada una sola vez cuando el número está listo.
const useConteo = (valorObjetivo, activo) => {
  const [valor, setValor] = useState(0);

  useEffect(() => {
    if (!activo || valorObjetivo === null) return;
    let inicio = null;
    const duracion = 900;
    let frame;

    const tick = (timestamp) => {
      if (!inicio) inicio = timestamp;
      const progreso = Math.min((timestamp - inicio) / duracion, 1);
      setValor(Math.round(progreso * valorObjetivo));
      if (progreso < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [valorObjetivo, activo]);

  return valor;
};

const StatCard = ({ icon: Icon, valor, sufijo, label, index }) => {
  const numero = useConteo(valor, valor !== null);
  return (
    <Grid item xs={6} md={3}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.45, delay: index * 0.1 }}
      >
        <Paper elevation={2} sx={{ p: 3, textAlign: 'center', height: '100%' }}>
          <Stack alignItems="center" spacing={1}>
            <Box sx={{ bgcolor: 'primary.main', color: '#fff', borderRadius: '50%', p: 1.2, display: 'flex' }}>
              <Icon />
            </Box>
            <Typography variant="h4" fontWeight={700}>
              {valor === null ? '—' : `${numero}${sufijo || ''}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
          </Stack>
        </Paper>
      </motion.div>
    </Grid>
  );
};

const HomeStats = () => {
  const [numSensores, setNumSensores] = useState(null);

  useEffect(() => {
    const fetchSensores = async () => {
      try {
        const response = await axios.get('/sensores');
        setNumSensores(Array.isArray(response.data) ? response.data.length : null);
      } catch (error) {
        console.error('Error al obtener el número de sensores:', error);
      }
    };
    fetchSensores();
  }, []);

  return (
    <Box sx={{ py: 6, bgcolor: 'background.paper' }}>
      <Container maxWidth="lg">
        <Grid container spacing={3}>
          <StatCard icon={SensorsIcon} valor={numSensores} label="Sensores activos" index={0} />
          <StatCard icon={ScienceIcon} valor={4} label="Parámetros monitoreados" index={1} />
          <StatCard icon={GavelIcon} valor={512} sufijo="-04" label="Norma NB aplicada" index={2} />
          <StatCard icon={TimelineIcon} valor={100} sufijo="%" label="Monitoreo en tiempo real" index={3} />
        </Grid>
      </Container>
    </Box>
  );
};

export default HomeStats;
