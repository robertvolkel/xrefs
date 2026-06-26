import {
  normalizeMpnForMatch,
  normalizeMfrForMatch,
  emptyVerifiedSet,
  extendVerifiedSet,
  isVerifiedMpn,
  isMentionableMpn,
  isVerifiedMfr,
} from '@/lib/services/grounding/verifiedSet';

describe('normalizeMpnForMatch', () => {
  it('lowercases and strips whitespace', () => {
    expect(normalizeMpnForMatch('  BC 847 BLT1G ')).toBe('bc847blt1g');
  });

  it('strips common packaging/reel suffixes', () => {
    expect(normalizeMpnForMatch('TPW4157-TR')).toBe('tpw4157');
    expect(normalizeMpnForMatch('CL10B104KB8NNNC-REEL')).toBe('cl10b104kb8nnnc');
    expect(normalizeMpnForMatch('GRM188R71C104KA01/R7')).toBe('grm188r71c104ka01');
  });

  it('strips the Nexperia/Philips comma reel code (the BC846BW,115 case)', () => {
    expect(normalizeMpnForMatch('BC846BW,115')).toBe('bc846bw');
  });

  it('returns empty string for blank/nullish input', () => {
    expect(normalizeMpnForMatch('')).toBe('');
    expect(normalizeMpnForMatch(null)).toBe('');
    expect(normalizeMpnForMatch(undefined)).toBe('');
  });
});

describe('normalizeMfrForMatch', () => {
  it('drops corporate-form noise words and punctuation', () => {
    expect(normalizeMfrForMatch('Nexperia USA Inc.')).toBe('nexperia usa');
    expect(normalizeMfrForMatch('Texas Instruments')).toBe('texas instruments');
    expect(normalizeMfrForMatch('onsemi')).toBe('onsemi');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeMfrForMatch('')).toBe('');
    expect(normalizeMfrForMatch(null)).toBe('');
  });
});

describe('extendVerifiedSet', () => {
  it('does not mutate the base set (immutable union)', () => {
    const base = emptyVerifiedSet();
    const next = extendVerifiedSet(base, { catalogParts: [{ mpn: 'BC847BLT1G' }] });
    expect(base.mpns.size).toBe(0);
    expect(next.mpns.has('bc847blt1g')).toBe(true);
  });

  it('ACCUMULATES across turns — an earlier part stays verified after a later search', () => {
    // Turn 1: a search surfaces part A.
    let set = extendVerifiedSet(emptyVerifiedSet(), {
      catalogParts: [{ mpn: 'BC847BLT1G', manufacturer: 'onsemi' }],
    });
    // Turn 2: a different search surfaces part B (in today's app this REPLACES the
    // visible cards). The verified set must still know about part A.
    set = extendVerifiedSet(set, {
      catalogParts: [{ mpn: 'MAX485', manufacturer: 'Analog Devices' }],
    });
    expect(isVerifiedMpn(set, 'BC847BLT1G')).toBe(true); // earlier turn — not forgotten
    expect(isVerifiedMpn(set, 'MAX485')).toBe(true);
  });

  it('records manufacturer names from catalog parts and standalone names', () => {
    const set = extendVerifiedSet(emptyVerifiedSet(), {
      catalogParts: [{ mpn: 'BC846BW,115', manufacturer: 'Nexperia USA Inc.' }],
      mfrNames: ['GigaDevice Semiconductor'],
    });
    expect(isVerifiedMfr(set, 'Nexperia')).toBe(true);
    expect(isVerifiedMfr(set, 'GigaDevice')).toBe(true);
  });
});

describe('isVerifiedMpn / isMentionableMpn', () => {
  it('matches a packaging-variant of a verified part (false-SAFE is fine)', () => {
    const set = extendVerifiedSet(emptyVerifiedSet(), {
      catalogParts: [{ mpn: 'BC846BW,115' }],
    });
    // Prose mentions the bare base part — must still count as verified.
    expect(isVerifiedMpn(set, 'BC846BW')).toBe(true);
  });

  it('does NOT verify an unknown (fabricated) part', () => {
    const set = extendVerifiedSet(emptyVerifiedSet(), {
      catalogParts: [{ mpn: 'BC847BLT1G' }],
    });
    expect(isVerifiedMpn(set, 'SBC847XYZ9G')).toBe(false);
  });

  it('treats a user-typed MPN as mentionable but NOT catalog-verified', () => {
    const set = extendVerifiedSet(emptyVerifiedSet(), { userMpns: ['XYZ123'] });
    expect(isVerifiedMpn(set, 'XYZ123')).toBe(false); // not from our catalog
    expect(isMentionableMpn(set, 'XYZ123')).toBe(true); // but the user named it
  });
});

describe('isVerifiedMfr', () => {
  it('matches when prose name is a prefix of the catalog name', () => {
    const set = extendVerifiedSet(emptyVerifiedSet(), {
      catalogParts: [{ mpn: 'X', manufacturer: 'Nexperia USA Inc.' }],
    });
    expect(isVerifiedMfr(set, 'Nexperia')).toBe(true);
  });

  it('rejects an unverified manufacturer name', () => {
    const set = extendVerifiedSet(emptyVerifiedSet(), {
      catalogParts: [{ mpn: 'X', manufacturer: 'onsemi' }],
    });
    expect(isVerifiedMfr(set, 'Vishay')).toBe(false);
  });
});
