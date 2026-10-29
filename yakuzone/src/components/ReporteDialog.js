import React, { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableViewIcon from '@mui/icons-material/TableView';
import axios from '../axios/axiosConfig';
import SelectorPeriodo, { hoyMenos, periodoInvalido, periodoPredefinido } from './SelectorPeriodo';

// Los reportes de Datos Históricos. alertas: de un sensor (necesita `sensor`);
// alertas-general: todas las alertas del sistema; general: todo el sistema.
const TIPOS = {
  alertas: {
    titulo: (sensor) => `Reporte de alertas — ${sensor ? sensor.n_serie : ''}`,
    descripcion: 'Datos del sensor y su propietario, resumen de sus alertas y el detalle de cada una: estado, equipo asignado y acciones realizadas.',
    archivo: (sensor) => `reporte_alertas_${sensor.n_serie}`,
  },
  'alertas-general': {
    titulo: () => 'Reporte general de alertas',
    descripcion:
      'Todas las alertas del sistema con los datos del sensor y del propietario (nombre, CI, teléfono, dirección y teléfono de emergencia), el equipo asignado y la mitigación de cada una.',
    archivo: () => 'reporte_general_alertas',
  },
  general: {
    titulo: () => 'Reporte general',
    descripcion:
      'Todo el sistema: indicadores clave, sensores y propietarios, calidad del agua por sensor, alertas, equipos de mitigación y el detalle de las alertas. La versión Excel incluye además todas las lecturas del periodo.',
    archivo: () => 'reporte_general',
  },
};

// Descarga de los reportes de Datos Históricos en PDF o Excel, para el periodo elegido.
const ReporteDialog = ({ open, onClose, tipo, sensor }) => {
  const [periodo, setPeriodo] = useState(periodoPredefinido('mensual'));
  const [descargando, setDescargando] = useState(null);
  const [error, setError] = useState(null);
  const config = TIPOS[tipo] || TIPOS.general;

  useEffect(() => {
    if (open) {
      setPeriodo(periodoPredefinido('mensual'));
      setError(null);
    }
  }, [open]);

  const descargar = async (formato) => {
    setDescargando(formato);
    setError(null);
    try {
      const params = { formato, desde: periodo.desde || undefined, hasta: periodo.hasta || undefined };
      if (tipo === 'alertas') params.sensor_id = sensor.id;
      const res = await axios.get(`/reportes/${tipo}`, { params, responseType: 'blob' });

      const url = URL.createObjectURL(res.data);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `${config.archivo(sensor)}_${hoyMenos(0)}.${formato}`;
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

  const deshabilitado = Boolean(descargando) || periodoInvalido(periodo);

  return (
    <Dialog open={open} onClose={() => !descargando && onClose()} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {config.titulo(sensor)}
        <IconButton onClick={onClose} size="small" disabled={Boolean(descargando)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {config.descripcion}
        </Typography>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Periodo
        </Typography>
        <SelectorPeriodo valor={periodo} onChange={setPeriodo} />
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
          disabled={deshabilitado}
          onClick={() => descargar('pdf')}
        >
          Descargar PDF
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={descargando === 'xlsx' ? <CircularProgress size={16} color="inherit" /> : <TableViewIcon />}
          disabled={deshabilitado}
          onClick={() => descargar('xlsx')}
        >
          Descargar Excel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReporteDialog;
