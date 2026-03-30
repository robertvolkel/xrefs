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
  IconButton,
  InputAdornment,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import { keyframes } from '@mui/material/styles';
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
// TEXT MATCHING
// ============================================================

/** Case-insensitive substring match against option labels. Returns first match. */
function findMatch<T extends string>(
  input: string,
  options: { value: T; label: string }[],
): T | null {
  const lower = input.toLowerCase().trim();
  if (!lower) return null;
  // Exact match first
  for (const o of options) {
    if (o.label.toLowerCase() === lower) return o.value;
  }
  // Substring match
  for (const o of options) {
    if (o.label.toLowerCase().includes(lower) || lower.includes(o.label.toLowerCase())) return o.value;
  }
  return null;
}

/** Find multiple matches from comma-separated or free-form text */
function findMultiMatch<T extends string>(
  input: string,
  options: { value: T; label: string }[],
  max?: number,
): T[] {
  const lower = input.toLowerCase().trim();
  if (!lower) return [];
  const matches: T[] = [];
  for (const o of options) {
    if (max && matches.length >= max) break;
    if (lower.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(lower)) {
      matches.push(o.value);
    }
  }
  return matches;
}

const AFFIRMATIVE = /^(yes|yeah|yep|sure|ok|okay|ready|let'?s go|let'?s do it|go|start)/i;

const bounce = keyframes`
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
`;

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
  /** When true, renders without full-page wrapper (parent provides container) */
  embedded?: boolean;
}

export default function OnboardingAgent({ firstName, embedded }: OnboardingAgentProps) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
  const [chatInput, setChatInput] = useState('');
  const [typing, setTyping] = useState(false);

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
    } catch { /* best-effort */ }
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

    // Show typing indicator, then reveal the next question after a brief pause
    setTyping(true);
    const delay = 500 + Math.random() * 400; // 500–900ms

    setTimeout(() => {
      setTyping(false);

      if (nextStep === 'closing') {
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
      if (msg) addMessages({ role: 'agent', text: msg });
      setStep(nextStep);
    }, delay);
  }, [addMessages]);

  // --------------------------------------------------------
  // CHIP HANDLERS (unchanged logic, streamlined)
  // --------------------------------------------------------

  const handleRoleSelect = useCallback((role: BusinessRole, label?: string) => {
    addMessages({ role: 'user', text: label ?? getRoleLabel(role) });
    setAnswers(prev => ({ ...prev, businessRole: role }));
    savePartial({ businessRole: role }); // fire-and-forget
    advanceTo('q2_industry');
  }, [addMessages, savePartial, advanceTo, setAnswers]);

  const handleIndustryToggle = useCallback((ind: IndustryVertical) => {
    setPendingIndustries(prev =>
      prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
    );
  }, []);

  const handleIndustryConfirm = useCallback((industries?: IndustryVertical[]) => {
    const selected = industries ?? pendingIndustries;
    if (selected.length === 0) return;
    const labels = selected.map(i => getIndustryLabel(i));
    addMessages({ role: 'user', text: labels.join(', ') });
    const acks = selected.map(i => INDUSTRY_ACKS[i]).filter(Boolean) as string[];
    if (acks.length > 0) addMessages({ role: 'agent', text: acks.join(' ') });
    setAnswers(prev => ({ ...prev, industries: selected }));
    savePartial({ industries: selected }); // fire-and-forget
    setPendingIndustries([]);
    advanceTo('q3_produce');
  }, [pendingIndustries, addMessages, savePartial, advanceTo, setAnswers]);

  const handleProdTypeToggle = useCallback((pt: ProductionType) => {
    setPendingProdTypes(prev => {
      if (prev.includes(pt)) return prev.filter(p => p !== pt);
      if (prev.length >= 3) return prev;
      return [...prev, pt];
    });
  }, []);

  const handleProdTypeConfirm = useCallback((types?: ProductionType[]) => {
    const selected = types ?? pendingProdTypes;
    if (selected.length === 0) return;
    addMessages({ role: 'user', text: selected.map(p => getProductionTypeLabel(p)).join(', ') });
    setAnswers(prev => ({ ...prev, productionTypes: selected }));
    savePartial({ productionTypes: selected }); // fire-and-forget
    setPendingProdTypes([]);
    advanceTo('q4_volume');
  }, [pendingProdTypes, addMessages, savePartial, advanceTo, setAnswers]);

  const handleVolumeSelect = useCallback((vol: ProductionVolume, label?: string) => {
    addMessages({ role: 'user', text: label ?? getVolumeLabel(vol) });
    const ack = VOLUME_ACKS[vol];
    if (ack) addMessages({ role: 'agent', text: ack });
    setAnswers(prev => ({ ...prev, productionVolume: vol }));
    savePartial({ productionVolume: vol }); // fire-and-forget
    advanceTo('q5_phase');
  }, [addMessages, savePartial, advanceTo, setAnswers]);

  const handlePhaseSelect = useCallback((phase: ProjectPhase, label?: string) => {
    addMessages({ role: 'user', text: label ?? getPhaseLabel(phase) });
    setAnswers(prev => ({ ...prev, projectPhase: phase }));
    savePartial({ projectPhase: phase }); // fire-and-forget
    advanceTo('q6_goals');
  }, [addMessages, savePartial, advanceTo, setAnswers]);

  const handleGoalToggle = useCallback((goal: UserGoal) => {
    setPendingGoals(prev => {
      if (prev.includes(goal)) return prev.filter(g => g !== goal);
      if (prev.length >= 3) return prev;
      return [...prev, goal];
    });
  }, []);

  const handleGoalConfirm = useCallback((goals?: UserGoal[]) => {
    const selected = goals ?? pendingGoals;
    if (selected.length === 0) return;
    addMessages({ role: 'user', text: selected.map(g => getGoalLabel(g)).join(', ') });
    setAnswers(prev => ({ ...prev, goals: selected }));
    savePartial({ goals: selected }); // fire-and-forget
    setPendingGoals([]);
    advanceTo('q7_anything_else');
  }, [pendingGoals, addMessages, savePartial, advanceTo, setAnswers]);

  const handleSkipQuestion = useCallback(() => {
    const nextStepMap: Record<OnboardingStep, OnboardingStep> = {
      intro: 'q1_role', q1_role: 'q2_industry', q2_industry: 'q3_produce',
      q3_produce: 'q4_volume', q4_volume: 'q5_phase', q5_phase: 'q6_goals',
      q6_goals: 'q7_anything_else', q7_anything_else: 'closing', closing: 'closing',
    };
    advanceTo(nextStepMap[step]);
  }, [step, advanceTo]);

  // --------------------------------------------------------
  // CHAT INPUT HANDLER — text interpretation per step
  // --------------------------------------------------------

  const handleChatSend = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');

    switch (step) {
      case 'intro': {
        if (AFFIRMATIVE.test(text)) {
          addMessages({ role: 'user', text });
          advanceTo('q1_role');
        }
        // Ignore non-affirmative text on intro
        break;
      }
      case 'q1_role': {
        const match = findMatch(text, ROLE_OPTIONS);
        if (match) {
          handleRoleSelect(match, text);
        } else {
          // Treat as "Other" with custom text
          handleRoleSelect('other', text);
        }
        break;
      }
      case 'q2_industry': {
        const matches = findMultiMatch(text, INDUSTRY_OPTIONS);
        if (matches.length > 0) {
          handleIndustryConfirm(matches);
        } else {
          // Show as user message, skip to next
          addMessages({ role: 'user', text });
          advanceTo('q3_produce');
        }
        break;
      }
      case 'q3_produce': {
        const matches = findMultiMatch(text, PRODUCTION_TYPE_OPTIONS, 3);
        if (matches.length > 0) {
          handleProdTypeConfirm(matches);
        } else {
          addMessages({ role: 'user', text });
          advanceTo('q4_volume');
        }
        break;
      }
      case 'q4_volume': {
        const match = findMatch(text, VOLUME_OPTIONS);
        if (match) {
          handleVolumeSelect(match, text);
        } else {
          // Unmatched — show as user message, advance
          addMessages({ role: 'user', text });
          advanceTo('q5_phase');
        }
        break;
      }
      case 'q5_phase': {
        const match = findMatch(text, PHASE_OPTIONS);
        if (match) {
          handlePhaseSelect(match, text);
        } else {
          addMessages({ role: 'user', text });
          advanceTo('q6_goals');
        }
        break;
      }
      case 'q6_goals': {
        const matches = findMultiMatch(text, GOAL_OPTIONS, 3);
        if (matches.length > 0) {
          handleGoalConfirm(matches);
        } else {
          addMessages({ role: 'user', text });
          advanceTo('q7_anything_else');
        }
        break;
      }
      case 'q7_anything_else': {
        addMessages({ role: 'user', text });
        setAnswers(prev => ({ ...prev, freeformText: text }));
        advanceTo('closing');
        break;
      }
      default:
        break;
    }
  }, [chatInput, step, addMessages, advanceTo, handleRoleSelect, handleIndustryConfirm, handleProdTypeConfirm, handleVolumeSelect, handlePhaseSelect, handleGoalConfirm, setAnswers]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  }, [handleChatSend]);

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

  const showChatInput = step !== 'closing';

  // ---- Scrollable messages + interactive area ----
  const messagesArea = (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        px: embedded ? 3 : 2,
        py: 2,
        display: 'flex',
        flexDirection: 'column',
        ...(embedded ? {} : { alignItems: 'center' }),
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
              <Typography variant="body2" sx={{ lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {msg.text}
              </Typography>
            </Paper>
          </Box>
        ))}

        {/* ---- Interactive chips/buttons below messages ---- */}

        {!typing && step === 'intro' && (
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1, ml: 5.5 }}>
            <Button variant="contained" size="small" onClick={() => advanceTo('q1_role')}>
              Let&apos;s go
            </Button>
            <Button variant="text" size="small" onClick={skipToApp} sx={{ color: 'text.secondary' }}>
              Skip for now &rarr;
            </Button>
          </Box>
        )}

        {!typing && step === 'q1_role' && (
          <Box sx={{ ml: 5.5, mt: 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {ROLE_OPTIONS.map(o => (
                <Chip key={o.value} label={o.label} variant="outlined" onClick={() => handleRoleSelect(o.value)} sx={chipSx} />
              ))}
            </Box>
            <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>Skip this question &rarr;</MuiLink>
          </Box>
        )}

        {!typing && step === 'q2_industry' && (
          <Box sx={{ ml: 5.5, mt: 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {INDUSTRY_OPTIONS.map(o => (
                <Chip key={o.value} label={o.label} variant={pendingIndustries.includes(o.value) ? 'filled' : 'outlined'} onClick={() => handleIndustryToggle(o.value)} sx={pendingIndustries.includes(o.value) ? selectedChipSx : chipSx} />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1.5 }}>
              {pendingIndustries.length > 0 && (
                <Button variant="contained" size="small" onClick={() => handleIndustryConfirm()}>Continue &rarr;</Button>
              )}
              <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>Skip this question &rarr;</MuiLink>
            </Box>
          </Box>
        )}

        {!typing && step === 'q3_produce' && (
          <Box sx={{ ml: 5.5, mt: 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {PRODUCTION_TYPE_OPTIONS.map(o => (
                <Chip key={o.value} label={o.label} variant={pendingProdTypes.includes(o.value) ? 'filled' : 'outlined'} onClick={() => handleProdTypeToggle(o.value)} disabled={!pendingProdTypes.includes(o.value) && pendingProdTypes.length >= 3} sx={pendingProdTypes.includes(o.value) ? selectedChipSx : chipSx} />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1.5 }}>
              {pendingProdTypes.length > 0 && (
                <Button variant="contained" size="small" onClick={() => handleProdTypeConfirm()}>Continue &rarr;</Button>
              )}
              <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>Skip this question &rarr;</MuiLink>
            </Box>
          </Box>
        )}

        {!typing && step === 'q4_volume' && (
          <Box sx={{ ml: 5.5, mt: 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {VOLUME_OPTIONS.map(o => (
                <Chip key={o.value} label={o.label} variant="outlined" onClick={() => handleVolumeSelect(o.value)} sx={chipSx} />
              ))}
            </Box>
            <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>Skip this question &rarr;</MuiLink>
          </Box>
        )}

        {!typing && step === 'q5_phase' && (
          <Box sx={{ ml: 5.5, mt: 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {PHASE_OPTIONS.map(o => (
                <Chip key={o.value} label={o.label} variant="outlined" onClick={() => handlePhaseSelect(o.value)} sx={chipSx} />
              ))}
            </Box>
            <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>Skip this question &rarr;</MuiLink>
          </Box>
        )}

        {!typing && step === 'q6_goals' && (
          <Box sx={{ ml: 5.5, mt: 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {GOAL_OPTIONS.map(o => (
                <Chip key={o.value} label={o.label} variant={pendingGoals.includes(o.value) ? 'filled' : 'outlined'} onClick={() => handleGoalToggle(o.value)} disabled={!pendingGoals.includes(o.value) && pendingGoals.length >= 3} sx={pendingGoals.includes(o.value) ? selectedChipSx : chipSx} />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1.5 }}>
              {pendingGoals.length > 0 && (
                <Button variant="contained" size="small" onClick={() => handleGoalConfirm()}>Done &rarr;</Button>
              )}
              <MuiLink component="button" onClick={handleSkipQuestion} sx={skipLinkSx}>Skip this question &rarr;</MuiLink>
            </Box>
          </Box>
        )}

        {!typing && step === 'q7_anything_else' && (
          <Box sx={{ ml: 5.5, mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Type your answer below, or skip to finish.
            </Typography>
            <Box sx={{ mt: 1 }}>
              <MuiLink component="button" onClick={() => advanceTo('closing')} sx={skipLinkSx}>Skip &rarr;</MuiLink>
            </Box>
          </Box>
        )}

        {step === 'closing' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Button variant="contained" onClick={goToDashboard}>
              Go to Dashboard &rarr;
            </Button>
          </Box>
        )}

        {/* Typing indicator */}
        {typing && (
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 2 }}>
            <Box
              sx={{
                width: 32, height: 32, borderRadius: '50%',
                bgcolor: 'background.paper', border: 1, borderColor: 'divider',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, mt: 0.25,
              }}
            >
              <SmartToyIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            </Box>
            <Paper
              elevation={0}
              sx={{
                px: 2, py: 1.5,
                bgcolor: 'background.paper',
                borderRadius: '16px 16px 16px 4px',
                border: 1, borderColor: 'divider',
                display: 'flex', gap: 0.5, alignItems: 'center',
                minWidth: 56,
              }}
            >
              {[0, 1, 2].map(i => (
                <Box
                  key={i}
                  sx={{
                    width: 6, height: 6, borderRadius: '50%',
                    bgcolor: 'text.secondary',
                    animation: `${bounce} 1.2s ease-in-out infinite`,
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </Paper>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>
    </Box>
  );

  // ---- Chat input bar ----
  const chatInputBar = showChatInput ? (
    <Box
      sx={{
        borderTop: 1,
        borderColor: 'divider',
        px: embedded ? 2 : 2,
        py: 1.5,
        flexShrink: 0,
      }}
    >
      <TextField
        inputRef={inputRef}
        fullWidth
        size="small"
        placeholder="Type a response..."
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={typing}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleChatSend}
                  disabled={!chatInput.trim()}
                  sx={{ color: chatInput.trim() ? 'primary.main' : 'text.disabled' }}
                >
                  <SendIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: '24px',
            fontSize: '0.88rem',
          },
        }}
      />
    </Box>
  ) : null;

  // ---- Embedded mode: flex column filling parent ----
  if (embedded) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {messagesArea}
        {chatInputBar}
      </Box>
    );
  }

  // ---- Standalone mode: full-page wrapper ----
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 2 }}>
        <MuiLink
          component="button"
          onClick={skipToApp}
          sx={{ fontSize: '0.85rem', color: 'text.secondary', textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
        >
          Skip and go to app &rarr;
        </MuiLink>
      </Box>
      {messagesArea}
      {chatInputBar}
    </Box>
  );
}
