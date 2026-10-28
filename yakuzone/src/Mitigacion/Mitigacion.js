import React, { useEffect, useMemo, useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Tabs,
  Tab,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import HealingIcon from '@mui/icons-material/Healing';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import RoomIcon from '@mui/icons-material/Room';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';

// Etiquetas legibles para cada parámetro (coinciden con utils/thresholds.js del backend)
const ETIQUETAS_PARAMETRO = {
  ph: 'pH',
  turbidez: 'Turbidez',
  conductividad: 'Conductividad eléctrica',
};

// Módulo de mitigación (objetivo 9 del alcance): sugerencias generadas
// automáticamente por la API de Gemini cuando una alerta se confirma,
// dirigidas al equipo de mitigación (administrador y rol equipo_mitigacion).
const Mitigacion = () => {
  const [sugerencias, setSugerencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0); // 0 = Pendientes, 1 = Historial completo
  const [procesandoId, setProcesandoId] = useState(null);

  const fetchSugerencias = async () => {
    try {
      const response = await axios.get('/mitigacion');
      setSugerencias(response.data);
      setError(null);
    } catch (err) {
      console.error('Error al obtener sugerencias de mitigación:', err);
      setError('No se pudieron cargar las sugerencias de mitigación.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSugerencias();
    const interval = setInterval(fetchSugerencias, 10000); // Igual que Notificaciones: cada 10 segundos
    return () => clearInterval(interval);
  }, []);

  const pendientes = useMemo(() => sugerencias.filter((s) => s.estado === 'pendiente'), [sugerencias]);
  const visibles = tab === 0 ? pendientes : sugerencias;

  const handleMarcarAtendida = async (id) => {
    setProcesandoId(id);
    try {
      await axios.put(`/mitigacion/${id}/atendida`);
      fetchSugerencias();
    } catch (err) {
      console.error('Error al marcar la sugerencia como atendida:', err);
    } finally {
      setProcesandoId(null);
    }
  };

  return (
    <>
      <PageHeader
        icon={HealingIcon}
        title="Mitigación"
        subtitle="Sugerencias de acción correctiva generadas por IA ante alertas confirmadas"
        action={
          pendientes.length > 0 && (
            <Chip
              label={`${pendientes.length} pendiente(s)`}
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
          <Tab label={`Pendientes (${pendientes.length})`} />
          <Tab label={`Historial (${sugerencias.length})`} />
        </Tabs>

        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error">{error}</Typography>
        ) : visibles.length === 0 ? (
          <Typography color="text.secondary">
            {tab === 0
              ? 'No hay sugerencias pendientes por el momento.'
              : 'Todavía no se generó ninguna sugerencia de mitigación.'}
          </Typography>
        ) : (
          <Stack spacing={2}>
            <AnimatePresence>
              {visibles.map((s, index) => (
                <motion.div
                  key={s.id}
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
                      bgcolor: s.estado === 'atendida' ? 'background.paper' : '#e8f5e9',
                      borderLeft: '4px solid',
                      borderColor: s.estado === 'atendida' ? 'divider' : 'success.main',
                      transition: 'box-shadow 0.2s ease',
                      '&:hover': { boxShadow: 4 },
                    }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Sensor: {s.numero_serie} — {ETIQUETAS_PARAMETRO[s.parametro] || s.parametro}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        {s.correo_enviado ? (
                          <Chip size="small" icon={<MarkEmailReadIcon />} label="Correo enviado" color="default" variant="outlined" />
                        ) : (
                          <Chip size="small" icon={<MailOutlineIcon />} label="Sin enviar" color="default" variant="outlined" />
                        )}
                        {s.estado === 'pendiente' ? (
                          <Chip label="Pendiente" color="success" size="small" />
                        ) : (
                          <Chip label="Atendida" color="default" size="small" />
                        )}
                      </Stack>
                    </Box>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
                    >
                      <RoomIcon fontSize="inherit" /> {s.ubicacion || 'Ubicación no registrada'}
                    </Typography>

                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Valor registrado: <strong>{s.valor}</strong> (rango aceptable: {s.rango_referencia})
                    </Typography>

                    <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, bgcolor: 'grey.50' }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                        {s.sugerencia}
                      </Typography>
                    </Paper>

                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, mb: 1 }}>
                      Generada el {new Date(s.creado_en).toLocaleString()}
                      {s.estado === 'atendida' && s.atendido_por_nombre && (
                        <> · Atendida por {s.atendido_por_nombre} {s.atendido_por_apellido}</>
                      )}
                    </Typography>

                    {s.estado === 'pendiente' && (
                      <Button
                        onClick={() => handleMarcarAtendida(s.id)}
                        variant="contained"
                        size="small"
                        disabled={procesandoId === s.id}
                        startIcon={procesandoId === s.id ? <CircularProgress size={14} color="inherit" /> : null}
                      >
                        Marcar como atendida
                      </Button>
                    )}
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

export default Mitigacion;
