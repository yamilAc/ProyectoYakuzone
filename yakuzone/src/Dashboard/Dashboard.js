import React, { useEffect, useState } from 'react';
import { Container, Typography, Box, Grid, Paper, Chip, Stack, CircularProgress, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
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
import SensorsIcon from '@mui/icons-material/Sensors';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import OpacityIcon from '@mui/icons-material/Opacity';
import ScienceIcon from '@mui/icons-material/Science';
import BoltIcon from '@mui/icons-material/Bolt';
import { motion } from 'framer-motion';
import DashboardIcon from '@mui/icons-material/Dashboard';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';
import { SensorMiniCardReal, SensorMiniCardPlaceholder } from './SensorMiniCard';
import { evaluarEstadoSensor, evaluarParametros, crearIconoEstado, COLORES_ESTADO, ETIQUETAS_ESTADO } from '../utils/estadoSensor';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const TOTAL_NODOS_PLANEADOS = 4;

const CENTRO_DEFAULT = { lat: -17.4033631, lng: -66.193527 };

const MINI_PARAMETROS = [
  { key: 'valor_temperatura', label: 'Temperatura', color: '#0E7C9B', icon: ThermostatIcon },
  { key: 'valor_turbidez', label: 'Turbidez', color: '#9C27B0', icon: OpacityIcon },
  { key: 'valor_ph', label: 'pH', color: '#ED6C02', icon: ScienceIcon },
  { key: 'valor_conductividad', label: 'Conductividad', color: '#009688', icon: BoltIcon },
];

const sparklineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 500 },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  elements: { point: { radius: 0 } },
  scales: { x: { display: false }, y: { display: false } },
};

const Dashboard = () => {
  const [sensores, setSensores] = useState([]);
  const [lecturas, setLecturas] = useState([]);
  const [sensorActividadId, setSensorActividadId] = useState('');
  const [ultimasPorSensor, setUltimasPorSensor] = useState({});
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resSensores, resLecturas, resUltimas, resAlertas] = await Promise.all([
          axios.get('/sensores'),
          axios.get('/lecturas'),
          axios.get('/lecturas/ultimas'),
          axios.get('/alertas'),
        ]);
        setSensores(resSensores.data);
        setSensorActividadId((actual) => actual || (resSensores.data[0] && resSensores.data[0].id) || '');
        setLecturas(resLecturas.data);
        const mapa = {};
        resUltimas.data.forEach((lectura) => {
          mapa[lectura.sensor_id] = lectura;
        });
        setUltimasPorSensor(mapa);
        setAlertas(resAlertas.data);
      } catch (error) {
        console.error('Error al cargar el dashboard:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sensoresValidos = sensores.filter((s) => s.latitud !== null && s.longitud !== null);
  const alertasActivas = alertas.filter((a) => !a.leida).length;
  const placeholders = Math.max(0, TOTAL_NODOS_PLANEADOS - sensores.length);

  const centro =
    sensoresValidos.length > 0
      ? { lat: parseFloat(sensoresValidos[0].latitud), lng: parseFloat(sensoresValidos[0].longitud) }
      : CENTRO_DEFAULT;

  return (
    <>
      <PageHeader
        icon={DashboardIcon}
        title="Dashboard General"
        subtitle={`Vista general de la red de sensores — previsualización a ${TOTAL_NODOS_PLANEADOS} nodos`}
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
                animation: 'dash-pulse 1.8s ease-in-out infinite',
              },
              '@keyframes dash-pulse': {
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
        <>
          <Stack direction="row" spacing={1.5} sx={{ my: 3, flexWrap: 'wrap', gap: 1 }}>
            <Chip icon={<SensorsIcon />} label={`${sensores.length} sensor(es) activo(s)`} color="primary" variant="outlined" />
            <Chip
              icon={<NotificationsActiveIcon />}
              label={`${alertasActivas} alerta(s) activa(s)`}
              color={alertasActivas > 0 ? 'error' : 'default'}
              variant="outlined"
            />
            <Chip icon={<CheckCircleIcon />} label="Sistema operativo" color="success" variant="outlined" />
          </Stack>

          <Typography variant="h6" fontWeight={600} gutterBottom>
            Red de sensores
          </Typography>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {sensores.map((sensor, index) => (
              <Grid item xs={12} sm={6} md={3} key={sensor.id}>
                <SensorMiniCardReal index={index} sensor={sensor} lecturas={lecturas} ultima={ultimasPorSensor[sensor.id]} />
              </Grid>
            ))}
            {Array.from({ length: placeholders }).map((_, i) => (
              <Grid item xs={12} sm={6} md={3} key={`placeholder-${i}`}>
                <SensorMiniCardPlaceholder index={sensores.length + i} numero={sensores.length + i + 1} />
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={3}>
            <Grid item xs={12} md={7}>
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
                <Paper elevation={2} sx={{ p: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Mapa de sensores
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      {['verde', 'amarillo', 'rojo'].map((e) => (
                        <Chip
                          key={e}
                          size="small"
                          label={ETIQUETAS_ESTADO[e]}
                          sx={{
                            bgcolor: `${COLORES_ESTADO[e]}18`,
                            color: COLORES_ESTADO[e],
                            fontWeight: 600,
                            '&::before': {
                              content: '""',
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: COLORES_ESTADO[e],
                              mr: 0.7,
                            },
                          }}
                        />
                      ))}
                    </Stack>
                  </Stack>
                  <Box sx={{ height: 380, borderRadius: 1, overflow: 'hidden' }}>
                    <MapContainer center={centro} zoom={15} style={{ height: '100%', width: '100%' }}>
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {sensoresValidos.map((sensor) => {
                        const ultima = ultimasPorSensor[sensor.id];
                        const estado = evaluarEstadoSensor(ultima);
                        const parametros = evaluarParametros(ultima);
                        return (
                          <Marker
                            key={sensor.id}
                            position={{ lat: parseFloat(sensor.latitud), lng: parseFloat(sensor.longitud) }}
                            icon={crearIconoEstado(estado)}
                          >
                            <Popup>
                              <div style={{ minWidth: 210 }}>
                                <strong>{sensor.n_serie}</strong>
                                <br />
                                {sensor.ubicacion}
                                <div style={{ marginTop: 6, fontWeight: 700, color: estado ? COLORES_ESTADO[estado] : '#9e9e9e' }}>
                                  {estado ? ETIQUETAS_ESTADO[estado] : 'Sin lecturas todavía'}
                                </div>
                                {parametros.length > 0 && (
                                  <div style={{ marginTop: 6, borderTop: '1px solid #eee', paddingTop: 6 }}>
                                    {parametros.map((p) => (
                                      <div key={p.campo} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 13 }}>
                                        <span
                                          style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            flexShrink: 0,
                                            background: p.estado ? COLORES_ESTADO[p.estado] : '#9e9e9e',
                                          }}
                                        />
                                        <span>
                                          {p.nombre}: {p.valor !== null ? `${p.valor.toFixed(1)}${p.unidad}` : '—'} — {p.texto}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </Popup>
                          </Marker>
                        );
                      })}
                    </MapContainer>
                  </Box>
                </Paper>
              </motion.div>
            </Grid>

            <Grid item xs={12} md={5}>
              <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
                <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Actividad en tiempo real
                    </Typography>
                    {sensores.length > 1 && (
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel id="dashboard-sensor-label">Sensor</InputLabel>
                        <Select
                          labelId="dashboard-sensor-label"
                          label="Sensor"
                          value={sensorActividadId}
                          onChange={(e) => setSensorActividadId(e.target.value)}
                        >
                          {sensores.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.n_serie}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Stack>
                  {(() => {
                    const lecturasDelSensor = sensorActividadId
                      ? lecturas.filter((l) => l.sensor_id === sensorActividadId)
                      : lecturas;
                    return (
                      <Stack spacing={1.5}>
                        {MINI_PARAMETROS.map((p) => {
                          const valores = lecturasDelSensor.map((l) => l[p.key]);
                          const actual = valores.length > 0 ? valores[valores.length - 1] : null;
                          const data = {
                            labels: lecturasDelSensor.map((l) => l.fecha_hora),
                            datasets: [
                              {
                                data: valores,
                                borderColor: p.color,
                                backgroundColor: `${p.color}22`,
                                fill: true,
                                tension: 0.35,
                                borderWidth: 2,
                              },
                            ],
                          };
                          return (
                            <Box key={p.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ bgcolor: `${p.color}22`, color: p.color, borderRadius: '50%', p: 0.8, display: 'flex' }}>
                                <p.icon fontSize="small" />
                              </Box>
                              <Box sx={{ width: 78 }}>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {p.label}
                                </Typography>
                                <Typography variant="body2" fontWeight={700}>
                                  {actual !== null && actual !== undefined ? Number(actual).toFixed(1) : '—'}
                                </Typography>
                              </Box>
                              <Box sx={{ flex: 1, height: 34 }}>
                                {lecturasDelSensor.length > 1 && <Line data={data} options={sparklineOptions} />}
                              </Box>
                            </Box>
                          );
                        })}
                      </Stack>
                    );
                  })()}
                </Paper>
              </motion.div>
            </Grid>
          </Grid>
        </>
      )}
      </Container>
    </>
  );
};

export default Dashboard;
