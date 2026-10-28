import React from 'react';
import { Box } from '@mui/material';
import HomeHero from './HomeHero';
import HomeStats from './HomeStats';
import HomeComoFunciona from './HomeComoFunciona';
import HomeParametros from './HomeParametros';
import HomeGaleria from './HomeGaleria';
import HomeBeneficios from './HomeBeneficios';
import HomeFooterCTA from './HomeFooterCTA';

const Home = () => {
  return (
    <Box>
      <HomeHero />
      <HomeStats />
      <HomeComoFunciona />
      <HomeParametros />
      <HomeGaleria />
      <HomeBeneficios />
      <HomeFooterCTA />
    </Box>
  );
};

export default Home;
