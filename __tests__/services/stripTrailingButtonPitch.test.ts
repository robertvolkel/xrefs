import { stripTrailingButtonPitch } from '@/lib/services/llmOrchestrator';

describe('stripTrailingButtonPitch — strips unwanted next-step pitches', () => {
  it('strips the exact "Ready to find replacements" trailing paragraph from the user-reported case', () => {
    const input = `Correct — per the data we have, only **RS Components** and **Element14** carry this part.

For a 100-unit buy:
- **RS Components**: GBP 0.0400–0.0740 per unit (MOQ 50, 700 in stock)
- **Element14**: SGD 0.0950–0.1810 per unit (MOQ 5, 1655 in stock)

Ready to find replacements when you are — click the "Find cross-references" button.`;
    const output = stripTrailingButtonPitch(input);
    expect(output).not.toMatch(/Ready to find replacements/i);
    expect(output).not.toMatch(/Find cross-references/i);
    expect(output).toContain('RS Components'); // headline preserved
    expect(output).toContain('100-unit buy'); // body preserved
  });

  it('strips multi-sentence "Now, to find cross-reference replacements" pitch', () => {
    const input = `RS Components offers GBP-priced units. Element14 offers SGD-priced units.

Now, to find cross-reference replacements: click the "Find cross-references" button on the part card. The matching engine will surface candidates and rank them by fit.`;
    const output = stripTrailingButtonPitch(input);
    expect(output).not.toMatch(/Find cross-references/i);
    expect(output).not.toMatch(/click the/i);
    expect(output).toContain('RS Components');
  });

  it('strips "click the Best Spot Price button" pitches', () => {
    const input = `Here are the specs.

Want best pricing? Click the Best Spot Price button.`;
    expect(stripTrailingButtonPitch(input)).not.toMatch(/Best Spot Price/);
  });

  it('strips "click the Replacement Options button" pitches', () => {
    const input = `Specs are loaded.

To find alternatives, click the Replacement Options button on the part card.`;
    expect(stripTrailingButtonPitch(input)).not.toMatch(/Replacement Options/);
  });
});

describe('stripTrailingButtonPitch — preserves legitimate content', () => {
  it('does NOT strip a paragraph that just describes a part (no button pitch)', () => {
    const input = `RS Components: £0.074/each at qty 50+, 700 in stock.

Element14: SGD 0.181/each at qty 5+, 1655 in stock.`;
    expect(stripTrailingButtonPitch(input)).toBe(input);
  });

  it('does NOT strip prose that mentions "click" but not in a button-pitch context', () => {
    // "click" without action toward a named button — generic answer
    const input = `The capacitor's ESR varies with frequency.

A high-quality scope and click-on probes will give you accurate measurements.`;
    expect(stripTrailingButtonPitch(input)).toBe(input);
  });

  it('does NOT strip when the response is a single short paragraph', () => {
    const input = `Yes — those are the only two distributors carrying this part.`;
    expect(stripTrailingButtonPitch(input)).toBe(input);
  });

  it('preserves engineering assessment paragraphs', () => {
    const input = `Found 12 candidates, 9 passed.

Top picks: GRM21BR71C475KA73L and GCM21BR71C475KA73L from Murata at 4.7µF / 16V.

The X7R variants will have wider DC bias derating than C0G — but at this capacitance class C0G isn't practical.`;
    expect(stripTrailingButtonPitch(input)).toBe(input);
  });

  it('returns original message when stripping would leave empty result', () => {
    const input = `Click the Find cross-references button.`;
    expect(stripTrailingButtonPitch(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(stripTrailingButtonPitch('')).toBe('');
  });
});
