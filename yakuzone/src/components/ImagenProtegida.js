import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import axios from '../axios/axiosConfig';

// Imagen servida por la API con la sesión iniciada (una figura del
// entrenamiento de los modelos, por ejemplo): se descarga con axios, que
// agrega el token, y se muestra desde una URL local del navegador.
const ImagenProtegida = ({ ruta, alt, maxHeight = 360 }) => {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let activo = true;
    let creada = null;
    setUrl(null);
    setError(false);
    axios
      .get(ruta, { responseType: 'blob' })
      .then((res) => {
        creada = URL.createObjectURL(res.data);
        if (activo) setUrl(creada);
        else URL.revokeObjectURL(creada);
      })
      .catch(() => activo && setError(true));
    return () => {
      activo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [ruta]);

  if (error) {
    return (
      <Typography variant="caption" color="text.secondary">
        Figura no disponible.
      </Typography>
    );
  }
  if (!url) {
    return (
      <Box display="flex" justifyContent="center" py={3}>
        <CircularProgress size={22} />
      </Box>
    );
  }
  return <Box component="img" src={url} alt={alt} sx={{ maxWidth: '100%', maxHeight, display: 'block', mx: 'auto' }} />;
};

export default ImagenProtegida;
