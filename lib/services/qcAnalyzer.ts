import { createClient } from '@/lib/supabase/server';
import { getLogicTable } from '@/lib/logicTables';
import type {
  QcAnalysisInput,
  QcAnalysisExample,
  FamilyAggregateStats,
  RuleAggregateStats,
  FeedbackStatus,
  XrefRecommendation,
  MatchDetail,
  MatchingRule,
} from '@/lib/types';

// ── Helpers ──

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function bucketLabel(pct: number): string {
  if (pct < 20) return '0-20';
  if (pct < 40) return '20-40';
  if (pct < 60) return '40-60';
  if (pct < 80) return '60-80';
  return '80-100';
}

interface RuleAccumulator {
  attributeId: string;
  attributeName: string;
  totalEvaluations: number;
  passCount: number;
  failCount: number;
  reviewCount: number;
  upgradeCount: number;
  missingCount: number;
  earnedWeightSum: number;
}

// ── Main aggregation function ──

export async function aggregateQcStats(params: {
  days?: number;
  requestSource?: string;
  familyId?: string;
  hasFeedback?: boolean;
  search?: string;
}): Promise<QcAnalysisInput> {
  const days = params.days ?? 30;
  const supabase = await createClient();

  // Date filter
  const fromDate = new Date();
  if (days > 0) {
    fromDate.setDate(fromDate.getDate() - days);
  } else {
    fromDate.setFullYear(2020); // "all time"
  }
  const fromIso = fromDate.toISOString();

  // Build query
  let query = supabase
    .from('recommendation_log')
    .select('id, family_id, family_name, recommendation_count, request_source, data_source, snapshot, created_at')
    .gte('created_at', fromIso)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (params.requestSource) query = query.eq('request_source', params.requestSource);
  if (params.familyId) query = query.eq('family_id', params.familyId);

  // Search (simplified — no profile pre-query for analysis, just MPN/family)
  if (params.search) {
    query = query.or(
      `source_mpn.ilike.%${params.search}%,family_name.ilike.%${params.search}%`
    );
  }

  const { data: logs, error } = await query;
  if (error) throw new Error(`Failed to query logs: ${error.message}`);
  if (!logs || logs.length === 0) {
    return {
      dateRange: { from: fromIso, to: new Date().toISOString() },
      totalLogs: 0,
      totalFeedback: 0,
      byDataSource: {},
      byRequestSource: {},
      families: [],
      representativeExamples: [],
    };
  }

  // Optionally filter to only logs with feedback
  let filteredLogs = logs;
  let feedbackByLogId = new Map<string, { count: number; status: FeedbackStatus; comment?: string }>();

  // Get feedback data for all logs
  const logIds = logs.map((l: Record<string, unknown>) => l.id as string);
  let totalFeedback = 0;

  for (let i = 0; i < logIds.length; i += 500) {
    const batch = logIds.slice(i, i + 500);
    const { data: fbData } = await supabase
      .from('qc_feedback')
      .select('log_id, status, user_comment')
      .in('log_id', batch);
    if (fbData) {
      for (const fb of fbData) {
        totalFeedback++;
        const id = fb.log_id as string;
        const existing = feedbackByLogId.get(id);
        if (!existing) {
          feedbackByLogId.set(id, {
            count: 1,
            status: fb.status as FeedbackStatus,
            comment: fb.user_comment as string | undefined,
          });
        } else {
          existing.count++;
        }
      }
    }
  }

  if (params.hasFeedback) {
    filteredLogs = filteredLogs.filter(
      (l: Record<string, unknown>) => feedbackByLogId.has(l.id as string)
    );
  }

  // Group by data source and request source
  const byDataSource: Record<string, number> = {};
  const byRequestSource: Record<string, number> = {};

  for (const log of filteredLogs) {
    const ds = (log as Record<string, unknown>).data_source as string || 'unknown';
    const rs = (log as Record<string, unknown>).request_source as string || 'unknown';
    byDataSource[ds] = (byDataSource[ds] ?? 0) + 1;
    byRequestSource[rs] = (byRequestSource[rs] ?? 0) + 1;
  }

  // Group logs by family
  const familyGroups = new Map<string, Array<Record<string, unknown>>>();
  for (const log of filteredLogs) {
    const row = log as Record<string, unknown>;
    const familyId = (row.family_id as string) || 'unknown';
    if (!familyGroups.has(familyId)) familyGroups.set(familyId, []);
    familyGroups.get(familyId)!.push(row);
  }

  // Build per-family stats
  const families: FamilyAggregateStats[] = [];
  const representativeExamples: QcAnalysisExample[] = [];

  for (const [familyId, familyLogs] of familyGroups) {
    const familyName = (familyLogs[0].family_name as string) || familyId;

    // Get logic table for weight/logicType lookup
    const logicTable = getLogicTable(familyId);
    const ruleMap = new Map<string, MatchingRule>();
    if (logicTable) {
      for (const rule of logicTable.rules) {
        ruleMap.set(rule.attributeId, rule);
      }
    }

    // Collect match percentages from top recommendation
    const matchPercentages: number[] = [];
    const distribution: Record<string, number> = {
      '0-20': 0, '20-40': 0, '40-60': 0, '60-80': 0, '80-100': 0,
    };
    let recCountSum = 0;

    // Rule accumulators
    const ruleAccumulators = new Map<string, RuleAccumulator>();

    // Feedback counts for this family
    let familyFeedbackCount = 0;
    const familyFeedbackByStatus: Record<FeedbackStatus, number> = {
      open: 0, reviewed: 0, resolved: 0, dismissed: 0,
    };

    // Track worst-scoring log for representative examples
    let worstLog: { mpn: string; matchPct: number; failingRules: QcAnalysisExample['failingRules'] } | null = null;
    let feedbackLog: QcAnalysisExample | null = null;

    for (const row of familyLogs) {
      const snapshot = row.snapshot as { recommendations?: XrefRecommendation[] } | undefined;
      const recs = snapshot?.recommendations ?? [];
      recCountSum += row.recommendation_count as number;

      // Track feedback
      const fb = feedbackByLogId.get(row.id as string);
      if (fb) {
        familyFeedbackCount += fb.count;
        familyFeedbackByStatus[fb.status]++;
      }

      if (recs.length === 0) continue;

      // Top recommendation stats
      const topRec = recs[0];
      const pct = topRec.matchPercentage ?? 0;
      matchPercentages.push(pct);
      distribution[bucketLabel(pct)]++;

      // Iterate ALL recommendations' matchDetails for rule-level stats
      for (const rec of recs) {
        if (!rec.matchDetails) continue;
        for (const detail of rec.matchDetails as MatchDetail[]) {
          const key = detail.parameterId;
          if (!ruleAccumulators.has(key)) {
            ruleAccumulators.set(key, {
              attributeId: detail.parameterId,
              attributeName: detail.parameterName,
              totalEvaluations: 0,
              passCount: 0,
              failCount: 0,
              reviewCount: 0,
              upgradeCount: 0,
              missingCount: 0,
              earnedWeightSum: 0,
            });
          }
          const acc = ruleAccumulators.get(key)!;
          acc.totalEvaluations++;

          switch (detail.ruleResult) {
            case 'pass': acc.passCount++; break;
            case 'fail': acc.failCount++; break;
            case 'review': acc.reviewCount++; break;
            case 'upgrade': acc.upgradeCount++; break;
          }

          // Detect missing replacement data
          if (!detail.replacementValue || detail.replacementValue === '-' || detail.replacementValue === '—') {
            acc.missingCount++;
          }

          // Compute earned weight from logic table
          const rule = ruleMap.get(key);
          if (rule) {
            const weight = rule.weight;
            if (detail.ruleResult === 'pass' || detail.ruleResult === 'upgrade') {
              acc.earnedWeightSum += weight;
            } else if (detail.ruleResult === 'review') {
              acc.earnedWeightSum += weight * 0.5;
            }
            // fail = 0 earned
          }
        }
      }

      // Track worst-scoring log
      const topFailingRules = (topRec.matchDetails ?? [])
        .filter((d: MatchDetail) => d.ruleResult === 'fail')
        .map((d: MatchDetail) => ({
          attributeName: d.parameterName,
          sourceValue: d.sourceValue,
          replacementValue: d.replacementValue,
        }));

      if (!worstLog || pct < worstLog.matchPct) {
        worstLog = {
          mpn: (row as Record<string, unknown>).source_mpn as string ?? 'unknown',
          matchPct: pct,
          failingRules: topFailingRules,
        };
      }

      // Track a feedback example
      if (fb && !feedbackLog) {
        feedbackLog = {
          sourceMpn: (row as Record<string, unknown>).source_mpn as string ?? 'unknown',
          familyName,
          matchPercentage: pct,
          failingRules: topFailingRules,
          feedbackComment: fb.comment,
        };
      }
    }

    // Build rule stats
    const ruleStats: RuleAggregateStats[] = [];
    for (const acc of ruleAccumulators.values()) {
      const rule = ruleMap.get(acc.attributeId);
      ruleStats.push({
        attributeId: acc.attributeId,
        attributeName: acc.attributeName,
        logicType: rule?.logicType ?? 'unknown',
        weight: rule?.weight ?? 0,
        totalEvaluations: acc.totalEvaluations,
        passCount: acc.passCount,
        failCount: acc.failCount,
        reviewCount: acc.reviewCount,
        upgradeCount: acc.upgradeCount,
        missingCount: acc.missingCount,
        avgEarnedWeight: acc.totalEvaluations > 0
          ? Number((acc.earnedWeightSum / acc.totalEvaluations).toFixed(2))
          : 0,
        failRate: acc.totalEvaluations > 0
          ? Number((acc.failCount / acc.totalEvaluations).toFixed(3))
          : 0,
      });
    }

    // Sort by fail rate desc for top failing
    const sortedByFail = [...ruleStats]
      .filter(r => r.failCount > 0)
      .sort((a, b) => b.failRate - a.failRate);

    // Sort by missing rate desc
    const sortedByMissing = [...ruleStats]
      .filter(r => r.missingCount > 0)
      .sort((a, b) => (b.missingCount / b.totalEvaluations) - (a.missingCount / a.totalEvaluations));

    families.push({
      familyId,
      familyName,
      logCount: familyLogs.length,
      avgMatchPercentage: matchPercentages.length > 0
        ? Number((matchPercentages.reduce((a, b) => a + b, 0) / matchPercentages.length).toFixed(1))
        : 0,
      medianMatchPercentage: Number(median(matchPercentages).toFixed(1)),
      matchDistribution: Object.entries(distribution).map(([bucket, count]) => ({ bucket, count })),
      avgRecommendationCount: familyLogs.length > 0
        ? Number((recCountSum / familyLogs.length).toFixed(1))
        : 0,
      ruleStats,
      feedbackCount: familyFeedbackCount,
      feedbackByStatus: familyFeedbackByStatus,
      topFailingRules: sortedByFail.slice(0, 5).map(r => ({
        attributeName: r.attributeName,
        failRate: r.failRate,
        failCount: r.failCount,
      })),
      missingAttributeFrequency: sortedByMissing.slice(0, 5).map(r => ({
        attributeName: r.attributeName,
        missingRate: Number((r.missingCount / r.totalEvaluations).toFixed(3)),
        count: r.missingCount,
      })),
    });

    // Add representative examples
    if (worstLog && representativeExamples.length < 5) {
      representativeExamples.push({
        sourceMpn: worstLog.mpn,
        familyName,
        matchPercentage: worstLog.matchPct,
        failingRules: worstLog.failingRules,
      });
    }
    if (feedbackLog && representativeExamples.length < 5) {
      representativeExamples.push(feedbackLog);
    }
  }

  // Sort families by log count desc
  families.sort((a, b) => b.logCount - a.logCount);

  return {
    dateRange: { from: fromIso, to: new Date().toISOString() },
    totalLogs: filteredLogs.length,
    totalFeedback,
    byDataSource,
    byRequestSource,
    families,
    representativeExamples: representativeExamples.slice(0, 5),
  };
}
