import React, { useEffect, useState } from 'react';
import axios from '../axios/axiosConfig';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Container, Typography, Box, CircularProgress, Button, Paper, Chip, Stack, Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import OpacityIcon from '@mui/icons-material/Opacity';
import ScienceIcon from '@mui/icons-material/Science';
import BoltIcon from '@mui/icons-material/Bolt';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PageHeader from '../components/PageHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { NotificationContainer, NotificationManager } from 'react-notifications';
import 'react-notifications/lib/notifications.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// Un panel por parámetro, cada uno con su propia escala, color y umbral
// (mismo umbral que usa el backend en utils/thresholds.js, según la NB 512-04).
// La temperatura no tiene umbral normado, así que se muestra sin evaluar.
const PARAMETROS = [
  { key: 'valor_temperatura', label: 'Temperatura', unidad: '°C', color: '#0E7C9B', icon: ThermostatIcon, umbral: null },
  { key: 'valor_turbidez', label: 'Turbidez', unidad: ' NTU', color: '#9C27B0', icon: OpacityIcon, umbral: { min: 0, max: 1 } },
  { key: 'valor_ph', label: 'pH', unidad: '', color: '#ED6C02', icon: ScienceIcon, umbral: { min: 6.5, max: 8.5 } },
  { key: 'valor_conductividad', label: 'Conductividad', unidad: ' µS/cm', color: '#009688', icon: BoltIcon, umbral: { min: 0, max: 1500 } },
];

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: (i) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.08, ease: 'easeOut' } }),
};

const ParametroCard = ({ index, config, lecturas }) => {
  const { key, label, unidad, color, icon: Icon, umbral } = config;
  const valores = lecturas.map((l) => l[key]);
  const actual = valores.length > 0 ? valores[valores.length - 1] : null;

  let estado = null;
  if (umbral && actual !== null && actual !== undefined && !Number.isNaN(Number(actual))) {
    estado = Number(actual) < umbral.min || Number(actual) > umbral.max ? 'error' : 'success';
  }

  const data = {
    labels: lecturas.map((l) => new Date(l.fecha_hora).toLocaleTimeString()),
    datasets: [
      {
        label,
        data: valores,
        borderColor: color,
        backgroundColor: `${color}33`,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600 },
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
    scales: {
      x: { ticks: { color: '#888', maxTicksLimit: 6 }, grid: { display: false } },
      y: { ticks: { color: '#888' }, grid: { color: '#eef2f4' } },
    },
  };

  return (
    <Grid item xs={12} md={6}>
      <motion.div custom={index} initial="hidden" animate="show" variants={cardVariants} whileHover={{ y: -4 }}>
        <Paper elevation={2} sx={{ p: 2.5, height: '100%', transition: 'box-shadow 0.2s ease', '&:hover': { boxShadow: 6 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ bgcolor: `${color}22`, color, borderRadius: '50%', p: 1, display: 'flex' }}>
                <Icon fontSize="small" />
              </Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {label}
              </Typography>
            </Stack>
            {actual !== null && actual !== undefined && (
              <Chip
                label={`${Number(actual).toFixed(2)}${unidad}`}
                color={estado === 'error' ? 'error' : estado === 'success' ? 'success' : 'default'}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            )}
          </Stack>
          <Box sx={{ height: 200 }}>
            <Line data={data} options={options} />
          </Box>
        </Paper>
      </motion.div>
    </Grid>
  );
};

const Lectura = () => {
  const [lecturas, setLecturas] = useState([]);
  const [sensores, setSensores] = useState([]);
  const [sensorId, setSensorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [alertas, setAlertas] = useState([]);
  const [, setAlertasVistasIds] = useState(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [responseSensores, responseLecturas] = await Promise.all([
          axios.get('/sensores'),
          axios.get('/lecturas'),
        ]);
        setSensores(responseSensores.data);
        setSensorId((actual) => actual || (responseSensores.data[0] && responseSensores.data[0].id) || '');
        setLecturas(responseLecturas.data);

        // Las alertas ya vienen calculadas por el backend según la NB 512-04
        // (ver node/utils/thresholds.js); aquí solo se muestran.
        const responseAlertas = await axios.get('/alertas');
        setAlertas(responseAlertas.data);

        setAlertasVistasIds((vistasPrevias) => {
          const nuevas = responseAlertas.data.filter((a) => !vistasPrevias.has(a.id));
          nuevas.forEach((a) => {
            NotificationManager.warning(a.descripcion, `Alerta: ${a.numero_serie}`);
          });
          return new Set(responseAlertas.data.map((a) => a.id));
        });
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Actualiza cada 10 segundos
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(new Date());
    const timeInterval = setInterval(updateCurrentTime, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  const handleNotificationClick = (alerta) => {
    NotificationManager.info('Se ha clickeado en la notificación', '', 2000);
    console.log('Alerta clickeada:', alerta);
  };

  // Con varios sensores activos, las gráficas deben mostrar la serie de
  // tiempo de UN sensor a la vez — mezclar lecturas de sensores distintos
  // en la misma línea da un trazo sin sentido (saltos entre valores de
  // nodos diferentes en vez de la tendencia real de uno solo).
  const lecturasDelSensor = sensorId ? lecturas.filter((l) => l.sensor_id === sensorId) : lecturas;

  return (
    <>
      <NotificationContainer />
      <PageHeader
        icon={ShowChartIcon}
        title="Monitor de Calidad del Agua"
        subtitle="Lecturas de los sensores IoT en tiempo real"
        action={
          <Chip
            label={currentTime.toLocaleString()}
            sx={{
              fontWeight: 500,
              color: '#fff',
              bgcolor: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.4)',
              '&::before': {
                content: '""',
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: '#7CFFB2',
                mr: 1,
                animation: 'pulse 1.8s ease-in-out infinite',
              },
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.3 },
                '100%': { opacity: 1 },
              },
            }}
          />
        }
      />

      <Container maxWidth="lg" sx={{ pb: 4 }}>
      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {sensores.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 260, mb: 3 }}>
              <InputLabel id="lectura-sensor-label">Sensor</InputLabel>
              <Select
                labelId="lectura-sensor-label"
                label="Sensor"
                value={sensorId}
                onChange={(e) => setSensorId(e.target.value)}
              >
                {sensores.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.n_serie} — {s.descripcion || s.ubicacion}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Grid container spacing={3} sx={{ mb: 4 }}>
            {PARAMETROS.map((config, index) => (
              <ParametroCard key={config.key} index={index} config={config} lecturas={lecturasDelSensor} />
            ))}
          </Grid>

          <Typography variant="h6" fontWeight={600} gutterBottom>
            Notificaciones
          </Typography>
          {alertas.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Sin alertas activas.
            </Typography>
          )}
          <Stack spacing={2}>
            <AnimatePresence>
              {alertas.map((alerta, index) => (
                <motion.div
                  key={alerta.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3, delay: index * 0.04 }}
                >
                  <Paper elevation={1} sx={{ p: 2, borderLeft: '4px solid', borderColor: 'error.main' }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Sensor {alerta.numero_serie} — {alerta.tipo_alerta}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Descripción: {alerta.descripcion}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Fecha y Hora: {new Date(alerta.fecha_hora).toLocaleString()}
                    </Typography>
                    <Button onClick={() => handleNotificationClick(alerta)} variant="contained" size="small">
                      Ver detalles
                    </Button>
                  </Paper>
                </motion.div>
              ))}
            </AnimatePresence>
          </Stack>
        </Box>
      )}
      </Container>
    </>
  );
};
export default Lectura;
