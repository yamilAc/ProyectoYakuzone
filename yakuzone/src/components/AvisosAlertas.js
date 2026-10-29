import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CloseIcon from '@mui/icons-material/Close';
import axios from '../axios/axiosConfig';
import DetalleAlerta from '../Notificaciones/DetalleAlerta';
import { textoParametro, textoValor, avisarCambioAlertas } from '../utils/alertas';

const INTERVALO_MS = 10000;
const DURACION_AVISO_MS = 20000;
const MAX_AVISOS = 3;

// Qué se anuncia a cada rol: administradores y empleados, cada alerta nueva
// sin asignar y cada informe de visita que llega para revisar; el jefe de un
// equipo de mitigación, cada alerta asignada (o reasignada) a su equipo.
const FUENTES_GESTION = [
  { estado: 'pendiente', titulo: 'Nueva alerta de calidad del agua', color: 'error.main' },
  { estado: 'en_revision', titulo: 'Informe de visita por revisar', color: '#7B1FA2' },
];
const FUENTES_JEFE = [{ estado: 'asignada', titulo: 'Nueva alerta asignada a tu equipo', color: 'error.main' }];

// Aviso emergente, visible en cualquier pantalla del sistema. Al tocarlo se
// abre el detalle de la alerta (datos del sensor, mapa y propietario).
const AvisosAlertas = ({ userRole }) => {
  const fuentes = userRole === 'equipo_mitigacion' ? FUENTES_JEFE : FUENTES_GESTION;
  // Alertas ya conocidas por estado: las que existían al entrar no se
  // anuncian, solo las que aparezcan después.
  const conocidas = useRef({});
  const [avisos, setAvisos] = useState([]);
  const [alertaAbierta, setAlertaAbierta] = useState(null);

  useEffect(() => {
    let activo = true;
    conocidas.current = {};
    const revisar = async () => {
      for (const fuente of fuentes) {
        try {
          const res = await axios.get('/alertas', { params: { estado: fuente.estado } });
          if (!activo) return;
          const yaVistas = conocidas.current[fuente.estado];
          // Una alerta que sale de este estado y vuelve (p. ej. reasignada
          // tras una visita no aprobada) se anuncia de nuevo.
          conocidas.current[fuente.estado] = new Set(res.data.map((a) => a.id));
          if (!yaVistas) continue;
          const nuevas = res.data.filter((a) => !yaVistas.has(a.id));
          if (nuevas.length > 0) {
            const recibido = Date.now();
            setAvisos((actuales) =>
              [...nuevas.map((a) => ({ ...a, clave: `${fuente.estado}-${a.id}-${recibido}`, titulo: fuente.titulo, color: fuente.color, recibido })), ...actuales].slice(0, MAX_AVISOS)
            );
            avisarCambioAlertas(); // el contador del menú se actualiza al mismo tiempo que el aviso
          }
        } catch {
          // Sin conexión o sesión vencida: se vuelve a intentar en el próximo ciclo.
        }
      }
    };
    revisar();
    const interval = setInterval(revisar, INTERVALO_MS);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, [fuentes]);

  // Cada aviso se cierra solo después de un rato (la alerta sigue en Notificaciones).
  useEffect(() => {
    if (avisos.length === 0) return undefined;
    const timer = setInterval(() => {
      setAvisos((actuales) => actuales.filter((a) => Date.now() - a.recibido < DURACION_AVISO_MS));
    }, 1000);
    return () => clearInterval(timer);
  }, [avisos.length]);

  const cerrar = (clave) => setAvisos((actuales) => actuales.filter((a) => a.clave !== clave));

  const abrir = (aviso) => {
    cerrar(aviso.clave);
    setAlertaAbierta(aviso.id);
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
              key={a.clave}
              layout
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ duration: 0.3 }}
              style={{ pointerEvents: 'auto' }}
            >
              <Paper
                elevation={8}
                onClick={() => abrir(a)}
                sx={{
                  p: 1.5,
                  pr: 0.5,
                  cursor: 'pointer',
                  borderLeft: '5px solid',
                  borderColor: a.color,
                  display: 'flex',
                  gap: 1.2,
                  alignItems: 'flex-start',
                  '&:hover': { boxShadow: 12 },
                }}
              >
                <NotificationsActiveIcon sx={{ mt: 0.3, color: a.color }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {a.titulo}
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
                    cerrar(a.clave);
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
