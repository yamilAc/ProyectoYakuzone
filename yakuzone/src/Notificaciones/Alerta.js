import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { FotosEvidencia, TIPOS_FOTO } from './FotosMitigacion';
import { getUserRole } from '../axios/auth';
import { ESTADOS_ALERTA, RESULTADOS_VISITA, EVENTO_ALERTAS_CAMBIARON, textoParametro, textoValor, formatearFecha } from '../utils/alertas';

// Administradores y empleados ven todas las alertas, las asignan a un
// equipo y revisan los informes de las visitas (pestaña Pendientes); el jefe
// de un equipo de mitigación solo ve las de su equipo.
const PESTANAS_GESTION = [
  { estado: 'pendiente', label: 'Sin asignar' },
  { estado: 'asignada', label: 'Asignadas' },
  { estado: 'en_revision', label: 'Pendientes' },
  { estado: 'mitigada', label: 'Mitigadas' },
  { estado: '', label: 'Todas' },
];
const PESTANAS_JEFE = [
  { estado: 'asignada', label: 'Por atender' },
  { estado: 'en_revision', label: 'En revisión' },
  { estado: 'mitigada', label: 'Mitigadas' },
];

const MENSAJES_VACIO = {
  pendiente: 'No hay alertas sin asignar.',
  asignada: 'No hay alertas asignadas esperando la visita del equipo.',
  en_revision: 'No hay informes de visita pendientes de revisión.',
  mitigada: 'Todavía no hay alertas mitigadas.',
  '': 'Todavía no hay notificaciones.',
};
const MENSAJES_VACIO_JEFE = {
  asignada: 'Tu equipo no tiene alertas por atender.',
  en_revision: 'No tienes informes esperando revisión.',
  mitigada: 'Todavía no hay alertas mitigadas por tu equipo.',
};

// Miniaturas de las fotos del último informe de visita en la tarjeta de una
// alerta (en revisión o mitigada). Se descargan recién cuando la tarjeta
// aparece en pantalla; tocar una la amplía (sin abrir el detalle de la alerta).
const FotosEnTarjeta = ({ alertaId, informeId }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible || !ref.current) return undefined;
    const observador = new IntersectionObserver(([entrada]) => entrada.isIntersecting && setVisible(true), { rootMargin: '200px' });
    observador.observe(ref.current);
    return () => observador.disconnect();
  }, [visible]);
  return (
    <Box ref={ref} onClick={(e) => e.stopPropagation()} sx={{ mt: 1, maxWidth: 380, minHeight: 64 }}>
      {visible && <FotosEvidencia alertaId={alertaId} informeId={informeId} tipos={TIPOS_FOTO.map((t) => t.tipo)} alto={64} />}
    </Box>
  );
};

const Alerta = () => {
  const esJefe = getUserRole() === 'equipo_mitigacion';
  const pestanas = esJefe ? PESTANAS_JEFE : PESTANAS_GESTION;

  const [tab, setTab] = useState(0);
  const [alertas, setAlertas] = useState([]);
  const [resumen, setResumen] = useState({ pendiente: 0, asignada: 0, en_revision: 0, mitigada: 0 });
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
    window.addEventListener(EVENTO_ALERTAS_CAMBIARON, fetchAlertas);
    return () => {
      activo = false;
      clearInterval(interval);
      window.removeEventListener(EVENTO_ALERTAS_CAMBIARON, fetchAlertas);
    };
  }, [estado, recarga]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return alertas;
    return alertas.filter((a) =>
      [a.numero_serie, a.ubicacion, a.propietario_nombre, textoParametro(a.parametro), a.equipo_nombre]
        .filter(Boolean)
        .some((texto) => texto.toLowerCase().includes(termino))
    );
  }, [alertas, busqueda]);

  const totalTodas = resumen.pendiente + resumen.asignada + (resumen.en_revision || 0) + resumen.mitigada;
  const contador = (e) => (e ? resumen[e] || 0 : totalTodas);
  const avisosEncabezado = esJefe
    ? [resumen.asignada > 0 && `${resumen.asignada} por atender`]
    : [resumen.pendiente > 0 && `${resumen.pendiente} sin asignar`, resumen.en_revision > 0 && `${resumen.en_revision} por revisar`];
  const textoEncabezado = avisosEncabezado.filter(Boolean).join(' · ');

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
          textoEncabezado && (
            <Chip
              label={textoEncabezado}
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
          placeholder="Buscar por sensor, ubicación, propietario, parámetro o equipo..."
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
            {busqueda ? 'Ninguna alerta coincide con la búsqueda.' : (esJefe ? MENSAJES_VACIO_JEFE : MENSAJES_VACIO)[estado]}
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
                          <Stack direction="row" spacing={0.6}>
                            {alerta.estado === 'en_revision' && RESULTADOS_VISITA[alerta.ultimo_resultado] && (
                              <Chip
                                label={RESULTADOS_VISITA[alerta.ultimo_resultado].label}
                                size="small"
                                variant="outlined"
                                sx={{ borderColor: RESULTADOS_VISITA[alerta.ultimo_resultado].color, color: RESULTADOS_VISITA[alerta.ultimo_resultado].color, fontWeight: 600 }}
                              />
                            )}
                            <Chip label={info.label} size="small" sx={{ bgcolor: info.color, color: '#fff', fontWeight: 600 }} />
                          </Stack>
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
                          {alerta.propietario_nombre && ` · Propietario: ${alerta.propietario_nombre}`}
                          {alerta.mitigado_en && ` · Mitigada el ${formatearFecha(alerta.mitigado_en)}`}
                        </Typography>
                        {['en_revision', 'mitigada'].includes(alerta.estado) && alerta.fotos > 0 && (
                          <FotosEnTarjeta alertaId={alerta.id} informeId={alerta.ultimo_informe_id} />
                        )}
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
