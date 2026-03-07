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
import FeedbackButton from './FeedbackButton';

interface ApplicationContextFormProps {
  questions: ContextQuestion[];
  familyId?: string;
  initialAnswers?: Record<string, string>;
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
  sourceMpn?: string;
  sourceManufacturer?: string;
}

function QuestionField({
  question,
  familyId,
  value,
  onChange,
  enterValuePlaceholder,
  sourceMpn,
  sourceManufacturer,
}: {
  question: ContextQuestion;
  familyId?: string;
  value: string;
  onChange: (value: string) => void;
  enterValuePlaceholder: string;
  sourceMpn?: string;
  sourceManufacturer?: string;
}) {
  const { t } = useTranslation();
  const isFreeText = question.allowFreeText;
  // For free-text questions, track whether user is typing a custom value
  const [customText, setCustomText] = useState('');
  const isCustom = isFreeText && value !== '' && !question.options.some(o => o.value === value);

  // Translation key prefix for this question (falls back to hardcoded English)
  const qKey = familyId ? `contextQ.${familyId}.${question.questionId}` : '';

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, fontSize: '0.82rem', mb: 0.5 }}
        >
          {familyId ? t(`${qKey}.text`, question.questionText) : question.questionText}
          {question.required && (
            <Typography
              component="span"
              variant="caption"
              sx={{ ml: 1, color: 'warning.main', fontWeight: 700, fontSize: '0.7rem' }}
            >
              {t('common.required', 'Required')}
            </Typography>
          )}
        </Typography>
        {sourceMpn && (
          <FeedbackButton
            feedbackStage="qualifying_questions"
            sourceMpn={sourceMpn}
            sourceManufacturer={sourceManufacturer}
            questionId={question.questionId}
            questionText={question.questionText}
            sx={{ p: 0.25, mb: 0.5 }}
          />
        )}
      </Stack>

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
        {question.options.map((option) => {
          const optLabel = familyId ? t(`${qKey}.opt.${option.value}.label`, option.label) : option.label;
          const optDesc = option.description
            ? (familyId ? t(`${qKey}.opt.${option.value}.desc`, option.description) : option.description)
            : undefined;
          return (
            <FormControlLabel
              key={option.value}
              value={option.value}
              control={<Radio size="small" sx={{ py: 0.25, px: 0.5 }} />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontSize: '0.82rem', lineHeight: 1.3 }}>
                    {optLabel}
                  </Typography>
                  {optDesc && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', lineHeight: 1.2 }}>
                      {optDesc}
                    </Typography>
                  )}
                </Box>
              }
              sx={{ alignItems: 'flex-start', ml: 0, mr: 0, mb: 0.25 }}
            />
          );
        })}

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
  familyId,
  initialAnswers,
  onSubmit,
  onSkip,
  sourceMpn,
  sourceManufacturer,
}: ApplicationContextFormProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers ?? {});

  // IDs of questions that were auto-answered — these are hidden from the user
  const autoAnsweredIds = useMemo(() => new Set(Object.keys(initialAnswers ?? {})), [initialAnswers]);

  // Filter questions based on conditions — only show questions whose conditions are met
  // Also exclude auto-answered disambiguation questions
  const visibleQuestions = useMemo(() => {
    const sorted = [...questions].sort((a, b) => a.priority - b.priority);
    return sorted.filter((q) => {
      // Hide auto-answered questions
      if (autoAnsweredIds.has(q.questionId)) return false;
      if (!q.condition) return true;
      const depAnswer = answers[q.condition.questionId];
      return depAnswer !== undefined && q.condition.values.includes(depAnswer);
    });
  }, [questions, answers, autoAnsweredIds]);

  // Check if any visible required questions are unanswered
  const hasUnansweredRequired = useMemo(() => {
    return visibleQuestions.some(
      (q) => q.required && (!answers[q.questionId] || answers[q.questionId].trim() === '')
    );
  }, [visibleQuestions, answers]);

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
            familyId={familyId}
            value={answers[question.questionId] ?? ''}
            onChange={(v) => handleChange(question.questionId, v)}
            enterValuePlaceholder={t('chat.enterValue')}
            sourceMpn={sourceMpn}
            sourceManufacturer={sourceManufacturer}
          />
        ))}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<CheckIcon />}
          onClick={() => onSubmit({ ...initialAnswers, ...answers })}
          disabled={hasUnansweredRequired}
        >
          {t('chat.continue')}
        </Button>
        <Button
          size="small"
          startIcon={<SkipNextIcon />}
          onClick={onSkip}
          color="inherit"
          disabled={hasUnansweredRequired}
          sx={{ opacity: hasUnansweredRequired ? 0.4 : 0.7 }}
        >
          {t('chat.skipUseDefaults')}
        </Button>
      </Stack>
    </Box>
  );
}
