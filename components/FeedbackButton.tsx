'use client';

import { useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { useTranslation } from 'react-i18next';
import FeedbackDialog, { FeedbackDialogProps } from './FeedbackDialog';

type FeedbackButtonProps = Omit<FeedbackDialogProps, 'open' | 'onClose'> & {
  size?: 'small' | 'medium';
  sx?: Record<string, unknown>;
};

export default function FeedbackButton({ size = 'small', sx, ...dialogProps }: FeedbackButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip title={t('feedback.tooltip')} placement="top">
        <IconButton
          size={size}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          sx={{
            opacity: 0.5,
            '&:hover': { opacity: 1 },
            transition: 'opacity 0.15s ease',
            ...sx,
          }}
        >
          <FlagOutlinedIcon fontSize={size === 'small' ? 'small' : 'medium'} />
        </IconButton>
      </Tooltip>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} {...dialogProps} />
    </>
  );
}
