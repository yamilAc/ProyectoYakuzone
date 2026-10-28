import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import { Carousel } from 'react-bootstrap';
import { motion } from 'framer-motion';

const SLIDES = [
  {
    src: require('../images/templito.jpg'),
    alt: 'Parroquia Condebamba',
    titulo: 'Parroquia Condebamba',
    texto: 'Parroquia "Nuestra Señora de la Anunciación", la más significativa de nuestra OTB.',
  },
  {
    src: require('../images/agua1.jpg'),
    alt: 'Calidad de Agua',
    titulo: 'Calidad de Agua',
    texto: 'El agua es un recurso vital: por eso monitoreamos que cumpla los estándares adecuados.',
  },
];

const HomeGaleria = () => {
  return (
    <Box sx={{ py: 8, bgcolor: 'background.paper' }}>
      <Container maxWidth="lg">
        <Typography variant="h4" fontWeight={700} sx={{ textAlign: 'center', mb: 1 }}>
          Conoce Más Sobre Nuestra Cooperativa
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', mb: 5 }}>
          Un vistazo a la comunidad de Condebamba-Chiquicollo.
        </Typography>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
        >
          <Box sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: 4 }}>
            <Carousel indicators controls fade>
              {SLIDES.map((s) => (
                <Carousel.Item key={s.titulo} interval={4500}>
                  <img className="d-block w-100" src={s.src} alt={s.alt} style={{ height: 420, objectFit: 'cover' }} />
                  <Carousel.Caption
                    style={{
                      background: 'linear-gradient(0deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 100%)',
                      borderRadius: 8,
                      paddingTop: 24,
                    }}
                  >
                    <h3>{s.titulo}</h3>
                    <p>{s.texto}</p>
                  </Carousel.Caption>
                </Carousel.Item>
              ))}
            </Carousel>
          </Box>
        </motion.div>
      </Container>
    </Box>
  );
};

export default HomeGaleria;
