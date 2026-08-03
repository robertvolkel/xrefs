import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const readCode = (rel: string) =>
  readFileSync(path.join(ROOT, rel), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const MODAL = 'components/parts-list/PartDetailModal.tsx';
const SHELL = 'components/parts-list/PartsListShell.tsx';
const STATE = 'hooks/usePartsListState.ts';
const COMPARISON = 'components/ComparisonView.tsx';

/**
 * Clicking a replacement inside the BOM row popup left the right 2/3 of the
 * modal BLANK for the ~10s attribute fetch: `isComparing` unmounts the
 * recommendations list immediately, while the comparison block was gated on
 * `comparisonAttrs` and so had not mounted yet. Observed in the browser.
 */

describe('BOM modal: the comparison panes mount before their data arrives', () => {
  it('does not gate the comparison block on the fetched attributes', () => {
    // The gate must not wait for comparisonAttrs — that is what produced the
    // blank pane. ComparisonView takes `PartAttributes | null` by signature.
    const code = readCode(MODAL);
    expect(code).not.toMatch(/isComparing && selectedRec && row\.sourceAttributes && comparisonAttrs &&/);
    expect(code).toMatch(/isComparing && selectedRec && row\.sourceAttributes &&/);
  });

  it('passes BOTH loading and error through to ComparisonView', () => {
    const code = readCode(MODAL);
    expect(code).toMatch(/isLoadingReplacement=\{isLoadingReplacement\}/);
    expect(code).toMatch(/replacementError=\{replacementError\}/);
  });

  it('is wired from the shell', () => {
    const code = readCode(SHELL);
    expect(code).toMatch(/isLoadingReplacement=\{modalComparisonLoading\}/);
    expect(code).toMatch(/replacementError=\{modalComparisonError\}/);
  });
});

describe('BOM modal: a FAILED fetch resolves instead of shimmering forever', () => {
  const code = () => readCode(STATE);

  it('sets loading true when the replacement is selected', () => {
    expect(code()).toMatch(/modalComparing: true,[\s\S]{0,120}?modalComparisonLoading: true/);
  });

  it('clears loading on SUCCESS', () => {
    expect(code()).toMatch(/modalComparisonAttrs: attrs, modalComparisonLoading: false/);
  });

  it('clears loading and flags the error on FAILURE', () => {
    // The catch block used to be empty. With the panes now mounted during the
    // fetch, an empty catch would leave attrs null and loading true — an
    // indefinite skeleton, the exact failure this whole change exists to avoid.
    const src = code();
    const catchBlock = src.slice(src.indexOf('} catch {', src.indexOf('handleModalSelectRec')));
    expect(catchBlock.slice(0, 300)).toMatch(/modalComparisonLoading: false/);
    expect(catchBlock.slice(0, 300)).toMatch(/modalComparisonError: true/);
  });

  it('resets both flags at EVERY site that closes the comparison', () => {
    // Five separate sites set `modalComparing: false`. A missed one leaves a
    // stale flag, so the NEXT comparison opens straight into a skeleton or an
    // error that never clears.
    //
    // Counting occurrences is NOT enough — the success and failure paths add
    // two more `modalComparisonLoading: false`, so a total-count assertion
    // still passes with one reset site deleted. (Verified: that mutation
    // survived the count-based version of this test.) Anchor on each site.
    const src = code();
    const sites = [...src.matchAll(/modalComparing: false/g)].map((m) => m.index!);
    expect(sites.length).toBeGreaterThanOrEqual(4);
    for (const at of sites) {
      const block = src.slice(Math.max(0, at - 260), at);
      expect(block).toMatch(/modalComparisonLoading: false/);
      expect(block).toMatch(/modalComparisonError: false/);
    }
  });
});

describe('ComparisonView already distinguishes loading from failed', () => {
  it('keys its skeletons on loading, and its error copy on the error flag', () => {
    // This is why the fix needs a real error flag rather than inferring from
    // `!attrs` — the component was already built for three states.
    const code = readCode(COMPARISON);
    expect(code).toMatch(/isLoadingReplacement && !replacementAttributes \? \(\s*<OverviewSkeleton/);
    expect(code).toMatch(/isLoadingReplacement && !replacementAttributes \? \(\s*<CommercialSkeleton/);
    expect(code).toMatch(/replacementError && !replacementAttributes/);
  });

  it('renders from the recommendation when attributes are absent', () => {
    // Guarantees the mounted-early panes cannot crash on null attrs.
    expect(readCode(COMPARISON)).toMatch(/const replPart = \(replacementAttributes \?\? recommendation\)\.part/);
  });
});
