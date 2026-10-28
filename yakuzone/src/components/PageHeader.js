import React from 'react';
import { Box, Container, Typography, Stack } from '@mui/material';
import { motion } from 'framer-motion';

// Encabezado de marca reutilizable para las páginas internas: mismo
// degradado que el hero de Inicio, el sidebar y el login, para que ninguna
// sección se sienta "en blanco" y suelta del resto del sistema.
const PageHeader = ({ icon: Icon, title, subtitle, action }) => (
  <Box
    component={motion.div}
    initial={{ opacity: 0, y: -16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
    sx={{
      background: 'linear-gradient(135deg, #0B5E77 0%, #0E7C9B 55%, #1CB5E0 100%)',
      color: '#fff',
      py: { xs: 3.5, md: 4.5 },
      mb: 4,
    }}
  >
    <Container maxWidth="lg">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          {Icon && (
            <Box
              sx={{
                bgcolor: 'rgba(255,255,255,0.15)',
                borderRadius: '50%',
                p: 1.3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon />
            </Box>
          )}
          <Box>
            <Typography variant="h4" fontWeight={700}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.3 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>
        {action}
      </Stack>
    </Container>
  </Box>
);

export default PageHeader;
