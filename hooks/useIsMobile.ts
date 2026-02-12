'use client';
import { useMediaQuery, useTheme } from '@mui/material';

export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm')); // < 600px
}

export function useIsTablet(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600–899px
}

export function useIsDesktop(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.up('md')); // >= 900px
}
