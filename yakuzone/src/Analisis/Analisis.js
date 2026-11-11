import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Box, Chip, CircularProgress, Container, Grid, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import InsightsIcon from '@mui/icons-material/Insights';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';
import AnalisisSensor from './AnalisisSensor';
import DesempenoModelos from './DesempenoModelos';
import { CLASES_CALIDAD, porcentaje } from '../utils/analisis';

// Resultados de los modelos de aprendizaje automático: clasificación de la
// calidad del agua, detección de anomalías y pronóstico, por sensor, y el
// desempeño medido de cada modelo.
const Analisis = () => {
  const sensorElegido = useLocation().state?.sensorId;
  const [tab, setTab] = useState(0);
  const [estado, setEstado] = useState(null);
  const [resumen, setResumen] = useState([]);
  const [sensorId, setSensorId] = useState(null);
  const [metricas, setMetricas] = useState(undefined);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      const [resEstado, resResumen] = await Promise.all([
        axios.get('/analisis/estado').catch(() => ({ data: null })),
        axios.get('/analisis/resumen').catch(() => ({ data: [] })),
      ]);
      if (!activo) return;
      setEstado(resEstado.data);
      setResumen(resResumen.data);
      setSensorId((actual) => actual || (resResumen.data.find((s) => s.id === sensorElegido) || resResumen.data[0] || {}).id || null);
      setCargando(false);
    };
    cargar();
    const intervalo = setInterval(cargar, 60000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [sensorElegido]);

  useEffect(() => {
    if (tab !== 1 || metricas !== undefined) return;
    axios
      .get('/analisis/metricas')
      .then((res) => setMetricas(res.data))
      .catch(() => setMetricas(null));
  }, [tab, metricas]);

  const servicio = estado?.servicio;

  return (
    <>
      <PageHeader
        icon={InsightsIcon}
        title="Análisis"
        subtitle="Modelos de aprendizaje automático: clasificación de la calidad del agua, detección de anomalías y pronóstico"
        action={
          estado && (
            <Chip
              label={servicio ? 'Servicio de análisis activo' : 'Servicio de análisis sin conexión'}
              sx={{ color: '#fff', bgcolor: servicio ? 'rgba(46,125,50,0.85)' : 'rgba(211,47,47,0.85)', fontWeight: 600 }}
            />
          )
        }
      />
      <Container maxWidth="lg" sx={{ pb: 5 }}>
        {estado && !servicio && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            El servicio de aprendizaje automático no responde. Para levantarlo, en la carpeta <code>ml</code> ejecuta:{' '}
            <code>.venv\Scripts\python -m uvicorn servicio.main:app --host 127.0.0.1 --port 8000</code>. Mientras tanto, el monitoreo y las
            alertas de la NB 512-04 siguen funcionando con normalidad.
          </Alert>
        )}

        <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Por sensor" />
          <Tab label="Desempeño de los modelos" />
        </Tabs>

        {tab === 0 &&
          (cargando ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : resumen.length === 0 ? (
            <Typography color="text.secondary">Todavía no hay sensores registrados.</Typography>
          ) : (
            <>
              <Grid container spacing={1.5} sx={{ mb: 3 }}>
                {resumen.map((s) => {
                  const clase = CLASES_CALIDAD[s.ultimo_analisis?.clase];
                  const elegido = s.id === sensorId;
                  return (
                    <Grid item xs={12} sm={6} md={3} key={s.id}>
                      <Paper
                        onClick={() => setSensorId(s.id)}
                        elevation={elegido ? 6 : 1}
                        sx={{
                          p: 1.5,
                          cursor: 'pointer',
                          height: '100%',
                          borderTop: '3px solid',
                          borderColor: clase ? clase.color : 'divider',
                          outline: elegido ? '2px solid' : 'none',
                          outlineColor: 'primary.main',
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography fontWeight={700}>{s.n_serie}</Typography>
                          {clase ? (
                            <Chip size="small" label={clase.label} sx={{ bgcolor: clase.color, color: '#fff', fontWeight: 600 }} />
                          ) : (
                            <Chip size="small" label="Sin análisis" />
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {s.ubicacion || 'Sin ubicación'}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                          {s.ultimo_analisis ? `Prob. apta ${porcentaje(s.ultimo_analisis.probabilidad_apta)} · ` : ''}
                          {s.anomalias_24h} anomalía(s) en 24 h
                        </Typography>
                        {s.pronostico?.parametros_fuera > 0 && (
                          <Typography variant="caption" color="error.main" fontWeight={600} display="block">
                            El pronóstico sale de la norma
                          </Typography>
                        )}
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
              {sensorId && <AnalisisSensor sensorId={sensorId} />}
            </>
          ))}

        {tab === 1 &&
          (metricas === undefined ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : (
            <DesempenoModelos metricas={metricas} />
          ))}
      </Container>
    </>
  );
};

export default Analisis;
