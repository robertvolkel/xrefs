/**
 * Composite "better than source" ranking (Decision #145).
 *
 * Given a candidate recommendation and the source part, computes a 0–100
 * composite score across four axes — Lifecycle, Compliance, Cost, Stock —
 * weighted by the list-level ReplacementPriorities config. Each per-axis
 * delta is in [0, 1] where 1 means the candidate is strictly better than
 * the source on that axis, 0 means equal-or-worse.
 *
 * Axis-by-axis rules:
 *   - Lifecycle: PartStatus tier difference, blended with riskRank when both present.
 *   - Compliance: count of certifications the candidate has that the source lacks,
 *     penalised if the candidate is missing any the source had.
 *   - Cost: relative price savings, clamped to [0, 1], missing prices → 0.
 *   - Stock: GATED — only active when source totalStock < LOW_STOCK_THRESHOLD.
 *     Rewards candidates proportionally to their stock when the source is scarce.
 *
 * Weights are derived from ReplacementPriorities.order positions: 4, 3, 2, 1.
 * Disabled axes (priorities.enabled[axis] === false) contribute weight 0.
 * A gated-off axis (stock, when source has plenty) contributes weight 0 per-rec.
 */

import type {
  PartAttributes,
  XrefRecommendation,
  ReplacementAxis,
  ReplacementPriorities,
  SupplierQuote,
  Part,
  PartStatus,
} from '@/lib/types';

/** Stock axis activates when source totalStock falls below this. */
export const LOW_STOCK_THRESHOLD = 100;

/** How many extra certifications saturate the compliance axis (delta = 1). */
const COMPLIANCE_SATURATION = 3;

/** Compliance penalty when candidate is missing a cert the source had. */
const COMPLIANCE_REGRESSION_PENALTY = 0.3;

/** Max expected riskRank (FindChips/parts.io convention: lower = safer). */
const RISK_RANK_SCALE = 10;

export interface CompositeScoreResult {
  /** 0–100 weighted composite. 0 when no enabled axis has data. */
  score: number;
  /** Per-axis deltas in [0, 1]. Omitted axes were either disabled or gated off. */
  axisDeltas: Partial<Record<ReplacementAxis, number>>;
  /** Enabled axes that contributed to the final score (excludes disabled + gated-off). */
  activeAxes: ReplacementAxis[];
}

/** Map PartStatus to numeric tier. Higher = healthier lifecycle. */
function lifecycleTier(status: PartStatus | undefined): number {
  switch (status) {
    case 'Active': return 4;
    case 'NRND': return 3;
    case 'LastTimeBuy': return 2;
    case 'Discontinued': return 1;
    case 'Obsolete': return 0;
    default: return 2; // neutral when unknown
  }
}

/** Reuse of the parts list column aggregation pattern (Math.min of positive unit prices). */
function bestPrice(quotes: SupplierQuote[] | undefined): number | undefined {
  if (!quotes || quotes.length === 0) return undefined;
  const prices = quotes
    .map(q => q.unitPrice)
    .filter((p): p is number => p != null && p > 0);
  return prices.length > 0 ? Math.min(...prices) : undefined;
}

/** Sum of quantityAvailable across all supplier quotes. */
function totalStock(quotes: SupplierQuote[] | undefined): number {
  if (!quotes || quotes.length === 0) return 0;
  return quotes.reduce((sum, q) => sum + (q.quantityAvailable ?? 0), 0);
}

function lifecycleDelta(src: Part, cand: Part): number {
  const srcTier = lifecycleTier(src.status);
  const candTier = lifecycleTier(cand.status);
  const tierDelta = Math.max(0, (candTier - srcTier) / 4);

  // Blend in riskRank when both present (lower = safer, so src - cand is the delta)
  const srcRisk = src.riskRank ?? src.lifecycleInfo?.[0]?.riskRank;
  const candRisk = cand.riskRank ?? cand.lifecycleInfo?.[0]?.riskRank;
  if (srcRisk != null && candRisk != null) {
    const riskDelta = Math.max(0, Math.min(1, (srcRisk - candRisk) / RISK_RANK_SCALE));
    return Math.max(0, Math.min(1, (tierDelta + riskDelta) / 2));
  }
  return Math.max(0, Math.min(1, tierDelta));
}

function hasRohs(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.toLowerCase();
  return s.includes('compliant') && !s.includes('non');
}

function hasReach(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.toLowerCase();
  return s.includes('compliant') && !s.includes('non');
}

function complianceDelta(src: Part, cand: Part): number {
  const srcCerts = new Set<string>();
  const candCerts = new Set<string>();
  if (hasRohs(src.rohsStatus)) srcCerts.add('rohs');
  if (hasRohs(cand.rohsStatus)) candCerts.add('rohs');
  if (hasReach(src.reachCompliance)) srcCerts.add('reach');
  if (hasReach(cand.reachCompliance)) candCerts.add('reach');
  for (const q of src.qualifications ?? []) srcCerts.add(`qual:${q.toLowerCase()}`);
  for (const q of cand.qualifications ?? []) candCerts.add(`qual:${q.toLowerCase()}`);

  let extras = 0;
  for (const c of candCerts) if (!srcCerts.has(c)) extras++;
  let regressions = 0;
  for (const c of srcCerts) if (!candCerts.has(c)) regressions++;

  const base = Math.min(1, extras / COMPLIANCE_SATURATION);
  if (regressions > 0) return Math.max(0, base - COMPLIANCE_REGRESSION_PENALTY);
  return base;
}

function costDelta(src: Part, cand: Part): number {
  const srcPrice = bestPrice(src.supplierQuotes) ?? src.unitPrice;
  const candPrice = bestPrice(cand.supplierQuotes) ?? cand.unitPrice;
  if (srcPrice == null || candPrice == null || srcPrice <= 0) return 0;
  const savings = (srcPrice - candPrice) / srcPrice;
  return Math.max(0, Math.min(1, savings));
}

/** Returns undefined when the axis is gated off (source has plenty of stock). */
function stockDelta(src: Part, cand: Part): number | undefined {
  const srcStock = totalStock(src.supplierQuotes) || src.quantityAvailable || 0;
  if (srcStock >= LOW_STOCK_THRESHOLD) return undefined;
  const candStock = totalStock(cand.supplierQuotes) || cand.quantityAvailable || 0;
  return Math.max(0, Math.min(1, candStock / LOW_STOCK_THRESHOLD));
}

export function computeCompositeScore(
  candidate: XrefRecommendation,
  source: PartAttributes,
  priorities: ReplacementPriorities,
): CompositeScoreResult {
  const src = source.part;
  const cand = candidate.part;

  // Compute raw deltas for every axis; stock may be undefined when gated off.
  const rawDeltas: Partial<Record<ReplacementAxis, number>> = {
    lifecycle: lifecycleDelta(src, cand),
    compliance: complianceDelta(src, cand),
    cost: costDelta(src, cand),
  };
  const stock = stockDelta(src, cand);
  if (stock !== undefined) rawDeltas.stock = stock;

  // Weight assignment from priorities.order positions: [4, 3, 2, 1].
  // Disabled axes → weight 0. Gated-off stock → weight 0 per-rec.
  const weightByPosition = [4, 3, 2, 1];
  const weights: Record<ReplacementAxis, number> = {
    lifecycle: 0, compliance: 0, cost: 0, stock: 0,
  };
  priorities.order.forEach((axis, idx) => {
    if (priorities.enabled[axis] && rawDeltas[axis] !== undefined) {
      weights[axis] = weightByPosition[idx] ?? 1;
    }
  });

  let totalWeight = 0;
  let earned = 0;
  const activeAxes: ReplacementAxis[] = [];
  const axisDeltas: Partial<Record<ReplacementAxis, number>> = {};
  for (const axis of priorities.order) {
    const w = weights[axis];
    if (w <= 0) continue;
    const d = rawDeltas[axis] ?? 0;
    totalWeight += w;
    earned += d * w;
    axisDeltas[axis] = d;
    activeAxes.push(axis);
  }

  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;
  return { score, axisDeltas, activeAxes };
}
