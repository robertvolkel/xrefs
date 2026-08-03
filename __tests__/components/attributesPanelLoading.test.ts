import { readFileSync } from 'fs';
import path from 'path';
import { isPending } from '@/components/AttributesSkeletons';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf-8');

/**
 * Source with comments stripped.
 *
 * Every "must NOT appear" assertion below has to run against CODE. This change
 * is documented by comments that quote the broken forms they replaced (the
 * false `String(distributorCount)`, the bare `<Skeleton height={14}/>`), so
 * asserting over raw source would make the explanation of a fix
 * indistinguishable from the defect.
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SKELETONS = 'components/AttributesSkeletons.tsx';
const PANEL = 'components/AttributesPanel.tsx';
const TABS = 'components/AttributesTabContent.tsx';
const COMPARISON = 'components/ComparisonView.tsx';
const DESKTOP = 'components/DesktopLayout.tsx';
const MOBILE = 'components/MobileAppLayout.tsx';

/**
 * The source part's attribute fetch was MEASURED at ~17s against the live APIs
 * (MNS2N2222AUB 16.7s / GRM188R71H104KA93D 18.0s). For that entire window the
 * panel rendered hard em-dashes and a literal "0" for values that were still
 * loading, which reads as "we looked and there is nothing". These tests pin the
 * rule that replaced it: pending values shimmer, real values (including 0) do not.
 */

describe('isPending: the single rule behind every loading shimmer', () => {
  it('treats null / undefined / empty-string as pending while the fetch runs', () => {
    expect(isPending(undefined, true)).toBe(true);
    expect(isPending(null, true)).toBe(true);
    expect(isPending('', true)).toBe(true);
  });

  it('treats 0, false and [] as REAL values, never pending', () => {
    // This is the "0 distributors" bug in reverse. A part with zero distributors
    // must render "0" — shimmering it would be a different kind of lie, and a
    // `!value` implementation would do exactly that.
    expect(isPending(0, true)).toBe(false);
    expect(isPending(false, true)).toBe(false);
    expect(isPending([], true)).toBe(false);
  });

  it('never shimmers once the fetch has finished', () => {
    // The panel resolves in a single frame (preview -> canonical), so after that
    // an absent value is genuinely absent and must render its em-dash.
    expect(isPending(undefined, false)).toBe(false);
    expect(isPending(null, false)).toBe(false);
    expect(isPending('', false)).toBe(false);
  });
});

describe('Overview: pending values shimmer instead of asserting an absence', () => {
  it('shimmers Distributors while quotes are pending, rather than asserting a count', () => {
    // Measured: MNS2N2222AUB resolves to 3 distributors after ~17s. Before the
    // fix the row asserted "0" for that entire window.
    //
    // `String(distributorCount)` still appears — it is the CORRECT rendering once
    // the fetch is done. The invariant is that it sits in the resolved branch of
    // the quotesPending ternary, with a shimmer in the pending branch.
    const code = readCode(TABS);
    const pendingBranch = code.match(
      /quotesPending \? \([\s\S]*?\) : \(/,
    );
    expect(pendingBranch).not.toBeNull();
    expect(pendingBranch![0]).toMatch(/<FieldRow label="Distributors"><ShimmerValue/);
    expect(pendingBranch![0]).not.toMatch(/String\(distributorCount\)/);
    // ...and the bare count is reachable only after that ternary.
    expect(code.indexOf('String(distributorCount)')).toBeGreaterThan(code.indexOf('quotesPending ? ('));
  });

  it('routes all four Distribution rows through one pending check', () => {
    // They all derive from supplierQuotes, so they must resolve together —
    // three shimmering rows beside a settled one reads as a rendering bug.
    const code = readCode(TABS);
    expect(code).toMatch(/const quotesPending = isPending\(part\.supplierQuotes, isEnriching\)/);
  });

  it('gates the hero image shimmer on a non-Atlas source', () => {
    // imageUrl is a Digikey field. An Atlas part would shimmer for the full
    // fetch and still land on "No image", so it must not tease one.
    expect(readCode(TABS)).toMatch(/isPending\(part\.imageUrl, isEnriching\) && dataSource !== 'atlas'/);
  });

  it('is wired from the source panel', () => {
    expect(readCode(PANEL)).toMatch(/<OverviewContent[\s\S]{0,200}?isEnriching=\{isEnriching\}/);
  });

  it('is NOT wired from the comparison panel', () => {
    // ComparisonView's only available flag is isEnrichingFC, which means just the
    // FindChips rows are pending. Passing it would falsely shimmer rows that are
    // already final (Grade, RoHS) for the whole recommendation-enrichment pass.
    const code = readCode(COMPARISON);
    const overview = code.slice(code.indexOf('<OverviewContent'));
    expect(overview.slice(0, 300)).not.toMatch(/isEnriching=/);
  });
});

describe('Specs: filler rows while loading, an explicit message when empty', () => {
  it('pads to a full table only while loading and only outside comparison mode', () => {
    // !comparisonRows makes the Decision #246 row-alignment invariant explicit.
    // The two states are already mutually exclusive by phase; the guard keeps it
    // that way if either phase gate ever moves.
    expect(readCode(PANEL)).toMatch(
      /isEnriching && !comparisonRows &&[\s\S]{0,160}?SPECS_SKELETON_ROWS - specRows\.length/,
    );
  });

  it('pads to the same row count the full skeleton uses', () => {
    // One constant drives both loading states, so a partial preview and a cold
    // load can't produce visibly different-sized tables.
    const code = readCode(PANEL);
    expect(code).toMatch(/const SPECS_SKELETON_ROWS = 12/);
    expect(code).toMatch(/length: SPECS_SKELETON_ROWS \}\)\.map\(\(_, i\) => <SkeletonSpecRow/);
  });

  it('shows an empty state only AFTER loading finishes', () => {
    // Measured: MNS2N2222AUB returns params=0 even after the full fetch (control:
    // a Murata MLCC returns 11). Without !isEnriching the shimmer and the "no
    // data" message would render together; without the message entirely, the
    // shimmer would resolve to an unexplained blank table — worse than the stable
    // blank it replaced.
    expect(readCode(PANEL)).toMatch(/!isEnriching && specRows\.length === 0/);
  });
});

describe('Structural invariants that keep this working', () => {
  it('AttributesTabContent never imports AttributesPanel', () => {
    // The cycle rule was previously enforced only by a comment. AttributesPanel
    // imports AttributesTabContent, so the reverse edge would be a cycle.
    expect(readCode(TABS)).not.toMatch(/from\s+['"]\.\/AttributesPanel['"]/);
  });

  it('the shared skeleton module imports neither panel', () => {
    const code = readCode(SKELETONS);
    expect(code).not.toMatch(/from\s+['"]\.\/AttributesPanel['"]/);
    expect(code).not.toMatch(/from\s+['"]\.\/AttributesTabContent['"]/);
  });

  it('both layouts pass the same loading flag', () => {
    // These two have drifted before (comparisonRows is desktop-only). A shimmer
    // that only appears on desktop is worse than one that appears nowhere.
    const expected = /isEnriching=\{phase === 'loading-attributes'\}/;
    expect(readCode(DESKTOP)).toMatch(expected);
    expect(readCode(MOBILE)).toMatch(expected);
  });

  it('ShimmerValue keeps the transparent glyph that makes it height-exact', () => {
    // The em-dash stays in the DOM but invisible so the shimmering row is the
    // exact height of the resolved row. A bare <Skeleton height={14}/> is ~4px
    // shorter; across a dozen rows that is a visible whole-panel jolt the moment
    // data lands. This pins it against a well-meaning "simplification".
    const code = readCode(SKELETONS);
    const shimmer = code.slice(code.indexOf('export function ShimmerValue'));
    expect(shimmer).toMatch(/color: 'transparent'/);
    expect(shimmer).toMatch(/&#8212;/);
    expect(shimmer).toMatch(/position: 'absolute'/);
  });
});
