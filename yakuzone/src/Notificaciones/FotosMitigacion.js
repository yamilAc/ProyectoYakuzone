import React, { useEffect, useMemo, useState } from 'react';
import { Box, ButtonBase, CircularProgress, Dialog, Grid, IconButton, Typography } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import HomeIcon from '@mui/icons-material/Home';
import HandymanIcon from '@mui/icons-material/Handyman';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import CloseIcon from '@mui/icons-material/Close';
import axios from '../axios/axiosConfig';

// Las 3 fotos de evidencia del informe de una visita (mismos nombres que
// espera el backend).
export const TIPOS_FOTO = [
  { tipo: 'equipo', label: 'El equipo', descripcion: 'El equipo en el lugar', icon: GroupsIcon },
  { tipo: 'casa', label: 'La casa', descripcion: 'La vivienda atendida', icon: HomeIcon },
  { tipo: 'trabajo', label: 'El trabajo realizado', descripcion: 'Resultado de la mitigación', icon: HandymanIcon },
];

const MiniFoto = ({ url, etiqueta, onClick, alto }) => (
  <ButtonBase onClick={onClick} sx={{ width: '100%', borderRadius: 2, overflow: 'hidden', display: 'block', position: 'relative' }}>
    <Box component="img" src={url} alt={etiqueta} sx={{ width: '100%', height: alto, objectFit: 'cover', display: 'block' }} />
    <Typography
      variant="caption"
      sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, px: 1, py: 0.3, color: '#fff', bgcolor: 'rgba(0,0,0,0.55)', textAlign: 'left' }}
    >
      {etiqueta}
    </Typography>
  </ButtonBase>
);

// Selector de las 3 fotos, con vista previa. fotos: { equipo, casa, trabajo }
// (File o null); opcionales: tipos que se pueden dejar sin foto.
export const SelectorFotos = ({ fotos, onChange, disabled, opcionales = [] }) => {
  const previas = useMemo(
    () => Object.fromEntries(TIPOS_FOTO.map(({ tipo }) => [tipo, fotos[tipo] ? URL.createObjectURL(fotos[tipo]) : null])),
    [fotos]
  );
  useEffect(() => () => Object.values(previas).forEach((url) => url && URL.revokeObjectURL(url)), [previas]);

  return (
    <Grid container spacing={1.2}>
      {TIPOS_FOTO.map(({ tipo, label, descripcion, icon: Icon }) => (
        <Grid item xs={12} sm={4} key={tipo}>
          <Box
            component="label"
            sx={{
              display: 'block',
              cursor: disabled ? 'default' : 'pointer',
              borderRadius: 2,
              border: '1.5px dashed',
              borderColor: fotos[tipo] ? 'success.main' : 'divider',
              overflow: 'hidden',
              position: 'relative',
              height: 120,
              '&:hover': disabled ? {} : { borderColor: 'primary.main' },
            }}
          >
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={disabled}
              onChange={(e) => {
                const archivo = e.target.files && e.target.files[0];
                if (archivo) onChange({ ...fotos, [tipo]: archivo });
                e.target.value = '';
              }}
            />
            {previas[tipo] ? (
              <>
                <Box component="img" src={previas[tipo]} alt={label} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <Typography
                  variant="caption"
                  sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, px: 1, py: 0.3, color: '#fff', bgcolor: 'rgba(0,0,0,0.55)' }}
                >
                  {label} · toca para cambiar
                </Typography>
              </>
            ) : (
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 1, textAlign: 'center' }}>
                <Box sx={{ display: 'flex', gap: 0.5, color: 'text.secondary', mb: 0.5 }}>
                  <Icon fontSize="small" />
                  <AddAPhotoIcon fontSize="small" />
                </Box>
                <Typography variant="body2" fontWeight={600}>
                  {label}
                  {opcionales.includes(tipo) && ' (opcional)'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {descripcion}
                </Typography>
              </Box>
            )}
          </Box>
        </Grid>
      ))}
    </Grid>
  );
};

// Fotos de evidencia del informe de una visita. Se descargan con la sesión
// iniciada (no son públicas), por eso se piden con axios y no con un <img src>.
// alertaId + informeId identifican el informe; alto: altura de cada miniatura.
export const FotosEvidencia = ({ alertaId, informeId, tipos, alto = 110 }) => {
  const clave = tipos.join(',');
  const [urls, setUrls] = useState(null);
  const [ampliada, setAmpliada] = useState(null);

  useEffect(() => {
    let activo = true;
    const creadas = [];
    Promise.all(
      clave.split(',').filter(Boolean).map((tipo) =>
        axios
          .get(`/alertas/${alertaId}/informes/${informeId}/fotos/${tipo}`, { responseType: 'blob' })
          .then((res) => {
            const url = URL.createObjectURL(res.data);
            if (activo) creadas.push(url);
            else URL.revokeObjectURL(url);
            return [tipo, url];
          })
          .catch(() => [tipo, null])
      )
    ).then((pares) => {
      if (activo) setUrls(Object.fromEntries(pares));
    });
    return () => {
      activo = false;
      creadas.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [alertaId, informeId, clave]);

  if (!urls) {
    return <CircularProgress size={20} />;
  }
  return (
    <>
      <Grid container spacing={1.2}>
        {TIPOS_FOTO.filter(({ tipo }) => tipos.includes(tipo)).map(({ tipo, label }) => (
          <Grid item xs={4} key={tipo}>
            {urls[tipo] ? (
              <MiniFoto url={urls[tipo]} etiqueta={label} alto={alto} onClick={() => setAmpliada({ url: urls[tipo], label })} />
            ) : (
              <Typography variant="caption" color="text.secondary">
                No se pudo cargar: {label}
              </Typography>
            )}
          </Grid>
        ))}
      </Grid>
      <Dialog open={Boolean(ampliada)} onClose={() => setAmpliada(null)} maxWidth="md">
        {ampliada && (
          <Box sx={{ position: 'relative' }}>
            <IconButton onClick={() => setAmpliada(null)} sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.5)', color: '#fff' }}>
              <CloseIcon />
            </IconButton>
            <Box component="img" src={ampliada.url} alt={ampliada.label} sx={{ display: 'block', maxWidth: '100%', maxHeight: '80vh' }} />
            <Typography variant="body2" sx={{ p: 1.5 }}>
              {ampliada.label}
            </Typography>
          </Box>
        )}
      </Dialog>
    </>
  );
};
