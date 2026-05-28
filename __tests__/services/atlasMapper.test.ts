import { reclassifyByParameterSignals } from '@/lib/services/atlasMapper';

const B1 = { category: 'Diodes' as const, subcategory: 'Rectifier Diode', familyId: 'B1' };

describe('reclassifyByParameterSignals', () => {
  it('keeps B1 when no Type parameter present', () => {
    expect(reclassifyByParameterSignals(B1, [])).toEqual(B1);
    expect(reclassifyByParameterSignals(B1, [{ name: 'Vrrm', value: '600' }])).toEqual(B1);
  });

  it('keeps B1 when Type value is empty', () => {
    expect(reclassifyByParameterSignals(B1, [{ name: 'Type', value: '' }])).toEqual(B1);
    expect(reclassifyByParameterSignals(B1, [{ name: 'Type', value: '   ' }])).toEqual(B1);
  });

  it('reclassifies B1 → B4 on Type=Bi / Uni / Bidirectional / Unidirectional', () => {
    for (const v of ['Bi', 'Uni', 'Bidirectional', 'Unidirectional']) {
      const result = reclassifyByParameterSignals(B1, [{ name: 'Type', value: v }]);
      expect(result.familyId).toBe('B4');
      expect(result.subcategory).toBe('TVS Diode');
    }
  });

  it('reclassifies B1 → B3 on Type=Regulator / Voltage Regulator', () => {
    for (const v of ['Regulator', 'voltage regulator', 'REGULATOR']) {
      const result = reclassifyByParameterSignals(B1, [{ name: 'Type', value: v }]);
      expect(result.familyId).toBe('B3');
      expect(result.subcategory).toBe('Zener Diode');
    }
  });

  it('matches Chinese 类型 key equivalently to English Type', () => {
    const r1 = reclassifyByParameterSignals(B1, [{ name: '类型', value: 'Bi' }]);
    expect(r1.familyId).toBe('B4');
    const r2 = reclassifyByParameterSignals(B1, [{ name: '类型', value: 'Regulator' }]);
    expect(r2.familyId).toBe('B3');
  });

  it('is case-insensitive on the Type key', () => {
    expect(reclassifyByParameterSignals(B1, [{ name: 'TYPE', value: 'Uni' }]).familyId).toBe('B4');
    expect(reclassifyByParameterSignals(B1, [{ name: 'type', value: 'Bi' }]).familyId).toBe('B4');
  });

  it('keeps B1 on non-matching Type values (Standard, Fast, Ultrafast, etc.)', () => {
    for (const v of ['Standard', 'Fast', 'Ultrafast', 'Schottky', 'unknown']) {
      const result = reclassifyByParameterSignals(B1, [{ name: 'Type', value: v }]);
      expect(result).toEqual(B1);
    }
  });

  it('only fires from B1 — non-B1 inputs pass through unchanged', () => {
    const B4 = { category: 'Diodes' as const, subcategory: 'TVS Diode', familyId: 'B4' };
    expect(reclassifyByParameterSignals(B4, [{ name: 'Type', value: 'Regulator' }])).toEqual(B4);

    const C1 = { category: 'Voltage Regulators' as const, subcategory: 'LDO', familyId: 'C1' };
    expect(reclassifyByParameterSignals(C1, [{ name: 'Type', value: 'Regulator' }])).toEqual(C1);
  });

  it('uses the first matching Type entry when multiple are present', () => {
    // Defensive — model.parameters is an array, so duplicates are possible.
    const result = reclassifyByParameterSignals(B1, [
      { name: 'Type', value: 'Regulator' },
      { name: 'Type', value: 'Bi' },
    ]);
    expect(result.familyId).toBe('B3'); // first wins
  });

  // ── Phase 2: foreign-family param-name signatures ─────────────────
  describe('foreign-family param-name signatures (registry-driven)', () => {
    it('reclassifies B1 → B6 when BJT-only params (BVCBO/BVCEO/BVEBO) appear', () => {
      for (const name of ['BVCBO(V)', 'BVCEO(V)', 'BVEBO(V)']) {
        const r = reclassifyByParameterSignals(B1, [{ name, value: '-60' }]);
        expect(r.familyId).toBe('B6');
        expect(r.subcategory).toBe('BJT');
        expect(r.category).toBe('Transistors');
      }
    });

    it('reclassifies B1 → B6 on hFE alone (no cooccurrence required)', () => {
      const r3 = reclassifyByParameterSignals(B1, [{ name: 'hFE', value: '100' }]);
      expect(r3.familyId).toBe('B6');
    });

    it('does NOT reclassify B1 → B6 on Ic alone (cooccurrence guard)', () => {
      // Ic is shared between BJTs and IGBTs — Ic alone without a strictly-unique
      // BJT signal (hfe / vcbo / vceo / vebo) on the same product is not enough
      // to flip a B1 rectifier to BJT. Protects legitimate IGBTs.
      const r1 = reclassifyByParameterSignals(B1, [{ name: '@Ic(mA)', value: '500' }]);
      expect(r1).toEqual(B1);
      const r2 = reclassifyByParameterSignals(B1, [{ name: 'Ic(mA)', value: '500' }]);
      expect(r2).toEqual(B1);
    });

    it('reclassifies B1 → B6 on Ic + cooccurring hFE (cooccurrence satisfied)', () => {
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Ic(mA)', value: '500' },
        { name: 'hFE', value: '100' },
      ]);
      expect(r.familyId).toBe('B6');
    });

    it('reclassifies B1 → B6 on Ic + cooccurring VCEO (cooccurrence satisfied)', () => {
      // VCEO matches the vcbo|vceo|vebo signature first (which has no cooccurrence
      // requirement), so the loop returns on that hit before ever evaluating Ic.
      // Result is the same — B6 — but via a different code path.
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Ic(mA)', value: '500' },
        { name: 'VCEO(V)', value: '60' },
      ]);
      expect(r.familyId).toBe('B6');
    });

    it('does NOT reclassify B1 → B6 on fT alone (cooccurrence guard)', () => {
      // fT is shared with RF MOSFETs — same protection as Ic.
      const r = reclassifyByParameterSignals(B1, [{ name: 'fT(MHz)', value: '300' }]);
      expect(r).toEqual(B1);
    });

    it('reclassifies B1 → B6 on fT + cooccurring hFE', () => {
      const r = reclassifyByParameterSignals(B1, [
        { name: 'fT(MHz)', value: '300' },
        { name: 'hFE', value: '100' },
      ]);
      expect(r.familyId).toBe('B6');
    });

    it('reclassifies B1 → B5 on Rds(on) alone (truly MOSFET-unique)', () => {
      const r1 = reclassifyByParameterSignals(B1, [{ name: 'Rds(on)(Ω)', value: '0.025' }]);
      expect(r1.familyId).toBe('B5');
    });

    it('does NOT reclassify B1 → B5 on Vgs(th) alone (cooccurrence guard)', () => {
      // Vgs(th) is shared between MOSFETs and IGBTs (both have voltage-controlled
      // gates). Standalone Vgs(th) without Rds(on) is not decisive.
      const r = reclassifyByParameterSignals(B1, [{ name: 'Vgs(th)(V)', value: '2.5' }]);
      expect(r).toEqual(B1);
    });

    it('does NOT reclassify B1 → B5 on Qg alone (cooccurrence guard)', () => {
      // Qg is shared with IGBTs too. Same protection as Vgs(th).
      const r = reclassifyByParameterSignals(B1, [{ name: 'Qg(nC)', value: '40' }]);
      expect(r).toEqual(B1);
    });

    it('reclassifies B1 → B5 on Vgs(th) + cooccurring Rds(on)', () => {
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Vgs(th)(V)', value: '2.5' },
        { name: 'Rds(on)(Ω)', value: '0.025' },
      ]);
      expect(r.familyId).toBe('B5');
    });

    it('reclassifies B1 → B5 on Qg + cooccurring Rds(on)', () => {
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Qg(nC)', value: '40' },
        { name: 'Rds(on)', value: '0.025' },
      ]);
      expect(r.familyId).toBe('B5');
    });

    it('reclassifies B1 → B7 on IGBT-unique params (Eoff alone)', () => {
      const r = reclassifyByParameterSignals(B1, [{ name: 'Eoff(mJ)', value: '1.5' }]);
      expect(r.familyId).toBe('B7');
    });

    it('does NOT reclassify B1 → B7 on Vce(sat) alone (cooccurrence guard)', () => {
      // Vce(sat) is shared between BJTs (switching saturation) and IGBTs.
      // Requires cooccurrence of Vces or Eon/Eoff/Ets to confirm IGBT.
      const r = reclassifyByParameterSignals(B1, [{ name: 'Vce(sat)(V)', value: '2.0' }]);
      expect(r).toEqual(B1);
    });

    it('reclassifies B1 → B7 on Vce(sat) + cooccurring Eoff', () => {
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Vce(sat)(V)', value: '2.0' },
        { name: 'Eoff(mJ)', value: '1.5' },
      ]);
      expect(r.familyId).toBe('B7');
    });

    it('reclassifies B1 → B7 on Vce(sat) + cooccurring Vces', () => {
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Vce(sat)(V)', value: '2.0' },
        { name: 'Vces(V)', value: '1200' },
      ]);
      expect(r.familyId).toBe('B7');
    });

    it('correctly-classified B6 BJT carrying Vce(sat) STAYS in B6 (no Vces/Eoff cooccurrence)', () => {
      // Direct lock for the WPMSEMI HFT3837 root cause: a BJT correctly
      // classified by c3 as B6 carries Vce(sat) as a switching spec; without
      // cooccurrence on Vces/Eon/Eoff/Ets, the B7 sig must NOT fire.
      const B6 = { category: 'Transistors' as const, subcategory: 'BJT', familyId: 'B6' };
      const params = [
        { name: 'vceo_v', value: '45' },
        { name: 'hfe_min', value: '110' },
        { name: 'vce_sat_max_v', value: '0.3' },
        { name: 'ic_ma', value: '300' },
      ];
      const r = reclassifyByParameterSignals(B6, params);
      expect(r).toEqual(B6);
    });

    it('reclassifies B1 → B9 on JFET-only Idss param', () => {
      const r = reclassifyByParameterSignals(B1, [{ name: 'Idss(mA)', value: '5' }]);
      expect(r.familyId).toBe('B9');
      expect(r.subcategory).toBe('JFET');
    });

    it('reclassifies B1 → E1 on optocoupler-only params', () => {
      const r1 = reclassifyByParameterSignals(B1, [{ name: 'CTR(%)', value: '50' }]);
      expect(r1.familyId).toBe('E1');
      const r2 = reclassifyByParameterSignals(B1, [{ name: 'Viso(V)', value: '5000' }]);
      expect(r2.familyId).toBe('E1');
    });

    it('does NOT reclassify when the signature matches the current family (no-op)', () => {
      // A correctly-classified BJT carrying BVCBO should stay in B6, not get
      // re-routed to B6 (same family).
      const B6 = { category: 'Transistors' as const, subcategory: 'BJT', familyId: 'B6' };
      const r = reclassifyByParameterSignals(B6, [{ name: 'BVCBO(V)', value: '60' }]);
      expect(r).toEqual(B6);
    });

    it('Phase 1 (Type=Bi) takes precedence over Phase 2 — TVS detection runs first', () => {
      // If a B1 product has both Type=Bi AND a registry-matched param, the
      // Type-value rule should win (it's the more specific signal — TVS is a
      // diode subtype, not a transistor).
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Type', value: 'Bi' },
        { name: 'BVCBO(V)', value: '60' },
      ]);
      expect(r.familyId).toBe('B4');
    });

    it('first matching signature wins when multiple registry patterns hit', () => {
      // Edge case — a row carrying both BJT and MOSFET signatures (shouldn't
      // happen in practice, but the registry order is the tiebreak so the
      // behavior is deterministic).
      const r = reclassifyByParameterSignals(B1, [
        { name: 'BVCBO(V)', value: '60' },
        { name: 'Rds(on)', value: '0.1' },
      ]);
      // BJT entries come before MOSFET entries in the registry — B6 wins.
      expect(r.familyId).toBe('B6');
    });

    it('keeps initial classification when no params match any signature', () => {
      const r = reclassifyByParameterSignals(B1, [
        { name: 'Vrrm(V)', value: '600' },
        { name: 'If(A)', value: '1.0' },
      ]);
      expect(r).toEqual(B1);
    });

    it('handles missing or empty param names defensively', () => {
      const r1 = reclassifyByParameterSignals(B1, [{ name: '', value: 'foo' }]);
      expect(r1).toEqual(B1);
      const r2 = reclassifyByParameterSignals(B1, [{ name: '   ', value: 'foo' }]);
      expect(r2).toEqual(B1);
    });

    it('fires from any starting family, not just B1', () => {
      // A product misclassified as B5 MOSFET that actually carries CTR
      // (optocoupler param) should reclassify to E1.
      const B5 = { category: 'Transistors' as const, subcategory: 'MOSFET', familyId: 'B5' };
      const r = reclassifyByParameterSignals(B5, [{ name: 'CTR(%)', value: '50' }]);
      expect(r.familyId).toBe('E1');
    });

    // ── Regex-bug fix (May 27, 2026 — \b vs underscore) ─────────────
    // Before the fix: /^hfe\b/i did NOT match `hfe_min` because JS regex
    // treats `_` as `\w`, so there's no word boundary between `e` and `_`.
    // The fix replaces `\b` with `(?![A-Za-z0-9])` to catch the underscore
    // and other separators (paren, space) consistently.
    describe('underscored / spaced paramName variants (regex-bug fix)', () => {
      it('matches hfe_min, hfe_max (WPMSEMI shape)', () => {
        const r1 = reclassifyByParameterSignals(B1, [{ name: 'hfe_min', value: '100' }]);
        expect(r1.familyId).toBe('B6');
        const r2 = reclassifyByParameterSignals(B1, [{ name: 'hFE_Max', value: '300' }]);
        expect(r2.familyId).toBe('B6');
      });

      it('matches vceo_v, bvceo_v (underscored variants)', () => {
        const r1 = reclassifyByParameterSignals(B1, [{ name: 'vceo_v', value: '60' }]);
        expect(r1.familyId).toBe('B6');
        const r2 = reclassifyByParameterSignals(B1, [{ name: 'bvceo_v', value: '60' }]);
        expect(r2.familyId).toBe('B6');
      });

      it('matches VCEO (V) with space (WPMSEMI shape)', () => {
        const r = reclassifyByParameterSignals(B1, [{ name: 'VCEO (V)', value: '60' }]);
        expect(r.familyId).toBe('B6');
      });

      it('matches fT_Min (MHz) with cooccurrence (WPMSEMI shape)', () => {
        const r = reclassifyByParameterSignals(B1, [
          { name: 'fT_Min (MHz)', value: '300' },
          { name: 'hFE_Min', value: '100' }, // cooccurrence partner
        ]);
        expect(r.familyId).toBe('B6');
      });

      it('matches IC (mA) with cooccurrence (WPMSEMI shape)', () => {
        const r = reclassifyByParameterSignals(B1, [
          { name: 'IC (mA)', value: '500' },
          { name: 'VCEO (V)', value: '60' }, // cooccurrence partner
        ]);
        expect(r.familyId).toBe('B6');
      });

      it('matches eoff_mj, eon_mj, ets_mj (IGBT switching energy)', () => {
        const r1 = reclassifyByParameterSignals(B1, [{ name: 'eoff_mj', value: '1.5' }]);
        expect(r1.familyId).toBe('B7');
        const r2 = reclassifyByParameterSignals(B1, [{ name: 'eon_mj', value: '1.0' }]);
        expect(r2.familyId).toBe('B7');
      });

      it('matches qg_nc, qgs_nc, qgd_nc + Rds(on) cooccurrence (MOSFET gate charge underscored)', () => {
        // Qg requires Rds(on) cooccurrence (post-May-27-fix) to avoid IGBT
        // false positives — IGBTs spec gate charge too.
        const r1 = reclassifyByParameterSignals(B1, [
          { name: 'qg_nc', value: '40' },
          { name: 'rds_on', value: '0.025' },
        ]);
        expect(r1.familyId).toBe('B5');
        const r2 = reclassifyByParameterSignals(B1, [
          { name: 'qgs_nc', value: '15' },
          { name: 'rds_on', value: '0.025' },
        ]);
        expect(r2.familyId).toBe('B5');
      });

      it('matches idss_ma (JFET)', () => {
        const r = reclassifyByParameterSignals(B1, [{ name: 'idss_ma', value: '5' }]);
        expect(r.familyId).toBe('B9');
      });

      it('matches ctr_min, viso_vrms (optocoupler underscored)', () => {
        const r1 = reclassifyByParameterSignals(B1, [{ name: 'ctr_min', value: '50' }]);
        expect(r1.familyId).toBe('E1');
        const r2 = reclassifyByParameterSignals(B1, [{ name: 'viso_vrms', value: '5000' }]);
        expect(r2.familyId).toBe('E1');
      });
    });

    // ── Real-MFR fixture shapes ─────────────────────────────────────
    // Spot-checked against actual data/atlas/mfr_*.json files. These cover
    // the 13 MFRs in the BJT-misclass cleanup scope.
    describe('real-MFR BJT-shape products reclassify B7 → B6', () => {
      const B7 = { category: 'Transistors' as const, subcategory: 'IGBT', familyId: 'B7' };

      it('WPMSEMI shape: hFE_Min + hFE_Max + VCEO (V) + fT_Min (MHz) + IC (mA)', () => {
        const params = [
          { name: 'Package', value: 'SOT-23' },
          { name: 'Polarity', value: 'NPN' },
          { name: 'IC (mA)', value: '500' },
          { name: 'VCEO (V)', value: '45' },
          { name: 'hFE_Min', value: '110' },
          { name: 'hFE_Max', value: '800' },
          { name: 'fT_Min (MHz)', value: '300' },
        ];
        const r = reclassifyByParameterSignals(B7, params);
        expect(r.familyId).toBe('B6');
      });

      it('KEXIN shape: VCBO(V) + VCEO(V) + VEBO(V) + HFE(Min.) + IC(A) + VCESAT(V)', () => {
        const params = [
          { name: 'package', value: 'SOT-23' },
          { name: 'VCBO(V)', value: '50' },
          { name: 'VCEO(V)', value: '45' },
          { name: 'VEBO(V)', value: '6' },
          { name: 'IC(A)', value: '0.1' },
          { name: 'VCESAT(V)', value: '0.3' },
          { name: 'HFE(Min.)', value: '100' },
          { name: 'HFE(Max.)', value: '300' },
          { name: 'fT(MHz)', value: '300' },
        ];
        // VCBO matches the B6 vcbo/vceo/vebo signature first; B6 wins even
        // though VCESAT would match B7 later in the loop.
        const r = reclassifyByParameterSignals(B7, params);
        expect(r.familyId).toBe('B6');
      });

      it('SWST shape with concat forms: VCBO(V) + VCEO(V) + ... + hFEhFE + hFEVCE(V) + hFEIC(mA)', () => {
        const params = [
          { name: 'Polarity', value: 'NPN' },
          { name: 'Ptot(W)', value: '0.625' },
          { name: 'IC(A)', value: '0.1' },
          { name: 'VCBO(V)', value: '50' },
          { name: 'VCEO(V)', value: '45' },
          { name: 'VEBO(V)', value: '6' },
          { name: 'VCEsat(V)', value: '0.3' },
          { name: 'fT(MHz)', value: '300' },
          { name: 'hFEhFE', value: '100' }, // concat — not matched standalone
          { name: 'hFEVCE(V)', value: '10' }, // concat — not matched standalone
          { name: 'hFEIC(mA)', value: '2' }, // concat — not matched standalone
        ];
        // VCBO matches first; concat forms are noise on top.
        const r = reclassifyByParameterSignals(B7, params);
        expect(r.familyId).toBe('B6');
      });

      it('legitimate B7 IGBT (vces_max + eoff + ic_max only) STAYS in B7', () => {
        // The 244 legitimate B7 IGBTs from the survey carry zero BJT-unique
        // keys. Ic alone (without hfe/vcbo/vceo/vebo) must not flip them.
        const params = [
          { name: 'vces_max', value: '1200' },
          { name: 'ic_max', value: '40' },
          { name: 'eoff', value: '2.0' },
          { name: 'igbt_technology', value: 'Trench' },
        ];
        const r = reclassifyByParameterSignals(B7, params);
        expect(r).toEqual(B7);
      });

      it('legitimate B7 IGBT carrying ic_max stays in B7 (no cooccurring BJT signal)', () => {
        const params = [
          { name: 'vces_max', value: '650' },
          { name: 'ic_max', value: '20' },
        ];
        const r = reclassifyByParameterSignals(B7, params);
        expect(r).toEqual(B7);
      });

      it('WPMSEMI HFT3837 shape (ic_ma + vceo_v + hfe_min + hfe_max + vce_sat_max_v) reclassifies B7 → B6', () => {
        // The 5 known WPMSEMI BJTs in B7 carry vce_sat_max_v alongside hfe/vceo.
        // Without vce_sat cooccurrence on Vces/Eoff, the sig would route them
        // BACK to B7. With the guard, B6 sigs (vceo, hfe) fire first and the
        // product correctly stays in B6.
        const params = [
          { name: 'ic_ma', value: '300' },
          { name: 'vceo_v', value: '45' },
          { name: 'hfe_max', value: '800' },
          { name: 'hfe_min', value: '110' },
          { name: 'polarity', value: 'NPN' },
          { name: 'ft_typ_mhz', value: '300' },
          { name: 'package_case', value: 'SOT-23' },
          { name: 'vce_sat_max_v', value: '0.3' },
        ];
        const r = reclassifyByParameterSignals(B7, params);
        expect(r.familyId).toBe('B6');
      });

      it('CRMICRO IGBT shape (qg_ic_vge + vce_sat_ic_vge + vces) STAYS in B7 — Check B regression guard', () => {
        // 27 CRMICRO products. IGBTs spec gate charge too — pattern needs
        // Rds(on) cooccurrence to confirm MOSFET.
        const params = [
          { name: 'eon', value: '1.0' },
          { name: 'trr', value: '50' },
          { name: 'eoff', value: '2.0' },
          { name: 'vces', value: '1200' },
          { name: 'qg_ic_vge', value: '180' },
          { name: 'vge_th_ic', value: '5.5' },
          { name: 'package_case', value: 'TO-247' },
          { name: 'vce_sat_ic_vge', value: '2.1' },
        ];
        const r = reclassifyByParameterSignals(B7, params);
        expect(r).toEqual(B7);
      });

      it('CREATEK IGBT shape (vgs_th + vce_sat + vces_max) STAYS in B7 — Check B regression guard', () => {
        // 128 such products discovered by Check B of atlas-family-signatures-validate.mjs
        // on May 27, 2026. Vgs(th) is shared with MOSFETs but without Rds(on)/Qg, this
        // product is unambiguously IGBT (Vce(sat) + Vces are IGBT-specific).
        const params = [
          { name: 'vgs_th', value: '5.5' },
          { name: 'vce_sat', value: '2.1' },
          { name: 'vces_max', value: '1200' },
          { name: 'package_case', value: 'TO-247' },
        ];
        const r = reclassifyByParameterSignals(B7, params);
        expect(r).toEqual(B7);
      });
    });
  });
});
