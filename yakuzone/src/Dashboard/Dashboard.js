import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Grid,
  Paper,
  Chip,
  Stack,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  Button,
  Collapse,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Line } from 'react-chartjs-2';
import SensorsIcon from '@mui/icons-material/Sensors';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { motion } from 'framer-motion';
import DashboardIcon from '@mui/icons-material/Dashboard';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';
import GraficoParametro, { PARAMETROS_GRAFICO, conUnidad, fueraDeRango, textoRango } from '../components/GraficoParametro';
import { SensorMiniCardReal, SensorMiniCardPlaceholder } from './SensorMiniCard';
import { evaluarEstadoSensor, evaluarParametros, crearIconoEstado, COLORES_ESTADO, ETIQUETAS_ESTADO } from '../utils/estadoSensor';

const TOTAL_NODOS_PLANEADOS = 4;
const MAX_SENSORES_VISIBLES = 8;
const LECTURAS_ACTIVIDAD = 60;
const TODOS = 'todos';

const CENTRO_DEFAULT = { lat: -17.4033631, lng: -66.193527 };

const sparklineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 500 },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  elements: { point: { radius: 0 } },
  scales: { x: { display: false }, y: { display: false } },
};

const posicion = (sensor) => [parseFloat(sensor.latitud), parseFloat(sensor.longitud)];

// Mueve el mapa al sensor elegido en "Actividad en tiempo real", o encuadra
// todos los sensores cuando no hay uno elegido. Solo se mueve cuando cambia
// la selección (no en cada actualización de datos, para no perder el zoom
// que haya hecho el usuario).
const EnfocarMapa = ({ sensores, seleccionado }) => {
  const map = useMap();
  const objetivo = seleccionado ? `sensor-${seleccionado.id}` : `todos-${sensores.map((s) => s.id).join(',')}`;
  useEffect(() => {
    if (seleccionado) {
      map.flyTo(posicion(seleccionado), 17, { duration: 0.8 });
    } else if (sensores.length > 1) {
      map.flyToBounds(sensores.map(posicion), { padding: [40, 40], maxZoom: 16, duration: 0.8 });
    } else if (sensores.length === 1) {
      map.flyTo(posicion(sensores[0]), 16, { duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objetivo, map]);
  return null;
};

const ChipEstado = ({ estado }) => {
  const color = estado ? COLORES_ESTADO[estado] : '#9e9e9e';
  return (
    <Chip
      size="small"
      label={estado ? ETIQUETAS_ESTADO[estado] : 'Sin datos'}
      sx={{
        bgcolor: `${color}18`,
        color,
        fontWeight: 600,
        '&::before': { content: '""', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: color, mr: 0.7 },
      }}
    />
  );
};

// Fila de un parámetro en "Actividad en tiempo real": valor actual y una
// mini tendencia; al tocarla se despliega la gráfica completa con sus
// límites de la NB 512-04.
const FilaParametro = ({ config, lecturas, abierta, onToggle }) => {
  const { key, label, unidad, color, icon: Icon, umbral } = config;
  const valores = lecturas.map((l) => l[key]);
  const actual = valores.length > 0 ? valores[valores.length - 1] : null;
  const fuera = fueraDeRango(actual, umbral);

  return (
    <Box sx={{ border: '1px solid', borderColor: abierta ? `${color}66` : 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Box
        onClick={onToggle}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Box sx={{ bgcolor: `${color}22`, color, borderRadius: '50%', p: 0.8, display: 'flex' }}>
          <Icon fontSize="small" />
        </Box>
        <Box sx={{ width: 104 }}>
          <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
            {label}
          </Typography>
          <Typography variant="body2" fontWeight={700} color={fuera ? 'error.main' : 'text.primary'}>
            {conUnidad(actual, unidad, 1)}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, height: 32, minWidth: 0 }}>
          {lecturas.length > 1 && (
            <Line
              data={{
                labels: lecturas.map((l) => l.fecha_hora),
                datasets: [{ data: valores, borderColor: color, backgroundColor: `${color}22`, fill: true, tension: 0.35, borderWidth: 2 }],
              }}
              options={sparklineOptions}
            />
          )}
        </Box>
        <ExpandMoreIcon sx={{ color: 'text.secondary', transition: 'transform 0.2s', transform: abierta ? 'rotate(180deg)' : 'none' }} />
      </Box>
      <Collapse in={abierta} unmountOnExit>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            {umbral ? `Rango aceptable (NB 512-04): ${textoRango(config)}` : 'Sin límite normado (dato de referencia)'}
          </Typography>
          <GraficoParametro config={config} lecturas={lecturas} alto={220} />
        </Box>
      </Collapse>
    </Box>
  );
};

const Dashboard = () => {
  const [sensores, setSensores] = useState([]);
  const [ultimasPorSensor, setUltimasPorSensor] = useState({});
  const [resumenAlertas, setResumenAlertas] = useState({ pendiente: 0, asignada: 0, en_revision: 0 });
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [busqueda, setBusqueda] = useState('');
  const navigate = useNavigate();
  const [seleccionId, setSeleccionId] = useState(TODOS);
  const [lecturasSeleccion, setLecturasSeleccion] = useState([]);
  const [parametroAbierto, setParametroAbierto] = useState('valor_ph');
  const actividadRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resSensores, resUltimas, resResumen] = await Promise.all([
          axios.get('/sensores'),
          axios.get('/lecturas/ultimas'),
          axios.get('/alertas/resumen'),
        ]);
        setSensores(resSensores.data);
        const mapa = {};
        resUltimas.data.forEach((lectura) => {
          mapa[lectura.sensor_id] = lectura;
        });
        setUltimasPorSensor(mapa);
        setResumenAlertas(resResumen.data);
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

  // Serie de tiempo del sensor elegido en "Actividad en tiempo real".
  useEffect(() => {
    if (seleccionId === TODOS) {
      setLecturasSeleccion([]);
      return undefined;
    }
    let activo = true;
    const fetchSeleccion = async () => {
      try {
        const res = await axios.get('/lecturas', { params: { sensor_id: seleccionId, limite: LECTURAS_ACTIVIDAD } });
        if (activo) setLecturasSeleccion(res.data);
      } catch (error) {
        console.error('Error al cargar la actividad del sensor:', error);
      }
    };
    fetchSeleccion();
    const interval = setInterval(fetchSeleccion, 10000);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, [seleccionId]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sensoresFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return sensores;
    return sensores.filter((s) =>
      [s.n_serie, s.ubicacion, s.descripcion, s.propietario_nombre].filter(Boolean).some((t) => t.toLowerCase().includes(termino))
    );
  }, [sensores, busqueda]);

  const sensoresVisibles = sensoresFiltrados.slice(0, MAX_SENSORES_VISIBLES);
  const sensoresValidos = sensores.filter((s) => s.latitud !== null && s.longitud !== null);
  const seleccionado = seleccionId === TODOS ? null : sensores.find((s) => s.id === seleccionId) || null;
  const enMapa = seleccionado ? sensoresValidos.filter((s) => s.id === seleccionado.id) : sensoresValidos;
  // Activas = todavía sin mitigar (sin asignar, asignadas o con informe por revisar).
  const alertasActivas = resumenAlertas.pendiente + resumenAlertas.asignada + (resumenAlertas.en_revision || 0);
  const placeholders = busqueda ? 0 : Math.max(0, TOTAL_NODOS_PLANEADOS - sensores.length);
  const ultimaSeleccion = seleccionado ? ultimasPorSensor[seleccionado.id] : null;

  const elegirSensor = (id, desplazar = false) => {
    setSeleccionId(id);
    if (desplazar && actividadRef.current) {
      actividadRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', sm: 'center' }}
              spacing={1.5}
              sx={{ mb: 1.5 }}
            >
              <Typography variant="h6" fontWeight={600}>
                Red de sensores
              </Typography>
              <TextField
                size="small"
                placeholder="Buscar sensor por número, ubicación o propietario..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                sx={{ width: { xs: '100%', sm: 380 }, bgcolor: 'background.paper', borderRadius: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>

            {sensoresFiltrados.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 4 }}>
                {sensores.length === 0 ? 'Todavía no hay sensores registrados.' : 'Ningún sensor coincide con la búsqueda.'}
              </Typography>
            ) : (
              <Grid container spacing={2} sx={{ mb: 1 }}>
                {sensoresVisibles.map((sensor, index) => (
                  <Grid item xs={12} sm={6} md={3} key={sensor.id}>
                    <SensorMiniCardReal
                      index={index}
                      sensor={sensor}
                      seleccionado={sensor.id === seleccionId}
                      onClick={() => elegirSensor(sensor.id, true)}
                    />
                  </Grid>
                ))}
                {Array.from({ length: placeholders }).map((_, i) => (
                  <Grid item xs={12} sm={6} md={3} key={`placeholder-${i}`}>
                    <SensorMiniCardPlaceholder index={sensores.length + i} numero={sensores.length + i + 1} />
                  </Grid>
                ))}
              </Grid>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 0.5, mb: 4 }}>
              {sensoresFiltrados.length > MAX_SENSORES_VISIBLES && (
                <Typography variant="caption" color="text.secondary">
                  Se muestran {MAX_SENSORES_VISIBLES} de {sensoresFiltrados.length} sensores
                </Typography>
              )}
              <Button variant="outlined" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/Sensores')}>
                Ver todos los sensores 
              </Button>
            </Box>

            <Grid container spacing={3} ref={actividadRef} sx={{ scrollMarginTop: 16 }}>
              <Grid item xs={12} md={7}>
                <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
                  <Paper elevation={2} sx={{ p: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {seleccionado ? `Mapa — ${seleccionado.n_serie}` : 'Mapa de sensores'}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        {['verde', 'amarillo', 'rojo'].map((e) => (
                          <ChipEstado key={e} estado={e} />
                        ))}
                      </Stack>
                    </Stack>
                    <Box sx={{ height: 380, borderRadius: 1, overflow: 'hidden' }}>
                      <MapContainer center={CENTRO_DEFAULT} zoom={15} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <EnfocarMapa sensores={sensoresValidos} seleccionado={seleccionado && enMapa.length ? seleccionado : null} />
                        {enMapa.map((sensor) => {
                          const ultima = ultimasPorSensor[sensor.id];
                          const estado = evaluarEstadoSensor(ultima);
                          const parametros = evaluarParametros(ultima);
                          return (
                            <Marker
                              key={sensor.id}
                              position={posicion(sensor)}
                              icon={crearIconoEstado(estado)}
                              eventHandlers={{ click: () => elegirSensor(sensor.id) }}
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
                    {seleccionado && enMapa.length === 0 && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        Este sensor no tiene coordenadas registradas.
                      </Typography>
                    )}
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
                      <FormControl size="small" sx={{ minWidth: 170 }}>
                        <InputLabel id="dashboard-sensor-label">Sensor</InputLabel>
                        <Select
                          labelId="dashboard-sensor-label"
                          label="Sensor"
                          value={seleccionId}
                          onChange={(e) => elegirSensor(e.target.value)}
                        >
                          <MenuItem value={TODOS}>Todos los sensores</MenuItem>
                          {sensores.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.n_serie}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Stack>

                    {!seleccionado ? (
                      <>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Elige un sensor (en la lista, en el mapa o en las tarjetas) para ver solo ese sensor en el mapa y sus gráficas en vivo.
                        </Typography>
                        <List dense disablePadding sx={{ maxHeight: 330, overflowY: 'auto' }}>
                          {sensores.map((s) => {
                            const estado = evaluarEstadoSensor(ultimasPorSensor[s.id]);
                            return (
                              <ListItemButton key={s.id} onClick={() => elegirSensor(s.id)} sx={{ borderRadius: 1.5 }}>
                                <ListItemText primary={s.n_serie} secondary={s.ubicacion || 'Sin ubicación'} />
                                <ChipEstado estado={estado} />
                              </ListItemButton>
                            );
                          })}
                        </List>
                      </>
                    ) : (
                      <>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, gap: 1 }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700} noWrap>
                              {seleccionado.n_serie} · {seleccionado.ubicacion || 'Sin ubicación'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {ultimaSeleccion
                                ? `Última lectura: ${new Date(ultimaSeleccion.fecha_hora).toLocaleTimeString()} · toca un parámetro para ver su gráfica`
                                : 'Sin lecturas todavía'}
                            </Typography>
                          </Box>
                          <ChipEstado estado={evaluarEstadoSensor(ultimaSeleccion)} />
                        </Stack>
                        <Stack spacing={1}>
                          {PARAMETROS_GRAFICO.map((p) => (
                            <FilaParametro
                              key={p.key}
                              config={p}
                              lecturas={lecturasSeleccion}
                              abierta={parametroAbierto === p.key}
                              onToggle={() => setParametroAbierto((actual) => (actual === p.key ? null : p.key))}
                            />
                          ))}
                        </Stack>
                      </>
                    )}
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
