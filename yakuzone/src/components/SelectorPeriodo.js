import React from 'react';
import { Chip, Stack, TextField } from '@mui/material';
import { errorPeriodo } from '../utils/validaciones';

// "YYYY-MM-DD" de hoy menos n días, en hora local.
export const hoyMenos = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Periodos ya establecidos, contados hacia atrás desde hoy.
export const PERIODOS = [
  { clave: 'semanal', label: 'Semanal', detalle: 'últimos 7 días', dias: 7 },
  { clave: 'mensual', label: 'Mensual', detalle: 'últimos 30 días', dias: 30 },
  { clave: 'anual', label: 'Anual', detalle: 'últimos 12 meses', dias: 365 },
  { clave: 'todo', label: 'Todo el historial', dias: null },
];

export const periodoPredefinido = (clave) => {
  const { dias } = PERIODOS.find((p) => p.clave === clave);
  return dias ? { desde: hoyMenos(dias), hasta: hoyMenos(0) } : { desde: '', hasta: '' };
};

// Fin anterior al inicio o inicio en el futuro (ver utils/validaciones.js).
export const periodoInvalido = ({ desde, hasta }) => Boolean(errorPeriodo(desde, hasta));

// Elección de periodo: atajos (semanal, mensual, anual o todo) y fechas de
// inicio y fin editables. valor: { desde, hasta } en "YYYY-MM-DD" ('' = sin límite).
const SelectorPeriodo = ({ valor, onChange }) => {
  const activo = PERIODOS.find((p) => {
    const v = periodoPredefinido(p.clave);
    return v.desde === valor.desde && v.hasta === valor.hasta;
  });
  const error = errorPeriodo(valor.desde, valor.hasta);
  const invalido = Boolean(error);
  const hoy = hoyMenos(0);

  return (
    <>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        {PERIODOS.map((p) => {
          const elegido = activo && activo.clave === p.clave;
          return (
            <Chip
              key={p.clave}
              label={p.detalle ? `${p.label} (${p.detalle})` : p.label}
              color={elegido ? 'primary' : 'default'}
              variant={elegido ? 'filled' : 'outlined'}
              onClick={() => onChange(periodoPredefinido(p.clave))}
            />
          );
        })}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Fecha inicio"
          type="date"
          value={valor.desde}
          onChange={(e) => onChange({ ...valor, desde: e.target.value })}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: '2000-01-01', max: hoy }}
          size="small"
          fullWidth
          error={invalido}
          helperText={error && error.includes('futuro') ? error : ''}
        />
        <TextField
          label="Fecha fin"
          type="date"
          value={valor.hasta}
          onChange={(e) => onChange({ ...valor, hasta: e.target.value })}
          InputLabelProps={{ shrink: true }}
          size="small"
          fullWidth
          inputProps={{ min: '2000-01-01' }}
          error={invalido}
          helperText={error && !error.includes('futuro') ? 'La fecha fin debe ser posterior a la de inicio' : ''}
        />
      </Stack>
    </>
  );
};

export default SelectorPeriodo;
