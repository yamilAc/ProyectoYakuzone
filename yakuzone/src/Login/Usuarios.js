import React, { useEffect, useMemo, useState } from 'react';
import {
  Container,
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Avatar,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  Divider,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import PeopleIcon from '@mui/icons-material/People';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BadgeIcon from '@mui/icons-material/Badge';
import HealingIcon from '@mui/icons-material/Healing';
import EmailIcon from '@mui/icons-material/Email';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';
import { getUserId } from '../axios/auth';

const FORM_INICIAL = {
  nombre: '',
  apellido: '',
  ci: '',
  email: '',
  contrasenia: '',
  rol: 'empleado',
};

// Colores por rol, coherentes con la paleta del resto del sistema: el rol
// con más privilegios usa el degradado de marca, el operativo un acento
// suave, para distinguirlos de un vistazo en las tarjetas.
const ROL_INFO = {
  administrador: { color: '#0B5E77', label: 'Administrador', icon: AdminPanelSettingsIcon },
  empleado: { color: '#1CB5E0', label: 'Empleado', icon: BadgeIcon },
  equipo_mitigacion: { color: '#2E7D32', label: 'Equipo de mitigación', icon: HealingIcon },
};

const iniciales = (nombre, apellido) =>
  `${(nombre || '?').charAt(0)}${(apellido || '').charAt(0)}`.toUpperCase();

const Usuarios = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);

  const [usuarioAEliminar, setUsuarioAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });

  const usuarioActualId = getUserId ? getUserId() : null;

  const fetchUsuarios = async () => {
    setCargando(true);
    try {
      const response = await axios.get('/usuarios');
      setUsuarios(response.data);
    } catch (error) {
      console.error('Error al obtener usuarios:', error);
      setFeedback({ open: true, severity: 'error', message: 'No tienes permiso para acceder a estos datos.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return usuarios;
    return usuarios.filter(
      (u) =>
        `${u.nombre} ${u.apellido}`.toLowerCase().includes(termino) ||
        (u.email || '').toLowerCase().includes(termino) ||
        (u.ci || '').toLowerCase().includes(termino)
    );
  }, [usuarios, busqueda]);

  const abrirNuevo = () => {
    setEditando(null);
    setFormData(FORM_INICIAL);
    setDialogoAbierto(true);
  };

  const abrirEditar = (usuario) => {
    setEditando(usuario);
    setFormData({ ...usuario, contrasenia: '' });
    setDialogoAbierto(true);
  };

  const cerrarDialogo = () => {
    if (guardando) return;
    setDialogoAbierto(false);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      if (editando) {
        await axios.put(`/usuarios/${editando.id}`, formData);
        setFeedback({ open: true, severity: 'success', message: 'Usuario actualizado correctamente.' });
      } else {
        await axios.post('/usuarios', formData);
        setFeedback({ open: true, severity: 'success', message: 'Usuario creado correctamente.' });
      }
      setDialogoAbierto(false);
      fetchUsuarios();
    } catch (error) {
      console.error('Error al crear/actualizar el usuario:', error);
      setFeedback({
        open: true,
        severity: 'error',
        message: error.response?.data?.error || 'Ocurrió un error al guardar el usuario.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!usuarioAEliminar) return;
    setEliminando(true);
    try {
      await axios.delete(`/usuarios/${usuarioAEliminar.id}`);
      setFeedback({ open: true, severity: 'success', message: 'Usuario eliminado.' });
      setUsuarioAEliminar(null);
      fetchUsuarios();
    } catch (error) {
      console.error('Error al eliminar el usuario:', error);
      setFeedback({ open: true, severity: 'error', message: 'No se pudo eliminar el usuario.' });
    } finally {
      setEliminando(false);
    }
  };

  const totalAdmins = usuarios.filter((u) => u.rol === 'administrador').length;
  const totalMitigacion = usuarios.filter((u) => u.rol === 'equipo_mitigacion').length;
  const totalEmpleados = usuarios.length - totalAdmins - totalMitigacion;

  return (
    <>
      <PageHeader
        icon={PeopleIcon}
        title="Gestión de Usuarios"
        subtitle="Alta, edición y roles de acceso al sistema"
        action={
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={abrirNuevo}
            sx={{ bgcolor: 'rgba(255,255,255,0.18)', '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' } }}
          >
            Nuevo usuario
          </Button>
        }
      />

      <Container maxWidth="lg" sx={{ pb: 5 }}>
        <Box
          component={motion.div}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}
        >
          <Chip
            icon={<AdminPanelSettingsIcon sx={{ color: '#fff !important' }} />}
            label={`${totalAdmins} administrador${totalAdmins === 1 ? '' : 'es'}`}
            sx={{ bgcolor: ROL_INFO.administrador.color, color: '#fff', fontWeight: 600, px: 0.5 }}
          />
          <Chip
            icon={<BadgeIcon sx={{ color: '#fff !important' }} />}
            label={`${totalEmpleados} empleado${totalEmpleados === 1 ? '' : 's'}`}
            sx={{ bgcolor: ROL_INFO.empleado.color, color: '#fff', fontWeight: 600, px: 0.5 }}
          />
          <Chip
            icon={<HealingIcon sx={{ color: '#fff !important' }} />}
            label={`${totalMitigacion} jefe${totalMitigacion === 1 ? '' : 's'} de equipo`}
            sx={{ bgcolor: ROL_INFO.equipo_mitigacion.color, color: '#fff', fontWeight: 600, px: 0.5 }}
          />
        </Box>

        <TextField
          fullWidth
          placeholder="Buscar por nombre, correo o CI..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          sx={{ mb: 3, bgcolor: 'background.paper', borderRadius: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />

        {cargando ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="240px">
            <CircularProgress />
          </Box>
        ) : usuariosFiltrados.length === 0 ? (
          <Box
            component={motion.div}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}
          >
            <PeopleIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
            <Typography variant="h6">
              {usuarios.length === 0 ? 'Todavía no hay usuarios registrados' : 'Ningún usuario coincide con la búsqueda'}
            </Typography>
            {usuarios.length === 0 && (
              <Button variant="outlined" startIcon={<PersonAddIcon />} sx={{ mt: 2 }} onClick={abrirNuevo}>
                Registrar el primero
              </Button>
            )}
          </Box>
        ) : (
          <Grid container spacing={2.5}>
            <AnimatePresence>
              {usuariosFiltrados.map((usuario, i) => {
                const info = ROL_INFO[usuario.rol] || ROL_INFO.empleado;
                const RolIcon = info.icon;
                const esUsuarioActual = usuarioActualId && String(usuarioActualId) === String(usuario.id);

                return (
                  <Grid item xs={12} sm={6} md={4} key={usuario.id}>
                    <Card
                      component={motion.div}
                      layout
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.35, delay: i * 0.04 }}
                      whileHover={{ y: -4, boxShadow: '0 12px 28px rgba(11,94,119,0.18)' }}
                      sx={{
                        borderRadius: 3,
                        borderTop: `4px solid ${info.color}`,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar
                            component={motion.div}
                            whileHover={{ scale: 1.08, rotate: 3 }}
                            sx={{
                              bgcolor: info.color,
                              width: 46,
                              height: 46,
                              fontWeight: 700,
                              boxShadow: '0 4px 10px rgba(11,94,119,0.3)',
                            }}
                          >
                            {iniciales(usuario.nombre, usuario.apellido)}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle1" fontWeight={700} noWrap>
                              {usuario.nombre} {usuario.apellido}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              CI {usuario.ci}
                            </Typography>
                          </Box>
                        </Box>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, wordBreak: 'break-all' }}
                        >
                          <EmailIcon fontSize="inherit" /> {usuario.email}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Chip
                            size="small"
                            icon={<RolIcon sx={{ color: '#fff !important' }} fontSize="small" />}
                            label={info.label}
                            sx={{ bgcolor: info.color, color: '#fff', fontWeight: 600 }}
                          />
                          {esUsuarioActual && (
                            <Chip size="small" label="Tú" variant="outlined" color="primary" />
                          )}
                        </Box>

                        <Box sx={{ flex: 1 }} />
                        <Divider sx={{ my: 1 }} />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                          <Tooltip title="Editar usuario">
                            <IconButton size="small" onClick={() => abrirEditar(usuario)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={esUsuarioActual ? 'No puedes eliminar tu propia cuenta' : 'Eliminar usuario'}>
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={esUsuarioActual}
                                onClick={() => setUsuarioAEliminar(usuario)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </AnimatePresence>
          </Grid>
        )}
      </Container>

      {/* Diálogo de alta / edición */}
      <Dialog open={dialogoAbierto} onClose={cerrarDialogo} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {editando ? `Editar a ${editando.nombre}` : 'Nuevo usuario'}
          <IconButton onClick={cerrarDialogo} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label="Nombre" name="nombre" value={formData.nombre} onChange={handleInputChange} fullWidth required />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Apellidos" name="apellido" value={formData.apellido} onChange={handleInputChange} fullWidth required />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Cédula de Identidad" name="ci" value={formData.ci} onChange={handleInputChange} fullWidth required />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Email" name="email" value={formData.email} onChange={handleInputChange} type="email" fullWidth required />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label={editando ? 'Nueva Contraseña (opcional)' : 'Contraseña'}
                  name="contrasenia"
                  value={formData.contrasenia}
                  onChange={handleInputChange}
                  type="password"
                  fullWidth
                  required={!editando}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Rol</InputLabel>
                  <Select name="rol" label="Rol" value={formData.rol} onChange={handleInputChange}>
                    <MenuItem value="administrador">Administrador</MenuItem>
                    <MenuItem value="empleado">Empleado</MenuItem>
                    <MenuItem value="equipo_mitigacion">Equipo de mitigación (jefe de equipo)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={cerrarDialogo} disabled={guardando}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={guardando}
              startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {editando ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Diálogo de confirmación de eliminación */}
      <Dialog open={Boolean(usuarioAEliminar)} onClose={() => !eliminando && setUsuarioAEliminar(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <WarningAmberIcon /> Eliminar usuario
        </DialogTitle>
        <DialogContent>
          <Typography>
            ¿Seguro que quieres eliminar a{' '}
            <strong>
              {usuarioAEliminar?.nombre} {usuarioAEliminar?.apellido}
            </strong>
            ? Perderá acceso al sistema de inmediato.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUsuarioAEliminar(null)} disabled={eliminando}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={eliminando}
            startIcon={eliminando ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
            onClick={handleEliminar}
          >
            Eliminar definitivamente
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={feedback.open}
        autoHideDuration={4000}
        onClose={() => setFeedback((f) => ({ ...f, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={feedback.severity} onClose={() => setFeedback((f) => ({ ...f, open: false }))}>
          {feedback.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default Usuarios;
