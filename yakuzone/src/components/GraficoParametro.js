import React from 'react';
import { Typography } from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import OpacityIcon from '@mui/icons-material/Opacity';
import ScienceIcon from '@mui/icons-material/Science';
import BoltIcon from '@mui/icons-material/Bolt';
import { UMBRALES } from '../utils/estadoSensor';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const ROJO = '#D32F2F';

// Los 4 parámetros que mide cada sensor, con el mismo umbral que usa el
// backend (NB 512-04). La temperatura no tiene límite normado.
export const PARAMETROS_GRAFICO = [
  { key: 'valor_temperatura', label: 'Temperatura', unidad: '°C', color: '#0E7C9B', icon: ThermostatIcon, umbral: null },
  { key: 'valor_turbidez', label: 'Turbidez', unidad: 'NTU', color: '#9C27B0', icon: OpacityIcon, umbral: UMBRALES.valor_turbidez },
  { key: 'valor_ph', label: 'pH', unidad: '', color: '#ED6C02', icon: ScienceIcon, umbral: UMBRALES.valor_ph },
  { key: 'valor_conductividad', label: 'Conductividad', unidad: 'µS/cm', color: '#009688', icon: BoltIcon, umbral: UMBRALES.valor_conductividad },
];

export const conUnidad = (valor, unidad, decimales = 2) =>
  valor === null || valor === undefined || Number.isNaN(Number(valor)) ? '—' : `${Number(valor).toFixed(decimales)}${unidad ? ` ${unidad}` : ''}`;

export const fueraDeRango = (valor, umbral) =>
  Boolean(umbral) && valor !== null && valor !== undefined && (Number(valor) < umbral.min || Number(valor) > umbral.max);

// Texto del rango aceptable: "6.5 – 9", "hasta 5 NTU".
export const textoRango = ({ umbral, unidad }) => {
  if (!umbral) return 'Sin límite normado';
  const sufijo = unidad ? ` ${unidad}` : '';
  return umbral.min > 0 ? `${umbral.min} – ${umbral.max}${sufijo}` : `hasta ${umbral.max}${sufijo}`;
};

// Gráfica de un parámetro en el tiempo, pensada para que se entienda sola:
// leyenda abajo, título en cada eje con su unidad, líneas rojas punteadas con
// los límites de la NB 512-04 y las lecturas fuera de rango marcadas con un
// punto rojo.
// Opcionales: refGrafico (recibe la instancia de Chart.js, p. ej. para
// exportarlo a PDF), formatoTiempo (texto del eje X a partir de la fecha),
// promedio (cada punto es el promedio de un tramo de lecturas) y
// altaResolucion (dibuja con más píxeles, para que se vea nítido en un PDF).
const horaLocal = (fecha) => fecha.toLocaleTimeString();

const GraficoParametro = ({ config, lecturas, alto = 220, refGrafico, formatoTiempo = horaLocal, promedio = false, altaResolucion = false }) => {
  const { key, label, unidad, color, umbral } = config;
  const etiquetaEje = unidad ? `${label} (${unidad})` : label;
  const valores = lecturas.map((l) => (l[key] === null || l[key] === undefined ? null : Number(l[key])));
  const fuera = valores.map((v) => fueraDeRango(v, umbral));
  const etiquetas = lecturas.map((l) => formatoTiempo(new Date(l.fecha_hora)));

  const lineaLimite = (texto, valor) => ({
    label: texto,
    data: etiquetas.map(() => valor),
    borderColor: ROJO,
    borderDash: [6, 4],
    borderWidth: 1.5,
    pointRadius: 0,
    pointHoverRadius: 0,
    fill: false,
  });

  const datasets = [
    {
      label: `${label} ${promedio ? 'promedio' : 'medido'}${unidad ? ` (${unidad})` : ''}`,
      data: valores,
      borderColor: color,
      backgroundColor: `${color}22`,
      fill: true,
      tension: 0.35,
      borderWidth: 2,
      pointRadius: fuera.map((f) => (f ? 3.5 : 0)),
      pointHoverRadius: 5,
      pointBackgroundColor: fuera.map((f) => (f ? ROJO : color)),
      pointBorderColor: fuera.map((f) => (f ? ROJO : color)),
    },
  ];
  if (umbral) {
    datasets.push(lineaLimite(`Límite máximo NB 512-04 (${umbral.max}${unidad ? ` ${unidad}` : ''})`, umbral.max));
    if (umbral.min > 0) datasets.push(lineaLimite(`Límite mínimo NB 512-04 (${umbral.min})`, umbral.min));
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    devicePixelRatio: altaResolucion ? Math.max(window.devicePixelRatio || 1, 2) : undefined,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 28, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            if (ctx.datasetIndex > 0) return ctx.dataset.label;
            const estado = umbral ? (fuera[ctx.dataIndex] ? ' — fuera de rango' : ' — dentro del rango') : '';
            return `${label}: ${conUnidad(ctx.parsed.y, unidad)}${estado}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: formatoTiempo === horaLocal ? 'Hora de la lectura' : 'Fecha y hora', color: '#78909C', font: { size: 11 } },
        ticks: { color: '#888', maxTicksLimit: 6 },
        grid: { display: false },
      },
      y: {
        title: { display: true, text: etiquetaEje, color: '#78909C', font: { size: 11 } },
        ticks: { color: '#888' },
        grid: { color: '#eef2f4' },
      },
    },
  };

  if (lecturas.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        Todavía no hay lecturas para graficar.
      </Typography>
    );
  }
  return (
    <div style={{ height: alto }}>
      <Line ref={refGrafico} data={{ labels: etiquetas, datasets }} options={options} />
    </div>
  );
};

export default GraficoParametro;
