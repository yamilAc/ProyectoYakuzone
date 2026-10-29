import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Container, Box, Paper, Alert, CircularProgress, Stack, Typography, Chip } from '@mui/material';
import RoomIcon from '@mui/icons-material/Room';
import { motion } from 'framer-motion';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';
import {
  evaluarEstadoSensor,
  evaluarParametros,
  crearIconoEstado,
  textoUltimaLectura,
  COLORES_ESTADO,
  ETIQUETAS_ESTADO,
  LEYENDA_ESTADOS,
} from '../utils/estadoSensor';

// Centro por defecto: OTB Urbanización Halein, Chiquicollo, Cochabamba.
const CENTRO_DEFAULT = { lat: -17.4033631, lng: -66.193527 };

const LEYENDA = LEYENDA_ESTADOS.map((estado) => ({ estado, texto: ETIQUETAS_ESTADO[estado] }));

const Zonas = () => {
  const [sensores, setSensores] = useState([]);
  const [ultimasPorSensor, setUltimasPorSensor] = useState({});
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const fetchDatos = async () => {
      try {
        const [resSensores, resUltimas] = await Promise.all([
          axios.get('/sensores'),
          axios.get('/lecturas/ultimas'),
        ]);

        const validos = resSensores.data.filter(
          (sensor) =>
            sensor.latitud !== null &&
            sensor.longitud !== null &&
            !isNaN(sensor.latitud) &&
            !isNaN(sensor.longitud)
        );
        setSensores(validos);

        const mapa = {};
        resUltimas.data.forEach((lectura) => {
          mapa[lectura.sensor_id] = lectura;
        });
        setUltimasPorSensor(mapa);
      } catch (err) {
        console.error('Error al obtener los datos de los sensores:', err);
        setError('No se pudo cargar la lista de sensores.');
      } finally {
        setCargando(false);
      }
    };
    fetchDatos();
    // Refresca cada 10s, igual que las demás vistas en tiempo real, para que
    // los colores del mapa se actualicen solos cuando llega una lectura nueva.
    const interval = setInterval(fetchDatos, 10000);
    return () => clearInterval(interval);
  }, []);

  const centro =
    sensores.length > 0
      ? { lat: parseFloat(sensores[0].latitud), lng: parseFloat(sensores[0].longitud) }
      : CENTRO_DEFAULT;

  return (
    <>
      <PageHeader
        icon={RoomIcon}
        title="Zonas"
        subtitle="Ubicación y estado en tiempo real de los sensores instalados"
      />
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {cargando ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
            <CircularProgress />
          </Box>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <Paper elevation={2} sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {sensores.length} sensor(es) en el mapa
                </Typography>
                <Stack direction="row" spacing={1}>
                  {LEYENDA.map((item) => (
                    <Chip
                      key={item.estado}
                      size="small"
                      label={item.texto}
                      sx={{
                        bgcolor: `${COLORES_ESTADO[item.estado]}18`,
                        color: COLORES_ESTADO[item.estado],
                        fontWeight: 600,
                        '&::before': {
                          content: '""',
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: COLORES_ESTADO[item.estado],
                          mr: 0.7,
                        },
                      }}
                    />
                  ))}
                </Stack>
              </Stack>

              <Box sx={{ height: 600, width: '100%', borderRadius: 1, overflow: 'hidden' }}>
                <MapContainer center={centro} zoom={15} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {sensores.map((sensor) => {
                    const ultima = ultimasPorSensor[sensor.id];
                    const estado = evaluarEstadoSensor(ultima);
                    const parametros = evaluarParametros(ultima);
                    return (
                      <Marker
                        key={sensor.id || sensor.n_serie}
                        position={{ lat: parseFloat(sensor.latitud), lng: parseFloat(sensor.longitud) }}
                        icon={crearIconoEstado(estado)}
                      >
                        <Popup>
                          <div style={{ minWidth: 210 }}>
                            <strong>{sensor.n_serie || 'Sensor'}</strong>
                            <br />
                            {sensor.ubicacion || 'Sin ubicación registrada'}
                            {sensor.descripcion && (
                              <>
                                <br />
                                {sensor.descripcion}
                              </>
                            )}
                            <div style={{ marginTop: 6, fontWeight: 700, color: estado ? COLORES_ESTADO[estado] : '#9e9e9e' }}>
                              {estado ? ETIQUETAS_ESTADO[estado] : 'Sin lecturas todavía'}
                            </div>
                            {ultima && <div style={{ fontSize: 12, color: '#78909C' }}>{textoUltimaLectura(ultima)}</div>}
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
        )}
      </Container>
    </>
  );
};

export default Zonas;
