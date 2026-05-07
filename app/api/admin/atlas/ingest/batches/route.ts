/**
 * GET /api/admin/atlas/ingest/batches
 *
 * Query params:
 *   status:    pending | applied | reverted | expired (default: pending) — filters the
 *              `batches` list shown in the Ingest panel. Does NOT affect the
 *              `unmappedParamsGlobal` aggregation (see below).
 *   risk:      clean | review | attention (optional) — applied to `batches` filter
 *   limit:     number (default: 500)
 *   batch:     batch_id (optional) — when set, restricts BOTH `batches` and the
 *              unmapped-params aggregation to a single batch. Used by the
 *              "Review in Dictionary Triage →" deep link from a batch card.
 *   include:   synonyms | auto_flagged | all (default: synonyms) — filters the
 *              unmapped-params queue by effective triage classification.
 *              `synonyms` = the synonym-mapping workflow (default). Excludes
 *                rows auto-detected or confirmed as wrong_family.
 *              `auto_flagged` = registry-detected misclassifications + any
 *                row engineer-set to status='wrong_family'. Used by the
 *                "Auto-flagged misclassifications" view in TriageFilterBar.
 *              `all` = everything; classification visible per row via
 *                autoFlag + noteStatus.
 *
 * Returns the batch list along with aggregate dashboard counters, a
 * deduplicated global unmapped-params table, and triageCounts so the UI
 * can render bucket badges without re-querying.
 *
 * The unmapped-params queue is INDEPENDENTLY scoped:
 *   - Includes both pending AND applied batches (the JSONB report.unmappedParams
 *     survives apply; previously we filtered them out by inheriting the status
 *     filter on the batch list query, which made the "queue" disappear after
 *     Proceed). Decision-derived: persistent queue across batch lifecycle.
 *   - Excludes params that already have an active dictionary override for the
 *     row's dominant family — those are de-facto resolved (next regenerate
 *     would map them) and shouldn't clutter the engineer's queue.
 *   - Each row carries `affectedManufacturers: Array<{slug, name, productCount}>`
 *     so the engineer sees provenance, not just an opaque count.
 *   - Foreign-family auto-flag (autoFlag field) is computed in-band per render
 *     against atlasFamilyParamSignatures.ts. Engineer Confirm/Revert actions
 *     persist status to atlas_unmapped_param_notes; persisted status takes
 *     precedence over the live registry hit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveAdminNames } from '@/lib/services/overrideHistoryHelper';
import type { IngestBatch, IngestRisk, IngestStatus } from '@/lib/services/atlasIngestService';
import { detectForeignFamily } from '@/lib/services/atlasFamilyParamSignatures';

const VALID_STATUSES: IngestStatus[] = ['pending', 'applied', 'reverted', 'expired'];
const VALID_RISKS: IngestRisk[] = ['clean', 'review', 'attention'];
const VALID_INCLUDE = new Set(['synonyms', 'auto_flagged', 'all']);
type IncludeMode = 'synonyms' | 'auto_flagged' | 'all';
const VALID_STATUS_FILTER = new Set(['open', 'accepted', 'undone', 'all']);
type StatusFilter = 'open' | 'accepted' | 'undone' | 'all';

/** Slugify a manufacturer display name as a fallback when we can't resolve the
 *  canonical slug from atlas_manufacturers (e.g. row never registered there). */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const statusParam = (searchParams.get('status') ?? 'pending') as IngestStatus;
    const riskParam = searchParams.get('risk') as IngestRisk | null;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10) || 500, 5000);
    const batchFilter = searchParams.get('batch');
    const includeRaw = (searchParams.get('include') ?? 'synonyms');
    const include: IncludeMode = VALID_INCLUDE.has(includeRaw) ? (includeRaw as IncludeMode) : 'synonyms';
    const statusFilterRaw = (searchParams.get('status_filter') ?? 'open');
    const statusFilter: StatusFilter = VALID_STATUS_FILTER.has(statusFilterRaw) ? (statusFilterRaw as StatusFilter) : 'open';

    if (!VALID_STATUSES.includes(statusParam)) {
      return NextResponse.json({ success: false, error: `Invalid status: ${statusParam}` }, { status: 400 });
    }
    if (riskParam && !VALID_RISKS.includes(riskParam)) {
      return NextResponse.json({ success: false, error: `Invalid risk: ${riskParam}` }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ── Batch list (status-filtered, for the Ingest panel) ─────────────────
    let batchListQuery = supabase
      .from('atlas_ingest_batches')
      .select('*')
      .eq('status', statusParam)
      .order('risk', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (riskParam) batchListQuery = batchListQuery.eq('risk', riskParam);
    if (batchFilter) batchListQuery = batchListQuery.eq('batch_id', batchFilter);

    const { data: batchListData, error: batchListErr } = await batchListQuery;
    if (batchListErr) throw new Error(batchListErr.message);
    const batches = (batchListData ?? []) as IngestBatch[];

    // ── Unmapped-params source (pending + applied, for the persistent queue) ──
    // Independent of statusParam: the queue spans all batches whose unmapped
    // params haven't been resolved yet, regardless of whether the batch itself
    // is still pending or already applied.
    // Projection: pull only the JSONB slices we actually need for aggregation
    // (unmappedParams + familyCounts), not the full report. Reports include the
    // per-product diff which can run multi-MB for large batches; selecting the
    // sub-paths cuts the wire payload ~80% and parse cost proportionally.
    let queueSourceQuery = supabase
      .from('atlas_ingest_batches')
      .select('batch_id, manufacturer, status, unmappedParams:report->unmappedParams, familyCounts:report->familyCounts, categoryCounts:report->categoryCounts')
      .in('status', ['pending', 'applied'])
      .limit(5000);
    if (batchFilter) queueSourceQuery = queueSourceQuery.eq('batch_id', batchFilter);
    const { data: queueSourceData, error: queueSourceErr } = await queueSourceQuery;
    if (queueSourceErr) throw new Error(queueSourceErr.message);
    const queueSourceBatches = (queueSourceData ?? []) as Array<{
      batch_id: string;
      manufacturer: string;
      status: IngestStatus;
      unmappedParams: Array<{
        paramName: string;
        sampleValues: string[];
        productCount: number;
        attributeId: string;
        kind: 'gaia' | 'standard';
        // Per-param family/category breakdown (mjs ingest emits this since the
        // dominantFamily-attribution fix). Counts the products carrying THIS
        // specific param, not the batch as a whole. Older batches predate the
        // field; falls through to undefined and the route uses the legacy
        // batch-level approximation as fallback.
        familyCounts?: Record<string, number>;
        categoryCounts?: Record<string, number>;
      }> | null;
      familyCounts: Record<string, number> | null;
      // Optional — older batches predate the L2-triage feature and don't
      // carry categoryCounts. Falls through to undefined → empty object,
      // which leaves dominantCategory null (same as today's behavior).
      categoryCounts?: Record<string, number> | null;
    }>;

    // ── Dictionary overrides (active + inactive, with metadata) ─────────────
    // Service-role client — requireAdmin() upstream is the gate (Decision #176).
    // We carry full metadata so the route can ANNOTATE rows with their accept
    // state instead of dropping them. This is what powers the inline accept
    // audit + revert in the Triage queue (Open / Accepted / Undone status filter).
    type OverrideMeta = {
      id: string;
      familyId: string;
      paramName: string;
      attributeId: string;
      attributeName: string;
      unit: string | null;
      createdBy: string;
      createdAt: string;
      updatedAt: string;
      isActive: boolean;
    };
    const activeOverrideMap = new Map<string, OverrideMeta>();
    const inactiveOverrideMap = new Map<string, OverrideMeta>();
    try {
      const { data: overrideData, error: ovErr } = await supabase
        .from('atlas_dictionary_overrides')
        .select('id, family_id, param_name, attribute_id, attribute_name, unit, created_by, created_at, updated_at, is_active')
        .order('updated_at', { ascending: false });
      if (!ovErr) {
        for (const o of overrideData ?? []) {
          const meta: OverrideMeta = {
            id: o.id as string,
            familyId: o.family_id as string,
            paramName: o.param_name as string,
            attributeId: (o.attribute_id as string) ?? '',
            attributeName: (o.attribute_name as string) ?? '',
            unit: (o.unit as string | null) ?? null,
            createdBy: o.created_by as string,
            createdAt: o.created_at as string,
            updatedAt: o.updated_at as string,
            isActive: o.is_active as boolean,
          };
          const key = `${meta.familyId}:${meta.paramName}`;
          if (meta.isActive) {
            // Active wins; only store first (most-recent by updated_at).
            if (!activeOverrideMap.has(key)) activeOverrideMap.set(key, meta);
          } else {
            // Most-recent inactive per key — surface the latest revert.
            if (!inactiveOverrideMap.has(key)) inactiveOverrideMap.set(key, meta);
          }
        }
      }
    } catch {
      // Table missing or transient failure — fail open (no annotations).
    }

    // Resolve admin display names for every override author once.
    const overrideAuthorIds = [
      ...activeOverrideMap.values(),
      ...inactiveOverrideMap.values(),
    ].map((m) => m.createdBy);
    const overrideAuthorNames = await resolveAdminNames(overrideAuthorIds);

    // ── Per-paramName triage status from atlas_unmapped_param_notes ─────────
    // The notes table carries a status enum that overrides the registry's
    // auto-detection: 'wrong_family' = confirmed misclassification (whether
    // auto-flagged then Confirmed by an engineer, or set manually);
    // 'confirmed_in_family' = engineer rejected an auto-flag, suppress the
    // registry hit for this paramName even if it matches a signature.
    const noteStatusByParam = new Map<string, {
      status: 'wrong_family' | 'confirmed_in_family' | null;
      flaggedBy: 'auto' | 'engineer' | null;
      autoDiagnosis: Record<string, unknown> | null;
    }>();
    try {
      const { data: notesData, error: notesErr } = await supabase
        .from('atlas_unmapped_param_notes')
        .select('param_name, status, flagged_by, auto_diagnosis')
        .not('status', 'is', null);
      if (!notesErr) {
        for (const row of notesData ?? []) {
          noteStatusByParam.set(row.param_name as string, {
            status: row.status as 'wrong_family' | 'confirmed_in_family' | null,
            flaggedBy: (row.flagged_by as 'auto' | 'engineer' | null) ?? null,
            autoDiagnosis: (row.auto_diagnosis as Record<string, unknown> | null) ?? null,
          });
        }
      }
    } catch {
      // Notes table missing → no statuses, treat all rows as default.
    }

    // ── MFR slug lookup (display name → canonical slug) ────────────────────
    const distinctMfrNames = [...new Set(queueSourceBatches.map((b) => b.manufacturer).filter(Boolean))];
    const mfrSlugMap = new Map<string, string>();
    if (distinctMfrNames.length > 0) {
      const { data: mfrRows } = await supabase
        .from('atlas_manufacturers')
        .select('slug, name_display')
        .in('name_display', distinctMfrNames);
      for (const row of mfrRows ?? []) {
        mfrSlugMap.set(row.name_display, row.slug);
      }
    }

    // ── Aggregate counters (computed from the visible batch list, not the
    //    queue source — these are operator-facing dashboard numbers) ────────
    const counts = { clean: 0, review: 0, attention: 0, total: batches.length };
    const productCounts = { willInsert: 0, willUpdate: 0, willDelete: 0 };
    const attrChanges = { totalNewAttrs: 0, totalChangedValues: 0, totalRemovedAttrs: 0 };
    for (const b of batches) {
      counts[b.risk]++;
      const r = b.report;
      if (r?.productCounts) {
        productCounts.willInsert += r.productCounts.willInsert ?? 0;
        productCounts.willUpdate += r.productCounts.willUpdate ?? 0;
        productCounts.willDelete += r.productCounts.willDelete ?? 0;
      }
      if (r?.attrChanges) {
        attrChanges.totalNewAttrs += r.attrChanges.totalNewAttrs ?? 0;
        attrChanges.totalChangedValues += r.attrChanges.totalChangedValues ?? 0;
        attrChanges.totalRemovedAttrs += r.attrChanges.totalRemovedAttrs ?? 0;
      }
    }

    // ── Aggregate unmappedParamsGlobal across the queue source ─────────────
    type AutoFlag = {
      suggestedFamily: string;        // familyId, e.g. 'B6'
      reasoning: string;              // human-readable rationale from registry
      matchingParam: string;          // the paramName that triggered the hit
    };
    type NoteStatus = 'wrong_family' | 'confirmed_in_family' | null;
    type GlobalUnmapped = {
      paramName: string;
      sampleValues: string[];
      mfrCount: number;
      productCount: number;
      affectedBatchIds: string[];
      affectedManufacturers: Array<{ slug: string; name: string; productCount: number }>;
      dominantFamily: string | null;
      familyCounts: Record<string, number>;
      /** Dominant L2 category for this paramName, scaled the same way as
       *  dominantFamily (per-batch category distribution × per-param product
       *  share). Used by the inline Accept flow as the override scope key
       *  when dominantFamily is null (L2-only products like Microcontrollers).
       *  Mirrors the L3/L2 overload of `family_id` in
       *  atlas_dictionary_overrides. Null when no batch carrying this param
       *  reports categoryCounts (older batches predating this feature). */
      dominantCategory: string | null;
      categoryCounts: Record<string, number>;
      // Foreign-family auto-flag, computed from the registry. Present iff the
      // paramName matches a signature whose target family differs from the
      // row's dominantFamily AND the engineer hasn't suppressed this row via
      // status='confirmed_in_family'.
      autoFlag?: AutoFlag;
      // Persisted triage status from atlas_unmapped_param_notes.
      noteStatus?: NoteStatus;
      flaggedBy?: 'auto' | 'engineer' | null;
      // Inline accept audit (Decision: inline audit + revert in Triage queue).
      // Present iff a row in atlas_dictionary_overrides matches this paramName
      // at either the dominantFamily or dominantCategory scope. isActive=false
      // means the override was reverted; row stays visible in 'Undone' / 'All'
      // status filters so the audit trail survives the revert.
      acceptedOverride?: {
        id: string;
        attributeId: string;
        attributeName: string;
        unit: string | null;
        createdBy: string;
        createdByName: string;
        createdAt: string;
        updatedAt: string;
        isActive: boolean;
        wasEdited: boolean;        // updated_at != created_at (signals PATCH after initial accept)
      };
      // True iff this row was synthesized from an override row alone (no
      // matching paramName in any current JSONB report). Means productCount=0,
      // affectedManufacturers=[], etc. — UI should render a "no longer in any
      // pending batch" indicator.
      orphaned?: boolean;
    };
    const unmappedMap = new Map<string, GlobalUnmapped>();
    // Per-row, dedupe MFR aggregation by slug — avoids double-counting when the
    // same MFR appears in multiple batches (re-ingest case).
    const mfrAggByParam = new Map<string, Map<string, { name: string; productCount: number }>>();

    for (const b of queueSourceBatches) {
      const batchFamilyCounts = b.familyCounts ?? {};
      const batchCategoryCounts = b.categoryCounts ?? {};
      const mfrSlug = mfrSlugMap.get(b.manufacturer) ?? slugifyName(b.manufacturer);
      for (const u of b.unmappedParams ?? []) {
        const key = u.paramName;
        let entry = unmappedMap.get(key);
        if (!entry) {
          entry = {
            paramName: key,
            sampleValues: [],
            mfrCount: 0,
            productCount: 0,
            affectedBatchIds: [],
            affectedManufacturers: [],
            dominantFamily: null,
            familyCounts: {},
            dominantCategory: null,
            categoryCounts: {},
          };
          unmappedMap.set(key, entry);
        }
        entry.productCount += u.productCount;
        entry.affectedBatchIds.push(b.batch_id);

        // Per-MFR rollup (deduped by slug across batches)
        let perMfr = mfrAggByParam.get(key);
        if (!perMfr) {
          perMfr = new Map();
          mfrAggByParam.set(key, perMfr);
        }
        const existing = perMfr.get(mfrSlug);
        if (existing) {
          existing.productCount += u.productCount;
        } else {
          perMfr.set(mfrSlug, { name: b.manufacturer, productCount: u.productCount });
        }

        // Family rollup. PREFERRED: use per-param familyCounts emitted by the
        // mjs aggregator (counts products carrying THIS specific param, not
        // the batch as a whole). FALLBACK: batch-level approximation for
        // older batches that predate the per-param breakdown — known to
        // mis-attribute on mixed-product-type MFRs (e.g. Delta's converter
        // params bleed into family 71 because inductors dominate the batch).
        if (u.familyCounts && Object.keys(u.familyCounts).length > 0) {
          for (const [fam, count] of Object.entries(u.familyCounts)) {
            if (fam === '(uncovered)') continue;
            entry.familyCounts[fam] = (entry.familyCounts[fam] ?? 0) + (count as number);
          }
        } else {
          const batchTotal = Object.values(batchFamilyCounts).reduce((s: number, n) => s + (n as number), 0) || 1;
          for (const [fam, count] of Object.entries(batchFamilyCounts)) {
            if (fam === '(uncovered)') continue;
            entry.familyCounts[fam] = (entry.familyCounts[fam] ?? 0) + Math.round((count as number) * (u.productCount / batchTotal));
          }
        }
        // Category rollup — same preferred/fallback split as family above.
        if (u.categoryCounts && Object.keys(u.categoryCounts).length > 0) {
          for (const [cat, count] of Object.entries(u.categoryCounts)) {
            if (cat === '(uncovered)') continue;
            entry.categoryCounts[cat] = (entry.categoryCounts[cat] ?? 0) + (count as number);
          }
        } else {
          const batchCatTotal = Object.values(batchCategoryCounts).reduce((s: number, n) => s + (n as number), 0) || 1;
          for (const [cat, count] of Object.entries(batchCategoryCounts)) {
            if (cat === '(uncovered)') continue;
            entry.categoryCounts[cat] = (entry.categoryCounts[cat] ?? 0) + Math.round((count as number) * (u.productCount / batchCatTotal));
          }
        }
        for (const sv of u.sampleValues) {
          if (entry.sampleValues.length < 5 && !entry.sampleValues.includes(sv)) {
            entry.sampleValues.push(sv);
          }
        }
      }
    }

    // Finalize: per-row dominantFamily + dominantCategory + MFR list + override filter
    for (const [paramName, entry] of unmappedMap) {
      const rankedFam = Object.entries(entry.familyCounts).sort((a, b) => b[1] - a[1]);
      entry.dominantFamily = rankedFam[0]?.[0] ?? null;

      const rankedCat = Object.entries(entry.categoryCounts).sort((a, b) => b[1] - a[1]);
      entry.dominantCategory = rankedCat[0]?.[0] ?? null;

      const perMfr = mfrAggByParam.get(paramName);
      if (perMfr) {
        entry.affectedManufacturers = [...perMfr.entries()]
          .map(([slug, v]) => ({ slug, name: v.name, productCount: v.productCount }))
          .sort((a, b) => b.productCount - a.productCount);
        entry.mfrCount = entry.affectedManufacturers.length;
      }
    }

    // Annotate (don't drop) rows with their accept state. This is the inline
    // audit + revert change — accepted/undone rows stay visible in the queue
    // so engineers can review, revert, and audit historical decisions in the
    // same surface as open synonyms. Status filtering happens downstream.
    //
    // Override.param_name is stored lowercased (Accept normalizes via
    // .toLowerCase() before insert); compare against entry.paramName.toLowerCase().
    // family_id in atlas_dictionary_overrides is overloaded — carries either
    // an L3 familyId ('B5') or an L2 category name ('Microcontrollers'). Check
    // both scopes; dominantFamily wins if both are present (more specific).
    const seenOverrideIds = new Set<string>();
    function lookupOverride(entry: GlobalUnmapped): OverrideMeta | null {
      const candidates: string[] = [];
      if (entry.dominantFamily) candidates.push(`${entry.dominantFamily}:${entry.paramName.toLowerCase()}`);
      if (entry.dominantCategory && entry.dominantCategory !== entry.dominantFamily) {
        candidates.push(`${entry.dominantCategory}:${entry.paramName.toLowerCase()}`);
      }
      // Active wins over inactive (an active override means the row is currently
      // resolved, regardless of any prior revert). Within active, first match wins.
      for (const k of candidates) {
        const m = activeOverrideMap.get(k);
        if (m) return m;
      }
      for (const k of candidates) {
        const m = inactiveOverrideMap.get(k);
        if (m) return m;
      }
      return null;
    }
    function annotateOverride(entry: GlobalUnmapped): GlobalUnmapped {
      const ov = lookupOverride(entry);
      if (!ov) return entry;
      seenOverrideIds.add(ov.id);
      return {
        ...entry,
        acceptedOverride: {
          id: ov.id,
          attributeId: ov.attributeId,
          attributeName: ov.attributeName,
          unit: ov.unit,
          createdBy: ov.createdBy,
          createdByName: overrideAuthorNames.get(ov.createdBy) ?? 'Unknown',
          createdAt: ov.createdAt,
          updatedAt: ov.updatedAt,
          isActive: ov.isActive,
          wasEdited: ov.updatedAt !== ov.createdAt,
        },
      };
    }
    const overrideAnnotated = [...unmappedMap.values()].map(annotateOverride);

    // Synthesize orphan rows for accepted overrides whose paramName isn't in
    // any current JSONB report. Long-tail audit case: an accept happened but
    // the source MFR file was later re-uploaded without that raw param name,
    // OR the accept was made manually via the Atlas Dictionaries admin panel.
    // Without these, the audit trail loses references to historical decisions.
    const orphans: GlobalUnmapped[] = [];
    for (const ov of [...activeOverrideMap.values(), ...inactiveOverrideMap.values()]) {
      if (seenOverrideIds.has(ov.id)) continue;
      orphans.push({
        paramName: ov.paramName,
        sampleValues: [],
        mfrCount: 0,
        productCount: 0,
        affectedBatchIds: [],
        affectedManufacturers: [],
        // The override's family_id may be an L3 familyId or an L2 category
        // name — we surface it as dominantFamily for UI rendering and let the
        // existing chip logic handle the display.
        dominantFamily: ov.familyId,
        familyCounts: {},
        dominantCategory: null,
        categoryCounts: {},
        acceptedOverride: {
          id: ov.id,
          attributeId: ov.attributeId,
          attributeName: ov.attributeName,
          unit: ov.unit,
          createdBy: ov.createdBy,
          createdByName: overrideAuthorNames.get(ov.createdBy) ?? 'Unknown',
          createdAt: ov.createdAt,
          updatedAt: ov.updatedAt,
          isActive: ov.isActive,
          wasEdited: ov.updatedAt !== ov.createdAt,
        },
        orphaned: true,
      });
      seenOverrideIds.add(ov.id);
    }
    const overrideResolved = [...overrideAnnotated, ...orphans];

    // Foreign-family auto-flag pass. The registry hits are computed in-band
    // every render (no DB write); engineer Confirm/Revert actions persist
    // status to atlas_unmapped_param_notes which then takes precedence.
    //
    // Effective row classification:
    //   - status='wrong_family'        → 'flagged'  (durable record, may have
    //                                                been engineer-only)
    //   - status='confirmed_in_family' → 'synonym'  (engineer suppressed the
    //                                                registry hit; row falls
    //                                                back to synonym workflow)
    //   - else if registry hit         → 'flagged'  (auto-detected)
    //   - else                         → 'synonym'
    type Classified = GlobalUnmapped & { effective: 'synonym' | 'flagged' };
    const classified: Classified[] = overrideResolved.map((entry) => {
      const noteRecord = noteStatusByParam.get(entry.paramName);
      const noteStatus: NoteStatus = noteRecord?.status ?? null;
      const flaggedBy = noteRecord?.flaggedBy ?? null;

      let autoFlag: AutoFlag | undefined;
      if (noteStatus !== 'confirmed_in_family') {
        const sig = detectForeignFamily(entry.paramName, entry.dominantFamily);
        if (sig) {
          autoFlag = {
            suggestedFamily: sig.target.familyId,
            reasoning: sig.reasoning,
            matchingParam: entry.paramName,
          };
        }
      }

      let effective: 'synonym' | 'flagged';
      if (noteStatus === 'wrong_family') effective = 'flagged';
      else if (noteStatus === 'confirmed_in_family') effective = 'synonym';
      else if (autoFlag) effective = 'flagged';
      else effective = 'synonym';

      return {
        ...entry,
        autoFlag,
        noteStatus,
        flaggedBy,
        effective,
      };
    });

    // Bucket counts for the UI filter chips (computed before the include
    // filter, so the engineer always sees how many rows live in each mode).
    // Counts are scoped to OPEN status (no override) — that's the working
    // queue size; accepted/undone counts are surfaced separately.
    function isOpen(r: Classified): boolean {
      return !r.acceptedOverride;
    }
    function isAccepted(r: Classified): boolean {
      return !!r.acceptedOverride && r.acceptedOverride.isActive;
    }
    function isUndone(r: Classified): boolean {
      return !!r.acceptedOverride && !r.acceptedOverride.isActive;
    }
    const openClassified = classified.filter(isOpen);
    const flaggedCount = openClassified.filter((r) => r.effective === 'flagged').length;
    const synonymCount = openClassified.filter((r) => r.effective === 'synonym').length;
    const acceptedCount = classified.filter(isAccepted).length;
    const undoneCount = classified.filter(isUndone).length;
    const openCount = openClassified.length;

    // Apply the include (mode) filter first, then the status filter.
    let visible: Classified[];
    if (include === 'auto_flagged') visible = classified.filter((r) => r.effective === 'flagged');
    else if (include === 'all') visible = classified;
    else visible = classified.filter((r) => r.effective === 'synonym');

    if (statusFilter === 'open') visible = visible.filter(isOpen);
    else if (statusFilter === 'accepted') visible = visible.filter(isAccepted);
    else if (statusFilter === 'undone') visible = visible.filter(isUndone);
    // statusFilter === 'all' → no further narrowing

    // Strip the internal `effective` field from the wire payload — it's a
    // server-side classifier output, the client doesn't need it.
    //
    // Sort: pending flagged rows (need engineer review) rise to the top;
    // already-confirmed flagged rows sink to the bottom of their own view so
    // the unreviewed work is always at eye level. Within each tier, by
    // productCount desc (most-impactful first).
    const unmappedParamsGlobal: GlobalUnmapped[] = visible
      .map(({ effective: _effective, ...rest }) => rest)
      .sort((a, b) => {
        const aConfirmed = a.noteStatus === 'wrong_family' ? 1 : 0;
        const bConfirmed = b.noteStatus === 'wrong_family' ? 1 : 0;
        if (aConfirmed !== bConfirmed) return aConfirmed - bConfirmed;
        return b.productCount - a.productCount;
      });

    return NextResponse.json({
      success: true,
      batches,
      aggregate: { counts, productCounts, attrChanges },
      unmappedParamsGlobal,
      triageCounts: { synonyms: synonymCount, autoFlagged: flaggedCount, total: synonymCount + flaggedCount },
      statusCounts: { open: openCount, accepted: acceptedCount, undone: undoneCount },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
