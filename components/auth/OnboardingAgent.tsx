'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Chip,
  Button,
  TextField,
  Link as MuiLink,
  Paper,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { updateUserPreferences } from '@/lib/api';
import {
  ROLE_OPTIONS,
  INDUSTRY_OPTIONS,
  PRODUCTION_TYPE_OPTIONS,
  VOLUME_OPTIONS,
  PHASE_OPTIONS,
  GOAL_OPTIONS,
  getRoleLabel,
  getIndustryLabel,
  getProductionTypeLabel,
  getVolumeLabel,
  getPhaseLabel,
  getGoalLabel,
} from '@/lib/constants/profileOptions';
import type {
  BusinessRole,
  IndustryVertical,
  ProductionType,
  ProductionVolume,
  ProjectPhase,
  UserGoal,
} from '@/lib/types';

// ============================================================
// TYPES
// ============================================================

type OnboardingStep =
  | 'intro'
  | 'q1_role'
  | 'q2_industry'
  | 'q3_produce'
  | 'q4_volume'
  | 'q5_phase'
  | 'q6_goals'
  | 'q7_anything_else'
  | 'closing';

interface Message {
  role: 'agent' | 'user';
  text: string;
}

interface Answers {
  businessRole?: BusinessRole;
  industries?: IndustryVertical[];
  productionTypes?: ProductionType[];
  productionVolume?: ProductionVolume;
  projectPhase?: ProjectPhase;
  goals?: UserGoal[];
  freeformText?: string;
}

// ============================================================
// ACKNOWLEDGMENT MAPS
// ============================================================

const INDUSTRY_ACKS: Partial<Record<IndustryVertical, string>> = {
  automotive: "Got it \u2014 I'll keep AEC-Q compliance in mind when I make recommendations.",
  medical: "Got it \u2014 I'll factor in ISO 13485 and component traceability when I make recommendations.",
  aerospace_defense: "Got it \u2014 I'll keep MIL-STD compliance in mind when I make recommendations.",
};

const VOLUME_ACKS: Record<string, string> = {
  prototype: "Good to know \u2014 I'll factor in minimum order quantities and single-source risks.",
  low_volume: "Good to know \u2014 I'll factor in minimum order quantities and single-source risks.",
  mid_volume: "Noted \u2014 pricing tiers, supply continuity, and lifecycle risk will matter most.",
  high_volume: "Noted \u2014 pricing tiers, supply continuity, and lifecycle risk will matter most.",
  varies: "Makes sense \u2014 you can set this per project once you're in.",
};

// ============================================================
// COMPONENT
// ============================================================

interface OnboardingAgentProps {
  firstName: string;
  /** When true, renders without full-page wrapper and top-right skip link (parent provides these) */
  embedded?: boolean;
}

export default function OnboardingAgent({ firstName, embedded }: OnboardingAgentProps) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<OnboardingStep>('intro');
  const [messages, setMessages] = useState<Message[]>([]);
  const [answers, _setAnswers] = useState<Answers>({});
  const answersRef = useRef<Answers>({});
  const setAnswers = useCallback((updater: Answers | ((prev: Answers) => Answers)) => {
    _setAnswers(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      answersRef.current = next;
      return next;
    });
  }, []);
  const [otherRoleText, setOtherRoleText] = useState('');
  const [freeformText, setFreeformText] = useState('');

  // Multi-select pending selections (before user clicks Continue/Done)
  const [pendingIndustries, setPendingIndustries] = useState<IndustryVertical[]>([]);
  const [pendingProdTypes, setPendingProdTypes] = useState<ProductionType[]>([]);
  const [pendingGoals, setPendingGoals] = useState<UserGoal[]>([]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, step]);

  // Show intro message on mount
  useEffect(() => {
    setMessages([
      {
        role: 'agent',
        text: `Hi ${firstName} \u2014 I'm the agent that will be helping you find the right products for your needs, analyze BOMs, find alternatives, and navigate supply chain decisions. I have a few quick questions that will help me give you sharper recommendations. You can skip this and come back to it in the My Profile section of the app's settings. Ready?`,
      },
    ]);
  }, [firstName]);

  // --------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------

  const addMessages = useCallback((...msgs: Message[]) => {
    setMessages(prev => [...prev, ...msgs]);
  }, []);

  const savePartial = useCallback(async (partial: Partial<Answers>) => {
    const toSave: Record<string, unknown> = {};
    if (partial.businessRole !== undefined) toSave.businessRole = partial.businessRole;
    if (partial.industries !== undefined) toSave.industries = partial.industries;
    if (partial.productionTypes !== undefined) toSave.productionTypes = partial.productionTypes;
    if (partial.productionVolume !== undefined) toSave.productionVolume = partial.productionVolume;
    if (partial.projectPhase !== undefined) toSave.projectPhase = partial.projectPhase;
    if (partial.goals !== undefined) toSave.goals = partial.goals;

    try {
      await updateUserPreferences(toSave);
    } catch (err) {
      console.error('[OnboardingAgent] Failed to save partial answer:', err);
    }
  }, []);

  const goToDashboard = useCallback(async () => {
    // Compose profile prompt from all answers (use ref for latest)
    const a = answersRef.current;
    const parts: string[] = [];

    if (a.businessRole) {
      parts.push(`I'm a ${getRoleLabel(a.businessRole).toLowerCase()}`);
    }
    if (a.industries?.length) {
      const labels = a.industries.map(i => getIndustryLabel(i).toLowerCase());
      parts.push(`working in ${labels.join(', ')}`);
    }
    if (parts.length > 0) {
      const first = parts.join(' ') + '.';
      parts.length = 0;
      parts.push(first);
    }
    if (a.productionTypes?.length) {
      const labels = a.productionTypes.map(p => getProductionTypeLabel(p).toLowerCase());
      parts.push(`My company produces ${labels.join(', ')}.`);
    }
    if (a.productionVolume) {
      parts.push(`Production volume: ${getVolumeLabel(a.productionVolume).toLowerCase()}.`);
    }
    if (a.projectPhase) {
      parts.push(`I typically work in the ${getPhaseLabel(a.projectPhase).toLowerCase()} phase.`);
    }
    if (a.goals?.length) {
      const labels = a.goals.map(g => getGoalLabel(g).toLowerCase());
      parts.push(`My priorities are ${labels.join(', ')}.`);
    }
    if (a.freeformText?.trim()) {
      parts.push(a.freeformText.trim());
    }

    const profilePrompt = parts.join(' ');

    try {
      await updateUserPreferences({
        onboardingComplete: true,
        ...(profilePrompt ? { profilePrompt } : {}),
      });
    } catch (err) {
      console.error('[OnboardingAgent] Failed to save onboarding completion:', err);
    }

    router.push('/');
    router.refresh();
  }, [router]);

  const skipToApp = useCallback(async () => {
    try {
      await updateUserPreferences({ onboardingComplete: true });
    } catch {
      // Best-effort
    }
    router.push('/');
    router.refresh();
  }, [router]);

  // --------------------------------------------------------
  // STEP TRANSITIONS
  // --------------------------------------------------------

  const advanceTo = useCallback((nextStep: OnboardingStep) => {
    const questionMessages: Record<string, string> = {
      q1_role: "What's your primary role at your organization?",
      q2_industry: 'What industry/industries do you serve?',
      q3_produce: 'What does your company manufacture?',
      q4_volume: 'What kind of production volume are you working with?',
      q5_phase: 'What phase are you typically working in when you use this tool?',
      q6_goals: "Last one \u2014 what matters most to you when evaluating components or BOM alternatives?",
      q7_anything_else: "Is there anything else about your work that would help me give you better recommendations? For example, specific product types you work with, particular challenges you face, or constraints I should know about.",
    };

    if (nextStep === 'closing') {
      // Build closing message (use ref for latest answers)
      const a = answersRef.current;
      const answeredFields: string[] = [];
      if (a.businessRole) answeredFields.push(`**Role:** ${getRoleLabel(a.businessRole)}`);
      if (a.industries?.length) answeredFields.push(`**Industry:** ${a.industries.map(i => getIndustryLabel(i)).join(', ')}`);
      if (a.productionTypes?.length) answeredFields.push(`**Makes:** ${a.productionTypes.map(p => getProductionTypeLabel(p)).join(', ')}`);
      if (a.productionVolume) answeredFields.push(`**Volume:** ${getVolumeLabel(a.productionVolume)}`);
      if (a.projectPhase) answeredFields.push(`**Phase:** ${getPhaseLabel(a.projectPhase)}`);
      if (a.goals?.length) answeredFields.push(`**Goals:** ${a.goals.map(g => getGoalLabel(g)).join(', ')}`);
      if (a.freeformText?.trim()) answeredFields.push(`**Additional context:** ${a.freeformText.trim()}`);

      if (answeredFields.length > 0) {
        addMessages({
          role: 'agent',
          text: `Perfect \u2014 here's what I've got:\n\n${answeredFields.join('\n')}\n\nI'll use this to tailor my recommendations. You can update any of this anytime under Settings \u2192 My Profile.`,
        });
      } else {
        addMessages({
          role: 'agent',
          text: "No problem \u2014 you can fill in your profile anytime under Settings \u2192 My Profile. Let's get started.",
        });
      }

      setStep('closing');
      return;
    }

    const msg = questionMessages[nextStep];
    if (msg) {
      addMessages({ role: 'agent', text: msg });
    }
    setStep(nextStep);
  }, [addMessages]);

  // --------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------

  // Q1: Role (single select)
  const handleRoleSelect = useCallback(async (role: BusinessRole) => {
    const label = role === 'other' && otherRoleText.trim()
      ? otherRoleText.trim()
      : getRoleLabel(role);
    addMessages({ role: 'user', text: label });

    setAnswers(prev => ({ ...prev, businessRole: role }));
    await savePartial({ businessRole: role });
    advanceTo('q2_industry');
  }, [otherRoleText, addMessages, savePartial, advanceTo, setAnswers]);

  // Q2: Industry (multi select)
  const handleIndustryToggle = useCallback((ind: IndustryVertical) => {
    setPendingIndustries(prev =>
      prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
    );
  }, []);

  const handleIndustryConfirm = useCallback(async () => {
    if (pendingIndustries.length === 0) return;

    const labels = pendingIndustries.map(i => getIndustryLabel(i));
    addMessages({ role: 'user', text: labels.join(', ') });

    // Contextual acknowledgments
    const acks = pendingIndustries
      .map(i => INDUSTRY_ACKS[i])
      .filter(Boolean) as string[];
    if (acks.length > 0) {
      addMessages({ role: 'agent', text: acks.join(' ') });
    }

    setAnswers(prev => ({ ...prev, industries: pendingIndustries }));
    await savePartial({ industries: pendingIndustries });
    setPendingIndustries([]);
    advanceTo('q3_produce');
  }, [pendingIndustries, addMessages, savePartial, advanceTo, setAnswers]);

  // Q3: Production types (multi select, max 3)
  const handleProdTypeToggle = useCallback((pt: ProductionType) => {
    setPendingProdTypes(prev => {
      if (prev.includes(pt)) return prev.filter(p => p !== pt);
      if (prev.length >= 3) return prev;
      return [...prev, pt];
    });
  }, []);

  const handleProdTypeConfirm = useCallback(async () => {
    if (pendingProdTypes.length === 0) return;

    const labels = pendingProdTypes.map(p => getProductionTypeLabel(p));
    addMessages({ role: 'user', text: labels.join(', ') });

    setAnswers(prev => ({ ...prev, productionTypes: pendingProdTypes }));
    await savePartial({ productionTypes: pendingProdTypes });
    setPendingProdTypes([]);
    advanceTo('q4_volume');
  }, [pendingProdTypes, addMessages, savePartial, advanceTo, setAnswers]);

  // Q4: Volume (single select)
  const handleVolumeSelect = useCallback(async (vol: ProductionVolume) => {
    addMessages({ role: 'user', text: getVolumeLabel(vol) });

    // Contextual acknowledgment
    const ack = VOLUME_ACKS[vol];
    if (ack) {
      addMessages({ role: 'agent', text: ack });
    }

    setAnswers(prev => ({ ...prev, productionVolume: vol }));
    await savePartial({ productionVolume: vol });
    advanceTo('q5_phase');
  }, [addMessages, savePartial, advanceTo, setAnswers]);

  // Q5: Phase (single select)
  const handlePhaseSelect = useCallback(async (phase: ProjectPhase) => {
    addMessages({ role: 'user', text: getPhaseLabel(phase) });

    setAnswers(prev => ({ ...prev, projectPhase: phase }));
    await savePartial({ projectPhase: phase });
    advanceTo('q6_goals');
  }, [addMessages, savePartial, advanceTo, setAnswers]);

  // Q6: Goals (multi select, max 3)
  const handleGoalToggle = useCallback((goal: UserGoal) => {
    setPendingGoals(prev => {
      if (prev.includes(goal)) return prev.filter(g => g !== goal);
      if (prev.length >= 3) return prev;
      return [...prev, goal];
    });
  }, []);

  const handleGoalConfirm = useCallback(async () => {
    if (pendingGoals.length === 0) return;

    const labels = pendingGoals.map(g => getGoalLabel(g));
    addMessages({ role: 'user', text: labels.join(', ') });

    setAnswers(prev => ({ ...prev, goals: pendingGoals }));
    await savePartial({ goals: pendingGoals });
    setPendingGoals([]);
    advanceTo('q7_anything_else');
  }, [pendingGoals, addMessages, savePartial, advanceTo, setAnswers]);

  // Q7: Free-form
  const handleFreeformSubmit = useCallback(() => {
    const text = freeformText.trim();
    if (text) {
      addMessages({ role: 'user', text });
    }
    // Update answers ref directly so advanceTo('closing') reads latest
    setAnswers(prev => ({ ...prev, freeformText: text || prev.freeformText }));
    advanceTo('closing');
  }, [freeformText, addMessages, advanceTo, setAnswers]);

  // Skip handlers
  const handleSkipQuestion = useCallback(() => {
    const nextStepMap: Record<OnboardingStep, OnboardingStep> = {
      intro: 'q1_role',
      q1_role: 'q2_industry',
      q2_industry: 'q3_produce',
      q3_produce: 'q4_volume',
      q4_volume: 'q5_phase',
      q5_phase: 'q6_goals',
      q6_goals: 'q7_anything_else',
      q7_anything_else: 'closing',
      closing: 'closing',
    };
    advanceTo(nextStepMap[step]);
  }, [step, advanceTo]);

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------

  const chipSx = {
    borderRadius: '16px',
    fontWeight: 500,
    fontSize: '0.82rem',
    py: 0.5,
    '&:hover': { bgcolor: 'action.hover' },
  };

  const selectedChipSx = {
    ...chipSx,
    bgcolor: 'primary.main',
    color: 'primary.contrastText',
    '&:hover': { bgcolor: 'primary.dark' },
  };

  const skipLinkSx = {
    fontSize: '0.78rem',
    color: 'text.secondary',
    cursor: 'pointer',
    textDecoration: 'none',
    '&:hover': { color: 'text.primary' },
    mt: 1,
  };

  const content = (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        ...(embedded
          ? { px: 3, py: 2 }
          : { alignItems: 'center', px: 2, pb: 4 }),
      }}
    >
      <Box sx={{ width: '100%', ...(embedded ? {} : { maxWidth: 640 }) }}>
          {messages.map((msg, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                mb: 2,
                gap: 1.5,
                alignItems: 'flex-start',
              }}
            >
              {msg.role === 'agent' && (
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    mt: 0.25,
                  }}
                >
                  <SmartToyIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </Box>
              )}
              <Paper
                elevation={0}
                sx={{
                  px: 2,
                  py: 1.5,
                  maxWidth: '85%',
                  bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper',
                  color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  border: msg.role === 'agent' ? 1 : 0,
                  borderColor: 'divider',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ lineHeight: 1.6, whiteSpace: 'pre-line' }}
                >
                  {msg.text}
                </Typography>
              </Paper>
            </Box>
          ))}

          {/* ---- Interactive area below messages ---- */}

          {/* INTRO: Let's go / Skip */}
          {step === 'intro' && (
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1, ml: 5.5 }}>
              <Button
                variant="contained"
                size="small"
                onClick={() => advanceTo('q1_role')}
              >
                Let&apos;s go
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={skipToApp}
                sx={{ color: 'text.secondary' }}
              >
                Skip for now &rarr;
              </Button>
            </Box>
          )}

          {/* Q1: Role */}
          {step === 'q1_role' && (
            <Box sx={{ ml: 5.5, mt: 1 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {ROLE_OPTIONS.map(o => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    variant="outlined"
                    onClick={() => {
                      if (o.value === 'other') {
                        // Show text field, don't advance yet
                        setOtherRoleText('');
                      } else {
                        handleRoleSelect(o.value);
                      }
                    }}
                    sx={chipSx}
                  />
                ))}
              </Box>
              {/* "Other" free text */}
              {step === 'q1_role' && otherRoleText !== undefined && ROLE_OPTIONS.some(o => o.value === 'other') && (
                <Box sx={{ display: 'none' }} /> // placeholder for Other text field state
              )}
              <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>
                Skip this question &rarr;
              </MuiLink>
            </Box>
          )}

          {/* Q2: Industry (multi) */}
          {step === 'q2_industry' && (
            <Box sx={{ ml: 5.5, mt: 1 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {INDUSTRY_OPTIONS.map(o => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    variant={pendingIndustries.includes(o.value) ? 'filled' : 'outlined'}
                    onClick={() => handleIndustryToggle(o.value)}
                    sx={pendingIndustries.includes(o.value) ? selectedChipSx : chipSx}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1.5 }}>
                {pendingIndustries.length > 0 && (
                  <Button variant="contained" size="small" onClick={handleIndustryConfirm}>
                    Continue &rarr;
                  </Button>
                )}
                <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>
                  Skip this question &rarr;
                </MuiLink>
              </Box>
            </Box>
          )}

          {/* Q3: Production types (multi, max 3) */}
          {step === 'q3_produce' && (
            <Box sx={{ ml: 5.5, mt: 1 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {PRODUCTION_TYPE_OPTIONS.map(o => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    variant={pendingProdTypes.includes(o.value) ? 'filled' : 'outlined'}
                    onClick={() => handleProdTypeToggle(o.value)}
                    disabled={!pendingProdTypes.includes(o.value) && pendingProdTypes.length >= 3}
                    sx={pendingProdTypes.includes(o.value) ? selectedChipSx : chipSx}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1.5 }}>
                {pendingProdTypes.length > 0 && (
                  <Button variant="contained" size="small" onClick={handleProdTypeConfirm}>
                    Continue &rarr;
                  </Button>
                )}
                <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>
                  Skip this question &rarr;
                </MuiLink>
              </Box>
            </Box>
          )}

          {/* Q4: Volume (single) */}
          {step === 'q4_volume' && (
            <Box sx={{ ml: 5.5, mt: 1 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {VOLUME_OPTIONS.map(o => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    variant="outlined"
                    onClick={() => handleVolumeSelect(o.value)}
                    sx={chipSx}
                  />
                ))}
              </Box>
              <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>
                Skip this question &rarr;
              </MuiLink>
            </Box>
          )}

          {/* Q5: Phase (single) */}
          {step === 'q5_phase' && (
            <Box sx={{ ml: 5.5, mt: 1 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {PHASE_OPTIONS.map(o => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    variant="outlined"
                    onClick={() => handlePhaseSelect(o.value)}
                    sx={chipSx}
                  />
                ))}
              </Box>
              <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>
                Skip this question &rarr;
              </MuiLink>
            </Box>
          )}

          {/* Q6: Goals (multi, max 3) */}
          {step === 'q6_goals' && (
            <Box sx={{ ml: 5.5, mt: 1 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {GOAL_OPTIONS.map(o => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    variant={pendingGoals.includes(o.value) ? 'filled' : 'outlined'}
                    onClick={() => handleGoalToggle(o.value)}
                    disabled={!pendingGoals.includes(o.value) && pendingGoals.length >= 3}
                    sx={pendingGoals.includes(o.value) ? selectedChipSx : chipSx}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1.5 }}>
                {pendingGoals.length > 0 && (
                  <Button variant="contained" size="small" onClick={handleGoalConfirm}>
                    Done &rarr;
                  </Button>
                )}
                <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>
                  Skip this question &rarr;
                </MuiLink>
              </Box>
            </Box>
          )}

          {/* Q7: Free-form */}
          {step === 'q7_anything_else' && (
            <Box sx={{ ml: 5.5, mt: 1 }}>
              <TextField
                multiline
                minRows={3}
                maxRows={6}
                fullWidth
                placeholder="e.g., I mostly work with power electronics for motor drives, and I'm often looking for parts with extended temperature range..."
                value={freeformText}
                onChange={(e) => setFreeformText(e.target.value)}
                sx={{ mb: 1.5 }}
              />
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleFreeformSubmit}
                >
                  {freeformText.trim() ? 'Done \u2192' : 'Skip \u2192'}
                </Button>
              </Box>
            </Box>
          )}

          {/* CLOSING: Go to Dashboard */}
          {step === 'closing' && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button variant="contained" onClick={goToDashboard}>
                Go to Dashboard &rarr;
              </Button>
            </Box>
          )}

          <div ref={messagesEndRef} />
        </Box>
      </Box>
  );

  // Embedded mode: content only (parent provides wrapper)
  if (embedded) return content;

  // Standalone mode: full-page wrapper with skip link
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 2 }}>
        <MuiLink
          component="button"
          onClick={skipToApp}
          sx={{
            fontSize: '0.85rem',
            color: 'text.secondary',
            textDecoration: 'none',
            '&:hover': { color: 'text.primary' },
          }}
        >
          Skip and go to app &rarr;
        </MuiLink>
      </Box>
      {content}
    </Box>
  );
}
