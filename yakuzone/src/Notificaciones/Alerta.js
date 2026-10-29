import React, { useEffect, useMemo, useState } from 'react';
import axios from '../axios/axiosConfig';
import {
  Container,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import NotificationsIcon from '@mui/icons-material/Notifications';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RoomIcon from '@mui/icons-material/Room';
import GroupsIcon from '@mui/icons-material/Groups';
import PageHeader from '../components/PageHeader';
import DetalleAlerta from './DetalleAlerta';
import { getUserRole } from '../axios/auth';
import { ESTADOS_ALERTA, textoParametro, textoValor, formatearFecha } from '../utils/alertas';

// Administradores y empleados ven todas las alertas y las asignan a un
// equipo; el jefe de un equipo de mitigación solo ve las de su equipo.
const PESTANAS_GESTION = [
  { estado: 'pendiente', label: 'Sin asignar' },
  { estado: 'asignada', label: 'Asignadas' },
  { estado: 'mitigada', label: 'Mitigadas' },
  { estado: '', label: 'Todas' },
];
const PESTANAS_JEFE = [
  { estado: 'asignada', label: 'Por atender' },
  { estado: 'mitigada', label: 'Mitigadas' },
];

const Alerta = () => {
  const esJefe = getUserRole() === 'equipo_mitigacion';
  const pestanas = esJefe ? PESTANAS_JEFE : PESTANAS_GESTION;

  const [tab, setTab] = useState(0);
  const [alertas, setAlertas] = useState([]);
  const [resumen, setResumen] = useState({ pendiente: 0, asignada: 0, mitigada: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [alertaAbierta, setAlertaAbierta] = useState(null);
  const [recarga, setRecarga] = useState(0);

  const estado = pestanas[tab].estado;

  useEffect(() => {
    let activo = true; // evita que una respuesta de la pestaña anterior pise la actual
    const fetchAlertas = async () => {
      try {
        const [resLista, resResumen] = await Promise.all([
          axios.get('/alertas', { params: estado ? { estado } : {} }),
          axios.get('/alertas/resumen'),
        ]);
        if (!activo) return;
        setAlertas(resLista.data);
        setResumen(resResumen.data);
        setError(null);
      } catch (err) {
        console.error('Error al obtener alertas:', err);
        if (activo) setError('No se pudieron cargar las alertas.');
      } finally {
        if (activo) setLoading(false);
      }
    };

    setLoading(true);
    fetchAlertas();
    const interval = setInterval(fetchAlertas, 10000); // Actualiza cada 10 segundos
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, [estado, recarga]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return alertas;
    return alertas.filter((a) =>
      [a.numero_serie, a.ubicacion, textoParametro(a.parametro), a.equipo_nombre]
        .filter(Boolean)
        .some((texto) => texto.toLowerCase().includes(termino))
    );
  }, [alertas, busqueda]);

  const totalTodas = resumen.pendiente + resumen.asignada + resumen.mitigada;
  const contador = (e) => (e ? resumen[e] : totalTodas);
  const porAtender = esJefe ? resumen.asignada : resumen.pendiente;

  return (
    <>
      <PageHeader
        icon={NotificationsIcon}
        title="Notificaciones"
        subtitle={
          esJefe
            ? 'Alertas asignadas a tu equipo de mitigación'
            : 'Alertas de calidad del agua: revisa cada una y asígnala a un equipo de mitigación'
        }
        action={
          porAtender > 0 && (
            <Chip
              label={esJefe ? `${porAtender} por atender` : `${porAtender} sin asignar`}
              sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', fontWeight: 600 }}
            />
          )
        }
      />
      <Container maxWidth="md" sx={{ pb: 4 }}>
        <Tabs
          value={tab}
          onChange={(e, val) => setTab(val)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          {pestanas.map((p) => (
            <Tab key={p.label} label={`${p.label} (${contador(p.estado)})`} />
          ))}
        </Tabs>

        <TextField
          fullWidth
          size="small"
          placeholder="Buscar por sensor, ubicación, parámetro o equipo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          sx={{ mb: 2.5, bgcolor: 'background.paper', borderRadius: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />

        {loading && alertas.length === 0 ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error">{error}</Typography>
        ) : visibles.length === 0 ? (
          <Typography color="text.secondary">
            {busqueda
              ? 'Ninguna alerta coincide con la búsqueda.'
              : estado === 'pendiente'
              ? 'No hay alertas sin asignar.'
              : estado === 'asignada'
              ? esJefe
                ? 'Tu equipo no tiene alertas por atender.'
                : 'No hay alertas asignadas en curso.'
              : estado === 'mitigada'
              ? 'Todavía no hay alertas mitigadas.'
              : 'Todavía no hay notificaciones.'}
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            <AnimatePresence initial={false}>
              {visibles.map((alerta, index) => {
                const info = ESTADOS_ALERTA[alerta.estado] || ESTADOS_ALERTA.pendiente;
                return (
                  <motion.div
                    key={alerta.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.25, delay: Math.min(index, 10) * 0.03 }}
                  >
                    <Paper
                      elevation={1}
                      onClick={() => setAlertaAbierta(alerta.id)}
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        borderLeft: '4px solid',
                        borderColor: info.color,
                        transition: 'box-shadow 0.2s ease',
                        '&:hover': { boxShadow: 4 },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
                          <Typography variant="subtitle1" fontWeight={600}>
                            {alerta.numero_serie} — {textoParametro(alerta.parametro)}: {textoValor(alerta.parametro, alerta.valor)}
                          </Typography>
                          <Chip label={info.label} size="small" sx={{ bgcolor: info.color, color: '#fff', fontWeight: 600 }} />
                        </Box>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.3, sm: 2 }} sx={{ mt: 0.5 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <RoomIcon fontSize="inherit" /> {alerta.ubicacion || 'Sin ubicación registrada'}
                          </Typography>
                          {alerta.equipo_nombre && (
                            <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <GroupsIcon fontSize="inherit" /> {alerta.equipo_nombre}
                            </Typography>
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.3 }}>
                          {formatearFecha(alerta.fecha_hora)}
                        </Typography>
                      </Box>
                      <ChevronRightIcon color="action" />
                    </Paper>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </Stack>
        )}
      </Container>

      <DetalleAlerta
        alertaId={alertaAbierta}
        onClose={() => setAlertaAbierta(null)}
        onCambio={() => setRecarga((n) => n + 1)}
      />
    </>
  );
};

export default Alerta;
