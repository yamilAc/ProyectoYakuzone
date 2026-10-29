import React, { useState, useEffect, useMemo } from 'react';
import axios from '../axios/axiosConfig';
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
  TextField,
  InputAdornment,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SummarizeIcon from '@mui/icons-material/Summarize';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SearchIcon from '@mui/icons-material/Search';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import ReporteDialog from '../components/ReporteDialog';
import GraficosSensorDialog from './GraficosSensorDialog';

const estiloBotonEncabezado = { bgcolor: 'rgba(255,255,255,0.18)', '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' } };

const DatosHistoricos = () => {
  const [loading, setLoading] = useState(false);
  const [sensores, setSensores] = useState([]);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  // { tipo: 'alertas' | 'alertas-general' | 'general', sensor } del reporte a descargar
  const [reporte, setReporte] = useState(null);
  // Sensor cuyos gráficos se muestran en la ventana de "Verificar"
  const [sensorGraficos, setSensorGraficos] = useState(null);

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

  const sensoresFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return sensores;
    return sensores.filter((s) =>
      [s.n_serie, s.ubicacion, s.descripcion, s.propietario_nombre].filter(Boolean).some((t) => t.toLowerCase().includes(termino))
    );
  }, [sensores, busqueda]);

  return (
    <>
      <PageHeader
        icon={HistoryIcon}
        title="Datos Históricos de Sensores"
        subtitle="Consulta el registro completo por sensor y rango de fechas"
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" startIcon={<ListAltIcon />} onClick={() => setReporte({ tipo: 'alertas-general' })} sx={estiloBotonEncabezado}>
              Reporte general de alertas
            </Button>
            <Button variant="contained" startIcon={<AssessmentIcon />} onClick={() => setReporte({ tipo: 'general' })} sx={estiloBotonEncabezado}>
              Reporte general
            </Button>
          </Stack>
        }
      />
      <Container sx={{ pb: 4 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Buscar sensor por número de serie, ubicación, descripción o propietario..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          sx={{ mb: 2.5, bgcolor: 'background.paper', borderRadius: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />

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
                  <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Propietario</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Descripción</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 'bold' }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {sensoresFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        {sensores.length === 0 ? 'Todavía no hay sensores registrados.' : 'Ningún sensor coincide con la búsqueda.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  sensoresFiltrados.map((sensor) => (
                    <TableRow key={sensor.id} hover component={motion.tr} whileHover={{ scale: 1.01 }}>
                      <TableCell>{sensor.n_serie}</TableCell>
                      <TableCell>{sensor.ubicacion}</TableCell>
                      <TableCell>{sensor.propietario_nombre || '—'}</TableCell>
                      <TableCell>{sensor.descripcion}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                          <Tooltip title={`Ver los gráficos de ${sensor.n_serie}`} arrow>
                            <Button variant="contained" size="small" startIcon={<ShowChartIcon />} onClick={() => setSensorGraficos(sensor)}>
                              Verificar
                            </Button>
                          </Tooltip>
                          <Tooltip title={`Descargar el reporte de alertas de ${sensor.n_serie} (PDF o Excel)`} arrow>
                            <Button variant="outlined" size="small" startIcon={<SummarizeIcon />} onClick={() => setReporte({ tipo: 'alertas', sensor })}>
                              Reporte de alertas
                            </Button>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>

      <GraficosSensorDialog sensor={sensorGraficos} onClose={() => setSensorGraficos(null)} />
      <ReporteDialog open={Boolean(reporte)} onClose={() => setReporte(null)} tipo={reporte?.tipo} sensor={reporte?.sensor} />
    </>
  );
};

export default DatosHistoricos;
