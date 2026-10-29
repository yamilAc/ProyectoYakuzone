import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableViewIcon from '@mui/icons-material/TableView';
import axios from '../axios/axiosConfig';

// "YYYY-MM-DD" de hoy menos n días, en hora local.
const haceDias = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ATAJOS = [
  { label: 'Últimos 7 días', desde: () => haceDias(7) },
  { label: 'Últimos 30 días', desde: () => haceDias(30) },
  { label: 'Todo el historial', desde: () => '' },
];

const DESCRIPCIONES = {
  general:
    'Indicadores clave, calidad del agua por sensor, alertas por estado y parámetro, desempeño de los equipos de mitigación y el detalle de las alertas.',
  alertas: 'Datos del sensor y su propietario, resumen de sus alertas y el detalle de cada una: estado, equipo asignado y acciones realizadas.',
};

// Descarga de los reportes de Datos Históricos en PDF o Excel.
// tipo: 'general' | 'alertas' (este último necesita `sensor`).
const ReporteDialog = ({ open, onClose, tipo, sensor }) => {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [descargando, setDescargando] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setDesde('');
      setHasta('');
      setError(null);
    }
  }, [open]);

  const descargar = async (formato) => {
    setDescargando(formato);
    setError(null);
    try {
      const params = { formato, desde: desde || undefined, hasta: hasta || undefined };
      if (tipo === 'alertas') params.sensor_id = sensor.id;
      const res = await axios.get(`/reportes/${tipo}`, { params, responseType: 'blob' });

      const nombre = tipo === 'alertas' ? `reporte_alertas_${sensor.n_serie}` : 'reporte_general';
      const url = URL.createObjectURL(res.data);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `${nombre}_${haceDias(0)}.${formato}`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      // Con responseType 'blob', el mensaje de error del backend también llega como blob.
      let mensaje = 'No se pudo generar el reporte.';
      try {
        mensaje = JSON.parse(await err.response.data.text()).error || mensaje;
      } catch {
        // respuesta sin JSON: se deja el mensaje genérico
      }
      setError(mensaje);
    } finally {
      setDescargando(null);
    }
  };

  const titulo = tipo === 'alertas' ? `Reporte de alertas — ${sensor ? sensor.n_serie : ''}` : 'Reporte general';

  return (
    <Dialog open={open} onClose={() => !descargando && onClose()} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {titulo}
        <IconButton onClick={onClose} size="small" disabled={Boolean(descargando)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {DESCRIPCIONES[tipo]}
        </Typography>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Periodo (opcional)
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          {ATAJOS.map((a) => (
            <Chip
              key={a.label}
              label={a.label}
              variant="outlined"
              onClick={() => {
                setDesde(a.desde());
                setHasta('');
              }}
            />
          ))}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            fullWidth
          />
          <TextField
            label="Hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            fullWidth
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Sin fechas, el reporte incluye todo el historial registrado.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="error"
          startIcon={descargando === 'pdf' ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />}
          disabled={Boolean(descargando)}
          onClick={() => descargar('pdf')}
        >
          Descargar PDF
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={descargando === 'xlsx' ? <CircularProgress size={16} color="inherit" /> : <TableViewIcon />}
          disabled={Boolean(descargando)}
          onClick={() => descargar('xlsx')}
        >
          Descargar Excel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReporteDialog;
