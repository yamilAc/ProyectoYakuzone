import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  MenuItem,
  Grid,
  Button,
  Chip,
  CircularProgress,
  Typography,
} from '@mui/material';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';
import DetalleAlerta from '../Notificaciones/DetalleAlerta';
import { ESTADOS_ALERTA, ETIQUETAS_PARAMETRO, textoParametro, textoValor, formatearFecha } from '../utils/alertas';

const FILTROS_VACIOS = { sensor_id: '', estado: '', parametro: '', desde: '', hasta: '' };

// Historial completo de alertas (Datos Históricos): todas las alertas
// registradas, con filtros y paginación; cada fila abre su detalle.
const HistorialAlertas = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState({ ...FILTROS_VACIOS, sensor_id: location.state?.sensorId || '' });
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(25);
  const [datos, setDatos] = useState({ total: 0, alertas: [] });
  const [sensores, setSensores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [alertaAbierta, setAlertaAbierta] = useState(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    axios
      .get('/sensores')
      .then((res) => setSensores(res.data))
      .catch(() => setSensores([]));
  }, []);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    const params = Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor !== ''));
    axios
      .get('/alertas/historial', { params: { ...params, pagina: pagina + 1, por_pagina: porPagina } })
      .then((res) => {
        if (!activo) return;
        setDatos(res.data);
        setError(null);
      })
      .catch(() => activo && setError('No se pudo cargar el historial de alertas.'))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [filtros, pagina, porPagina, recarga]);

  const cambiarFiltro = (campo) => (e) => {
    setFiltros((f) => ({ ...f, [campo]: e.target.value }));
    setPagina(0);
  };

  const hayFiltros = Object.values(filtros).some((v) => v !== '');

  return (
    <>
      <PageHeader
        icon={ListAltIcon}
        title="Historial de alertas"
        subtitle="Todas las alertas registradas, con su estado, equipo y fecha de mitigación"
        action={
          <Button
            variant="contained"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/DatosHistoricos')}
            sx={{ bgcolor: 'rgba(255,255,255,0.18)', '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' } }}
          >
            Datos Históricos
          </Button>
        }
      />
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={6} md={2.4}>
              <TextField select label="Sensor" value={filtros.sensor_id} onChange={cambiarFiltro('sensor_id')} size="small" fullWidth>
                <MenuItem value="">Todos</MenuItem>
                {sensores.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.n_serie}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
              <TextField select label="Estado" value={filtros.estado} onChange={cambiarFiltro('estado')} size="small" fullWidth>
                <MenuItem value="">Todos</MenuItem>
                {Object.entries(ESTADOS_ALERTA).map(([valor, info]) => (
                  <MenuItem key={valor} value={valor}>
                    {info.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4} md={2.4}>
              <TextField select label="Parámetro" value={filtros.parametro} onChange={cambiarFiltro('parametro')} size="small" fullWidth>
                <MenuItem value="">Todos</MenuItem>
                {Object.entries(ETIQUETAS_PARAMETRO).map(([valor, etiqueta]) => (
                  <MenuItem key={valor} value={valor}>
                    {etiqueta}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={4} md={2.4}>
              <TextField label="Desde" type="date" value={filtros.desde} onChange={cambiarFiltro('desde')} size="small" fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={6} sm={4} md={2.4}>
              <TextField label="Hasta" type="date" value={filtros.hasta} onChange={cambiarFiltro('hasta')} size="small" fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
          {hayFiltros && (
            <Button
              size="small"
              sx={{ mt: 1 }}
              onClick={() => {
                setFiltros(FILTROS_VACIOS);
                setPagina(0);
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </Paper>

        {error ? (
          <Typography color="error">{error}</Typography>
        ) : (
          <Paper elevation={2}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ background: 'linear-gradient(90deg, #0B5E77 0%, #0E7C9B 55%, #1CB5E0 100%)' }}>
                    {['Fecha y hora', 'Sensor', 'Parámetro', 'Valor', 'Estado', 'Equipo', 'Mitigada el'].map((titulo) => (
                      <TableCell key={titulo} sx={{ color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {titulo}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cargando && datos.alertas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Box display="flex" justifyContent="center" py={4}>
                          <CircularProgress size={28} />
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : datos.alertas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                          No hay alertas que coincidan con los filtros.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    datos.alertas.map((a) => {
                      const info = ESTADOS_ALERTA[a.estado] || ESTADOS_ALERTA.pendiente;
                      return (
                        <TableRow key={a.id} hover onClick={() => setAlertaAbierta(a.id)} sx={{ cursor: 'pointer', opacity: cargando ? 0.6 : 1 }}>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatearFecha(a.fecha_hora)}</TableCell>
                          <TableCell>{a.numero_serie}</TableCell>
                          <TableCell>{textoParametro(a.parametro)}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{textoValor(a.parametro, a.valor)}</TableCell>
                          <TableCell>
                            <Chip size="small" label={info.label} sx={{ bgcolor: info.color, color: '#fff', fontWeight: 600 }} />
                          </TableCell>
                          <TableCell>{a.equipo_nombre || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{a.mitigado_en ? formatearFecha(a.mitigado_en) : '—'}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={datos.total}
              page={pagina}
              onPageChange={(e, nueva) => setPagina(nueva)}
              rowsPerPage={porPagina}
              onRowsPerPageChange={(e) => {
                setPorPagina(parseInt(e.target.value, 10));
                setPagina(0);
              }}
              rowsPerPageOptions={[10, 25, 50, 100]}
              labelRowsPerPage="Filas por página"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          </Paper>
        )}
      </Container>

      <DetalleAlerta alertaId={alertaAbierta} onClose={() => setAlertaAbierta(null)} onCambio={() => setRecarga((n) => n + 1)} />
    </>
  );
};

export default HistorialAlertas;
