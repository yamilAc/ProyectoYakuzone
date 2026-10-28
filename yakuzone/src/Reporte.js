import React, { useState } from 'react';
import { Container, Typography, TextField, Button, Paper, Box, Chip, Stack } from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PageHeader from './components/PageHeader';

const Reporte = () => {
  const [descripcion, setDescripcion] = useState('');

  const handleEnviarReporte = () => {
    // TODO: conectar con el backend (endpoint de reportes) cuando esté definido.
    console.log('Descripción del problema:', descripcion);
    alert('Reporte enviado con éxito');
    setDescripcion('');
  };

  return (
    <>
      <PageHeader icon={AssignmentIcon} title="Reporte de Sensores" subtitle="Reporta una incidencia sobre un sensor específico" />
      <Container maxWidth="sm" sx={{ pb: 4 }}>
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            SN1: Juan Pérez
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Dirección: Av. Chaco #234
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
            <Chip label="Temperatura: Normal" color="success" size="small" />
            <Chip label="pH: Crítico" color="error" size="small" />
            <Chip label="Turbidez: Crítico" color="error" size="small" />
          </Stack>
        </Paper>

        <Box component="form" onSubmit={(e) => { e.preventDefault(); handleEnviarReporte(); }}>
          <TextField
            label="Descripción del Problema"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            multiline
            rows={4}
            fullWidth
            margin="normal"
            required
          />
          <Button type="submit" variant="contained" size="large">
            Enviar Reporte
          </Button>
        </Box>
      </Container>
    </>
  );
};

export default Reporte;
