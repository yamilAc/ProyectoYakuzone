import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from '../axios/axiosConfig';
import { Container, Typography, Box, CircularProgress, Paper, Chip, Stack, Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import GraficoParametro, { PARAMETROS_GRAFICO, conUnidad, fueraDeRango, textoRango } from '../components/GraficoParametro';

const LECTURAS_POR_GRAFICO = 100;

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: (i) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.08, ease: 'easeOut' } }),
};

// Un panel por parámetro, cada uno con su propia escala, color y límites de
// la NB 512-04 (ver components/GraficoParametro.js).
const ParametroCard = ({ index, config, lecturas }) => {
  const { label, unidad, color, icon: Icon, umbral } = config;
  const ultima = lecturas.length > 0 ? lecturas[lecturas.length - 1][config.key] : null;
  const hayValor = ultima !== null && ultima !== undefined;
  const fuera = fueraDeRango(ultima, umbral);

  return (
    <Grid item xs={12} md={6}>
      <motion.div custom={index} initial="hidden" animate="show" variants={cardVariants}>
        <Paper elevation={2} sx={{ p: 2.5, height: '100%', transition: 'box-shadow 0.2s ease', '&:hover': { boxShadow: 6 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ bgcolor: `${color}22`, color, borderRadius: '50%', p: 1, display: 'flex' }}>
                <Icon fontSize="small" />
              </Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {label}
              </Typography>
            </Stack>
            {hayValor && (
              <Chip
                label={`Actual: ${conUnidad(ultima, unidad)}`}
                color={!umbral ? 'default' : fuera ? 'error' : 'success'}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
            {umbral
              ? `Rango aceptable (NB 512-04): ${textoRango(config)} · los puntos rojos son lecturas fuera de rango`
              : 'La NB 512-04 no fija un límite para este parámetro; se registra como referencia'}
          </Typography>
          <GraficoParametro config={config} lecturas={lecturas} alto={240} />
        </Paper>
      </motion.div>
    </Grid>
  );
};

const Lectura = () => {
  // Sensor que llega elegido desde la página de Sensores (al tocar su tarjeta).
  const sensorElegido = useLocation().state?.sensorId;
  const [sensores, setSensores] = useState([]);
  const [sensorId, setSensorId] = useState('');
  const [lecturas, setLecturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    axios
      .get('/sensores')
      .then((res) => {
        setSensores(res.data);
        const inicial = res.data.find((s) => s.id === sensorElegido) || res.data[0];
        setSensorId((actual) => actual || (inicial && inicial.id) || '');
        if (res.data.length === 0) setLoading(false);
      })
      .catch((error) => {
        console.error('Error al obtener los sensores:', error);
        setLoading(false);
      });
  }, [sensorElegido]);

  // Con varios sensores, las gráficas muestran la serie de tiempo de UN
  // sensor a la vez (mezclar sensores en la misma línea no tendría sentido).
  useEffect(() => {
    if (!sensorId) return undefined;
    let activo = true;
    const fetchLecturas = async () => {
      try {
        const res = await axios.get('/lecturas', { params: { sensor_id: sensorId, limite: LECTURAS_POR_GRAFICO } });
        if (activo) setLecturas(res.data);
      } catch (error) {
        console.error('Error al obtener las lecturas:', error);
      } finally {
        if (activo) setLoading(false);
      }
    };
    fetchLecturas();
    const interval = setInterval(fetchLecturas, 10000); // Actualiza cada 10 segundos
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, [sensorId]);

  useEffect(() => {
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timeInterval);
  }, []);

  return (
    <>
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
        ) : sensores.length === 0 ? (
          <Typography color="text.secondary">Todavía no hay sensores registrados.</Typography>
        ) : (
          <Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 3 }}>
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel id="lectura-sensor-label">Sensor</InputLabel>
                <Select labelId="lectura-sensor-label" label="Sensor" value={sensorId} onChange={(e) => setSensorId(e.target.value)}>
                  {sensores.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.n_serie} — {s.descripcion || s.ubicacion}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary">
                Últimas {lecturas.length} lecturas del sensor; se actualizan cada 10 segundos.
              </Typography>
            </Stack>

            <Grid container spacing={3}>
              {PARAMETROS_GRAFICO.map((config, index) => (
                <ParametroCard key={config.key} index={index} config={config} lecturas={lecturas} />
              ))}
            </Grid>
          </Box>
        )}
      </Container>
    </>
  );
};

export default Lectura;
