import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Chip, CircularProgress, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import InsightsIcon from '@mui/icons-material/Insights';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import RoomIcon from '@mui/icons-material/Room';
import axios from '../axios/axiosConfig';
import { COLOR_PREVENTIVA, ORIGENES_PREVENTIVA } from '../utils/analisis';
import { formatearFecha } from '../utils/alertas';

// Alertas preventivas de los modelos de aprendizaje automático (lecturas
// anómalas y pronósticos fuera de la NB 512-04). Son informativas: avisan con
// anticipación y no pasan por el flujo de equipos; si el problema se
// confirma, el sistema genera la alerta normativa de siempre.
const AlertasPreventivas = ({ busqueda, onCambio }) => {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState('0'); // '0' = sin ver, '' = todas
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let activo = true;
    const cargar = () =>
      axios
        .get('/alertas-preventivas', { params: filtro ? { vista: filtro } : {} })
        .then((res) => activo && setAlertas(res.data))
        .catch(() => activo && setAlertas([]))
        .finally(() => activo && setCargando(false));
    setCargando(true);
    cargar();
    const intervalo = setInterval(cargar, 15000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [filtro, recarga]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return alertas;
    return alertas.filter((a) =>
      [a.numero_serie, a.ubicacion, a.propietario_nombre, a.descripcion].filter(Boolean).some((t) => t.toLowerCase().includes(termino))
    );
  }, [alertas, busqueda]);

  const marcarVista = async (id) => {
    await axios.put(`/alertas-preventivas/${id}/vista`).catch(() => {});
    setRecarga((n) => n + 1);
    onCambio && onCambio();
  };

  const marcarTodas = async () => {
    await axios.put('/alertas-preventivas/vistas').catch(() => {});
    setRecarga((n) => n + 1);
    onCambio && onCambio();
  };

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <ToggleButtonGroup size="small" exclusive value={filtro} onChange={(e, v) => v !== null && setFiltro(v)}>
          <ToggleButton value="0">Sin ver</ToggleButton>
          <ToggleButton value="">Todas</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" startIcon={<DoneAllIcon />} onClick={marcarTodas} disabled={!alertas.some((a) => !a.vista)}>
          Marcar todas como vistas
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Avisos anticipados de los modelos de análisis: lecturas anómalas (posibles fallas del sensor o cambios del agua) y pronósticos que
        saldrían de la NB 512-04. Son informativos; si el problema se confirma, se genera la alerta normativa.
      </Typography>

      {cargando && alertas.length === 0 ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : visibles.length === 0 ? (
        <Typography color="text.secondary">
          {busqueda ? 'Ninguna alerta preventiva coincide con la búsqueda.' : filtro ? 'No hay alertas preventivas sin ver.' : 'Todavía no hay alertas preventivas.'}
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {visibles.map((a) => (
            <Paper
              key={a.id}
              elevation={1}
              sx={{ p: 2, borderLeft: '4px solid', borderColor: COLOR_PREVENTIVA, opacity: a.vista ? 0.75 : 1 }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} flexWrap="wrap">
                <Typography variant="subtitle1" fontWeight={600}>
                  {a.numero_serie} — {ORIGENES_PREVENTIVA[a.origen]?.label || a.origen}
                </Typography>
                <Stack direction="row" spacing={0.6}>
                  {a.detecciones > 1 && <Chip size="small" variant="outlined" label={`${a.detecciones} detecciones`} />}
                  <Chip size="small" label="Preventiva" sx={{ bgcolor: COLOR_PREVENTIVA, color: '#fff', fontWeight: 600 }} />
                </Stack>
              </Stack>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {a.descripcion}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <RoomIcon fontSize="inherit" /> {a.ubicacion || 'Sin ubicación registrada'}
                {a.propietario_nombre && ` · Propietario: ${a.propietario_nombre}`}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Detectada el {formatearFecha(a.creada_en)}
                {a.detecciones > 1 && ` · última vez: ${formatearFecha(a.ultima_deteccion)}`}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button size="small" startIcon={<InsightsIcon />} onClick={() => navigate('/Analisis', { state: { sensorId: a.sensor_id } })}>
                  Ver análisis del sensor
                </Button>
                {!a.vista && (
                  <Button size="small" onClick={() => marcarVista(a.id)}>
                    Marcar como vista
                  </Button>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </>
  );
};

export default AlertasPreventivas;
