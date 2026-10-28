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
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';

const DatosHistoricos = () => {
  const [loading, setLoading] = useState(false);
  const [sensores, setSensores] = useState([]);
  const [error, setError] = useState(null);
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
                      <Tooltip title={`Verificar sensor: ${sensor.n_serie}`} arrow>
                        <Button variant="contained" size="small" onClick={() => handleVerificar(sensor.id)}>
                          Verificar
                        </Button>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>
    </>
  );
};

export default DatosHistoricos;
