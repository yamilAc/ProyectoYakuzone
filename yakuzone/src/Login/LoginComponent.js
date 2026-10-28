import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Avatar,
  InputAdornment,
  IconButton,
  Stack,
  Chip,
  CircularProgress,
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import SensorsIcon from '@mui/icons-material/Sensors';
import VerifiedIcon from '@mui/icons-material/Verified';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { motion } from 'framer-motion';
import axios from '../axios/axiosConfig';
import logo from '../images/logoYakuzone.png';
import fondoAgua from '../images/agua1.jpg';

// Burbujas decorativas del panel izquierdo: posición, tamaño y ritmo de
// animación distintos para que el efecto se sienta orgánico y no repetitivo.
const BURBUJAS = [
  { left: '8%', size: 18, duration: 7, delay: 0 },
  { left: '20%', size: 10, duration: 9, delay: 1.2 },
  { left: '35%', size: 26, duration: 8.5, delay: 0.4 },
  { left: '50%', size: 14, duration: 6.5, delay: 2 },
  { left: '65%', size: 22, duration: 10, delay: 0.8 },
  { left: '78%', size: 12, duration: 7.5, delay: 1.6 },
  { left: '90%', size: 20, duration: 9.5, delay: 0.2 },
];

const FEATURES = [
  { icon: SensorsIcon, text: 'Sensores IoT en tiempo real' },
  { icon: VerifiedIcon, text: 'Alertas según la norma NB 512-04' },
  { icon: ShowChartIcon, text: 'Historial y tendencias por sensor' },
];

const LoginComponent = ({ setAuth }) => {
  const [email, setEmail] = useState('');
  const [contrasenia, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      const response = await axios.post('/login', { email, contrasenia });

      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        setAuth(true);
        navigate('/');
      } else {
        setError('Credenciales inválidas.');
      }
    } catch (err) {
      if (err.response && err.response.status === 401) {
        setError('Correo o contraseña incorrectos.');
      } else {
        console.error('Error en la autenticación:', err);
        setError('Error al conectar con el servidor. Intenta nuevamente.');
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      {/* Panel izquierdo: branding, solo visible desde md hacia arriba */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          width: '46%',
          p: 6,
          overflow: 'hidden',
          color: '#fff',
          backgroundImage: `linear-gradient(135deg, rgba(11,94,119,0.92) 0%, rgba(14,124,155,0.90) 55%, rgba(28,181,224,0.88) 100%), url(${fondoAgua})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {BURBUJAS.map((b, i) => (
          <motion.div
            key={i}
            style={{
              position: 'absolute',
              left: b.left,
              bottom: -40,
              width: b.size,
              height: b.size,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.35)',
            }}
            animate={{ y: [0, -520], opacity: [0, 0.9, 0] }}
            transition={{ duration: b.duration, delay: b.delay, repeat: Infinity, ease: 'linear' }}
          />
        ))}

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, zIndex: 1 }}
        >
          <Avatar src={logo} alt="Logo" variant="rounded" sx={{ width: 48, height: 48, bgcolor: 'rgba(255,255,255,0.15)' }} />
          <Typography variant="h6" fontWeight={700}>
            YakuZone
          </Typography>
        </motion.div>

        <Box sx={{ zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>
            <Typography variant="h3" fontWeight={700} sx={{ mb: 2, lineHeight: 1.15 }}>
              Agua monitoreada,
              <br />
              comunidad protegida.
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, maxWidth: 420, mb: 4 }}>
              Plataforma de monitoreo en tiempo real para la Cooperativa OTB
              Hallein — Chiquicollo, Cochabamba. Sensores IoT conectados por
              MQTT, umbrales de la norma boliviana NB 512-04 y alertas
              automáticas.
            </Typography>
          </motion.div>

          <Stack spacing={1.5}>
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.4 + i * 0.12 }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.15)',
                      borderRadius: '50%',
                      p: 0.8,
                      display: 'flex',
                    }}
                  >
                    <f.icon fontSize="small" />
                  </Box>
                  <Typography variant="body2">{f.text}</Typography>
                </Stack>
              </motion.div>
            ))}
          </Stack>
        </Box>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.8 }} style={{ zIndex: 1 }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            Proyecto de Grado 2024 · Universidad del Valle · Ingeniería de Sistemas Informáticos
          </Typography>
        </motion.div>
      </Box>

      {/* Panel derecho: formulario */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          p: 3,
        }}
      >
        <Box
          component={motion.div}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          sx={{ maxWidth: 400, width: '100%' }}
        >
          <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Avatar src={logo} alt="Logo" variant="rounded" sx={{ width: 56, height: 56, mb: 1 }} />
            <Typography variant="h6" fontWeight={700} color="primary.main">
              YakuZone
            </Typography>
          </Box>

          <Typography variant="h4" fontWeight={700} gutterBottom>
            Bienvenido de nuevo
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Ingresa tus credenciales para acceder al panel de monitoreo.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              type="email"
              label="Correo electrónico"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              margin="normal"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailOutlinedIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              type={mostrarPassword ? 'text' : 'password'}
              label="Contraseña"
              value={contrasenia}
              onChange={(e) => setPassword(e.target.value)}
              required
              margin="normal"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setMostrarPassword((v) => !v)} edge="end" size="small">
                      {mostrarPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Box
              component={motion.div}
              whileHover={{ scale: cargando ? 1 : 1.015 }}
              whileTap={{ scale: cargando ? 1 : 0.985 }}
              sx={{ mt: 3 }}
            >
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={cargando}
                sx={{
                  py: 1.3,
                  background: 'linear-gradient(90deg, #0B5E77 0%, #0E7C9B 55%, #1CB5E0 100%)',
                  boxShadow: '0 8px 20px rgba(14,124,155,0.35)',
                }}
              >
                {cargando ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : 'Iniciar Sesión'}
              </Button>
            </Box>
          </Box>

          <Stack direction="row" spacing={1} sx={{ mt: 4, flexWrap: 'wrap', gap: 1 }}>
            <Chip label="IoT" size="small" variant="outlined" />
            <Chip label="MQTT" size="small" variant="outlined" />
            <Chip label="Tiempo real" size="small" variant="outlined" />
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

export default LoginComponent;
