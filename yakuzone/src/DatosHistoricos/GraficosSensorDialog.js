import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import axios from '../axios/axiosConfig';
import GraficoParametro, { PARAMETROS_GRAFICO, conUnidad, textoRango } from '../components/GraficoParametro';
import SelectorPeriodo, { hoyMenos, periodoInvalido, periodoPredefinido } from '../components/SelectorPeriodo';

const UN_DIA_MS = 24 * 3600 * 1000;

// Con periodos de más de un día, el eje X muestra fecha y hora.
const formatoFechaCorta = (fecha) =>
  fecha.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const textoPeriodo = ({ desde, hasta }) => {
  const dia = (texto) => texto.split('-').reverse().join('/');
  if (desde && hasta) return `Del ${dia(desde)} al ${dia(hasta)}`;
  if (desde) return `Desde el ${dia(desde)}`;
  if (hasta) return `Hasta el ${dia(hasta)}`;
  return 'Todo el historial registrado';
};

// Mínimo / promedio / máximo y lecturas fuera de rango de un parámetro.
const resumenEstadistica = (config, est, total) => {
  if (!est || est.prom === null) return 'Sin lecturas en el periodo';
  const partes = [`Mín. ${conUnidad(est.min, config.unidad)}`, `Prom. ${conUnidad(est.prom, config.unidad)}`, `Máx. ${conUnidad(est.max, config.unidad)}`];
  if (est.fuera !== null && total) partes.push(`Fuera de rango: ${est.fuera} (${((est.fuera / total) * 100).toFixed(1)} %)`);
  return partes.join(' · ');
};

// PDF con lo que muestra la ventana: encabezado, estadísticas y los 4 gráficos.
async function generarPdf({ sensor, periodo, serie, graficos }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 15;
  const util = ancho - margen * 2;

  doc.setFillColor(11, 94, 119);
  doc.rect(0, 0, ancho, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Yakuzone', margen, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Monitoreo de la calidad del agua - OTB Urbanización Hallein, Chiquicollo - Cochabamba', margen, 17);

  let y = 32;
  doc.setTextColor(38, 50, 56);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`Lecturas del sensor ${sensor.n_serie}`, margen, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(96, 125, 139);
  y += 6;
  doc.text(`${sensor.ubicacion || 'Sin ubicación registrada'}${sensor.propietario_nombre ? ` - Propietario: ${sensor.propietario_nombre}` : ''}`, margen, y);
  y += 5;
  doc.text(`Periodo: ${textoPeriodo(periodo)} - ${serie.total} lecturas - Generado el ${new Date().toLocaleString()}`, margen, y);
  if (serie.agrupado) {
    y += 5;
    doc.text('Para que el gráfico se pueda leer, cada punto es el promedio de un tramo de lecturas.', margen, y);
  }

  // Tabla de estadísticas
  y += 8;
  const columnas = [
    { titulo: 'Parámetro', ancho: 34 },
    { titulo: 'Mínimo', ancho: 26 },
    { titulo: 'Promedio', ancho: 26 },
    { titulo: 'Máximo', ancho: 26 },
    { titulo: 'Rango aceptable', ancho: 34 },
    { titulo: 'Fuera de rango', ancho: util - 146 },
  ];
  doc.setFillColor(14, 124, 155);
  doc.rect(margen, y - 4.5, util, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  let x = margen + 2;
  columnas.forEach((c) => {
    doc.text(c.titulo, x, y);
    x += c.ancho;
  });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(38, 50, 56);
  PARAMETROS_GRAFICO.forEach((config, i) => {
    y += 7;
    if (i % 2 === 1) {
      doc.setFillColor(242, 247, 249);
      doc.rect(margen, y - 4.5, util, 7, 'F');
    }
    const est = serie.estadisticas[config.key] || {};
    const fuera = est.fuera === null || est.fuera === undefined ? '-' : `${est.fuera} (${serie.total ? ((est.fuera / serie.total) * 100).toFixed(1) : 0} %)`;
    const celdas = [
      config.unidad ? `${config.label} (${config.unidad})` : config.label,
      conUnidad(est.min, ''),
      conUnidad(est.prom, ''),
      conUnidad(est.max, ''),
      config.umbral ? textoRango(config).replace('–', '-') : 'Sin límite normado',
      fuera,
    ];
    x = margen + 2;
    celdas.forEach((texto, j) => {
      doc.text(String(texto).replace('—', '-'), x, y);
      x += columnas[j].ancho;
    });
  });

  // Gráficos, uno debajo de otro (dos por página)
  y += 10;
  PARAMETROS_GRAFICO.forEach((config) => {
    const grafico = graficos[config.key];
    if (!grafico) return;
    const imagen = grafico.toBase64Image('image/png', 1);
    const altoImagen = Math.min(95, util * (grafico.height / grafico.width));
    if (y + altoImagen + 8 > alto - 15) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(14, 124, 155);
    doc.text(config.label, margen, y);
    y += 3;
    doc.addImage(imagen, 'PNG', margen, y, util, altoImagen);
    y += altoImagen + 8;
  });

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(96, 125, 139);
    doc.text('Yakuzone - Reporte generado automáticamente por la plataforma', margen, alto - 8);
    doc.text(`Página ${i} de ${paginas}`, ancho - margen, alto - 8, { align: 'right' });
  }
  doc.save(`graficos_${sensor.n_serie}_${hoyMenos(0)}.pdf`);
}

// Ventana de "Verificar" en Datos Históricos: los 4 parámetros del sensor,
// cada uno en su propio gráfico con leyenda, para el periodo elegido, y la
// opción de descargarlos en PDF.
const GraficosSensorDialog = ({ sensor, onClose }) => {
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down('md'));
  const [periodo, setPeriodo] = useState(periodoPredefinido('semanal'));
  const [serie, setSerie] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [generando, setGenerando] = useState(false);
  const graficos = useRef({});

  useEffect(() => {
    if (sensor) {
      setSerie(null);
      setPeriodo(periodoPredefinido('semanal'));
    }
  }, [sensor]);

  useEffect(() => {
    if (!sensor || periodoInvalido(periodo)) return undefined;
    let activo = true;
    setCargando(true);
    setError(null);
    axios
      .get(`/lecturas/${sensor.id}/serie`, { params: { desde: periodo.desde || undefined, hasta: periodo.hasta || undefined } })
      .then((res) => activo && setSerie(res.data))
      .catch((err) => activo && setError(err.response?.data?.error || 'No se pudieron cargar las lecturas del sensor.'))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [sensor, periodo]);

  const handlePdf = async () => {
    setGenerando(true);
    try {
      await generarPdf({ sensor, periodo, serie, graficos: graficos.current });
    } catch (err) {
      console.error('Error al generar el PDF:', err);
      setError('No se pudo generar el PDF.');
    } finally {
      setGenerando(false);
    }
  };

  const puntos = serie ? serie.puntos : [];
  const variosDias = serie && serie.inicio && serie.fin && new Date(serie.fin) - new Date(serie.inicio) > UN_DIA_MS;

  return (
    <Dialog open={Boolean(sensor)} onClose={onClose} fullWidth maxWidth="lg" fullScreen={pantallaChica} scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700} noWrap>
            Gráficos del sensor {sensor?.n_serie}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {sensor?.ubicacion || 'Sin ubicación registrada'}
            {sensor?.propietario_nombre && ` · Propietario: ${sensor.propietario_nombre}`}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ bgcolor: 'background.default' }}>
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <SelectorPeriodo valor={periodo} onChange={setPeriodo} />
          {serie && !cargando && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              {serie.total === 0
                ? 'No hay lecturas de este sensor en el periodo elegido.'
                : `${serie.total} lecturas · ${textoPeriodo(periodo)}${serie.agrupado ? ' · cada punto es el promedio de un tramo de lecturas' : ''}`}
            </Typography>
          )}
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {cargando && !serie ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
            <CircularProgress />
          </Box>
        ) : (
          serie && (
            <Grid container spacing={2} sx={{ opacity: cargando ? 0.5 : 1, transition: 'opacity 0.2s' }}>
              {PARAMETROS_GRAFICO.map((config) => {
                const Icon = config.icon;
                return (
                  <Grid item xs={12} md={6} key={config.key}>
                    <Paper elevation={1} sx={{ p: 2, height: '100%' }}>
                      <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 0.5 }}>
                        <Box sx={{ bgcolor: `${config.color}22`, color: config.color, borderRadius: '50%', p: 0.8, display: 'flex' }}>
                          <Icon fontSize="small" />
                        </Box>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {config.label}
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {config.umbral ? `Rango aceptable (NB 512-04): ${textoRango(config)}` : 'Sin límite normado (dato de referencia)'}
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                        {resumenEstadistica(config, serie.estadisticas[config.key], serie.total)}
                      </Typography>
                      <GraficoParametro
                        config={config}
                        lecturas={puntos}
                        alto={250}
                        promedio={serie.agrupado}
                        formatoTiempo={variosDias ? formatoFechaCorta : undefined}
                        altaResolucion
                        refGrafico={(grafico) => {
                          graficos.current[config.key] = grafico;
                        }}
                      />
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          )
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onClose}>
          Volver a Datos Históricos
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={generando ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />}
          disabled={!serie || serie.total === 0 || cargando || generando}
          onClick={handlePdf}
        >
          Generar PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GraficosSensorDialog;
