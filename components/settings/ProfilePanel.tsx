'use client';

import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function ProfilePanel() {
  const { t } = useTranslation();

  return (
    <Box sx={{ px: 3, pt: '16px', pb: 4 }}>
      <Typography variant="body2" color="text.secondary">
        {t('common.comingSoon')}
      </Typography>
    </Box>
  );
}
