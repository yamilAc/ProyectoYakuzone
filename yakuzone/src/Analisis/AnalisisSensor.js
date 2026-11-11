import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip as TooltipMui,
  Typography,
} from '@mui/material';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import axios from '../axios/axiosConfig';
import { UMBRALES } from '../utils/estadoSensor';
import { CLASES_CALIDAD, TIPOS_ANOMALIA, METODOS_PRONOSTICO, NOMBRES_PARAMETRO, porcentaje } from '../utils/analisis';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const ROJO = '#D32F2F';
const UNIDADES = { ph: '', turbidez: 'NTU', conductividad: 'µS/cm' };
const LIMITES = { ph: UMBRALES.valor_ph, turbidez: UMBRALES.valor_turbidez, conductividad: UMBRALES.valor_conductividad };
const PARAMETROS_PRONOSTICO = ['ph', 'turbidez', 'conductividad'];

const hora = (fecha) => new Date(fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fechaHora = (fecha) => new Date(fecha).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const ChipClase = ({ clase, size = 'small' }) => {
  const info = CLASES_CALIDAD[clase];
  if (!info) return <Chip size={size} label="Sin clasificar" />;
  return <Chip size={size} label={info.label} sx={{ bgcolor: info.color, color: '#fff', fontWeight: 700 }} />;
};

const lineaHorizontal = (texto, valor, cantidad, color = ROJO) => ({
  label: texto,
  data: Array(cantidad).fill(valor),
  borderColor: color,
  borderDash: [6, 4],
  borderWidth: 1.5,
  pointRadius: 0,
  fill: false,
});

const opcionesBase = (tituloY, min, max) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 28, font: { size: 11 } } } },
  scales: {
    x: { ticks: { color: '#888', maxTicksLimit: 8 }, grid: { display: false }, title: { display: true, text: 'Hora', color: '#78909C' } },
    y: { min, max, ticks: { color: '#888' }, grid: { color: '#eef2f4' }, title: { display: true, text: tituloY, color: '#78909C' } },
  },
});

// Probabilidad de que el agua sea apta y puntaje de anomalía en el tiempo.
const GraficoEvolucion = ({ evolucion }) => {
  const etiquetas = evolucion.map((e) => hora(e.fecha_hora));
  const anomala = evolucion.map((e) => Number(e.es_anomalia) === 1);
  const datos = {
    labels: etiquetas,
    datasets: [
      {
        label: 'Probabilidad de que sea apta',
        data: evolucion.map((e) => (e.probabilidad_apta === null ? null : Number(e.probabilidad_apta))),
        borderColor: '#2E7D32',
        backgroundColor: '#2E7D3218',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Puntaje de anomalía',
        data: evolucion.map((e) => (e.puntaje_anomalia === null ? null : Number(e.puntaje_anomalia))),
        borderColor: '#7B1FA2',
        tension: 0.3,
        borderWidth: 1.5,
        pointRadius: anomala.map((a) => (a ? 3.5 : 0)),
        pointBackgroundColor: anomala.map((a) => (a ? ROJO : '#7B1FA2')),
        pointBorderColor: anomala.map((a) => (a ? ROJO : '#7B1FA2')),
      },
      lineaHorizontal('Umbral de anomalía (0,5)', 0.5, etiquetas.length, '#7B1FA2'),
    ],
  };
  const opciones = opcionesBase('Valor (0 a 1)', 0, 1);
  return (
    <Box sx={{ height: 260 }}>
      <Line data={datos} options={opciones} />
    </Box>
  );
};

// Últimas lecturas (promedios de 15 min) y pronóstico a 3 horas de un parámetro.
const GraficoPronostico = ({ parametro, recientes, pronostico }) => {
  const unidad = UNIDADES[parametro];
  const historia = recientes.map((r) => ({ t: r.fecha_hora, v: r[parametro] === null ? null : Number(r[parametro]) }));
  const futuro = pronostico ? pronostico.puntos : [];
  const etiquetas = [...historia.map((h) => hora(h.t)), ...futuro.map((p) => hora(p.fecha_hora))];
  const n = historia.length;
  const limite = LIMITES[parametro];
  const datasets = [
    {
      label: `Lecturas (promedio de 15 min)`,
      data: [...historia.map((h) => h.v), ...futuro.map(() => null)],
      borderColor: '#0E7C9B',
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2,
    },
    {
      label: pronostico ? `Pronóstico (${METODOS_PRONOSTICO[pronostico.metodo] || pronostico.metodo})` : 'Pronóstico',
      // Empieza en la última lectura para que las dos líneas queden unidas.
      data: [...historia.map((h, i) => (i === n - 1 ? h.v : null)), ...futuro.map((p) => p.valor)],
      borderColor: '#ED6C02',
      borderDash: [5, 4],
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2,
    },
    lineaHorizontal(`Límite máximo NB 512-04 (${limite.max}${unidad ? ` ${unidad}` : ''})`, limite.max, etiquetas.length),
  ];
  if (limite.min > 0) datasets.push(lineaHorizontal(`Límite mínimo NB 512-04 (${limite.min})`, limite.min, etiquetas.length));
  const titulo = unidad ? `${NOMBRES_PARAMETRO[parametro]} (${unidad})` : NOMBRES_PARAMETRO[parametro];
  return (
    <Box sx={{ height: 230 }}>
      <Line data={{ labels: etiquetas, datasets }} options={opcionesBase(titulo)} />
    </Box>
  );
};

const AnalisisSensor = ({ sensorId }) => {
  const [horas, setHoras] = useState(24);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    const cargar = () =>
      axios
        .get(`/analisis/sensores/${sensorId}`, { params: { horas } })
        .then((res) => {
          if (!activo) return;
          setDatos(res.data);
          setError(null);
        })
        .catch(() => activo && setError('No se pudo cargar el análisis del sensor.'));
    setDatos(null);
    cargar();
    const intervalo = setInterval(cargar, 60000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [sensorId, horas]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!datos) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  const { ultimo, distribucion, evolucion, anomalias, pronosticos, recientes } = datos;
  const totalClasificadas = Object.values(distribucion).reduce((a, b) => a + b, 0);
  const pronosticoDe = Object.fromEntries(pronosticos.map((p) => [p.parametro, p]));

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h6" fontWeight={700}>
          {datos.sensor.n_serie} · {datos.sensor.ubicacion || 'Sin ubicación'}
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={horas} onChange={(e, v) => v && setHoras(v)}>
          <ToggleButton value={6}>6 h</ToggleButton>
          <ToggleButton value={24}>24 h</ToggleButton>
          <ToggleButton value={168}>7 días</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {!ultimo ? (
        <Alert severity="info">
          Todavía no hay lecturas analizadas de este sensor. El análisis empieza cuando el sensor envía lecturas y el servicio de
          aprendizaje automático está activo.
        </Alert>
      ) : (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Clasificación de la última lectura
              </Typography>
              <ChipClase clase={ultimo.clase} size="medium" />
              <Typography variant="body2" sx={{ mt: 1.5 }}>
                Probabilidad de que el agua sea apta: <strong>{porcentaje(ultimo.probabilidad_apta)}</strong>
              </Typography>
              <Typography variant="body2">
                Según el modelo: <strong>{CLASES_CALIDAD[ultimo.clase_modelo]?.label || '—'}</strong>
              </Typography>
              <Typography variant="body2" color={Number(ultimo.cumple_nb512) === 1 ? 'success.main' : 'error.main'}>
                {Number(ultimo.cumple_nb512) === 1 ? 'Cumple los rangos de la NB 512-04' : 'Incumple la NB 512-04 (prevalece la norma)'}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                {fechaHora(ultimo.fecha_hora)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Lecturas de las últimas {horas === 168 ? '7 días' : `${horas} h`} ({totalClasificadas})
              </Typography>
              {Object.entries(CLASES_CALIDAD).map(([clase, info]) => {
                const cantidad = distribucion[clase] || 0;
                const parte = totalClasificadas ? cantidad / totalClasificadas : 0;
                return (
                  <Box key={clase} sx={{ mb: 1 }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">{info.label}</Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {cantidad} ({porcentaje(parte)})
                      </Typography>
                    </Stack>
                    <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'grey.200', overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', width: `${parte * 100}%`, bgcolor: info.color }} />
                    </Box>
                  </Box>
                );
              })}
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Detección de anomalías
              </Typography>
              <Typography variant="h4" fontWeight={700} color={anomalias.length ? '#7B1FA2' : 'text.primary'}>
                {anomalias.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                lecturas anómalas en el periodo
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Última lectura: {Number(ultimo.es_anomalia) === 1 ? <strong style={{ color: '#7B1FA2' }}>anómala</strong> : 'normal'}
                {ultimo.puntaje_anomalia !== null && ` (puntaje ${Number(ultimo.puntaje_anomalia).toFixed(2)})`}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {evolucion.length > 1 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Evolución de la clasificación y de las anomalías
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Promedios de 5 minutos. La probabilidad de que sea apta la estima el modelo de clasificación para los parámetros de laboratorio;
            por encima de 0,5, el puntaje de anomalía indica una lectura anómala (puntos rojos).
          </Typography>
          <GraficoEvolucion evolucion={evolucion} />
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Pronóstico a 3 horas
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
          Se calcula cada 15 minutos con los últimos 7 días del sensor; si un valor pronosticado sale de la NB 512-04 se genera una alerta
          preventiva.
        </Typography>
        <Grid container spacing={2}>
          {PARAMETROS_PRONOSTICO.map((parametro) => {
            const pronostico = pronosticoDe[parametro];
            return (
              <Grid item xs={12} md={4} key={parametro}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2">{NOMBRES_PARAMETRO[parametro]}</Typography>
                  {pronostico?.fuera_de_rango && (
                    <TooltipMui title={`Se prevé ${pronostico.fuera_de_rango.valor} a las ${hora(pronostico.fuera_de_rango.fecha_hora)}`}>
                      <Chip size="small" label="Saldría de la norma" sx={{ bgcolor: ROJO, color: '#fff', fontWeight: 600 }} />
                    </TooltipMui>
                  )}
                </Stack>
                {pronostico ? (
                  <>
                    <GraficoPronostico parametro={parametro} recientes={recientes} pronostico={pronostico} />
                    <Typography variant="caption" color="text.secondary">
                      Generado a las {hora(pronostico.generado_en)}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                    Sin pronóstico todavía: hace falta que el sensor envíe lecturas de forma continua (al menos 2 días de historia).
                  </Typography>
                )}
              </Grid>
            );
          })}
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Lecturas anómalas
        </Typography>
        {anomalias.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No se detectaron lecturas anómalas en el periodo.
          </Typography>
        ) : (
          <TableContainer sx={{ maxHeight: 340 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['Fecha y hora', 'Causa probable', 'Parámetros', 'Puntaje', 'pH', 'Turbidez', 'Conductividad', 'Temp.'].map((t) => (
                    <TableCell key={t} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {t}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {anomalias.map((a) => {
                  const tipo = TIPOS_ANOMALIA[a.tipo_anomalia] || TIPOS_ANOMALIA.atipica;
                  return (
                    <TableRow key={a.lectura_id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fechaHora(a.fecha_hora)}</TableCell>
                      <TableCell>
                        <TooltipMui title={tipo.detalle}>
                          <span>{tipo.label}</span>
                        </TooltipMui>
                      </TableCell>
                      <TableCell>{(a.parametros_anomalia || '').split(',').filter(Boolean).map((p) => NOMBRES_PARAMETRO[p] || p).join(', ') || '—'}</TableCell>
                      <TableCell>{a.puntaje_anomalia === null ? '—' : Number(a.puntaje_anomalia).toFixed(2)}</TableCell>
                      <TableCell>{a.valor_ph ?? '—'}</TableCell>
                      <TableCell>{a.valor_turbidez ?? '—'}</TableCell>
                      <TableCell>{a.valor_conductividad ?? '—'}</TableCell>
                      <TableCell>{a.valor_temperatura ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Stack>
  );
};

export default AnalisisSensor;
