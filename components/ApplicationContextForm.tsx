'use client';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import { ContextQuestion } from '@/lib/types';

interface ApplicationContextFormProps {
  questions: ContextQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
}

function QuestionField({
  question,
  value,
  onChange,
  enterValuePlaceholder,
}: {
  question: ContextQuestion;
  value: string;
  onChange: (value: string) => void;
  enterValuePlaceholder: string;
}) {
  const isFreeText = question.allowFreeText;
  // For free-text questions, track whether user is typing a custom value
  const [customText, setCustomText] = useState('');
  const isCustom = isFreeText && value !== '' && !question.options.some(o => o.value === value);

  return (
    <Box>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, fontSize: '0.82rem', mb: 0.5 }}
      >
        {question.questionText}
      </Typography>

      <RadioGroup
        value={isCustom ? '__custom__' : value}
        onChange={(e) => {
          if (e.target.value === '__custom__') {
            onChange(customText || '');
          } else {
            onChange(e.target.value);
            setCustomText('');
          }
        }}
      >
        {question.options.map((option) => (
          <FormControlLabel
            key={option.value}
            value={option.value}
            control={<Radio size="small" sx={{ py: 0.25, px: 0.5 }} />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontSize: '0.82rem', lineHeight: 1.3 }}>
                  {option.label}
                </Typography>
                {option.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', lineHeight: 1.2 }}>
                    {option.description}
                  </Typography>
                )}
              </Box>
            }
            sx={{ alignItems: 'flex-start', ml: 0, mr: 0, mb: 0.25 }}
          />
        ))}

        {isFreeText && (
          <FormControlLabel
            value="__custom__"
            control={<Radio size="small" sx={{ py: 0.25, px: 0.5 }} />}
            label={
              <TextField
                size="small"
                placeholder={question.freeTextPlaceholder ?? enterValuePlaceholder}
                value={customText}
                onChange={(e) => {
                  setCustomText(e.target.value);
                  onChange(e.target.value);
                }}
                onFocus={() => {
                  if (value === '' || question.options.some(o => o.value === value)) {
                    onChange(customText || '');
                  }
                }}
                sx={{
                  ml: 0,
                  minWidth: { xs: 140, sm: 200 },
                  '& .MuiInputBase-input': { fontSize: '0.82rem', py: 0.75 },
                }}
              />
            }
            sx={{ alignItems: 'center', ml: 0, mr: 0, mb: 0.25 }}
          />
        )}
      </RadioGroup>
    </Box>
  );
}

export default function ApplicationContextForm({
  questions,
  onSubmit,
  onSkip,
}: ApplicationContextFormProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Filter questions based on conditions — only show questions whose conditions are met
  const visibleQuestions = useMemo(() => {
    const sorted = [...questions].sort((a, b) => a.priority - b.priority);
    return sorted.filter((q) => {
      if (!q.condition) return true;
      const depAnswer = answers[q.condition.questionId];
      return depAnswer !== undefined && q.condition.values.includes(depAnswer);
    });
  }, [questions, answers]);

  const handleChange = (questionId: string, value: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      // Clear answers for questions whose conditions are no longer met
      for (const q of questions) {
        if (q.condition && q.condition.questionId === questionId) {
          if (!q.condition.values.includes(value)) {
            delete next[q.questionId];
          }
        }
      }
      return next;
    });
  };

  return (
    <Box sx={{
      mt: 1.5,
      maxWidth: { xs: '100%', sm: 520 },
      border: 1,
      borderColor: 'divider',
      borderRadius: 2,
      bgcolor: 'background.default',
      p: 2,
    }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.82rem' }}>
        {t('chat.tellAboutApplication')}
      </Typography>

      <Stack spacing={2}>
        {visibleQuestions.map((question) => (
          <QuestionField
            key={question.questionId}
            question={question}
            value={answers[question.questionId] ?? ''}
            onChange={(v) => handleChange(question.questionId, v)}
            enterValuePlaceholder={t('chat.enterValue')}
          />
        ))}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<CheckIcon />}
          onClick={() => onSubmit(answers)}
        >
          {t('chat.continue')}
        </Button>
        <Button
          size="small"
          startIcon={<SkipNextIcon />}
          onClick={onSkip}
          color="inherit"
          sx={{ opacity: 0.7 }}
        >
          {t('chat.skipUseDefaults')}
        </Button>
      </Stack>
    </Box>
  );
}
