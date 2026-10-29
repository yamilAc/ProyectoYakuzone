import React, { useEffect, useState } from 'react';
import {
  Container,
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Button,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  Divider,
  Stack,
  Avatar,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import GroupsIcon from '@mui/icons-material/Groups';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PhoneIcon from '@mui/icons-material/Phone';
import axios from '../axios/axiosConfig';
import PageHeader from '../components/PageHeader';

const MIEMBRO_VACIO = { nombre: '', telefono: '' };
const FORM_INICIAL = { nombre: '', descripcion: '', jefe_id: '', miembros: [{ ...MIEMBRO_VACIO }] };

// Equipos de mitigación: cada equipo tiene un jefe (usuario con rol
// "Equipo de mitigación", el único que entra al sistema y recibe las
// alertas asignadas) y sus miembros, registrados solo con nombre y teléfono.
const Equipos = () => {
  const [equipos, setEquipos] = useState([]);
  const [jefes, setJefes] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);

  const [equipoAEliminar, setEquipoAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resEquipos, resUsuarios] = await Promise.all([axios.get('/equipos'), axios.get('/usuarios')]);
      setEquipos(resEquipos.data);
      setJefes(resUsuarios.data.filter((u) => u.rol === 'equipo_mitigacion'));
    } catch (err) {
      console.error('Error al cargar equipos:', err);
      setFeedback({ open: true, severity: 'error', message: 'No se pudo cargar la lista de equipos.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const abrirNuevo = () => {
    setEditando(null);
    setFormData({ ...FORM_INICIAL, miembros: [{ ...MIEMBRO_VACIO }] });
    setDialogoAbierto(true);
  };

  const abrirEditar = (equipo) => {
    setEditando(equipo);
    setFormData({
      nombre: equipo.nombre || '',
      descripcion: equipo.descripcion || '',
      jefe_id: equipo.jefe_id || '',
      miembros: equipo.miembros.length
        ? equipo.miembros.map((m) => ({ nombre: m.nombre, telefono: m.telefono || '' }))
        : [{ ...MIEMBRO_VACIO }],
    });
    setDialogoAbierto(true);
  };

  const cerrarDialogo = () => {
    if (guardando) return;
    setDialogoAbierto(false);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleMiembroChange = (indice, campo, valor) => {
    setFormData((f) => ({
      ...f,
      miembros: f.miembros.map((m, i) => (i === indice ? { ...m, [campo]: valor } : m)),
    }));
  };

  const agregarMiembro = () => {
    setFormData((f) => ({ ...f, miembros: [...f.miembros, { ...MIEMBRO_VACIO }] }));
  };

  const quitarMiembro = (indice) => {
    setFormData((f) => ({ ...f, miembros: f.miembros.filter((_, i) => i !== indice) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      if (editando) {
        await axios.put(`/equipos/${editando.id}`, formData);
        setFeedback({ open: true, severity: 'success', message: `Equipo ${formData.nombre} actualizado correctamente.` });
      } else {
        await axios.post('/equipos', formData);
        setFeedback({ open: true, severity: 'success', message: `Equipo ${formData.nombre} registrado correctamente.` });
      }
      setDialogoAbierto(false);
      cargarDatos();
    } catch (err) {
      console.error('Error al guardar el equipo:', err);
      setFeedback({
        open: true,
        severity: 'error',
        message: err.response?.data?.error || 'Ocurrió un error al guardar el equipo.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!equipoAEliminar) return;
    setEliminando(true);
    try {
      await axios.delete(`/equipos/${equipoAEliminar.id}`);
      setFeedback({ open: true, severity: 'success', message: `Equipo ${equipoAEliminar.nombre} eliminado.` });
      setEquipoAEliminar(null);
      cargarDatos();
    } catch (err) {
      console.error('Error al eliminar el equipo:', err);
      setFeedback({
        open: true,
        severity: 'error',
        message: err.response?.data?.error || 'No se pudo eliminar el equipo.',
      });
    } finally {
      setEliminando(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={GroupsIcon}
        title="Equipos de mitigación"
        subtitle="Cada equipo tiene un jefe, que es quien recibe las alertas que se le asignan"
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={abrirNuevo}
            sx={{ bgcolor: 'rgba(255,255,255,0.18)', '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' } }}
          >
            Nuevo equipo
          </Button>
        }
      />

      <Container maxWidth="lg" sx={{ pb: 5 }}>
        {!cargando && jefes.length === 0 && (
          <Alert severity="info" sx={{ mb: 3 }}>
            Para crear un equipo, primero registra en <strong>Usuarios</strong> la cuenta de su jefe con el rol
            "Equipo de mitigación". Los demás miembros no necesitan usuario.
          </Alert>
        )}

        {cargando ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="240px">
            <CircularProgress />
          </Box>
        ) : equipos.length === 0 ? (
          <Box
            component={motion.div}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}
          >
            <GroupsIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
            <Typography variant="h6">Todavía no hay equipos de mitigación registrados</Typography>
            <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }} onClick={abrirNuevo} disabled={jefes.length === 0}>
              Registrar el primero
            </Button>
          </Box>
        ) : (
          <Grid container spacing={2.5}>
            <AnimatePresence>
              {equipos.map((equipo, i) => (
                <Grid item xs={12} sm={6} md={4} key={equipo.id}>
                  <Card
                    component={motion.div}
                    layout
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.35, delay: i * 0.04 }}
                    whileHover={{ y: -4, boxShadow: '0 12px 28px rgba(11,94,119,0.18)' }}
                    sx={{ borderRadius: 3, borderTop: '4px solid #2E7D32', height: '100%', display: 'flex', flexDirection: 'column' }}
                  >
                    <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                        <Typography variant="h6" fontWeight={700}>
                          {equipo.nombre}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${equipo.alertas_activas} en curso`}
                          color={equipo.alertas_activas > 0 ? 'warning' : 'default'}
                          sx={{ fontWeight: 600 }}
                        />
                      </Box>
                      {equipo.descripcion && (
                        <Typography variant="body2" color="text.secondary">
                          {equipo.descripcion}
                        </Typography>
                      )}

                      <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mt: 0.5 }}>
                        <Avatar sx={{ width: 34, height: 34, bgcolor: '#2E7D32', fontSize: 15 }}>
                          {equipo.jefe_nombre ? equipo.jefe_nombre[0] : '?'}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {equipo.jefe_nombre ? `${equipo.jefe_nombre} ${equipo.jefe_apellido}` : 'Sin jefe asignado'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {equipo.jefe_email ? `Jefe · ${equipo.jefe_email}` : 'Edita el equipo para elegir un jefe'}
                          </Typography>
                          {equipo.jefe_id && (
                            <Typography variant="caption" color={equipo.jefe_telefono ? 'text.secondary' : 'warning.main'} noWrap display="block">
                              {equipo.jefe_telefono ? `WhatsApp · ${equipo.jefe_telefono}` : 'Sin celular: regístralo en Usuarios para avisos por WhatsApp'}
                            </Typography>
                          )}
                        </Box>
                      </Stack>

                      <Divider sx={{ my: 0.5 }} />
                      <Typography variant="caption" color="text.secondary">
                        Miembros ({equipo.miembros.length})
                      </Typography>
                      {equipo.miembros.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Sin miembros registrados
                        </Typography>
                      ) : (
                        equipo.miembros.map((m) => (
                          <Typography key={m.id} variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                            {m.nombre}
                            {m.telefono && (
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                                <PhoneIcon sx={{ fontSize: 12 }} /> {m.telefono}
                              </Typography>
                            )}
                          </Typography>
                        ))
                      )}

                      <Box sx={{ flex: 1 }} />
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Tooltip title="Editar equipo">
                          <IconButton size="small" onClick={() => abrirEditar(equipo)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar equipo">
                          <IconButton size="small" color="error" onClick={() => setEquipoAEliminar(equipo)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </AnimatePresence>
          </Grid>
        )}
      </Container>

      {/* Diálogo de alta / edición */}
      <Dialog open={dialogoAbierto} onClose={cerrarDialogo} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {editando ? `Editar equipo ${editando.nombre}` : 'Nuevo equipo de mitigación'}
          <IconButton onClick={cerrarDialogo} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Nombre del equipo"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  placeholder="Equipo 1 - Chiquicollo"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Descripción (opcional)"
                  name="descripcion"
                  value={formData.descripcion}
                  onChange={handleInputChange}
                  fullWidth
                  placeholder="Zona o tareas que cubre el equipo"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  select
                  label="Jefe del equipo"
                  name="jefe_id"
                  value={formData.jefe_id}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  helperText="Recibe por correo y en Notificaciones las alertas asignadas al equipo"
                >
                  {jefes.length === 0 && (
                    <MenuItem value="" disabled>
                      No hay usuarios con rol "Equipo de mitigación"
                    </MenuItem>
                  )}
                  {jefes.map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.nombre} {u.apellido} — {u.email}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Miembros
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Solo nombre y teléfono; no necesitan usuario en el sistema.
                </Typography>
              </Grid>
              {formData.miembros.map((m, i) => (
                <Grid item xs={12} key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    label={`Miembro ${i + 1}`}
                    value={m.nombre}
                    onChange={(e) => handleMiembroChange(i, 'nombre', e.target.value)}
                    size="small"
                    sx={{ flex: 3 }}
                  />
                  <TextField
                    label="Teléfono"
                    value={m.telefono}
                    onChange={(e) => handleMiembroChange(i, 'telefono', e.target.value)}
                    size="small"
                    sx={{ flex: 2 }}
                  />
                  <Tooltip title="Quitar miembro">
                    <IconButton size="small" onClick={() => quitarMiembro(i)}>
                      <RemoveCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Grid>
              ))}
              <Grid item xs={12}>
                <Button size="small" startIcon={<PersonAddIcon />} onClick={agregarMiembro}>
                  Agregar miembro
                </Button>
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
              {editando ? 'Guardar cambios' : 'Registrar equipo'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Diálogo de confirmación de eliminación */}
      <Dialog open={Boolean(equipoAEliminar)} onClose={() => !eliminando && setEquipoAEliminar(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <WarningAmberIcon /> Eliminar equipo
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>
            ¿Seguro que quieres eliminar el equipo <strong>{equipoAEliminar?.nombre}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Se borra el equipo y su lista de miembros. Las alertas que ya mitigó se conservan en el historial. No se puede eliminar
            mientras tenga alertas asignadas sin mitigar.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEquipoAEliminar(null)} disabled={eliminando}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={eliminando}
            startIcon={eliminando ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
            onClick={handleEliminar}
          >
            Eliminar
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

export default Equipos;
