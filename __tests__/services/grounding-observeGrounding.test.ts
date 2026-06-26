import { emptyVerifiedSet } from '@/lib/services/grounding/verifiedSet';
import {
  buildVerifiedSetFromContext,
  observeMessage,
} from '@/lib/services/grounding/observeGrounding';

describe('buildVerifiedSetFromContext', () => {
  it('assembles a verified set from all context sources', () => {
    const set = buildVerifiedSetFromContext({
      searchMatches: [{ mpn: 'BC847BLT1G', manufacturer: 'onsemi' }],
      recommendations: [{ mpn: 'BC846BW,115', manufacturer: 'Nexperia' }],
      sourcePart: { mpn: 'MAX485', manufacturer: 'Analog Devices' },
      attributeMpns: ['LM317'],
      userMpns: ['XYZ123'],
    });
    expect(set.mpns.has('bc847blt1g')).toBe(true);
    expect(set.mpns.has('bc846bw')).toBe(true); // reel code stripped
    expect(set.mpns.has('max485')).toBe(true);
    expect(set.mpns.has('lm317')).toBe(true);
    expect(set.userMpns.has('xyz123')).toBe(true);
  });

  it('accumulates onto a base set carried from earlier turns', () => {
    const turn1 = buildVerifiedSetFromContext({ searchMatches: [{ mpn: 'BC847BLT1G' }] });
    const turn2 = buildVerifiedSetFromContext({ searchMatches: [{ mpn: 'MAX485' }] }, turn1);
    expect(turn2.mpns.has('bc847blt1g')).toBe(true); // not forgotten
    expect(turn2.mpns.has('max485')).toBe(true);
  });
});

describe('observeMessage', () => {
  const verified = buildVerifiedSetFromContext({
    searchMatches: [{ mpn: 'BC847BLT1G', manufacturer: 'onsemi' }],
  });

  it('reports zero findings when the message only cites verified parts + vocabulary', () => {
    const obs = observeMessage(
      'The BC847BLT1G in a SOT-23 package, X7R-adjacent, AEC-Q101 rated.',
      verified,
      { surface: 'chat' },
    );
    expect(obs.findingCount).toBe(0);
    expect(obs.verifiedMpnCount).toBe(1);
  });

  it('flags a fabricated part and tallies confidence counts', () => {
    const obs = observeMessage(
      'You could also use the MAX9988 or a ZQX4410K instead.',
      verified,
      { surface: 'chat', conversationId: 'c1', model: 'sonnet' },
    );
    expect(obs.findingCount).toBe(2);
    expect(obs.highCount).toBe(1); // MAX9988 — known family
    expect(obs.mediumCount).toBe(1); // ZQX4410K — structural only
    expect(obs.surface).toBe('chat');
    expect(obs.conversationId).toBe('c1');
    expect(obs.findings.map((f) => f.token).sort()).toEqual(['MAX9988', 'ZQX4410K']);
  });
});
