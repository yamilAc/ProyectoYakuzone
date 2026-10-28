import { createTheme } from '@mui/material/styles';

// Paleta unificada de Yakuzone: azules de "agua" consistentes con el logo y
// con las capturas del perfil de proyecto. Un solo lugar de verdad para
// colores/tipografía en vez de mezclar estilos sueltos de Bootstrap/Tailwind
// por cada componente.
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0E7C9B',
      light: '#00AFEF',
      dark: '#0B5E77',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#1CB5E0',
    },
    background: {
      default: '#EAF3F6',
      paper: '#ffffff',
    },
    success: { main: '#2E7D32' },
    warning: { main: '#ED6C02' },
    error: { main: '#D32F2F' },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(90deg, #0B5E77 0%, #0E7C9B 60%, #1CB5E0 100%)',
        },
      },
    },
  },
});

export default theme;
