import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CloseIcon from '@mui/icons-material/Close';
import axios from '../axios/axiosConfig';
import DetalleAlerta from '../Notificaciones/DetalleAlerta';
import { textoParametro, textoValor } from '../utils/alertas';

const INTERVALO_MS = 10000;
const DURACION_AVISO_MS = 20000;
const MAX_AVISOS = 3;

// Aviso emergente de alertas nuevas, visible en cualquier pantalla del
// sistema: administradores y empleados ven cada alerta nueva sin asignar; el
// jefe de un equipo de mitigación, cada alerta nueva asignada a su equipo.
// Al tocar el aviso se abre el detalle de la alerta (datos del sensor, mapa
// y propietario).
const AvisosAlertas = ({ userRole }) => {
  const esJefe = userRole === 'equipo_mitigacion';
  const estado = esJefe ? 'asignada' : 'pendiente';
  // Alertas ya conocidas: las que existían al entrar no se anuncian, solo las
  // que aparezcan después.
  const conocidas = useRef(null);
  const [avisos, setAvisos] = useState([]);
  const [alertaAbierta, setAlertaAbierta] = useState(null);

  useEffect(() => {
    let activo = true;
    conocidas.current = null;
    const revisar = async () => {
      try {
        const res = await axios.get('/alertas', { params: { estado } });
        if (!activo) return;
        if (conocidas.current === null) {
          conocidas.current = new Set(res.data.map((a) => a.id));
          return;
        }
        const nuevas = res.data.filter((a) => !conocidas.current.has(a.id));
        nuevas.forEach((a) => conocidas.current.add(a.id));
        if (nuevas.length > 0) {
          setAvisos((actuales) => [...nuevas.map((a) => ({ ...a, recibido: Date.now() })), ...actuales].slice(0, MAX_AVISOS));
        }
      } catch {
        // Sin conexión o sesión vencida: se vuelve a intentar en el próximo ciclo.
      }
    };
    revisar();
    const interval = setInterval(revisar, INTERVALO_MS);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, [estado]);

  // Cada aviso se cierra solo después de un rato (la alerta sigue en Notificaciones).
  useEffect(() => {
    if (avisos.length === 0) return undefined;
    const timer = setInterval(() => {
      setAvisos((actuales) => actuales.filter((a) => Date.now() - a.recibido < DURACION_AVISO_MS));
    }, 1000);
    return () => clearInterval(timer);
  }, [avisos.length]);

  const cerrar = (id) => setAvisos((actuales) => actuales.filter((a) => a.id !== id));

  const abrir = (id) => {
    cerrar(id);
    setAlertaAbierta(id);
  };

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          top: { xs: 64, md: 16 },
          right: 16,
          left: { xs: 16, sm: 'auto' },
          zIndex: 1400,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.2,
          width: { sm: 360 },
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {avisos.map((a) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ duration: 0.3 }}
              style={{ pointerEvents: 'auto' }}
            >
              <Paper
                elevation={8}
                onClick={() => abrir(a.id)}
                sx={{
                  p: 1.5,
                  pr: 0.5,
                  cursor: 'pointer',
                  borderLeft: '5px solid',
                  borderColor: 'error.main',
                  display: 'flex',
                  gap: 1.2,
                  alignItems: 'flex-start',
                  '&:hover': { boxShadow: 12 },
                }}
              >
                <NotificationsActiveIcon color="error" sx={{ mt: 0.3 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {esJefe ? 'Nueva alerta asignada a tu equipo' : 'Nueva alerta de calidad del agua'}
                  </Typography>
                  <Typography variant="body2">
                    {a.numero_serie} — {textoParametro(a.parametro)}: {textoValor(a.parametro, a.valor)}
                  </Typography>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.3 }}>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                      {a.ubicacion || 'Sin ubicación registrada'}
                    </Typography>
                    <Typography variant="caption" color="primary" fontWeight={600} sx={{ flexShrink: 0, ml: 1 }}>
                      Ver detalle
                    </Typography>
                  </Stack>
                </Box>
                <IconButton
                  size="small"
                  aria-label="Cerrar aviso"
                  onClick={(e) => {
                    e.stopPropagation();
                    cerrar(a.id);
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Paper>
            </motion.div>
          ))}
        </AnimatePresence>
      </Box>

      <DetalleAlerta alertaId={alertaAbierta} onClose={() => setAlertaAbierta(null)} />
    </>
  );
};

export default AvisosAlertas;
