import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import {
  Container,
  TextField,
  Button,
  CircularProgress,
  Grid,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Paper,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useLocation } from 'react-router-dom';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const GraficoSensor = () => {
  const location = useLocation();
  const sensorIdPreseleccionado = location.state?.sensorId;

  const [fechaInicio, setFechaInicio] = useState(null);
  const [fechaFin, setFechaFin] = useState(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [sensores, setSensores] = useState([]);
  const [sensorId, setSensorId] = useState(sensorIdPreseleccionado || '');

  // Carga la lista real de sensores registrados (antes estaba fija a 1/2/3).
  useEffect(() => {
    const fetchSensores = async () => {
      try {
        const response = await axios.get('/sensores');
        setSensores(response.data);
        if (!sensorIdPreseleccionado && response.data.length > 0) {
          setSensorId(response.data[0].id);
        }
      } catch (error) {
        console.error('Error al obtener la lista de sensores:', error);
      }
    };
    fetchSensores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartConfig = {
    labels: [],
    datasets: [
      { label: 'Temperatura (°C)', data: [], borderColor: 'rgba(14, 124, 155, 1)', backgroundColor: 'rgba(14, 124, 155, 0.2)' },
      { label: 'Turbidez (NTU)', data: [], borderColor: 'rgba(156, 39, 176, 1)', backgroundColor: 'rgba(156, 39, 176, 0.2)' },
      { label: 'pH', data: [], borderColor: 'rgba(237, 108, 2, 1)', backgroundColor: 'rgba(237, 108, 2, 0.2)' },
      { label: 'Conductividad (µS/cm)', data: [], borderColor: 'rgba(0, 150, 136, 1)', backgroundColor: 'rgba(0, 150, 136, 0.2)' },
    ],
  };

  const obtenerLecturas = async () => {
    if (!sensorId || !fechaInicio || !fechaFin) return;
    setLoading(true);
    try {
      const formattedFechaInicio = fechaInicio.toISOString().split('T')[0];
      const formattedFechaFin = fechaFin.toISOString().split('T')[0];

      const response = await axios.get(`/lecturas/${sensorId}`, {
        params: { fechaInicio: formattedFechaInicio, fechaFin: formattedFechaFin },
      });

      const labels = response.data.map((item) => new Date(item.fecha_hora).toLocaleString('es-ES'));
      const temperaturas = response.data.map((item) => item.valor_temperatura);
      const turbidez = response.data.map((item) => item.valor_turbidez);
      const ph = response.data.map((item) => item.valor_ph);
      const conductividad = response.data.map((item) => item.valor_conductividad);

      setData({
        ...chartConfig,
        labels,
        datasets: [
          { ...chartConfig.datasets[0], data: temperaturas },
          { ...chartConfig.datasets[1], data: turbidez },
          { ...chartConfig.datasets[2], data: ph },
          { ...chartConfig.datasets[3], data: conductividad },
        ],
      });
    } catch (error) {
      console.error('Error al obtener las lecturas:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={ShowChartIcon}
        title="Gráfico de Datos del Sensor"
        subtitle="Historial detallado por sensor y rango de fechas"
      />
      <Container maxWidth="lg" sx={{ pb: 4 }}>
      <Paper elevation={2} sx={{ p: 3 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Fecha Inicio"
                value={fechaInicio}
                onChange={(newValue) => setFechaInicio(newValue)}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Fecha Fin"
                value={fechaFin}
                onChange={(newValue) => setFechaFin(newValue)}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel id="sensor-select-label">Seleccionar Sensor</InputLabel>
                <Select
                  labelId="sensor-select-label"
                  value={sensorId}
                  label="Seleccionar Sensor"
                  onChange={(event) => setSensorId(event.target.value)}
                >
                  {sensores.map((sensor) => (
                    <MenuItem key={sensor.id} value={sensor.id}>
                      {sensor.n_serie} — {sensor.ubicacion}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="contained"
                fullWidth
                size="large"
                onClick={obtenerLecturas}
                disabled={!sensorId || !fechaInicio || !fechaFin || loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Generar Gráfico'}
              </Button>
            </Grid>
          </Grid>
        </LocalizationProvider>
      </Paper>

      {data && (
        <Paper elevation={2} sx={{ p: 3, mt: 4 }}>
          <Line data={data} />
        </Paper>
      )}
      </Container>
    </>
  );
};

export default GraficoSensor;
