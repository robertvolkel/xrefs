/**
 * GROUNDING MEASUREMENT HARNESS — quantify whether the Track A "family-knowledge" injection
 * changes the assistant's fabrication rate, by running the same prose prompts through the REAL
 * `chat()` twice (rulebook OFF, then ON) and scoring each reply through the SAME two detectors
 * the production watchers use (MPN + spec-value).
 *
 * WHY. The chat-prompt regression checklist (docs/chat-prompt-regression-checklist.md) is a
 * manual, human-judged procedure. Its CRITICAL rows are all "did the model fabricate a part
 * number / spec value?" — which the two observe detectors already answer deterministically. So
 * this harness automates the grounding half of the gate: it produces a side-by-side count of
 * would-be fabrications with the feature off vs on, plus the actual reply text so a human can
 * still eyeball the "is it smarter?" half.
 *
 * The prompts are PROSE turns with NO on-screen part context — the purest fabrication test: the
 * verified set is only what the USER typed, so any MPN-family token or volunteered value+unit the
 * model emits is a finding. This is exactly the surface Track A widens.
 *
 * The A/B is in ONE process: FAMILY_KNOWLEDGE_ENABLED is read at call time, so we run each prompt
 * with the flag unset, then set it to '1' and run again. Same prompt, same model, only the flag
 * differs — so any delta in findings is the feature, not noise (beyond model non-determinism,
 * which is why we print the raw replies).
 *
 * RUN:  node --env-file=.env.local --import tsx scripts/grounding-measurement-harness.ts [--out file.json]
 */
import { chat } from '@/lib/services/llmOrchestrator';
import type { OrchestratorMessage } from '@/lib/types';
import {
  buildVerifiedSetFromContext,
  observeMessage,
} from '@/lib/services/grounding/observeGrounding';
import { extractUserMpnCandidates } from '@/lib/services/grounding/groundingLogger';
import {
  detectUngroundedSpecValues,
  knownValuesFromUserText,
} from '@/lib/services/grounding/specValueDetector';

interface Scenario {
  id: string;
  /** CRITICAL rows are the grounding gate; DESIGN rows are the scenario-8 target Track A improves. */
  tier: 'CRITICAL' | 'HIGH' | 'DESIGN' | 'THEORY';
  prompt: string;
  /** What a human should look for in the reply text (not asserted). */
  watch: string;
}

// Prose turns with no on-screen context — the surface where the model types atoms from memory.
const SCENARIOS: Scenario[] = [
  {
    id: 'design-opamp',
    tier: 'DESIGN',
    prompt: 'What should I look for in a low-noise op-amp for a precision sensor front-end?',
    watch: 'Should explain WHICH specs matter (noise density, offset, bandwidth) — must NOT recite specific op-amp MPNs or "typical" noise numbers as fact.',
  },
  {
    id: 'design-buck',
    tier: 'DESIGN',
    prompt: 'I need to make a 5V rail from a 12V input at about 2A. What specs matter in the buck converter?',
    watch: 'Which specs matter for a buck at this rail. Watch for volunteered target numbers (efficiency %, specific Vin ceilings) stated as fact, and any invented controller MPNs.',
  },
  {
    id: 'theory-ldo',
    tier: 'THEORY',
    prompt: 'How does an LDO dropout voltage affect efficiency?',
    watch: 'Conceptual answer. Watch for fabricated efficiency percentages / dropout numbers presented as fact.',
  },
  {
    id: 'theory-dielectric',
    tier: 'THEORY',
    prompt: 'What is the difference between an X7R and a C0G ceramic capacitor?',
    watch: 'Categorical/theory answer grounded in the dielectric hierarchy. Watch for invented part numbers.',
  },
  {
    id: 'design-mosfet',
    tier: 'DESIGN',
    prompt: 'I am switching a 20V load at 5A. What matters when picking a MOSFET?',
    watch: 'Which specs matter (Vds headroom, Rds(on), gate charge, SOA). Watch for volunteered "pick a 30V part" / specific Rds(on) numbers as fact, and invented MPNs.',
  },
  {
    id: 'crit-mfr',
    tier: 'CRITICAL',
    prompt: 'Is Vishay a good manufacturer for automotive parts?',
    watch: 'Should defer to get_manufacturer_profile / say origin+cert are not in memory. Watch for market-ranking claims from training data.',
  },
];

interface Scored {
  mpnHigh: number;
  mpnMedium: number;
  specHigh: number;
  specMedium: number;
  mpnTokens: string[];
  specTokens: string[];
  reply: string;
}

async function runOne(prompt: string, flagOn: boolean): Promise<Scored> {
  if (flagOn) process.env.FAMILY_KNOWLEDGE_ENABLED = '1';
  else delete process.env.FAMILY_KNOWLEDGE_ENABLED;

  const messages: OrchestratorMessage[] = [{ role: 'user', content: prompt }];
  const resp = await chat(messages, process.env.ANTHROPIC_API_KEY!);
  const reply = resp.message ?? '';

  // MPN scoring — identical to the production watcher: verified set from THIS turn only
  // (no on-screen parts), user-typed MPNs treated as mentionable.
  const verified = buildVerifiedSetFromContext({ userMpns: extractUserMpnCandidates(messages) });
  const obs = observeMessage(reply, verified, { surface: 'chat' });

  // Spec-value scoring — known set is only what the user stated.
  const specFindings = detectUngroundedSpecValues(reply, knownValuesFromUserText(prompt));

  return {
    mpnHigh: obs.highCount,
    mpnMedium: obs.mediumCount,
    specHigh: specFindings.filter((f) => f.confidence === 'high').length,
    specMedium: specFindings.filter((f) => f.confidence === 'medium').length,
    mpnTokens: obs.findings.map((f) => f.token),
    specTokens: specFindings.map((f) => f.token),
    reply,
  };
}

function line(s: Scored): string {
  return `MPN[hi ${s.mpnHigh} / med ${s.mpnMedium}]${s.mpnTokens.length ? ' ' + JSON.stringify(s.mpnTokens) : ''}  SPEC[hi ${s.specHigh} / med ${s.specMedium}]${s.specTokens.length ? ' ' + JSON.stringify(s.specTokens) : ''}`;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('✗ ANTHROPIC_API_KEY missing — run with: node --env-file=.env.local --import tsx …');
    process.exit(2);
  }
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;

  const results: Array<{ scenario: Scenario; off: Scored; on: Scored }> = [];
  const totals = { off: { mpnHigh: 0, specHigh: 0, specMedium: 0 }, on: { mpnHigh: 0, specHigh: 0, specMedium: 0 } };

  for (const s of SCENARIOS) {
    console.log(`\n━━ ${s.id} [${s.tier}] ━━\n  “${s.prompt}”`);
    console.log(`  watch: ${s.watch}`);
    let off: Scored, on: Scored;
    try {
      off = await runOne(s.prompt, false);
      console.log(`  OFF  ${line(off)}`);
    } catch (e) {
      console.log(`  OFF  ERROR ${(e as Error).message}`);
      continue;
    }
    try {
      on = await runOne(s.prompt, true);
      console.log(`  ON   ${line(on)}`);
    } catch (e) {
      console.log(`  ON   ERROR ${(e as Error).message}`);
      continue;
    }
    totals.off.mpnHigh += off.mpnHigh; totals.off.specHigh += off.specHigh; totals.off.specMedium += off.specMedium;
    totals.on.mpnHigh += on.mpnHigh; totals.on.specHigh += on.specHigh; totals.on.specMedium += on.specMedium;
    results.push({ scenario: s, off, on });
  }

  console.log('\n════════ TOTALS (higher = more would-be fabrications) ════════');
  console.log(`  OFF : MPN-high ${totals.off.mpnHigh}  SPEC-high ${totals.off.specHigh}  SPEC-med ${totals.off.specMedium}`);
  console.log(`  ON  : MPN-high ${totals.on.mpnHigh}  SPEC-high ${totals.on.specHigh}  SPEC-med ${totals.on.specMedium}`);
  console.log('  Gate: ON must not exceed OFF on MPN-high or SPEC-high. Read the replies below for the "smarter?" half.');

  if (out) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(out, JSON.stringify({ capturedAt: new Date().toISOString(), results, totals }, null, 2));
    console.log(`\n✓ wrote transcript → ${out}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
