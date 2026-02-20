# Architectural Decisions

Key design decisions inferred from the codebase, with rationale.

---

## 1. Deterministic Matching Engine, Not LLM-Based Scoring

**Decision:** Cross-reference scoring uses a rule-based engine (`matchingEngine.ts`) with predefined logic tables, not LLM judgment.

**Rationale:** Electronic component replacement is safety-critical in many applications (automotive, medical, aerospace). Rule outcomes must be reproducible, auditable, and explainable. Every rule has an `engineeringReason` field documenting *why* it exists. The LLM orchestrates the conversation flow and tool calls but never decides whether a replacement is valid.

**Tradeoff:** Adding a new component family requires manually encoding rules from the `.docx` spec documents. There's no way to "learn" rules from examples.

---

## 2. LLM as Conversation Orchestrator with Tool Calling

**Decision:** Claude drives the multi-turn conversation via tool use (`search_parts`, `get_part_attributes`, `find_replacements`, `filter_recommendations`), but all data access and scoring goes through deterministic services.

**Rationale:** The LLM handles natural language understanding (what part the user wants, disambiguating multiple matches, explaining results) while the matching engine handles correctness. This separation means the LLM can't hallucinate scores or invent attribute values.

**Tradeoff:** Tool-calling adds latency (multiple round trips). The system prompt is long (~150 lines) to guide the agent's behavior.

---

## 3. Dual Mode: LLM + Deterministic Fallback

**Decision:** `useAppState` checks for the Claude API key at startup. If available, it uses the LLM orchestrator. If not, it runs a deterministic conversation flow with hardcoded prompts and direct API calls.

**Rationale:** Allows the app to function without an Anthropic API key (demo mode, cost control, offline development). The deterministic path follows the same phases (search → resolve → attributes → context → recommendations) but uses scripted messages instead of LLM-generated ones.

**Tradeoff:** Two conversation paths to maintain. The deterministic path is more rigid — it can't handle unexpected user input or free-form questions.

---

## 4. Digikey-First with Silent Mock Fallback

**Decision:** `partDataService.ts` tries Digikey API first, falls back to mock data with a `console.warn`.

**Rationale:** Development can proceed without live API access. Mock data covers enough parts (6 MLCCs, 3 resistors, 5 ICs) for UI development and basic flow testing.

**Tradeoff:** The UI doesn't indicate whether results came from Digikey or mock. Users may not realize they're seeing stale/limited data. This is a known gap (see BACKLOG.md).

---

## 5. Logic Tables as Static TypeScript, Not Database Records

**Decision:** Each family's rules are hardcoded in TypeScript files (`lib/logicTables/*.ts`), not stored in a database.

**Rationale:** Rules change infrequently (they're derived from engineering spec documents). TypeScript provides type safety — a rule with `logicType: 'threshold'` must have a `thresholdDirection`. Having rules in code means they're version-controlled, reviewable in PRs, and deployed atomically with the app. No database migration needed when rules change.

**Tradeoff:** Adding or updating a family requires a code change and deploy, not a config update.

---

## 6. Variant Families via Delta Builder + Classifier

**Decision:** Some families (current sense resistors, through-hole resistors, aluminum polymer, mica, RF inductors, chassis mount resistors) are derived from base families using a delta pattern — start with the base rules, then add/remove/override specific rules.

**Rationale:** These variant families share 70-90% of their rules with the base family. Duplicating the entire table would create a maintenance burden. The delta approach (`deltaBuilder.ts`) ensures changes to base rules automatically propagate to variants.

The classifier (`familyClassifier.ts`) examines part attributes to detect which variant applies — e.g., a chip resistor with low resistance (≤1Ω) and "current sense" in the description gets classified as family 54 instead of 52.

**Tradeoff:** Classification heuristics can produce false positives (e.g., an RF inductor check based on nanohenry range is brittle). Processing order matters: REMOVE → OVERRIDE → ADD.

---

## 7. Application Context Modifies Rule Weights, Not Rules

**Decision:** Context questions (e.g., "Is this automotive?", "Is this on a flex PCB?") adjust rule weights and types via `contextModifier.ts`, rather than creating entirely different logic tables per application.

**Rationale:** There are potentially hundreds of application combinations. Rather than a combinatorial explosion of tables, one table per family is modified at evaluation time. The effect types are well-defined: `escalate_to_mandatory` (weight → 10), `escalate_to_primary` (weight → 8-9), `not_applicable` (weight → 0), `add_review_flag` (type → application_review), `set_threshold`.

**Tradeoff:** If two context answers affect the same rule, the last one wins — no conflict resolution. Effects are applied in question order.

---

## 8. OrchestratorMessage Types in lib/types.ts, Not in Orchestrator Module

**Decision:** `OrchestratorMessage` and `OrchestratorResponse` interfaces are defined in `lib/types.ts` even though they're primarily used by `llmOrchestrator.ts`.

**Rationale:** The orchestrator module imports `@anthropic-ai/sdk`, which is server-only. If types were co-located with the orchestrator, any client component importing those types would pull in the server-only SDK and break the build. Keeping types in the shared `types.ts` file avoids this.

---

## 9. Digikey Parameter Mapping by ParameterText, Not Numeric ID

**Decision:** `digikeyParamMap.ts` maps parameters using the human-readable `ParameterText` string (e.g., "Voltage - Rated") rather than the numeric `ParameterId`.

**Rationale:** ParameterText strings are more stable across Digikey API versions and more readable in code. Numeric IDs are opaque and would require a lookup table to understand.

**Tradeoff:** If Digikey changes a label (e.g., "Voltage - Rated" → "Voltage Rating"), the mapping breaks silently. The discovery script (`scripts/discover-digikey-params.mjs`) exists to verify mappings against live API data.

---

## 10. Streaming NDJSON for Batch Validation

**Decision:** The `/api/parts-list/validate` endpoint returns results as a streaming NDJSON response, not a single JSON payload.

**Rationale:** Batch validation can take minutes for large lists. Streaming allows the UI to update row-by-row as results arrive, rather than waiting for all rows to complete. Concurrency is capped at 3 to respect Digikey rate limits.

**Tradeoff:** Error recovery mid-stream is limited. If the connection drops, the client must track which rows were completed and retry the rest.

---

## 11. CSS Grid Layout with Animated Column Transitions

**Decision:** The main layout uses CSS Grid with `grid-template-columns` transitions for the panel reveal (idle → attributes → recommendations).

**Rationale:** CSS Grid transitions are hardware-accelerated and produce smooth animations without JavaScript layout calculations. The two-step reveal (70/30 → 40/30/30) gives visual feedback that new information is available.

**Tradeoff:** Grid column transitions require careful width management. Panel content must handle variable widths gracefully.

---

## 12. Supabase for Auth + Persistence, Not a Custom Backend

**Decision:** Authentication, user profiles, and conversation persistence use Supabase (hosted PostgreSQL + auth).

**Rationale:** Avoids building a custom auth system. Supabase provides RLS (Row Level Security) out of the box, so users can only access their own conversations. Server-side auth via `@supabase/ssr` integrates cleanly with Next.js App Router.

**Tradeoff:** Adds a hosted dependency. The schema is manually managed via `scripts/supabase-schema.sql` (no migration tool).

---

## 13. Invite-Code Registration, Not Open Signup

**Decision:** User registration requires a `REGISTRATION_CODE` from the environment.

**Rationale:** The app is in early development and uses paid APIs (Anthropic, Digikey). Open registration would risk unexpected costs and unauthorized access.

---

## 14. i18n from Day One

**Decision:** All user-facing text uses `react-i18next` with translation files for English, German, and Simplified Chinese.

**Rationale:** The target market includes European and Asian electronics manufacturers. Retrofitting i18n is painful, so it was built in early.

**Tradeoff:** Some strings are still hardcoded (status text in PartsListTable, logic type labels in LogicShell). These should be moved to translation files.

---

## 15. Test Suite: Jest on Core Business Logic

**Decision:** Unit tests cover the 5 core business logic modules (175 tests). API routes, UI components, and the LLM orchestrator are intentionally untested.

**What's covered:**
- `matchingEngine.ts` (55 tests) — all 7 rule evaluators, scoring math, fail propagation, partial credit, missing-value edge cases
- `familyClassifier.ts` (24 tests) — variant detection for all 6 variant families, cross-family safety, rectifier enrichment
- `deltaBuilder.ts` (14 tests) — REMOVE→OVERRIDE→ADD processing order, immutability, silent skip
- `contextModifier.ts` (12 tests) — all 5 effect types, last-writer-wins, unanswered/unmatched skip
- `digikeyMapper.ts` (70 tests) — category/subcategory/status mapping, SI prefix extraction, value transformers, search dedup

**Rationale:** These modules contain the highest-risk logic — numeric parsing, hierarchy evaluation, scoring math — where bugs are silent (wrong percentages, incorrect pass/fail). Everything else either fails loudly (API routes, auth) or is non-deterministic (LLM orchestrator). UI is better covered by E2E tests if needed later.

**Config:** `jest.config.ts` using `next/jest.js` for SWC transforms and `@/*` path aliases. `testEnvironment: 'node'`. Tests run in ~0.2s.

**Tradeoff:** No integration tests verifying the wiring between services (e.g., `partDataService` orchestration). Build verification (`npm run build`) catches type-level wiring errors; the remaining gap is acceptable.

---

## 16. Digikey API Parameter Quirks (Discovered During Mapping)

**Context:** While building param maps for chip resistors (Feb 2026), we ran the discovery script against multiple real parts and found that Digikey's parametric data structure has category-specific quirks that affect how mappings must be built. These findings apply to all future family mappings.

**Key findings:**

1. **Parameters vary by category, not just by value.** Chip resistors have no `Voltage - Rated` parameter at all — it simply doesn't exist in their parametric data. The logic table expects `voltage_rated` (weight 8), but Digikey never provides it. The matching engine handles this gracefully: when both source and candidate are missing the same attribute, the rule passes. Each family must be probed via the discovery script to learn which parameters Digikey actually provides.

2. **"Ratings" vs "Features" is inconsistent across categories.** For MLCCs, AEC-Q200 qualification appears in the `Ratings` parameter. For chip resistors, `Ratings` is always `"-"` and AEC-Q200 appears in `Features` instead. The mapper's `transformToAecQ200()` function checks for the "AEC-Q200" substring regardless of which field it comes from, but each family's param map must point the right Digikey field to the `aec_q200` attributeId.

3. **"Features" is a multi-valued comma-separated field.** A single `Features` value can contain "Automotive AEC-Q200, Moisture Resistant, Pulse Withstanding". When multiple internal attributes need to be extracted from one Digikey field, the param map uses array entries (`ParamMapEntry = ParamMapping | ParamMapping[]`) and each value transformer runs independently against the same text.

4. **MSL (Moisture Sensitivity Level) is not always a Parameter.** For MLCCs, MSL appears as a normal parameter (`Moisture Sensitivity Level (MSL)`). For chip resistors, MSL only exists in the product-level `Classifications.MoistureSensitivityLevel` field, not in the `Parameters` array. The mapper now extracts MSL from Classifications as a fallback for any mapped category.

5. **Anti-sulfur is best-effort.** Anti-sulfur resistors (e.g., YAGEO AC series) are not consistently tagged by Digikey. Some show "Moisture Resistant" in Features without explicitly saying "Anti-Sulfur". The transformer checks for keywords like "anti-sulfur" and "sulphur resistant", but detection is incomplete. This is a known data quality limitation.

**Implication for future mappings:** Always run the discovery script (`scripts/discover-digikey-params.mjs`) against 2-3 representative parts per family before writing a param map. Do not assume parameter names or field locations are the same as other families.

---

## 17. Digikey API Parameter Quirks — Inductor Group (Families 69-72)

**Context:** While building param maps for inductors, ferrite beads, and common mode chokes (Feb 2026), we ran the discovery script against 14 representative parts across all three Digikey categories: "Fixed Inductors", "Ferrite Beads and Chips", and "Common Mode Chokes".

**Key findings:**

1. **Power inductors and RF inductors share one Digikey category: "Fixed Inductors."** Both family 71 (power) and family 72 (RF/signal) parts are returned under the same category. A single param map serves both families, and `familyClassifier.ts` handles the 71→72 split based on attributes. This mirrors how chip resistors (52-55) share a single Digikey category.

2. **Height field name varies by category.** Fixed Inductors use `Height - Seated (Max)`, but Ferrite Beads and Common Mode Chokes use `Height (Max)`. Each param map must use the correct Digikey field name for its category.

3. **DCR and Current Rating field names vary by category.** Fixed Inductors: `DC Resistance (DCR)` and `Current Rating (Amps)`. Ferrite Beads and CMCs: `DC Resistance (DCR) (Max)` and `Current Rating (Max)`. The "(Max)" suffix is category-specific.

4. **"Package / Case" is often "Nonstandard" for inductors.** Most power inductors return `Package / Case: Nonstandard`, with the actual package info in `Supplier Device Package` (e.g., "1210 (3225 Metric)"). The mapper now falls back to `Supplier Device Package` when `Package / Case` is "Nonstandard".

5. **AEC-Q200 for inductors appears in "Ratings" (consistent with MLCCs).** Confirmed on SRP1265A-100M (Bourns): `Ratings: AEC-Q200`. Non-automotive parts show `Ratings: -`. All ferrite beads and CMCs probed showed `Ratings: -`; AEC-Q200 would appear in the same field when present.

6. **Ferrite beads have no Tolerance or Voltage Rating parameters.** The logic table expects both (weights 5 each), but Digikey doesn't provide them. The matching engine handles this gracefully (both sides missing → rule passes). Accepted as-is.

7. **CMC "Filter Type" maps to application type.** Values observed: `"Signal Line"`, `"Power Line"`, `"Power, Signal Line"`. Mapped to `application_type` attributeId. The identity match works because both source and candidate get the same Digikey format string.

8. **Common mode inductance is not in Digikey parametric data.** The CMC logic table expects `cm_inductance` (weight 8), but Digikey doesn't provide it as a parameter. Added as a placeholder ("Consult datasheet") so it appears in the attributes panel.

9. **"Shielding" for inductors has three values.** Digikey returns "Shielded", "Semi-Shielded", or "Unshielded". The shielding rule was converted from `identity_flag` to `identity_upgrade` with hierarchy `['Shielded', 'Semi-Shielded', 'Unshielded']`. This required a bug fix in `matchingEngine.ts` — the `identity_upgrade` evaluator used `.includes()` for hierarchy matching, causing "Shielded" to false-match inside "Semi-Shielded" and "Unshielded". Fixed by trying exact match first, then falling back to substring.

10. **CMC "Approval Agency" and "Features" fields exist but are typically empty.** Mapped to `safety_rating` and `interface_compliance` respectively, but all 5 probed CMCs returned "-" for both. These fields likely carry data for safety-certified or interface-specific parts.

**Parts probed:**
- Fixed Inductors: SRR1260-100M, NR6028T100M, SRP1265A-100M, LQH32CN100K53L, LQW15AN3N3C80D
- Ferrite Beads: BLM18PG221SN1D, BLM15AG601SN1D, BLM18KG601SN1D, BLA31AG601SN4D
- Common Mode Chokes: DLW5BTM102SQ2L, ACM2012-900-2P-T002, DLW21SN900SQ2L, ACM7060-701-2PL-TL01, DLW5BSM351SQ2L

---

## 18. Digikey API Parameter Quirks — Capacitor Group (Families 58-61, 64)

**Context:** While building param maps for tantalum, aluminum electrolytic, aluminum polymer, film, and supercapacitor families (Feb 2026), we ran the discovery script against 18 representative parts across 6 Digikey categories.

**Key findings:**

1. **Tantalum and Tantalum Polymer are separate Digikey categories.** Standard tantalum = "Tantalum Capacitors" (15 params). Polymer tantalum = "Tantalum - Polymer Capacitors" (15 params). The parameter sets differ: standard tantalum has `Failure Rate` (always "-") but no `Ratings`; polymer tantalum has `Ratings` but no `Failure Rate`. Both categories are mapped to the same param map since our family 59 handles both via the upgrade hierarchy.

2. **AEC-Q200 is unreliable for standard tantalum.** Even known automotive parts (KEMET T495, Vishay 593D) show `Features: "General Purpose"` with no `Ratings` field. AEC-Q200 status may only be available in product-level metadata for this category. The mapper checks both `Features` and `Ratings` fields via the `transformToAecQ200()` transformer.

3. **Many tantalum logic table attributes are missing from Digikey.** `ripple_current` (w7), `leakage_current` (w5), `dissipation_factor` (w5), and `failure_mode` (w8) have no corresponding Digikey parameters. Total weight 25 unavailable for differentiation. The matching engine handles this gracefully (both sides missing → rule passes).

4. **Aluminum Electrolytic has two ripple current fields.** `Ripple Current @ Low Frequency` (120 Hz) and `Ripple Current @ High Frequency` (100 kHz). The logic table has one `ripple_current` rule. We map the high-frequency value since 100 kHz is the standard comparison point for electrolytics.

5. **Diameter is encoded in "Size / Dimension", not a dedicated field.** Format: `"0.197" Dia (5.00mm)"`. Applies to aluminum electrolytic, aluminum polymer, and supercapacitors. A custom `transformToDiameter()` extracts the metric value from this compound string.

6. **Aluminum Polymer is a separate Digikey category.** "Aluminum - Polymer Capacitors" (16 params) differs from "Aluminum Electrolytic Capacitors" (17 params): no `Polarization` field (all are polar — added as placeholder), only high-frequency ripple current (no low-frequency), and `Type: "Polymer"` doesn't distinguish PEDOT vs polypyrrole (added `polymer_type` placeholder).

7. **Film capacitor "Ratings" conflates safety class with AEC-Q200.** Values like `"AEC-Q200, X2"` contain both. The param map uses an array entry (like chip resistor `Features`) to multi-map `Ratings` to both `aec_q200` and `safety_rating`. The `transformToSafetyRating()` transformer extracts X1/X2/Y1/Y2 class codes.

8. **Film capacitor "Dielectric Material" is a compound field.** Values like `"Polypropylene (PP), Metallized"` combine material type and construction. Two transformers run independently: `transformToDielectricType()` extracts the abbreviation (PP/PPS/PEN/PET), and `transformToSelfHealing()` infers self-healing capability from "Metallized" keyword.

9. **Film capacitors have separate AC and DC voltage fields.** `"Voltage Rating - AC"` and `"Voltage Rating - DC"` align directly with the logic table's `voltage_rated_ac` and `voltage_rated_dc` attributes. Some parts have only AC (EMI filters), some only DC, some both.

10. **Supercapacitor parametric data is extremely sparse.** Only 14 parameters, many "-". Uses `"Qualification"` instead of `"Ratings"` for AEC-Q200. Missing from Digikey: `technology`, `peak_current`, `leakage_current`, `self_discharge`, `cycle_life`. Tolerance is asymmetric (e.g., `"0%, +100%"`, `"-20%, +80%"`). Capacitance in F or mF, not µF.

11. **Supercapacitor Digikey category name required a `mapSubcategory()` fix.** The raw category "Electric Double Layer Capacitors (EDLC), Supercapacitors" didn't match any existing subcategory mapping. Added case for `supercapacitor` / `double layer` → `"Supercapacitor"`.

12. **ESR values include frequency suffix across multiple categories.** Aluminum electrolytic: `"260mOhm @ 100kHz"`, supercaps: `"200mOhm @ 1kHz"`, polymer tantalum: `"70mOhm @ 100kHz"`. The existing `extractNumericValue()` regex matches the first number+unit correctly, so numeric extraction works despite the suffix.

**Parts probed:**
- Tantalum: TAJB106K016RNJ (AVX), T491B106K016AT (KEMET), 293D106X9016B2TE3 (Vishay), TAJR475M010RNJ (AVX), T495D107K016ATE100 (KEMET), 593D107X9016D2TE3 (Vishay)
- Tantalum Polymer: T520B107M006ATE070 (KEMET)
- Aluminum Electrolytic: UWX1V100MCL1GB (Nichicon), EEE-FT1V101AP (Panasonic), 860020672012 (Würth)
- Aluminum Polymer: PCJ1C330MCL1GS (Nichicon)
- Film: ECW-F2105JB (Panasonic), MKP1848C61060JP4 (Vishay), B32922C3104M000 (EPCOS/TDK), ECQ-U2A105ML (Panasonic), BFC233920104 (Vishay)
- Supercapacitors: CPH3225A (Seiko), XH414HG-IV01E (Seiko), SCMR18C105PRBA0 (AVX), MAL219691102E3 (Vishay)

---

## 19. Digikey API Parameter Quirks — Protection Components & Rectifier Diodes (Families 65-68, B1)

**Context:** While building param maps for varistors, PTC resettable fuses, NTC/PTC thermistors, and rectifier diodes (Feb 2026), we ran the discovery script against 19 representative parts across 6 Digikey categories: "Varistors, MOVs", "PTC Resettable Fuses", "NTC Thermistors", "PTC Thermistors", "Single Diodes", and "Bridge Rectifiers".

**Key findings:**

1. **Varistors use "Qualification" for AEC-Q200 (same as supercaps).** No "Ratings" or "Features" field exists in this category. Three varistor voltage fields (Min/Typ/Max) — we map Typ (standard 1mA specification). "Maximum AC Volts" mapped as continuous voltage (DC skipped — AC is more conservative).

2. **Varistor clamping voltage is NOT in Digikey parametric data.** This is the second most important varistor spec (weight 9). Also missing: response time, leakage current, surge pulse lifetime, safety rating, thermal disconnect. Total unmapped weight: 52 of 126. Added clamping voltage as placeholder.

3. **PTC fuses have dual height fields.** "Height - Seated (Max)" is populated for through-hole parts; "Thickness (Max)" is populated for SMD parts. Both map to `height` — the non-"-" value wins when the matching engine's `buildParamMap()` overwrites duplicate keys. AEC-Q200 appears in "Ratings" (confirmed on Bourns MF-MSMF050-2).

4. **NTC thermistors have multiple B-value fields.** B0/50, B25/50, B25/75, B25/85, B25/100 represent measurements at different temperature ranges. B25/50 is the most commonly populated for SMD chip types; bead/leaded types may only have B25/100. We map B25/50 as primary `b_value`. Accepted limitation: bead types without B25/50 won't have a B-value match (weight 9 rule).

5. **B-value "K" suffix is Kelvin, not kilo.** "3380K" means 3380 Kelvin, but `extractNumericValue()` would interpret "K" as kilo (×1000) → 3,380,000. Added `transformBValue()` that preserves raw text. Since `b_value` uses `identity` matching (string comparison), the incorrect numericValue doesn't affect matching behavior.

6. **PTC thermistor data is EXTREMELY sparse.** Only 6 Digikey parameters, 4 mappable to logic table rules (resistance, tolerance, operating temp, package). Total matchable weight: 26 of 109 (24%). Most logic table rules will pass via both-sides-missing. Operating Temperature represents the PTC switch range (e.g., 90-160°C), not ambient — this is correct for cross-referencing.

7. **Rectifier diodes span TWO Digikey categories.** "Single Diodes" (standard/fast/ultrafast/Schottky) and "Bridge Rectifiers" have different parameter sets with different field names. Two separate param maps needed. Single diodes provide `Vdc` but not `Vrrm`; bridges provide `Vrrm` but not `Vdc`.

8. **"Speed" field encodes recovery category as a compound string.** Values: `"Standard Recovery >500ns, > 200mA (Io)"`, `"Fast Recovery =< 500ns, > 200mA (Io)"`. Added `transformToRecoveryCategory()` that extracts "Standard"/"Fast"/"Ultrafast" to match the upgrade hierarchy in `rectifierDiodes.ts`. This supplements the existing `enrichRectifierAttributes()` function in `familyClassifier.ts`.

9. **AEC-Q101 (discrete semiconductor qualification) is NOT in Digikey parametric data.** Unlike passive AEC-Q200 which appears in Ratings/Qualification/Features for some categories, AEC-Q101 is completely absent from the "Single Diodes" and "Bridge Rectifiers" parameter sets. Weight 8 rule will pass via both-sides-missing.

10. **"Operating Temperature - Junction" has inconsistent format.** Three patterns observed: range (`"-65°C ~ 150°C"`), max-only (`"175°C (Max)"`), and with qualifier (`"-65°C ~ 150°C (TJ)"`). Mapped to `operating_temp` as-is; the range parser in `matchingEngine.ts` handles the standard range format.

11. **Added `'Protection'` to `ComponentCategory`.** Varistors, thermistors, and PTC fuses don't fit existing categories (Capacitors/Resistors/etc.). New `'Protection'` category provides clean semantic grouping. Only required changes to `types.ts` (type union) and `digikeyMapper.ts` (`mapCategory()` function).

12. **Six new `mapSubcategory()` cases needed.** "Varistors, MOVs" → "Varistor", "PTC Resettable Fuses" → "PTC Resettable Fuse", "NTC Thermistors" → "NTC Thermistor", "PTC Thermistors" → "PTC Thermistor", "Single Diodes" → "Rectifier Diode", "Bridge Rectifiers" → "Diodes - Bridge Rectifiers". These align with the `subcategoryToFamily` lookup in `lib/logicTables/index.ts`.

**Parts probed:**
- Varistors: ERZ-V14D201 (Panasonic), B72214S0271K101 (EPCOS/TDK), V14E130P (Littelfuse), V5.5MLA0603NH (Littelfuse SMD), V18MLA1206H (Littelfuse SMD)
- PTC Resettable Fuses: MF-MSMF050-2 (Bourns AEC-Q200), RXEF050 (Littelfuse TH), 1210L050YR (Littelfuse SMD)
- NTC Thermistors: NCP15XH103F03RC (Murata), NTCG103JF103FT1 (TDK), B57861S0103F040 (EPCOS/TDK AEC-Q200)
- PTC Thermistors: B59100M1120A070 (EPCOS/TDK), B59901D0070A040 (EPCOS/TDK)
- Single Diodes: S1M-13-F (Diodes Inc), 1N4007-E3/54 (Vishay), STTH1R06RL (ST), BYV29X-600,127 (WeEn), MURS120-13-F (Diodes Inc), STPS2L60A (ST Schottky)
- Bridge Rectifiers: GBJ2510-F (Diodes Inc), DF10S-E3/45 (Vishay)

---

## 20. Data Source Indicator on PartAttributes

**Decision:** Added `dataSource?: 'digikey' | 'mock'` to the `PartAttributes` interface only. Did not add a separate data source tracker for recommendations.

**Rationale:** `partDataService.getAttributes()` is the single function that decides whether to return Digikey or mock data. Tagging the result at the source is the minimal change — the field flows automatically through API responses, `useAppState`, and into `AttributesPanel` with no intermediate plumbing.

**Why not track recommendations separately?** Three reasons:

1. **If source attributes are mock, everything downstream is suspect.** Recommendations are scored against the source attributes — mock attributes produce unreliable scores regardless of where candidates come from. The "Mock Data" chip on the attributes panel is sufficient warning.

2. **Mock recommendations for supported families are effectively empty.** `mockGetRecommendations()` only has hardcoded results for 1 resistor and 1 IC. For the 19 supported families, if Digikey candidate search fails, the user sees "0 replacements found" — which is its own signal.

3. **Complexity cost is high for the edge case.** Tracking recommendations source separately would require: a new wrapper type around `XrefRecommendation[]`, changes to 3 API routes, `lib/api.ts` return types, `useAppState` storage, and `RecommendationsPanel` display. All for a scenario (Digikey attributes succeed but candidate search fails) that's rare in practice.

**Files changed:**
- `lib/types.ts` — added `dataSource` to `PartAttributes`
- `lib/services/partDataService.ts` — tagged all return paths in `getAttributes()`
- `components/AttributesPanel.tsx` — amber "Mock Data" chip in header
