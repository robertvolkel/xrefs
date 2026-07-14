import type { LogicTable, SearchConstraint } from '../types';
import { resolveAttributeId, toBaseSI, leadingMagnitudeToBaseSI } from './searchConstraints';
import { ruleCanCompare } from './matchingEngine';
import type { PartAttributes } from '../types';

/**
 * STATED BANDS — the numeric range a user actually asked for.
 *
 * Why this exists at all. The matching engine scores a candidate against a SOURCE PART, and for
 * some specs its honest verdict is "these two differ; a human should look" (`application_review`)
 * or "this is non-electrical" (`operational`). Those evaluators never compare the two values —
 * which is CORRECT for a cross-reference. Swapping a BC847B for a BC847C changes the gain from
 * 200 to 420, and higher gain is usually fine but occasionally isn't: a human should look.
 *
 * A SEARCH is a different question. "I need an NPN with hFE 200-400" is not a request for a
 * human's opinion — it is a requirement, and a 420-gain part does not meet it. Under the engine
 * alone every candidate scores an identical 50% on gain, so BC847A (110), BC847B (200) and
 * BC847C (420) are indistinguishable and the right part sinks into the pile. That is the bug.
 *
 * The fix is NOT to retype the rule. Retyping `hfe` to a hard comparison would make the SEARCH
 * work and simultaneously start FAILING legitimate cross-references — trading a search bug for a
 * cross-ref bug. Instead the search path compares stated bands itself, here, and the engine keeps
 * its (correct) cross-ref semantics untouched. Nothing in this file runs on a cross-reference.
 *
 * TWO RULES KEEP THIS HONEST, and both are load-bearing:
 *
 *  1. ONLY EXPLICIT BANDS. A range ("200-400"), or a min/max-labelled bound. A bare single value
 *     is NOT a band, because its DIRECTION is unknowable: "gain 200" means *at least* 200, while
 *     "parasitic inductance 2nH" means *at most* 2nH — and nothing in the data says which. The
 *     last time this codebase guessed a direction it banded a "2 mA circuit" to parts *rated*
 *     2-20 mA and excluded every ordinary transistor ever made. We do not guess. A bare value on
 *     an uncomparable rule stays uncompared (exactly as today — no regression), and the gap is
 *     recorded in BACKLOG rather than papered over with an invented default.
 *
 *  2. ONLY RULES THE ENGINE CANNOT COMPARE. Applying a band to a `threshold` rule would
 *     re-introduce the bug above from the other direction — the engine correctly passes a 100 V
 *     part for a 12 V ask, and a band would fail it. The engine owns every rule it can compare;
 *     this file owns only the ones it structurally cannot (`ruleCanCompare` is the one boundary).
 */

/** A numeric requirement the user stated explicitly, in base SI. `hi` may be Infinity. */
export interface StatedBand {
  attributeId: string;
  lo: number;
  hi: number;
  /** The user's own words ("200-400"), for explaining a miss. */
  stated: string;
}

const RANGE_RE = /(-?\d[\d.]*)\s*(?:-|–|~|to)\s*(-?\d[\d.]*)/i;

/** Inclusive ± margin applied ONLY when widening a band for the catalog FETCH, so a boundary
 *  part survives the net. NEVER applied when checking a violation: with a 15% margin a stated
 *  200-400 would stretch to 460 and the 420-gain part we are trying to exclude would pass. */
const FETCH_BAND_MARGIN = 0.15;

/**
 * Turn raw constraints into the explicit numeric bands the user asked for, keyed by attributeId.
 *
 * Handles the several ways a bound arrives, because the extractor labels them inconsistently:
 *   "200-400" / "200 to 400" / "200~400"   → two-sided
 *   `hfe_min` = 200  +  `hfe_max` = 400    → two-sided (underscore labels included: `\b` does
 *                                            not break between `_` and a letter, so a naive
 *                                            word-boundary test misses `hFE_max` entirely)
 *   `current min` = 1                      → [1, ∞)
 *   `current max` = 5                      → (-∞, 5]
 *   two plain values for the same attr     → two-sided (an implicit range)
 *   ONE plain value                        → NOT A BAND (see rule 1 above)
 */
export function parseStatedBands(
  constraints: SearchConstraint[] | undefined,
  logicTable: LogicTable,
): Map<string, StatedBand> {
  const out = new Map<string, StatedBand>();
  if (!constraints || constraints.length === 0) return out;

  type Acc = { mins: number[]; maxs: number[]; plains: number[]; stated: string[] };
  const acc = new Map<string, Acc>();

  for (const c of constraints) {
    const rawValue = (typeof c.value === 'number' ? String(c.value) : c.value ?? '').trim();
    if (!rawValue || !/\d/.test(rawValue)) continue; // numeric constraints only
    const unit = c.unit?.trim() || undefined;

    // ⚠️ "max" IN AN ATTRIBUTE'S NAME IS NOT A BOUND LABEL. Half the specs in this codebase are
    // *called* `vceo_max`, `vds_max`, `ic_max` — because the spec IS the part's maximum RATING.
    // A user asking for "9 V" means "rated for at LEAST 9 V"; reading the `_max` in the spec's own
    // name as "at MOST 9 V" bands the catalog to parts rated ≤ 9 V and throws away every ordinary
    // transistor — which is, precisely, the bug that started all of this, coming back through a
    // different door. (It did exactly this in a live run before being caught.)
    //
    // So: resolve the attribute AS GIVEN first. If it names a real spec, the min/max is part of
    // that name and there is NO bound label. Only when it doesn't resolve do we strip a min/max —
    // because then the word can only have been a bound the extractor added (`hfe_min`, `hfe_max`,
    // "drain current min"), which is the one case where it really is a one-sided bound.
    const direct = resolveAttributeId(c.attribute, logicTable);
    let attrId: string | null;
    let isMin = false;
    let isMax = false;
    if (direct) {
      attrId = direct;
    } else {
      const normAttr = c.attribute.replace(/[_-]+/g, ' '); // `\b` does not break before `_`
      isMin = /\bmin(imum)?\b/i.test(normAttr);
      isMax = /\bmax(imum)?\b/i.test(normAttr);
      const term = normAttr.replace(/\b(min|max|minimum|maximum)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      attrId = term ? resolveAttributeId(term, logicTable) : null;
    }
    if (!attrId) continue;

    const e = acc.get(attrId) ?? { mins: [], maxs: [], plains: [], stated: [] };
    e.stated.push(unit ? `${rawValue}${unit}` : rawValue);
    const m = rawValue.match(RANGE_RE);
    if (m) {
      const a = toBaseSI(m[1], unit);
      const b = toBaseSI(m[2], unit);
      if (a != null && b != null) { e.mins.push(Math.min(a, b)); e.maxs.push(Math.max(a, b)); }
    } else {
      const v = toBaseSI(rawValue, unit);
      if (v != null) {
        if (isMin) e.mins.push(v);
        else if (isMax) e.maxs.push(v);
        else e.plains.push(v);
      }
    }
    acc.set(attrId, e);
  }

  for (const [attributeId, e] of acc) {
    const explicitLo = e.mins.length ? Math.min(...e.mins) : undefined;
    const explicitHi = e.maxs.length ? Math.max(...e.maxs) : undefined;
    let lo: number | undefined;
    let hi: number | undefined;

    if (explicitLo != null && explicitHi != null) { lo = explicitLo; hi = explicitHi; }
    else if (explicitLo != null) { lo = explicitLo; hi = Infinity; }
    else if (explicitHi != null) { lo = -Infinity; hi = explicitHi; }
    else if (e.plains.length >= 2) { lo = Math.min(...e.plains); hi = Math.max(...e.plains); }
    else continue; // one plain value → direction unknowable → NOT a band (rule 1)

    if (lo == null || hi == null || Number.isNaN(lo) || Number.isNaN(hi) || hi < lo) continue;
    out.set(attributeId, { attributeId, lo, hi, stated: e.stated.join(', ') });
  }
  return out;
}

/** Widen a band OUTWARD for the catalog fetch (a relevance NET — precision comes later, from
 *  `countStatedBandViolations`). Sign-agnostic: subtracting |bound| × margin always pushes `lo`
 *  DOWN, where a multiplicative `lo * 0.85` would push a NEGATIVE bound *toward* zero and
 *  narrow the band (dropping the -40°C parts from a -40..125 ask). Infinite bounds stay infinite. */
export function widenBandForFetch(band: StatedBand, margin = FETCH_BAND_MARGIN): { lo: number; hi: number } {
  const lo = Number.isFinite(band.lo) ? band.lo - Math.abs(band.lo) * margin : band.lo;
  const hi = Number.isFinite(band.hi) ? band.hi + Math.abs(band.hi) * margin : band.hi;
  return { lo, hi };
}

/**
 * How many of the user's stated bands this candidate VIOLATES — the search-only mismatch count
 * for specs the engine cannot compare (rule 2). A candidate that simply has no value for the
 * spec violates NOTHING: missing data never rejects a part (the engine's own invariant, and the
 * reason 40% of a real BJT pool — which carries no gain figure at all — stays visible).
 */
export function countStatedBandViolations(
  bands: Map<string, StatedBand>,
  logicTable: LogicTable,
  candidate: PartAttributes,
): number {
  if (bands.size === 0) return 0;
  const ruleById = new Map(logicTable.rules.map(r => [r.attributeId, r]));
  let violations = 0;
  for (const [attributeId, band] of bands) {
    const rule = ruleById.get(attributeId);
    if (ruleCanCompare(rule)) continue; // the engine already scored it — do not second-guess it
    const raw = candidate.parameters.find(p => p.parameterId === attributeId)?.value;
    if (!raw) continue;                 // missing data never rejects
    // The value STRING, never numericValue — for gain that field holds the TEST CONDITION.
    const n = leadingMagnitudeToBaseSI(String(raw));
    if (n == null) continue;
    if (n < band.lo || n > band.hi) violations++;
  }
  return violations;
}
