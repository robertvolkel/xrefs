import { detectFilterIntent, detectSearchStatusRefinement } from '@/lib/services/filterIntentDetector';
import type { XrefRecommendation } from '@/lib/types';

const rec = (mpn: string, manufacturer = 'Vishay'): XrefRecommendation => ({
  part: {
    mpn, manufacturer, description: mpn, detailedDescription: mpn,
    category: 'Transistors', subcategory: 'BJT', status: 'Active',
  },
  matchPercentage: 90,
  matchDetails: [],
});
const recs = [rec('A'), rec('B')];
const statuses = (q: string) => detectFilterIntent(q, recs)?.filterInput.exclude_statuses;

/**
 * Guard rails for the lifecycle-status detector. Every case here is a real defect
 * that shipped in the first cut of this feature: the detector tested "is there a cue
 * ANYWHERE?" and "is there a status word ANYWHERE?" independently, so it fired on
 * questions, on electronics jargon, and on requests that were about something else
 * entirely. Recognition is now CUE-ADJACENT — a status word only counts when a cue
 * governs it directly.
 */
describe('status detector — must NOT fire on electronics jargon', () => {
  // "dead time" is a gate-driver spec. This used to return ['Active'] — i.e. it hid
  // EVERY ACTIVE PART and left only the dead ones, on a plain parametric question.
  it('"dead time" is a spec, not a lifecycle word', () => {
    expect(statuses('show me parts with 100ns dead time')).toBeUndefined();
    expect(statuses('hide parts with dead time over 50ns')).toBeUndefined();
  });

  // "active low"/"active high"/"active filter" are pin and circuit descriptions.
  // These used to hide every non-Active part.
  it('"active low" / "active high" / "active filter" are specs, not lifecycle words', () => {
    expect(statuses('show me parts with active low enable')).toBeUndefined();
    expect(statuses('show me an active filter')).toBeUndefined();
    expect(statuses('only active-high reset parts')).toBeUndefined();
  });
});

describe('status detector — must NOT hijack a different request', () => {
  // Used to return {exclude_statuses:['Discontinued']} — hiding every discontinued
  // part regardless of maker, and never applying the Vishay filter the user asked for.
  it('a status word mentioned in passing does not steal a manufacturer filter', () => {
    const intent = detectFilterIntent('hide the Vishay ones, they are discontinued anyway', recs);
    expect(intent?.filterInput.exclude_statuses).toBeUndefined();
    expect(intent?.filterInput.manufacturer_filter).toBe('Vishay');
  });

  it('a question is not a filter', () => {
    expect(statuses('can you show me if any are discontinued?')).toBeUndefined();
    expect(statuses('is this part discontinued?')).toBeUndefined();
    expect(statuses('which of these are obsolete')).toBeUndefined();
  });
});

describe('status detector — must not hide what the user asked to KEEP', () => {
  // Used to return ['Discontinued','Active'] — the "not active" clause meant "not the
  // ACTIVE ones", and the detector read it as "also hide Active".
  it('"exclude discontinued, not active" never hides Active', () => {
    expect(statuses('exclude discontinued, not active')).toEqual(['Discontinued']);
  });

  it('"show the active ones but drop discontinued" hides only Discontinued', () => {
    expect(statuses('show me the active ones but drop discontinued')).toEqual(['Discontinued']);
  });

  it('a STRONG cue may still target Active explicitly', () => {
    expect(statuses('hide active parts')).toEqual(['Active']);
  });
});

describe('status detector — phrasings that MUST be caught', () => {
  it('the reported phrasing', () => {
    expect(statuses("don't show me discontinued parts")).toEqual(['Discontinued']);
  });

  // Previously fell through to the LLM entirely — the cue could not reach across
  // "parts that are" to the status word.
  it('"remove parts that are no longer active" — the natural hide-the-dead phrasing', () => {
    expect(statuses('remove parts that are no longer active')?.sort())
      .toEqual(['Discontinued', 'LastTimeBuy', 'NRND', 'Obsolete']);
  });

  it('cue reaches the status across filler words', () => {
    expect(statuses('remove parts that are discontinued')).toEqual(['Discontinued']);
    expect(statuses('hide all the obsolete ones')).toEqual(['Obsolete']);
  });

  it('weak cues still work when they sit on the status', () => {
    expect(statuses('show me parts that are not discontinued')).toEqual(['Discontinued']);
  });

  it('chains still union', () => {
    expect(statuses('hide obsolete and discontinued parts')?.sort())
      .toEqual(['Discontinued', 'Obsolete']);
  });
});

describe('detectSearchStatusRefinement — same guards on the search-card path', () => {
  it('does not fire on a dead-time spec query', () => {
    expect(detectSearchStatusRefinement('show me parts with dead time under 100ns')).toBeNull();
  });

  it('does not fire on an active-low spec query', () => {
    expect(detectSearchStatusRefinement('show me parts with active low enable')).toBeNull();
  });

  it('still fires on the real request', () => {
    expect(detectSearchStatusRefinement("don't show me discontinued parts"))
      .toEqual({ input: { exclude_statuses: ['Discontinued'] }, label: 'hiding Discontinued' });
  });
});
