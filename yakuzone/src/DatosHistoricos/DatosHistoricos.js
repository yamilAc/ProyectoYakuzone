import React, { useState, useEffect } from 'react';
import axios from '../axios/axiosConfig';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Tooltip,
  Typography,
  Stack,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SummarizeIcon from '@mui/icons-material/Summarize';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import ReporteDialog from '../components/ReporteDialog';

const estiloBotonEncabezado = { bgcolor: 'rgba(255,255,255,0.18)', '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' } };

const DatosHistoricos = () => {
  const [loading, setLoading] = useState(false);
  const [sensores, setSensores] = useState([]);
  const [error, setError] = useState(null);
  // { tipo: 'general' | 'alertas', sensor } del reporte que se va a descargar
  const [reporte, setReporte] = useState(null);
  const navigate = useNavigate();

  const fetchSensores = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/sensores');
      setSensores(response.data);
    } catch (error) {
      console.error('Error al obtener datos históricos de los sensores:', error);
      setError('No tienes permiso para acceder a estos datos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSensores();
  }, []);

  const handleVerificar = (sensorId) => {
    navigate('/graficoSensor', { state: { sensorId } });
  };

  return (
    <>
      <PageHeader
        icon={HistoryIcon}
        title="Datos Históricos de Sensores"
        subtitle="Consulta el registro completo por sensor y rango de fechas"
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" startIcon={<ListAltIcon />} onClick={() => navigate('/HistorialAlertas')} sx={estiloBotonEncabezado}>
              Historial de alertas
            </Button>
            <Button variant="contained" startIcon={<AssessmentIcon />} onClick={() => setReporte({ tipo: 'general' })} sx={estiloBotonEncabezado}>
              Reporte general
            </Button>
          </Stack>
        }
      />
      <Container sx={{ pb: 4 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error">{error}</Typography>
        ) : (
          <TableContainer component={Paper} elevation={2}>
            <Table>
              <TableHead>
                <TableRow sx={{ background: 'linear-gradient(90deg, #0B5E77 0%, #0E7C9B 55%, #1CB5E0 100%)' }}>
                  <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Número de Serie</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Ubicación</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Descripción</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 'bold' }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {sensores.map((sensor) => (
                  <TableRow key={sensor.id} hover component={motion.tr} whileHover={{ scale: 1.01 }}>
                    <TableCell>{sensor.n_serie}</TableCell>
                    <TableCell>{sensor.ubicacion}</TableCell>
                    <TableCell>{sensor.descripcion}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                        <Tooltip title={`Verificar sensor: ${sensor.n_serie}`} arrow>
                          <Button variant="contained" size="small" onClick={() => handleVerificar(sensor.id)}>
                            Verificar
                          </Button>
                        </Tooltip>
                        <Tooltip title={`Descargar el reporte de alertas de ${sensor.n_serie} (PDF o Excel)`} arrow>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<SummarizeIcon />}
                            onClick={() => setReporte({ tipo: 'alertas', sensor })}
                          >
                            Reporte de alertas
                          </Button>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>

      <ReporteDialog open={Boolean(reporte)} onClose={() => setReporte(null)} tipo={reporte?.tipo} sensor={reporte?.sensor} />
    </>
  );
};

export default DatosHistoricos;
