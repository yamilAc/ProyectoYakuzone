import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  Divider,
} from '@mui/material';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';
import SensorsIcon from '@mui/icons-material/Sensors';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import PlaceIcon from '@mui/icons-material/Place';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PersonIcon from '@mui/icons-material/Person';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';
import { evaluarEstadoSensor, COLORES_ESTADO, ETIQUETAS_ESTADO, crearIconoEstado } from '../utils/estadoSensor';
import { getUserRole } from '../axios/auth';

// Centro por defecto para el mini-mapa del formulario: OTB Urbanización
// Halein, Chiquicollo, Cochabamba (mismo centro que Zonas/Dashboard).
const CENTRO_DEFAULT = { lat: -17.4033631, lng: -66.193527 };

const FORM_INICIAL = {
  n_serie: '',
  ubicacion: '',
  descripcion: '',
  latitud: CENTRO_DEFAULT.lat,
  longitud: CENTRO_DEFAULT.lng,
  propietario_nombre: '',
  propietario_ci: '',
  propietario_telefono: '',
  propietario_direccion: '',
  propietario_nro_casa: '',
  telefono_emergencia: '',
};

const CAMPOS_PROPIETARIO = [
  'propietario_nombre',
  'propietario_ci',
  'propietario_telefono',
  'propietario_direccion',
  'propietario_nro_casa',
  'telefono_emergencia',
];

// Escucha clicks sobre el mini-mapa del formulario y mueve el marcador ahí
// — así se puede ubicar un sensor nuevo señalando en el plano en vez de
// tener que escribir coordenadas a mano.
const SelectorDeUbicacion = ({ onSeleccionar }) => {
  useMapEvents({
    click(e) {
      onSeleccionar(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

// El administrador da de alta, edita y elimina sensores; el empleado (que
// llega desde el Dashboard) solo los consulta. Al tocar una tarjeta se abren
// las Lecturas de ese sensor.
const Sensores = () => {
  const esAdmin = getUserRole() === 'administrador';
  const navigate = useNavigate();
  const [sensores, setSensores] = useState([]);
  const [ultimasPorSensor, setUltimasPorSensor] = useState({});
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);

  const [sensorAEliminar, setSensorAEliminar] = useState(null);
  const [confirmoPerdida, setConfirmoPerdida] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resSensores, resUltimas] = await Promise.all([
        axios.get('/sensores'),
        axios.get('/lecturas/ultimas').catch(() => ({ data: [] })),
      ]);
      setSensores(resSensores.data);
      const mapa = {};
      resUltimas.data.forEach((lectura) => {
        mapa[lectura.sensor_id] = lectura;
      });
      setUltimasPorSensor(mapa);
    } catch (err) {
      console.error('Error al cargar sensores:', err);
      setFeedback({ open: true, severity: 'error', message: 'No se pudo cargar la lista de sensores.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const sensoresFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return sensores;
    return sensores.filter(
      (s) =>
        (s.n_serie || '').toLowerCase().includes(termino) ||
        (s.ubicacion || '').toLowerCase().includes(termino) ||
        (s.descripcion || '').toLowerCase().includes(termino) ||
        (s.propietario_nombre || '').toLowerCase().includes(termino)
    );
  }, [sensores, busqueda]);

  const abrirNuevo = () => {
    setEditando(null);
    setFormData(FORM_INICIAL);
    setDialogoAbierto(true);
  };

  const abrirEditar = (sensor) => {
    setEditando(sensor);
    setFormData({
      n_serie: sensor.n_serie || '',
      ubicacion: sensor.ubicacion || '',
      descripcion: sensor.descripcion || '',
      latitud: sensor.latitud !== null && sensor.latitud !== undefined ? Number(sensor.latitud) : CENTRO_DEFAULT.lat,
      longitud: sensor.longitud !== null && sensor.longitud !== undefined ? Number(sensor.longitud) : CENTRO_DEFAULT.lng,
      ...Object.fromEntries(CAMPOS_PROPIETARIO.map((campo) => [campo, sensor[campo] || ''])),
    });
    setDialogoAbierto(true);
  };

  const cerrarDialogo = () => {
    if (guardando) return;
    setDialogoAbierto(false);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSeleccionarUbicacion = (lat, lng) => {
    setFormData((f) => ({ ...f, latitud: Number(lat.toFixed(6)), longitud: Number(lng.toFixed(6)) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.n_serie.trim()) {
      setFeedback({ open: true, severity: 'error', message: 'El número de serie es obligatorio.' });
      return;
    }
    setGuardando(true);
    try {
      if (editando) {
        await axios.put(`/sensores/${editando.id}`, formData);
        setFeedback({ open: true, severity: 'success', message: `Sensor ${formData.n_serie} actualizado correctamente.` });
      } else {
        await axios.post('/sensores', formData);
        setFeedback({ open: true, severity: 'success', message: `Sensor ${formData.n_serie} registrado correctamente.` });
      }
      setDialogoAbierto(false);
      cargarDatos();
    } catch (err) {
      console.error('Error al guardar el sensor:', err);
      setFeedback({
        open: true,
        severity: 'error',
        message: err.response?.data?.error || 'Ocurrió un error al guardar el sensor.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const abrirConfirmarEliminar = (sensor) => {
    setSensorAEliminar(sensor);
    setConfirmoPerdida(false);
  };

  const handleEliminar = async () => {
    if (!sensorAEliminar) return;
    setEliminando(true);
    try {
      await axios.delete(`/sensores/${sensorAEliminar.id}`);
      setFeedback({ open: true, severity: 'success', message: `Sensor ${sensorAEliminar.n_serie} eliminado.` });
      setSensorAEliminar(null);
      cargarDatos();
    } catch (err) {
      console.error('Error al eliminar el sensor:', err);
      setFeedback({
        open: true,
        severity: 'error',
        message: err.response?.data?.error || 'No se pudo eliminar el sensor.',
      });
    } finally {
      setEliminando(false);
    }
  };

  const marcadorPosicion = { lat: Number(formData.latitud) || CENTRO_DEFAULT.lat, lng: Number(formData.longitud) || CENTRO_DEFAULT.lng };

  return (
    <>
      <PageHeader
        icon={SensorsIcon}
        title="Gestión de Sensores"
        subtitle={esAdmin ? 'Alta, edición y baja de los nodos IoT registrados en el sistema' : 'Nodos IoT registrados en el sistema'}
        action={
          esAdmin && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={abrirNuevo}
              sx={{ bgcolor: 'rgba(255,255,255,0.18)', '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' } }}
            >
              Nuevo sensor
            </Button>
          )
        }
      />

      <Container maxWidth="lg" sx={{ pb: 5 }}>
        <TextField
          fullWidth
          placeholder="Buscar por número de serie, ubicación, descripción o propietario..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          sx={{ mb: 3, bgcolor: 'background.paper', borderRadius: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />

        {cargando ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="240px">
            <CircularProgress />
          </Box>
        ) : sensoresFiltrados.length === 0 ? (
          <Box
            component={motion.div}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}
          >
            <SensorsIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
            <Typography variant="h6">
              {sensores.length === 0 ? 'Todavía no hay sensores registrados' : 'Ningún sensor coincide con la búsqueda'}
            </Typography>
            {sensores.length === 0 && esAdmin && (
              <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }} onClick={abrirNuevo}>
                Registrar el primero
              </Button>
            )}
          </Box>
        ) : (
          <Grid container spacing={2.5}>
            <AnimatePresence>
              {sensoresFiltrados.map((sensor, i) => {
                const ultima = ultimasPorSensor[sensor.id];
                const estado = ultima ? evaluarEstadoSensor(ultima) : null;
                const colorEstado = estado ? COLORES_ESTADO[estado] : '#9e9e9e';
                const etiquetaEstado = estado ? ETIQUETAS_ESTADO[estado] : 'Sin datos';

                return (
                  <Grid item xs={12} sm={6} md={4} key={sensor.id}>
                    <Card
                      component={motion.div}
                      layout
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.35, delay: i * 0.04 }}
                      whileHover={{ y: -4, boxShadow: '0 12px 28px rgba(11,94,119,0.18)' }}
                      onClick={() => navigate('/Lectura', { state: { sensorId: sensor.id } })}
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 3,
                        borderTop: `4px solid ${colorEstado}`,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <WifiTetheringIcon sx={{ color: colorEstado }} />
                            <Typography variant="h6" fontWeight={700}>
                              {sensor.n_serie}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label={etiquetaEstado}
                            sx={{ bgcolor: colorEstado, color: '#fff', fontWeight: 600 }}
                          />
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PlaceIcon fontSize="inherit" /> {sensor.ubicacion || 'Sin ubicación registrada'}
                        </Typography>

                        {sensor.descripcion && (
                          <Typography variant="body2" color="text.secondary">
                            {sensor.descripcion}
                          </Typography>
                        )}

                        <Typography
                          variant="body2"
                          color={sensor.propietario_nombre ? 'text.secondary' : 'warning.main'}
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                          <PersonIcon fontSize="inherit" />
                          {sensor.propietario_nombre
                            ? `${sensor.propietario_nombre} · ${sensor.propietario_telefono || 'sin teléfono'}`
                            : 'Faltan los datos del propietario'}
                        </Typography>

                        {sensor.latitud && sensor.longitud && (
                          <Typography variant="caption" color="text.disabled">
                            {Number(sensor.latitud).toFixed(5)}, {Number(sensor.longitud).toFixed(5)}
                          </Typography>
                        )}

                        <Box sx={{ flex: 1 }} />
                        <Divider sx={{ my: 1 }} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" color="primary" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ShowChartIcon sx={{ fontSize: 16 }} /> Ver lecturas
                          </Typography>
                          {esAdmin && (
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Tooltip title="Editar sensor">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirEditar(sensor);
                                  }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Eliminar sensor">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirConfirmarEliminar(sensor);
                                  }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </AnimatePresence>
          </Grid>
        )}
      </Container>

      {/* Diálogo de alta / edición */}
      <Dialog open={dialogoAbierto} onClose={cerrarDialogo} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {editando ? `Editar sensor ${editando.n_serie}` : 'Nuevo sensor'}
          <IconButton onClick={cerrarDialogo} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Número de serie"
                  name="n_serie"
                  value={formData.n_serie}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  placeholder="SN-005"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Ubicación"
                  name="ubicacion"
                  value={formData.ubicacion}
                  onChange={handleInputChange}
                  fullWidth
                  placeholder="OTB Urbanización Hallein, Chiquicollo"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Descripción"
                  name="descripcion"
                  value={formData.descripcion}
                  onChange={handleInputChange}
                  fullWidth
                  multiline
                  minRows={2}
                  placeholder="Nodo de monitoreo — Vivienda 5"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Latitud"
                  name="latitud"
                  type="number"
                  value={formData.latitud}
                  onChange={handleInputChange}
                  fullWidth
                  inputProps={{ step: 'any' }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Longitud"
                  name="longitud"
                  type="number"
                  value={formData.longitud}
                  onChange={handleInputChange}
                  fullWidth
                  inputProps={{ step: 'any' }}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Toca el mapa para ubicar el sensor
                </Typography>
                <Box sx={{ height: 220, borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                  <MapContainer center={marcadorPosicion} zoom={15} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={marcadorPosicion} icon={crearIconoEstado('info')} />
                    <SelectorDeUbicacion onSeleccionar={handleSeleccionarUbicacion} />
                  </MapContainer>
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ mb: 1 }} />
                <Typography variant="subtitle2" fontWeight={700}>
                  Propietario de la vivienda
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Se muestran en el detalle de cada alerta para que el equipo de mitigación sepa a quién contactar.
                </Typography>
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField
                  label="Nombre del propietario"
                  name="propietario_nombre"
                  value={formData.propietario_nombre}
                  onChange={handleInputChange}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="CI"
                  name="propietario_ci"
                  value={formData.propietario_ci}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  placeholder="1234567 CB"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Teléfono"
                  name="propietario_telefono"
                  value={formData.propietario_telefono}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  placeholder="71234567"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Teléfono de emergencia"
                  name="telefono_emergencia"
                  value={formData.telefono_emergencia}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  helperText="Por si el propietario no contesta"
                />
              </Grid>
              <Grid item xs={12} sm={9}>
                <TextField
                  label="Dirección"
                  name="propietario_direccion"
                  value={formData.propietario_direccion}
                  onChange={handleInputChange}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Nº de casa"
                  name="propietario_nro_casa"
                  value={formData.propietario_nro_casa}
                  onChange={handleInputChange}
                  fullWidth
                  helperText="Opcional"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={cerrarDialogo} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={guardando} startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : null}>
              {editando ? 'Guardar cambios' : 'Registrar sensor'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Diálogo de confirmación de eliminación */}
      <Dialog open={Boolean(sensorAEliminar)} onClose={() => !eliminando && setSensorAEliminar(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <WarningAmberIcon /> Eliminar sensor
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>
            ¿Seguro que quieres eliminar <strong>{sensorAEliminar?.n_serie}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Esta acción es permanente y también borra todo el historial de lecturas y notificaciones asociado a este sensor.
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={confirmoPerdida} onChange={(e) => setConfirmoPerdida(e.target.checked)} />}
            label="Entiendo que se perderá el historial de este sensor"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSensorAEliminar(null)} disabled={eliminando}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={!confirmoPerdida || eliminando}
            startIcon={eliminando ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
            onClick={handleEliminar}
          >
            Eliminar definitivamente
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={feedback.open}
        autoHideDuration={4000}
        onClose={() => setFeedback((f) => ({ ...f, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={feedback.severity} onClose={() => setFeedback((f) => ({ ...f, open: false }))}>
          {feedback.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default Sensores;
