'use client';

import { useMemo } from 'react';
import { Box, Card, CardContent, Chip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { LogicTable, ContextEffectType } from '@/lib/types';
import { getContextQuestionsForFamily } from '@/lib/contextQuestions';

interface ContextPanelProps {
  table: LogicTable | null;
}

const sensitivityColors: Record<string, string> = {
  critical: '#FF5252',
  high: '#FFB74D',
  moderate: '#64B5F6',
  low: '#90A4AE',
};

const effectColors: Record<ContextEffectType, string> = {
  escalate_to_mandatory: '#FF5252',
  escalate_to_primary: '#FFB74D',
  set_threshold: '#81C784',
  not_applicable: '#90A4AE',
  add_review_flag: '#FFD54F',
};

const effectLabels: Record<ContextEffectType, string> = {
  escalate_to_mandatory: 'admin.escalateToMandatory',
  escalate_to_primary: 'admin.escalateToPrimary',
  set_threshold: 'admin.setThreshold',
  not_applicable: 'admin.notApplicable',
  add_review_flag: 'admin.addReviewFlag',
};

export default function ContextPanel({ table }: ContextPanelProps) {
  const { t } = useTranslation();

  const config = useMemo(
    () => (table ? getContextQuestionsForFamily(table.familyId) : null),
    [table],
  );

  if (!table) return null;

  if (!config) {
    return (
      <Box>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          {table.familyName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('admin.noContextConfig')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {table.familyName}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          {t('admin.contextSensitivity')}:
        </Typography>
        <Chip
          label={config.contextSensitivity}
          size="small"
          sx={{
            bgcolor: (sensitivityColors[config.contextSensitivity] ?? '#90A4AE') + '22',
            color: sensitivityColors[config.contextSensitivity] ?? '#90A4AE',
            fontWeight: 600,
            fontSize: '0.72rem',
            height: 24,
            textTransform: 'capitalize',
          }}
        />
        <Typography variant="body2" color="text.secondary">
          &mdash; {config.questions.length} {t('admin.questions').toLowerCase()}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {config.questions
          .sort((a, b) => a.priority - b.priority)
          .map((question) => (
            <Card key={question.questionId} variant="outlined" sx={{ bgcolor: 'background.default' }}>
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
                  <Chip
                    label={`P${question.priority}`}
                    size="small"
                    sx={{
                      bgcolor: '#64B5F622',
                      color: '#64B5F6',
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      height: 22,
                      minWidth: 32,
                    }}
                  />
                  <Typography variant="subtitle2">
                    {question.questionText}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1 }}>
                  {question.options.map((option) => (
                    <Box
                      key={option.value}
                      sx={{
                        borderLeft: 2,
                        borderColor: option.attributeEffects.length > 0 ? 'primary.main' : 'divider',
                        pl: 2,
                        py: 0.5,
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {option.label}
                      </Typography>
                      {option.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          {option.description}
                        </Typography>
                      )}

                      {option.attributeEffects.length > 0 && (
                        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                          {option.attributeEffects.map((effect) => (
                            <Box
                              key={effect.attributeId}
                              sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                            >
                              <Chip
                                label={effect.attributeId}
                                size="small"
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.68rem',
                                  height: 22,
                                  bgcolor: 'action.hover',
                                }}
                              />
                              <Typography variant="caption" color="text.secondary">
                                &rarr;
                              </Typography>
                              <Chip
                                label={t(effectLabels[effect.effect])}
                                size="small"
                                sx={{
                                  bgcolor: effectColors[effect.effect] + '22',
                                  color: effectColors[effect.effect],
                                  fontWeight: 500,
                                  fontSize: '0.68rem',
                                  height: 22,
                                }}
                              />
                              {effect.note && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ fontSize: '0.7rem', lineHeight: 1.4 }}
                                >
                                  {effect.note}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          ))}
      </Box>
    </Box>
  );
}
