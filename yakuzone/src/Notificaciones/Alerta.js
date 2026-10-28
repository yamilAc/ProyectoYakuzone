import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../axios/axiosConfig';
import { Container, Typography, Box, Button, Chip, CircularProgress, Paper, Stack, Tabs, Tab } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PageHeader from '../components/PageHeader';

// Etiquetas legibles para cada parámetro (coinciden con utils/thresholds.js del backend)
const ETIQUETAS_PARAMETRO = {
  ph: 'pH',
  turbidez: 'Turbidez',
  conductividad: 'Conductividad eléctrica',
};

const Alerta = () => {
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0); // 0 = Activas, 1 = Historial completo
  const navigate = useNavigate();

  const fetchAlertas = async () => {
    try {
      const response = await axios.get('/alertas');
      setAlertas(response.data);
      setError(null);
    } catch (err) {
      console.error('Error al obtener alertas:', err);
      setError('No se pudieron cargar las alertas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertas();
    const interval = setInterval(fetchAlertas, 10000); // Actualiza cada 10 segundos
    return () => clearInterval(interval);
  }, []);

  const handleVerLectura = () => {
    navigate('/Lectura');
  };

  const handleMarcarLeida = async (id) => {
    try {
      await axios.put(`/alertas/${id}/leida`);
      fetchAlertas();
    } catch (err) {
      console.error('Error al marcar la alerta como leída:', err);
    }
  };

  const activas = useMemo(() => alertas.filter((a) => !a.leida), [alertas]);
  const visibles = tab === 0 ? activas : alertas;

  return (
    <>
      <PageHeader
        icon={NotificationsIcon}
        title="Notificaciones"
        subtitle="Alertas activas e historial completo, en un solo lugar"
        action={
          activas.length > 0 && (
            <Chip
              label={`${activas.length} activa(s)`}
              sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', fontWeight: 600 }}
            />
          )
        }
      />
      <Container maxWidth="md" sx={{ pb: 4 }}>
      <Tabs
        value={tab}
        onChange={(e, val) => setTab(val)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label={`Activas (${activas.length})`} />
        <Tab label={`Historial (${alertas.length})`} />
      </Tabs>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : visibles.length === 0 ? (
        <Typography color="text.secondary">
          {tab === 0 ? 'No hay alertas activas por el momento.' : 'Todavía no hay historial de notificaciones.'}
        </Typography>
      ) : (
        <Stack spacing={2}>
          <AnimatePresence>
            {visibles.map((alerta, index) => (
              <motion.div
                key={alerta.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3, delay: index * 0.04 }}
              >
                <Paper
                  elevation={1}
                  sx={{
                    p: 2,
                    bgcolor: alerta.leida ? 'background.paper' : '#fff3e0',
                    borderLeft: '4px solid',
                    borderColor: alerta.leida ? 'divider' : 'warning.main',
                    transition: 'box-shadow 0.2s ease',
                    '&:hover': { boxShadow: 4 },
                  }}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight={600}>
                      Sensor: {alerta.numero_serie} — {ETIQUETAS_PARAMETRO[alerta.parametro] || alerta.parametro}
                    </Typography>
                    {!alerta.leida && <Chip label="Nueva" color="warning" size="small" />}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {alerta.descripcion}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Fecha y hora: {new Date(alerta.fecha_hora).toLocaleString()}
                  </Typography>
                  <Box display="flex" gap={1}>
                    <Button onClick={handleVerLectura} variant="contained" size="small">
                      Ver lecturas
                    </Button>
                    {!alerta.leida && (
                      <Button onClick={() => handleMarcarLeida(alerta.id)} variant="outlined" size="small">
                        Marcar como leída
                      </Button>
                    )}
                  </Box>
                </Paper>
              </motion.div>
            ))}
          </AnimatePresence>
        </Stack>
      )}
      </Container>
    </>
  );
};

export default Alerta;
