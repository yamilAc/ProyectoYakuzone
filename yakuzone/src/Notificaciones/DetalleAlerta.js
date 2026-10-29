import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SensorsIcon from '@mui/icons-material/Sensors';
import PersonIcon from '@mui/icons-material/Person';
import BadgeIcon from '@mui/icons-material/Badge';
import PhoneIcon from '@mui/icons-material/Phone';
import HomeIcon from '@mui/icons-material/Home';
import ContactEmergencyIcon from '@mui/icons-material/ContactEmergency';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import GroupsIcon from '@mui/icons-material/Groups';
import SendIcon from '@mui/icons-material/Send';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import axios from '../axios/axiosConfig';
import { getUserRole } from '../axios/auth';
import { crearIconoEstado } from '../utils/estadoSensor';
import { ESTADOS_ALERTA, textoParametro, textoValor, formatearFecha } from '../utils/alertas';

// Dentro de un Dialog el mapa se crea mientras el diálogo todavía se está
// animando y Leaflet calcula mal su tamaño (quedan mosaicos grises); se
// recalcula apenas termina de abrir.
const AjustarTamanoMapa = () => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(t);
  }, [map]);
  return null;
};

const Seccion = ({ icon: Icon, titulo, children, accion }) => (
  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Icon fontSize="small" color="primary" />
        <Typography variant="subtitle1" fontWeight={700}>
          {titulo}
        </Typography>
      </Stack>
      {accion}
    </Stack>
    {children}
  </Paper>
);

const Dato = ({ icon: Icon, etiqueta, children }) => (
  <Stack direction="row" spacing={1.2} alignItems="flex-start" sx={{ py: 0.6 }}>
    <Icon fontSize="small" sx={{ color: 'text.secondary', mt: 0.2 }} />
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
        {etiqueta}
      </Typography>
      <Typography variant="body2">{children || '—'}</Typography>
    </Box>
  </Stack>
);

const ChipEstado = ({ estado, size = 'small' }) => {
  const info = ESTADOS_ALERTA[estado] || ESTADOS_ALERTA.pendiente;
  return <Chip size={size} label={info.label} sx={{ bgcolor: info.color, color: '#fff', fontWeight: 600 }} />;
};

const telefonoLink = (telefono) => (telefono ? <Link href={`tel:${telefono.replace(/\s/g, '')}`}>{telefono}</Link> : null);

// Ventana de detalle de una alerta: datos del sensor y su ubicación,
// propietario de la vivienda, sugerencia de mitigación, asignación a un
// equipo (administrador y empleado), cierre de la alerta (jefe del equipo o
// administrador) e historial de alertas pendientes y mitigadas del sensor.
const DetalleAlerta = ({ alertaId, onClose, onCambio }) => {
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down('sm'));
  const rol = getUserRole();
  const puedeAsignar = rol === 'administrador' || rol === 'empleado';
  const puedeMitigar = rol === 'administrador' || rol === 'equipo_mitigacion';

  // Alerta que se está mostrando: al abrir una del historial del sensor se
  // apila la anterior para poder volver.
  const [idActual, setIdActual] = useState(alertaId);
  const [anteriores, setAnteriores] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [tabHistorial, setTabHistorial] = useState(0);

  const [equipos, setEquipos] = useState([]);
  const [equipoId, setEquipoId] = useState('');
  const [instrucciones, setInstrucciones] = useState('');
  const [observacion, setObservacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { severity, texto }

  useEffect(() => {
    setIdActual(alertaId);
    setAnteriores([]);
  }, [alertaId]);

  const cargarDetalle = useCallback(async (id) => {
    setCargando(true);
    setError(null);
    try {
      const res = await axios.get(`/alertas/${id}`);
      setDetalle(res.data);
      setEquipoId(res.data.alerta.equipo_id || '');
    } catch (err) {
      setDetalle(null);
      setError(err.response?.data?.error || 'No se pudo cargar el detalle de la alerta.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!idActual) return;
    setInstrucciones('');
    setObservacion('');
    setMensaje(null);
    setTabHistorial(0);
    cargarDetalle(idActual);
  }, [idActual, cargarDetalle]);

  useEffect(() => {
    if (!alertaId || !puedeAsignar) return;
    axios
      .get('/equipos')
      .then((res) => setEquipos(res.data))
      .catch(() => setEquipos([]));
  }, [alertaId, puedeAsignar]);

  const abrirDelHistorial = (id) => {
    setAnteriores((pila) => [...pila, idActual]);
    setIdActual(id);
  };

  const volver = () => {
    setIdActual(anteriores[anteriores.length - 1]);
    setAnteriores(anteriores.slice(0, -1));
  };

  const handleAsignar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await axios.put(`/alertas/${idActual}/asignar`, { equipo_id: equipoId, instrucciones });
      const equipo = equipos.find((e) => e.id === Number(equipoId));
      const jefe = equipo ? `${equipo.jefe_nombre} ${equipo.jefe_apellido}` : 'el jefe del equipo';
      setMensaje(
        res.data.correo_enviado
          ? { severity: 'success', texto: `Alerta asignada. Se notificó por correo a ${jefe}.` }
          : {
              severity: 'warning',
              texto: `Alerta asignada. No se pudo enviar el correo (revisa la configuración SMTP del servidor), pero ${jefe} ya la ve en sus Notificaciones.`,
            }
      );
      setInstrucciones('');
      await cargarDetalle(idActual);
      onCambio && onCambio();
    } catch (err) {
      setMensaje({ severity: 'error', texto: err.response?.data?.error || 'No se pudo asignar la alerta.' });
    } finally {
      setGuardando(false);
    }
  };

  const handleMitigar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      await axios.put(`/alertas/${idActual}/mitigada`, { observacion });
      setMensaje({ severity: 'success', texto: 'La alerta quedó registrada como mitigada.' });
      setObservacion('');
      await cargarDetalle(idActual);
      onCambio && onCambio();
    } catch (err) {
      setMensaje({ severity: 'error', texto: err.response?.data?.error || 'No se pudo registrar la mitigación.' });
    } finally {
      setGuardando(false);
    }
  };

  const alerta = detalle?.alerta;
  const sensor = detalle?.sensor;
  const propietario = detalle?.propietario;
  const equipo = detalle?.equipo;
  const historial = detalle?.historial || { pendientes: [], mitigadas: [] };
  const listaHistorial = tabHistorial === 0 ? historial.pendientes : historial.mitigadas;
  const tieneCoordenadas = sensor && sensor.latitud !== null && sensor.longitud !== null;
  const posicion = tieneCoordenadas ? [Number(sensor.latitud), Number(sensor.longitud)] : null;

  return (
    <Dialog open={Boolean(alertaId)} onClose={onClose} fullWidth maxWidth="lg" fullScreen={pantallaChica} scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        {anteriores.length > 0 && (
          <Tooltip title="Volver a la alerta anterior">
            <IconButton size="small" onClick={volver}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <WarningAmberIcon color={alerta?.estado === 'mitigada' ? 'success' : 'error'} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700} noWrap>
            {alerta ? `${sensor.n_serie} · ${textoParametro(alerta.parametro)} fuera de rango` : 'Detalle de la alerta'}
          </Typography>
          {alerta && (
            <Typography variant="caption" color="text.secondary">
              Alerta #{alerta.id} · {formatearFecha(alerta.fecha_hora)}
            </Typography>
          )}
        </Box>
        {alerta && <ChipEstado estado={alerta.estado} size="medium" />}
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ bgcolor: 'background.default' }}>
        {cargando && !detalle ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          detalle && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={7}>
                <Stack spacing={2}>
                  {mensaje && (
                    <Alert severity={mensaje.severity} onClose={() => setMensaje(null)}>
                      {mensaje.texto}
                    </Alert>
                  )}

                  <Seccion icon={WarningAmberIcon} titulo="Alerta">
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 4 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Valor registrado
                        </Typography>
                        <Typography variant="h4" fontWeight={700} color={alerta.estado === 'mitigada' ? 'text.primary' : 'error.main'}>
                          {textoValor(alerta.parametro, alerta.valor)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Rango aceptable (NB 512-04)
                        </Typography>
                        <Typography variant="h6" fontWeight={600}>
                          {alerta.rango_referencia}
                        </Typography>
                      </Box>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {textoParametro(alerta.parametro)} se mantuvo fuera de rango en varias lecturas consecutivas del sensor.
                    </Typography>
                  </Seccion>

                  <Seccion icon={AutoAwesomeIcon} titulo="Sugerencia de mitigación (IA)">
                    {alerta.sugerencia ? (
                      <>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                          {alerta.sugerencia}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                          Orientación automatizada; no reemplaza el criterio de un especialista en tratamiento de agua.
                        </Typography>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Todavía no hay una sugerencia para esta alerta (se genera unos segundos después de confirmarse).
                      </Typography>
                    )}
                  </Seccion>

                  <Seccion
                    icon={GroupsIcon}
                    titulo="Equipo de mitigación"
                    accion={
                      equipo &&
                      (alerta.correo_enviado ? (
                        <Chip size="small" variant="outlined" icon={<MarkEmailReadIcon />} label="Correo enviado" />
                      ) : (
                        <Chip size="small" variant="outlined" icon={<MailOutlineIcon />} label="Correo no enviado" />
                      ))
                    }
                  >
                    {equipo ? (
                      <Box sx={{ mb: alerta.estado === 'mitigada' ? 0 : 2 }}>
                        <Typography variant="body1" fontWeight={600}>
                          {equipo.nombre}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Jefe: {equipo.jefe || 'sin jefe asignado'}
                          {equipo.miembros.length > 0 && ` · ${equipo.miembros.length} miembro(s)`}
                        </Typography>
                        {equipo.miembros.length > 0 && (
                          <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                            {equipo.miembros.map((m, i) => (
                              <Chip key={i} size="small" label={m.telefono ? `${m.nombre} · ${m.telefono}` : m.nombre} />
                            ))}
                          </Stack>
                        )}
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                          Asignada por {alerta.asignado_por || '—'} el {formatearFecha(alerta.asignado_en)}
                        </Typography>
                        {alerta.instrucciones && (
                          <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-line' }}>
                            <strong>Instrucciones:</strong> {alerta.instrucciones}
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Todavía no se asignó a ningún equipo.
                      </Typography>
                    )}

                    {alerta.estado !== 'mitigada' && puedeAsignar && (
                      <>
                        {equipo && <Divider sx={{ mb: 2 }} />}
                        {equipos.length === 0 ? (
                          <Alert severity="info">
                            No hay equipos de mitigación registrados. Un administrador puede crearlos en la sección Equipos.
                          </Alert>
                        ) : (
                          <Stack spacing={1.5}>
                            <TextField
                              select
                              label={equipo ? 'Reasignar a otro equipo' : 'Equipo de mitigación'}
                              value={equipoId}
                              onChange={(e) => setEquipoId(e.target.value)}
                              size="small"
                              fullWidth
                            >
                              {equipos.map((e) => (
                                <MenuItem key={e.id} value={e.id} disabled={!e.jefe_id}>
                                  {e.nombre} — {e.jefe_id ? `jefe: ${e.jefe_nombre} ${e.jefe_apellido}` : 'sin jefe'}
                                  {` · ${e.miembros.length} miembro(s) · ${e.alertas_activas} alerta(s) en curso`}
                                </MenuItem>
                              ))}
                            </TextField>
                            <TextField
                              label="Instrucciones para el equipo (opcional)"
                              value={instrucciones}
                              onChange={(e) => setInstrucciones(e.target.value)}
                              size="small"
                              fullWidth
                              multiline
                              minRows={2}
                              inputProps={{ maxLength: 500 }}
                            />
                            <Box>
                              <Button
                                variant="contained"
                                startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                                disabled={!equipoId || guardando}
                                onClick={handleAsignar}
                              >
                                {equipo ? 'Reasignar y notificar' : 'Notificar al equipo'}
                              </Button>
                            </Box>
                          </Stack>
                        )}
                      </>
                    )}

                    {alerta.estado === 'asignada' && puedeMitigar && (
                      <>
                        {(equipo || puedeAsignar) && <Divider sx={{ my: 2 }} />}
                        <Stack spacing={1.5}>
                          <TextField
                            label="¿Qué se hizo para mitigar la alerta?"
                            value={observacion}
                            onChange={(e) => setObservacion(e.target.value)}
                            size="small"
                            fullWidth
                            multiline
                            minRows={2}
                            inputProps={{ maxLength: 500 }}
                          />
                          <Box>
                            <Button
                              variant="contained"
                              color="success"
                              startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : <TaskAltIcon />}
                              disabled={observacion.trim().length < 5 || guardando}
                              onClick={handleMitigar}
                            >
                              Marcar como mitigada
                            </Button>
                          </Box>
                        </Stack>
                      </>
                    )}

                    {alerta.estado === 'mitigada' && (
                      <Alert severity="success" icon={<TaskAltIcon />} sx={{ mt: equipo ? 2 : 0 }}>
                        Mitigada por {alerta.mitigado_por || '—'} el {formatearFecha(alerta.mitigado_en)}
                        {alerta.observacion_mitigacion && (
                          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                            {alerta.observacion_mitigacion}
                          </Typography>
                        )}
                      </Alert>
                    )}
                  </Seccion>
                </Stack>
              </Grid>

              <Grid item xs={12} md={5}>
                <Stack spacing={2}>
                  <Seccion icon={SensorsIcon} titulo={`Sensor ${sensor.n_serie}`}>
                    <Typography variant="body2">{sensor.ubicacion || 'Sin ubicación registrada'}</Typography>
                    {sensor.descripcion && (
                      <Typography variant="body2" color="text.secondary">
                        {sensor.descripcion}
                      </Typography>
                    )}
                    {posicion ? (
                      <Box sx={{ height: 190, mt: 1.5, borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                        <MapContainer key={sensor.id} center={posicion} zoom={16} style={{ height: '100%', width: '100%' }}>
                          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <Marker position={posicion} icon={crearIconoEstado(alerta.estado === 'mitigada' ? 'verde' : 'rojo')} />
                          <AjustarTamanoMapa />
                        </MapContainer>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        El sensor no tiene coordenadas registradas.
                      </Typography>
                    )}
                  </Seccion>

                  <Seccion icon={PersonIcon} titulo="Propietario">
                    {propietario ? (
                      <>
                        <Dato icon={PersonIcon} etiqueta="Nombre">
                          {propietario.nombre}
                        </Dato>
                        <Dato icon={BadgeIcon} etiqueta="CI">
                          {propietario.ci}
                        </Dato>
                        <Dato icon={PhoneIcon} etiqueta="Teléfono">
                          {telefonoLink(propietario.telefono)}
                        </Dato>
                        <Dato icon={HomeIcon} etiqueta="Dirección">
                          {propietario.direccion}
                          {propietario.nro_casa && ` · Casa Nº ${propietario.nro_casa}`}
                        </Dato>
                        <Dato icon={ContactEmergencyIcon} etiqueta="Teléfono de emergencia">
                          {telefonoLink(propietario.telefono_emergencia)}
                        </Dato>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Este sensor todavía no tiene los datos del propietario. Un administrador puede registrarlos en la sección Sensores.
                      </Typography>
                    )}
                  </Seccion>
                </Stack>
              </Grid>

              <Grid item xs={12}>
                <Seccion icon={WarningAmberIcon} titulo={`Otras alertas del sensor ${sensor.n_serie}`}>
                  <Tabs value={tabHistorial} onChange={(e, v) => setTabHistorial(v)} sx={{ mb: 1, minHeight: 36 }}>
                    <Tab label={`Pendientes (${historial.pendientes.length})`} sx={{ minHeight: 36 }} />
                    <Tab label={`Mitigadas (${historial.mitigadas.length})`} sx={{ minHeight: 36 }} />
                  </Tabs>
                  {listaHistorial.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                      {tabHistorial === 0 ? 'No hay otras alertas pendientes en este sensor.' : 'Este sensor no tiene alertas mitigadas.'}
                    </Typography>
                  ) : (
                    <List dense disablePadding sx={{ maxHeight: 260, overflowY: 'auto' }}>
                      {listaHistorial.map((a) => (
                        <Tooltip key={a.id} title={a.accesible ? '' : 'Asignada a otro equipo'} placement="left">
                          <span>
                            <ListItemButton
                              disabled={!a.accesible}
                              onClick={() => abrirDelHistorial(a.id)}
                              sx={{ borderRadius: 1.5, borderLeft: '3px solid', borderColor: ESTADOS_ALERTA[a.estado]?.color }}
                            >
                              <ListItemText
                                primary={`${textoParametro(a.parametro)}: ${textoValor(a.parametro, a.valor)}`}
                                secondary={`${formatearFecha(a.fecha_hora)}${a.equipo_nombre ? ` · ${a.equipo_nombre}` : ''}`}
                              />
                              <ChipEstado estado={a.estado} />
                            </ListItemButton>
                          </span>
                        </Tooltip>
                      ))}
                    </List>
                  )}
                </Seccion>
              </Grid>
            </Grid>
          )
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DetalleAlerta;
