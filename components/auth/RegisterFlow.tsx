'use client';

import { useState } from 'react';
import { Box, Paper, Stepper, Step, StepLabel, Typography, Link as MuiLink } from '@mui/material';
import { useRouter } from 'next/navigation';
import { updateUserPreferences } from '@/lib/api';
import RegisterForm from './RegisterForm';
import OnboardingAgent from './OnboardingAgent';

const STEPS = ['Create Account', 'Set Up Profile'];

/**
 * Two-step registration wizard inside a unified container.
 * Step 1: Account creation (RegisterForm)
 * Step 2: Conversational onboarding (OnboardingAgent)
 */
export default function RegisterFlow() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [firstName, setFirstName] = useState('');

  const skipToApp = async () => {
    try {
      await updateUserPreferences({ onboardingComplete: true });
    } catch {
      // Best-effort
    }
    router.push('/');
    router.refresh();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
        py: 4,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 560,
          height: 620,
          border: 1,
          borderColor: 'divider',
          borderRadius: 3,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header: stepper + skip link */}
        <Box
          sx={{
            px: 3,
            pt: 2.5,
            pb: 2,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
          }}
        >
          <Stepper activeStep={step} sx={{ flex: 1 }}>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>
                  <Typography variant="caption" fontWeight={500}>
                    {label}
                  </Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>

          {step === 1 && (
            <MuiLink
              component="button"
              onClick={skipToApp}
              sx={{
                fontSize: '0.78rem',
                color: 'text.secondary',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                '&:hover': { color: 'text.primary' },
              }}
            >
              Skip &rarr;
            </MuiLink>
          )}
        </Box>

        {/* Content */}
        {step === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              px: 3,
              py: 3,
              overflow: 'auto',
            }}
          >
            <RegisterForm
              onSuccess={(name) => {
                setFirstName(name);
                setStep(1);
              }}
            />
          </Box>
        ) : (
          <OnboardingAgent firstName={firstName} embedded />
        )}
      </Paper>
    </Box>
  );
}
