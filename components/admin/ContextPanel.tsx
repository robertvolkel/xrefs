'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Typography,
  IconButton,
  Button,
  Tooltip,
  Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BlockIcon from '@mui/icons-material/Block';
import { useTranslation } from 'react-i18next';
import {
  LogicTable,
  ContextEffectType,
  ContextQuestion,
  ContextOption,
  ContextOverrideRecord,
} from '@/lib/types';
import { getContextQuestionsForFamily } from '@/lib/contextQuestions';
import { getContextOverrides } from '@/lib/api';
import ContextOverrideDrawer from './ContextOverrideDrawer';

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
  const [overrides, setOverrides] = useState<ContextOverrideRecord[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add_question' | 'add_option' | 'modify_option' | 'disable_question'>('add_question');
  const [selectedQuestion, setSelectedQuestion] = useState<ContextQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<ContextOption | null>(null);

  const config = useMemo(
    () => (table ? getContextQuestionsForFamily(table.familyId) : null),
    [table],
  );

  // Build override lookup: questionId or questionId:optionValue
  const overrideMap = useMemo(() => {
    const map = new Map<string, ContextOverrideRecord>();
    for (const ov of overrides) {
      const key = ov.optionValue
        ? `${ov.questionId}:${ov.optionValue}`
        : ov.questionId;
      map.set(key, ov);
    }
    return map;
  }, [overrides]);

  const fetchOverrides = useCallback(async () => {
    if (!table) { setOverrides([]); return; }
    const data = await getContextOverrides(table.familyId);
    setOverrides(data);
  }, [table]);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);

  const openDrawer = useCallback((
    mode: typeof drawerMode,
    question: ContextQuestion | null,
    option: ContextOption | null,
  ) => {
    setDrawerMode(mode);
    setSelectedQuestion(question);
    setSelectedOption(option);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setSelectedQuestion(null);
    setSelectedOption(null);
  }, []);

  if (!table) return null;

  const overrideCount = overrides.length;

  if (!config) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="h6">
            {t(`logicTable.${table.familyId}.name`, table.familyName)}
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => openDrawer('add_question', null, null)}
            sx={{ textTransform: 'none' }}
          >
            Add Question
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('admin.noContextConfig')}
        </Typography>

        <ContextOverrideDrawer
          open={drawerOpen}
          onClose={handleDrawerClose}
          familyId={table.familyId}
          mode={drawerMode}
          question={selectedQuestion}
          option={selectedOption}
          existingOverride={null}
          onSaved={fetchOverrides}
        />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="h6">
          {t(`logicTable.${table.familyId}.name`, table.familyName)}
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => openDrawer('add_question', null, null)}
          sx={{ textTransform: 'none' }}
        >
          Add Question
        </Button>
      </Box>
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
        {overrideCount > 0 && (
          <Chip
            label={`${overrideCount} override${overrideCount !== 1 ? 's' : ''}`}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {config.questions
          .sort((a, b) => a.priority - b.priority)
          .map((question) => {
            const qOverride = overrideMap.get(question.questionId);
            const isDisabled = qOverride?.action === 'disable_question';

            return (
              <Card
                key={question.questionId}
                variant="outlined"
                sx={{
                  bgcolor: 'background.default',
                  ...(isDisabled && { opacity: 0.5 }),
                  ...(qOverride && { borderColor: '#FFB74D44' }),
                }}
              >
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
                    <Typography variant="subtitle2" sx={{ flex: 1 }}>
                      {t(`contextQ.${table.familyId}.${question.questionId}.text`, question.questionText)}
                    </Typography>

                    {/* Question-level actions */}
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                      <Tooltip title="Add option">
                        <IconButton
                          size="small"
                          onClick={() => openDrawer('add_option', question, null)}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                        >
                          <AddIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={isDisabled ? 'Disabled by override' : 'Disable question'}>
                        <IconButton
                          size="small"
                          onClick={() => openDrawer('disable_question', question, null)}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                          color={isDisabled ? 'error' : 'default'}
                        >
                          <BlockIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>

                    {qOverride && (
                      <Tooltip title={`Override: ${qOverride.action} — ${qOverride.changeReason}`}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: '#FFB74D',
                            flexShrink: 0,
                            mt: 0.8,
                          }}
                        />
                      </Tooltip>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1 }}>
                    {question.options.map((option) => {
                      const optKey = `${question.questionId}:${option.value}`;
                      const optOverride = overrideMap.get(optKey);

                      return (
                        <Box
                          key={option.value}
                          sx={{
                            borderLeft: 2,
                            borderColor: option.attributeEffects.length > 0 ? 'primary.main' : 'divider',
                            pl: 2,
                            py: 0.5,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' },
                            borderRadius: '0 4px 4px 0',
                            ...(optOverride && { bgcolor: 'rgba(255,183,77,0.06)' }),
                          }}
                          onClick={() => openDrawer('modify_option', question, option)}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
                              {t(`contextQ.${table.familyId}.${question.questionId}.opt.${option.value}.label`, option.label)}
                            </Typography>
                            {optOverride && (
                              <Tooltip title={`Override: ${optOverride.changeReason}`}>
                                <Box
                                  sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    bgcolor: '#FFB74D',
                                    flexShrink: 0,
                                  }}
                                />
                              </Tooltip>
                            )}
                            <IconButton
                              size="small"
                              onClick={e => { e.stopPropagation(); openDrawer('modify_option', question, option); }}
                              sx={{ opacity: 0.3, '&:hover': { opacity: 1 } }}
                            >
                              <EditOutlinedIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Box>
                          {option.description && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                              {t(`contextQ.${table.familyId}.${question.questionId}.opt.${option.value}.desc`, option.description)}
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
                      );
                    })}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
      </Box>

      {/* Override Drawer */}
      <ContextOverrideDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        familyId={table.familyId}
        mode={drawerMode}
        question={selectedQuestion}
        option={selectedOption}
        existingOverride={
          selectedOption
            ? overrideMap.get(`${selectedQuestion?.questionId}:${selectedOption.value}`) ?? null
            : selectedQuestion
              ? overrideMap.get(selectedQuestion.questionId) ?? null
              : null
        }
        onSaved={fetchOverrides}
      />
    </Box>
  );
}
