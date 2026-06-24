import { partitionToolUses } from '@/lib/services/llmOrchestrator';

/**
 * Greenfield determinism (Phase A — Decision #248). On a greenfield turn the model
 * may fire several `search_parts` calls (each a from-memory MPN guess) that race in
 * Promise.all with last-completes-wins. partitionToolUses keeps only the FIRST
 * search_parts (by array order — deterministic) and suppresses the rest.
 */
describe('partitionToolUses', () => {
  it('keeps exactly one search_parts on a greenfield multi-search turn', () => {
    const blocks = [
      { name: 'search_parts' },
      { name: 'search_parts' },
      { name: 'search_parts' },
    ];
    const flags = partitionToolUses(blocks, true);
    expect(flags).toEqual([true, false, false]);
    expect(flags.filter(Boolean)).toHaveLength(1);
  });

  it('emits a run-flag for every block (so every tool_use still gets a tool_result)', () => {
    const blocks = [{ name: 'search_parts' }, { name: 'search_parts' }];
    const flags = partitionToolUses(blocks, true);
    expect(flags).toHaveLength(blocks.length);
  });

  it('never suppresses non-search tools (present_choices, filters, etc.) on greenfield', () => {
    const blocks = [
      { name: 'search_parts' },
      { name: 'present_choices' },
      { name: 'search_parts' },
      { name: 'get_manufacturer_profile' },
    ];
    expect(partitionToolUses(blocks, true)).toEqual([true, true, false, true]);
  });

  it('runs ALL searches on a non-greenfield (MPN) turn — multi-MPN lookup is correct there', () => {
    const blocks = [{ name: 'search_parts' }, { name: 'search_parts' }];
    expect(partitionToolUses(blocks, false)).toEqual([true, true]);
  });

  it('the kept search is the FIRST by array order (not resolution order)', () => {
    const blocks = [
      { name: 'get_part_attributes' },
      { name: 'search_parts' }, // first search → kept
      { name: 'search_parts' }, // suppressed
    ];
    expect(partitionToolUses(blocks, true)).toEqual([true, true, false]);
  });

  it('handles a single search_parts (kept) and an empty list (no-op)', () => {
    expect(partitionToolUses([{ name: 'search_parts' }], true)).toEqual([true]);
    expect(partitionToolUses([], true)).toEqual([]);
  });

  it('suppresses ALL greenfield searches when one already ran earlier this turn (per-turn dedup across loop iterations)', () => {
    // alreadySearched=true models a prior tool-loop iteration that already ran a search.
    expect(partitionToolUses([{ name: 'search_parts' }], true, true)).toEqual([false]);
    expect(partitionToolUses(
      [{ name: 'search_parts' }, { name: 'present_choices' }, { name: 'search_parts' }],
      true,
      true,
    )).toEqual([false, true, false]);
  });

  it('alreadySearched is ignored on a non-greenfield turn (MPN multi-lookup still runs all)', () => {
    expect(partitionToolUses([{ name: 'search_parts' }, { name: 'search_parts' }], false, true)).toEqual([true, true]);
  });
});
