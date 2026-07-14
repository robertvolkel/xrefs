'use client';
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'data-mui-color-scheme',
  },
  colorSchemes: {
    light: {
      palette: {
        mode: 'light',
        primary: {
          main: '#1565C0',
          contrastText: '#FFFFFF',
        },
        secondary: {
          main: '#E65100',
          contrastText: '#FFFFFF',
        },
        background: {
          default: '#F5F5F5',
          paper: '#FFFFFF',
        },
        success: {
          main: '#2E7D32',
        },
        warning: {
          main: '#ED6C02',
        },
        error: {
          main: '#D32F2F',
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#616161',
        },
      },
    },
    dark: {
      palette: {
        mode: 'dark',
        primary: {
          main: '#A0C4FF',
          contrastText: '#003060',
        },
        secondary: {
          main: '#FFD6A5',
          contrastText: '#3E2723',
        },
        background: {
          default: '#121212',
          paper: '#1E1E1E',
        },
        success: {
          main: '#69F0AE',
        },
        warning: {
          main: '#FFD54F',
        },
        error: {
          main: '#FF5252',
        },
        text: {
          primary: '#E0E0E0',
          secondary: '#A0A0A0',
        },
      },
    },
  },
  defaultColorScheme: 'light',
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h5: { fontWeight: 600 },
    body2: { fontSize: '0.85rem' },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 20,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
  },
});

export default theme;
