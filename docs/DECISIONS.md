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

---

## 21. Component Refactoring: Extract Hooks + Sub-components

**Decision:** Split large shell components (AppShell, PartsListShell) by extracting custom hooks for state/logic groups and sub-components for self-contained JSX blocks. Keep tightly-coupled pipelines (sort/filter/view resolution) in the shell.

**What was extracted:**

*AppShell (536 → 122 lines):*
- `useConversationPersistence` — URL hydration (`?c=<id>`), auto-save on message/phase change, conversation CRUD, history drawer
- `usePanelVisibility` — skeleton delay timer, dismissed state, `showAttributesPanel`/`showRightPanel` derivations, close handlers
- `useManufacturerProfile` — MFR panel open/close, chat manual collapse, auto-clear when leaving 3-panel mode
- `useNewListWorkflow` — pending file state, new list dialog confirm/cancel
- `DesktopLayout` — all grid rendering: 4 panels (chat, attributes, recommendations, MFR), sidebar, history drawer

*PartsListShell (800 → 348 lines):*
- `usePartsListAutoLoad` — 4 initialization effects + 3 guard refs for pending file / URL param / redirect / default view
- `useRowSelection` — multi-select state, auto-clear on row count change, toggle/refresh callbacks
- `useRowDeletion` — two-step delete confirmation (permanent delete vs. hide from view)
- `useColumnCatalog` — 4 interdependent memos: parameter keys, effective headers, available columns, inferred mapping
- `ViewControls` — view dropdown, kebab menu (edit/create/delete), default star toggle, delete confirmation dialog
- `PartsListActionBar` — selection count display, refresh/delete buttons, search field with clear

**Rationale:** These components were 500-800 lines each, mixing state management, business logic, and rendering. Extraction makes each concern independently readable and testable. Hooks are the natural React boundary for state+effects groups. Sub-components are the natural boundary for self-contained JSX with local state.

**What stays in the shell:** Sort/search/filter pipeline (memos that chain together and feed directly into render), view column resolution (depends on both column catalog output and active view), and thin dialog toggles (pickerOpen, editNameOpen — not worth a separate hook).

**Verification approach:** TypeScript type checking (`tsc --noEmit`) after each extraction catches wiring errors. Existing 175 service-layer tests confirm no regressions. Production build confirms full compilation.

**Tradeoff:** PartsListShell ended up at 348 lines (plan estimated ~180) because the sort/filter/view-resolution pipeline is ~120 lines of tightly-coupled memos that couldn't be extracted without artificial splitting. The circular dependency between `usePanelVisibility` (needs `mfrOpen`) and `useManufacturerProfile` (needs `showRightPanel`) was resolved by exposing a `clearManualCollapse` callback and wiring the auto-clear effect in the shell.

---

## 22. Platform Settings Admin Section

**Decision:** Created a unified `/admin` route ("Platform Settings") with 4 view-only sections, accessible via a wrench icon in the sidebar (admin-only). Moved the cross-reference logic viewer from the settings dropdown menu into this section. The old `/logic` route redirects to `/admin?section=logic`.

**Sections:**
1. **Data Sources** — Shows Digikey API, Anthropic API, and Supabase configuration status via a dedicated admin-guarded API route (`/api/admin/data-sources`). Displays masked credentials, base URLs, and coverage metrics. No secrets are exposed — only prefixes, booleans, and public URLs.
2. **Parameter Mappings** — Displays the Digikey ParameterText → internal attributeId mappings per family. Uses `getDigikeyCategoriesForFamily()` and `getFullParamMap()` (new exports from `digikeyParamMap.ts`). Handles multi-map entries (compound fields like "Features" → aec_q200 + anti_sulfur) and families with dual Digikey categories (B1: Single Diodes + Bridge Rectifiers shown as tabs).
3. **Cross-Reference Logic** — The existing logic table viewer (formerly `LogicShell.tsx`), now refactored into `LogicPanel.tsx`.
4. **Application Context** — Shows per-family context questions with options and attribute effects. Each effect displays attributeId → effect type with color-coded chips matching the logic rule color scheme.

**Architecture:** `AdminShell` orchestrator manages section selection (URL params: `?section=data-sources|param-mappings|logic|context`), shared category/family picker state (used by sections 2-4), and renders the active panel. The family picker (`FamilyPicker.tsx`) was extracted from the old `LogicShell.tsx` for reuse across 3 sections.

**Rationale:** The team needs full visibility into the platform's inner workings — data sources, parameter mappings, matching rules, and context logic — without reading code. A single admin section consolidates all "how does the engine work" views under one roof. View-only for now; editing can be added incrementally.

**Files created:** `app/admin/page.tsx`, `app/api/admin/data-sources/route.ts`, `components/admin/AdminShell.tsx`, `AdminSectionNav.tsx`, `FamilyPicker.tsx`, `DataSourcesPanel.tsx`, `ParamMappingsPanel.tsx`, `LogicPanel.tsx`, `ContextPanel.tsx`.

**Files modified:** `components/AppSidebar.tsx` (wrench icon + removed logic menu item), `lib/services/digikeyParamMap.ts` (new exports), `locales/*.json` (i18n keys).

**Files removed:** `components/logic/LogicShell.tsx` (content split into FamilyPicker + LogicPanel).

---

## 23. Digikey Taxonomy Admin Section

**Decision:** Added a 5th "Taxonomy" tab to Platform Settings (`/admin?section=taxonomy`) that displays Digikey's entire product category hierarchy, cross-referenced with supported component families to show coverage status, rule counts, weight statistics, and parameter coverage percentages.

**How it works:**

1. A new `getCategories()` function in `digikeyClient.ts` calls Digikey's `GET /products/v4/search/categories` endpoint and caches the response for 24 hours. The response is normalized to handle both `ChildCategories` and `Children` field names (Digikey API field naming is inconsistent).

2. The API route (`/api/admin/taxonomy`) builds a reverse lookup from Digikey subcategory names to internal family coverage info. For each of the 20 supported families, it computes:
   - **Rule count** from the logic table
   - **Total weight** — sum of all rule weights
   - **Matchable weight** — sum of weights for rules that have Digikey parameter mappings (computed by `computeFamilyParamCoverage()` in `digikeyParamMap.ts`)
   - **Param coverage %** — matchableWeight / totalWeight
   - **Last updated** — static dates derived from git history, stored in `familyLastUpdated` map in `logicTables/index.ts`

3. Subcategory matching uses the same substring-contains approach as `findCategoryMap()`: check if the Digikey subcategory name (lowercased) contains the pattern string from `familyToDigikeyCategories`.

4. Results are sorted with covered categories first, then alphabetical. The UI uses MUI Accordions — categories with coverage are expanded by default.

**Rationale:** The team needs an at-a-glance inventory showing which parts of Digikey's catalog have cross-reference logic. Previously this information was scattered across `logicTables/index.ts`, `digikeyParamMap.ts`, and `DECISIONS.md`. The taxonomy view makes coverage gaps immediately visible and provides metrics (param coverage %) to assess data quality per family.

**Key design choices:**
- **Live API call with cache**, not a static snapshot — Digikey's category structure can change, and the 24h TTL keeps data fresh without excessive API calls.
- **No family picker** — unlike other admin sections, taxonomy shows all families at once since the point is a birds-eye coverage view.
- **Multiple families per subcategory** — Families 12+13 (MLCC + Mica) both map to "Ceramic Capacitors"; families 52-55 all map to "Chip Resistor"; families 71+72 both map to "Fixed Inductors". The UI renders multiple family info cards under the same subcategory.
- **`computeFamilyParamCoverage()` stays in `digikeyParamMap.ts`** — it needs access to the module-private `findCategoryMap()` function, avoiding the need to export internal implementation details.

**Files created:** `app/api/admin/taxonomy/route.ts`, `components/admin/TaxonomyPanel.tsx`.

**Files modified:** `lib/services/digikeyClient.ts` (added `getCategories()`), `lib/types.ts` (taxonomy types), `lib/services/digikeyParamMap.ts` (added `computeFamilyParamCoverage()`), `lib/logicTables/index.ts` (added `familyLastUpdated` + `getFamilyLastUpdated()`), `components/admin/AdminSectionNav.tsx` (taxonomy tab), `components/admin/AdminShell.tsx` (wiring), `locales/*.json` (i18n keys).

---

## 24. Improved Candidate Search: Category Filter + Limit Increase + Active-Only UI Filter

**Decision:** Enhanced the Digikey candidate search to use category-level API filtering and increased the result limit from 20 to 50. Replaced the auto-hide timer for obsolete parts with an explicit "Active only" checkbox in the Recommendations panel.

**What changed:**

1. **Digikey CategoryId preserved through the pipeline.** Added `digikeyCategoryId?: number` to the `Part` interface. `digikeyMapper.ts` now captures the deepest CategoryId from the product's hierarchical category structure via `getDeepestCategoryId()`. Previously this ID was discarded during mapping.

2. **Candidate search uses category filter + higher limit.** `fetchDigikeyCandidates()` now passes the source part's `digikeyCategoryId` to `keywordSearch()` (which already supported a `categoryId` option but it was never used). Limit bumped from 20 → 50 (Digikey's API maximum). This constrains results to the same Digikey product category as the source part, preventing unrelated parts from consuming result slots.

3. **Search query simplified when category filter is active.** `buildCandidateSearchQuery()` now skips the subcategory keyword (e.g., "MLCC") when a `digikeyCategoryId` is available, since the category filter handles that constraint. Falls back to the old keyword-inclusive behavior when no category ID exists (mock data path).

4. **"Active only" checkbox replaces auto-filter.** The old behavior auto-hid obsolete parts after a 2-second delay with no user control and only targeted `status === 'Obsolete'`. The new checkbox (checked by default) filters all non-Active statuses: Obsolete, Discontinued, NRND, and LastTimeBuy. Users can uncheck it to see all lifecycle statuses — useful because non-active parts from Digikey may still be available from other distributors.

**Rationale:** The previous keyword-only search relied entirely on Digikey's text relevance ranking with no category constraint. This meant a search for "10µF 0603" could waste slots on connectors or ICs that matched those keywords. Category filtering ensures all 50 results are from the correct component family. Not filtering by status or stock at the API level was intentional — users benefit from seeing non-active replacements as potential options from other sources, and the UI filter gives them instant control.

**Files modified:**
- `lib/types.ts` — added `digikeyCategoryId` to `Part`
- `lib/services/digikeyMapper.ts` — added `getDeepestCategoryId()`, used in `mapDigikeyProductToPart()`
- `lib/services/partDataService.ts` — updated `fetchDigikeyCandidates()` (category filter + limit 50) and `buildCandidateSearchQuery()` (conditional subcategory keyword)
- `components/RecommendationsPanel.tsx` — replaced auto-filter with `activeOnly` checkbox
- `locales/en.json`, `locales/de.json`, `locales/zh-CN.json` — added `activeOnly` key, updated `headerFiltered` template

---

## 25. Auto-Classified Theme Icons for Parts Lists

**Decision:** Each parts list card on the dashboard displays a contextual MUI outlined icon (light grey on dark) derived from the list's name, description, and customer fields using keyword classification. No new database column — classification is computed on read.

**How it works:**

1. `classifyListTheme(name, description, customer)` in `lib/themeClassifier.ts` concatenates the three fields and checks 16 themes in priority order (domain → technical → objective → general fallback).
2. Each theme has long keywords (substring match) and short keywords (word-boundary match to avoid false positives like "ev" in "every").
3. `THEME_ICON_MAP` maps each theme ID to an MUI outlined icon component.
4. `ListCard.tsx` renders the icon dynamically based on the classified theme.
5. `ListsDashboard.tsx` recomputes the icon on settings save for instant optimistic update.

**Theme priority (first match wins):** automotive > medical > aerospace > industrial > telecom > IoT > battery > power > motor > LED > audio > sensor > cost reduction > obsolescence > second source > general.

**Rationale:** The description field already contains rich application context (e.g. "lithium-ion cells for cell balancing" → battery, "AEC-Q200" → automotive). Keyword matching is instant, free, and sufficient for the narrow domain of electronic component lists. Computing on read (not storing in the database) means the taxonomy can evolve without migrations or backfills. An LLM call was considered but rejected — 1-2s latency and API cost for a visual nicety is overkill, and the keyword approach covers 90%+ of cases.

**Files:**
- `lib/themeClassifier.ts` — taxonomy, classifier function, icon map (new)
- `__tests__/services/themeClassifier.test.ts` — 27 tests (new)
- `lib/partsListStorage.ts` — added `themeIcon` to `PartsListSummary` and `SavedPartsList`
- `lib/supabasePartsListStorage.ts` — computes `themeIcon` via `classifyListTheme()` on read
- `components/lists/ListCard.tsx` — dynamic icon from `THEME_ICON_MAP`
- `components/lists/ListsDashboard.tsx` — optimistic `themeIcon` update on settings save

---

## 26. Light Mode + Theme Toggle

**Decision:** Added a full light color scheme alongside the existing dark mode, with light as the default. Theme is toggleable via a Display Settings section in Account Settings, with instant visual apply and persistence via Supabase user_metadata.

**What changed:**

1. **Dual color scheme in theme.** `theme/theme.ts` now defines both `light` and `dark` under `colorSchemes`. Light palette uses deeper, higher-contrast colors (primary `#1565C0`, text `#1A1A1A`, background `#F5F5F5`). `defaultColorScheme` set to `'light'`.

2. **`colorSchemeSelector: 'data-mui-color-scheme'`** replaces `cssVariables: true`. MUI's default `colorSchemeSelector` is `'media'` (OS-level `prefers-color-scheme`), which makes `setMode()` a no-op. Setting it to a `data` attribute enables programmatic mode switching.

3. **Display Settings in AccountPanel.** A `ToggleButtonGroup` (Light/Dark with sun/moon icons) calls `setMode()` for instant visual apply. The pending theme is batched with the language setting into a unified Save button at the bottom of the page. MUI auto-persists mode to localStorage; Supabase `user_metadata.theme` handles cross-device sync.

4. **ThemeSync component.** Follows the existing `LanguageSync` pattern in `I18nProvider.tsx`. On mount, reads `user_metadata.theme` from Supabase and calls `setMode()` if it differs from the current mode. Handles the case where a user set dark mode on device A and logs in on device B.

5. **Sidebar icons use color tokens, not opacity.** Replaced `opacity: 0.7` / `opacity: 1` with `color: 'text.secondary'` / `color: 'text.primary'`. The opacity trick only worked with light-on-dark; semantic tokens provide correct contrast in both modes.

6. **Dual logo.** `xq-logo.png` (light, for dark backgrounds) and `xq-logo-dark.png` (dark, for light backgrounds). `AppSidebar` swaps `src` based on `mode` from `useColorScheme()`.

7. **Particle wave adapts to both modes.** Removed the dark-mode-only gate. Dot color uses a ref (`dotColorRef`) that updates based on `isDark`: light gray `(210,210,210)` on dark backgrounds, charcoal `(80,80,80)` on light backgrounds.

**What didn't need to change:** Most components use MUI theme tokens (`background.default`, `text.primary`, `divider`, `action.selected`) and adapt automatically. Hardcoded status colors (#69F0AE, #FFD54F, #FF5252) are vivid semantic indicators that work on both backgrounds.

**Files modified:**
- `theme/theme.ts` — light colorScheme, `colorSchemeSelector`, `defaultColorScheme: 'light'`
- `components/ThemeRegistry.tsx` — `defaultMode="light"`
- `components/settings/AccountPanel.tsx` — Display Settings section with theme toggle
- `components/I18nProvider.tsx` — `ThemeSync` component
- `components/ParticleWaveBackground.tsx` — theme-adaptive dot color, removed dark-only gate
- `components/AppSidebar.tsx` — color tokens for icons, dual logo swap
- `locales/en.json`, `de.json`, `zh-CN.json` — i18n keys for Display Settings

**Files added:**
- `public/xq-logo-dark.png` — dark variant of sidebar logo for light mode

---

## 27. Feedback-First QC Panel Restructure

**Decision:** Restructured the admin QC panel from a log-centric view to a feedback-first triage queue. The primary tab shows user-submitted feedback items; the raw recommendation logs tab is secondary (for future AI analysis/export).

**Rationale:** The admin's job is triaging user-reported issues, not manually scanning thousands of recommendation logs. The original design listed logs as the primary entity with feedback as a secondary badge indicator — this inverted the actual workflow. Humans won't review raw logs at scale; that data is better suited for AI-driven pattern analysis.

**What changed:**

1. **Feedback Tab (primary).** New `GET /api/admin/qc/feedback` endpoint queries `qc_feedback` directly as the primary entity. Enriches with user profiles (name/email via separate `profiles` query — FK points to `auth.users`, not `profiles`) and `family_name` from `recommendation_log` via `log_id`. Status filter chips with live badge counts (Open/Reviewed/Resolved/Dismissed). Search across MPN, user, comment, and rule attribute fields.

2. **Feedback Detail View with comparison reconstruction.** When an admin clicks a feedback row, `QcFeedbackDetailView` loads the full snapshot from `recommendation_log` (via existing `GET /api/admin/qc/[logId]`) and reconstructs the comparison table using the same row-building algorithm as `ComparisonView.tsx`: `sourceAttributes.parameters` sorted by `sortOrder`, cross-referenced with `matchDetails` via `parameterId`. The specific rule the user flagged is highlighted with `bgcolor: 'action.selected'` and a yellow left border (`3px solid #FFD54F`).

3. **Edge cases handled:** No `logId` → shows "no linked log" note, skips comparison table. Replacement not in snapshot (capped at 10 recs) → shows `QcRecommendationSummary` cards as fallback. `qualifying_questions` feedback → no comparison table, shows question text and context answers.

4. **Component extraction.** The monolithic `QcPanel.tsx` (764 lines) was split into 7 files: `QcPanel.tsx` (thin shell with settings + tabs), `QcFeedbackTab.tsx`, `QcFeedbackDetailView.tsx`, `QcLogsTab.tsx`, `QcFeedbackCard.tsx`, `QcRecommendationSummary.tsx`, `qcConstants.ts`.

5. **Batch logging bug fixed.** `logRecommendation()` in `/api/parts-list/validate` was called without `await` (fire-and-forget with `.catch(() => {})`), silently dropping most batch log entries when the request context ended. Fixed by adding `await`.

**Key types added:**
- `QcFeedbackListItem extends QcFeedbackRecord` — enriched with `familyName`
- `FeedbackStatusCounts` — `{ open, reviewed, resolved, dismissed }` for filter badge counts

**Tradeoff:** The comparison table reconstruction duplicates the row-building logic from `ComparisonView.tsx` rather than sharing it — acceptable because the contexts differ (live data vs. snapshot, different rendering needs) and a shared abstraction would be premature.

**Files created:** `app/api/admin/qc/feedback/route.ts`, `components/admin/QcFeedbackTab.tsx`, `components/admin/QcFeedbackDetailView.tsx`, `components/admin/QcLogsTab.tsx`, `components/admin/QcFeedbackCard.tsx`, `components/admin/QcRecommendationSummary.tsx`, `components/admin/qcConstants.ts`.

**Files modified:** `app/api/parts-list/validate/route.ts` (await fix), `lib/types.ts` (new types), `lib/api.ts` (new client function), `components/admin/QcPanel.tsx` (rewritten as thin shell), `locales/en.json`, `de.json`, `zh-CN.json` (i18n keys).

---

## 28. QC Log Export + On-Demand AI Analysis

**Decision:** Added CSV/JSON export and on-demand AI analysis to the Logs tab. Export provides raw data download; AI analysis uses server-side aggregation + Claude streaming to produce actionable quality insights.

**Rationale:** Raw recommendation logs are too voluminous for human review but extremely valuable for pattern detection. Two tiers address different needs: export enables offline/spreadsheet analysis, while AI analysis surfaces rule quality issues, parameter mapping gaps, and family-specific patterns directly in the admin UI.

**What changed:**

1. **Export endpoint** (`GET /api/admin/qc/export`). Accepts the same filter params as the log list endpoint plus `format=csv|json`. CSV flattens each log to one row (id, timestamp, user, MPN, family, counts, top 3 recommendation MPNs + match percentages). JSON includes full snapshots. Both use `Content-Disposition: attachment` for browser download. Capped at 10,000 rows. Enriches with profiles and feedback counts using the same batched query pattern as the log list endpoint.

2. **Aggregation service** (`lib/services/qcAnalyzer.ts`). Queries `recommendation_log` with date filter (default 30 days), groups by family, iterates all `recommendations[].matchDetails` to compute per-rule stats: pass/fail/review/upgrade counts, failure rates, missing attribute frequency. Looks up `weight` and `logicType` from the current logic table via `getLogicTable()`. Computes score distributions (5 buckets), feedback correlations, and selects 3-5 representative examples. Returns a compact `QcAnalysisInput` (~3-5K tokens) regardless of underlying log count.

3. **Analysis endpoint** (`POST /api/admin/qc/analyze`). Calls `aggregateQcStats()`, sends the result to Claude Sonnet 4.5 with a QC-specific system prompt, streams the response back as SSE events. The system prompt instructs Claude to analyze: rule quality issues, parameter mapping gaps, family-specific patterns, score distribution anomalies, feedback correlations, and provide 3-5 ranked actionable recommendations.

4. **Analysis Drawer** (`QcAnalysisDrawer.tsx`). MUI right-side Drawer with time range selector (7/30/90/All days), active filter display, "Run Analysis" button, progress messages during aggregation/streaming, and `ReactMarkdown` + `remark-gfm` rendering of Claude's response (same libraries already used by `MessageBubble.tsx`). Auto-scrolls during streaming.

5. **Logs Tab UI** (`QcLogsTab.tsx`). Added Export dropdown (CSV/JSON via `Menu`) and Analyze button (outlined, `AutoFixHighIcon`) between the filter chips and search field. Export builds a URL via `getQcExportUrl()` and opens it with `window.open()`. Analyze opens the drawer.

**Key design decisions:**

- **Server-side aggregation, not raw snapshots to Claude.** A single snapshot can be 5-10K tokens; hundreds would exceed context limits. The aggregator compresses arbitrarily many logs into a fixed-size summary by computing aggregate statistics per family per rule.
- **Logic table lookup for weights.** `MatchDetail` (stored in snapshots) doesn't include `weight` or `logicType`. The aggregator looks these up from the current logic table via `getLogicTable(familyId)`. If the logic table has changed since the log was created, the weights reflect current rules — acceptable since the analysis is about current system behavior.
- **SSE streaming (not NDJSON).** The analysis produces a single long-form response, unlike batch validation which produces per-row results. SSE is more natural for this use case and enables incremental markdown rendering in the drawer.
- **Sonnet 4.5 (not Opus).** Analysis is structured data interpretation, not creative reasoning. Sonnet is faster, cheaper, and sufficient for this task.

**Key types added:**
- `RuleAggregateStats` — per-rule pass/fail/review/upgrade/missing counts + failure rate
- `FamilyAggregateStats` — per-family stats including rule stats, score distribution, feedback counts
- `QcAnalysisInput` — full aggregated dataset sent to Claude
- `QcAnalysisExample` — representative log example (MPN, family, match %, failing rules)
- `QcAnalysisEvent` — SSE event union type (progress | chunk | complete | error)

**Analysis drawer empty state.** Instead of a generic "Click Run Analysis" message, the empty state lists the 5 areas the AI will examine: rule failures (logic table issues), Digikey parameter mapping gaps, family-specific patterns, match score distribution anomalies, and data source quality comparison. This sets expectations before running and helps admins understand the tool's capabilities.

**Backfill (explored, tabled).** Considered adding a server-side "Backfill QC Logs" feature to re-run the recommendation pipeline for lists validated before logging was enabled. Designed but not implemented — admin can simply re-upload lists now that logging is active, or refresh existing lists which already triggers logging through the standard validate pipeline.

**Files created:** `app/api/admin/qc/export/route.ts`, `app/api/admin/qc/analyze/route.ts`, `lib/services/qcAnalyzer.ts`, `components/admin/QcAnalysisDrawer.tsx`.

**Files modified:** `lib/types.ts` (analysis types), `lib/api.ts` (`getQcExportUrl()` + `analyzeQcLogs()`), `components/admin/QcLogsTab.tsx` (Export/Analyze buttons + drawer), `locales/en.json`, `de.json`, `zh-CN.json` (i18n keys).

---

## 29. Organization Promoted to Top-Level Navigation

**Decision:** Moved Organization (user management) out of the Settings page and into its own top-level route (`/organization`) with a dedicated sidebar icon, visible to admins only.

**Rationale:** Organization/user management is an admin-only function that was hidden inside Settings as a fourth section. This made it inconsistent with the other admin tool (Data & Logic at `/admin`) which already had its own sidebar icon and route. Promoting Organization to a peer of Data & Logic gives admins direct access and keeps Settings focused on personal preferences (profile, account, notifications).

**What changed:**

1. **New route and shell.** `app/organization/page.tsx` follows the same page pattern as `/admin` and `/settings` (sidebar + history drawer + shell). `OrgShell.tsx` provides the layout: "Organization" header, left nav with a single "Users" section, and the existing `OrgPanel` as content.

2. **Sidebar icon.** `CorporateFareOutlinedIcon` added to `AppSidebar.tsx` between Data & Logic (wrench) and Settings (gear), admin-only via the same `isAdmin` guard. Active state highlighting follows the existing pattern (`isOrgActive` derived from `pathname`).

3. **Wrench rotation.** The Data & Logic `BuildOutlinedIcon` rotated 90° clockwise (`transform: 'rotate(90deg)'`) for visual distinction.

4. **OrgPanel simplified.** Removed the `Tabs` wrapper (which had a single "User Management" tab) since the shell's section nav now provides that context. Added `px: 3, pt: 2` padding to match the parts list table layout.

5. **Settings cleaned up.** Removed `'organization'` from `SettingsSection` type, `isValidSection()`, section nav array, and content rendering. Removed `isAdmin` prop from `SettingsSectionNav` (no admin-only sections remain). Removed `OrgPanel` import and `useProfile` hook from `SettingsShell`.

**Files created:** `app/organization/page.tsx`, `components/settings/OrgShell.tsx`.

**Files modified:** `components/AppSidebar.tsx` (org icon + wrench rotation + active state), `components/settings/OrgPanel.tsx` (removed Tabs, added padding), `components/settings/SettingsShell.tsx` (removed org handling), `components/settings/SettingsSectionNav.tsx` (removed org section + simplified), `locales/en.json` (title → "Organization", added `users` key).

---

## 30. Schottky Barrier Diodes — Family B2

**Decision:** Added Schottky Barrier Diodes as the second Block B discrete semiconductor family (B2), classified as a variant of B1 (Rectifier Diodes) via the family classifier.

**What changed:**

1. **Logic table** (`lib/logicTables/schottkyDiodes.ts`). 22 rules derived from `docs/schottky_diodes_logic.docx`. Key differences from B1: no reverse recovery attributes (trr, Qrr, recovery_category, recovery_behavior — Schottky is a majority-carrier device with no minority carrier storage); Junction Capacitance (Cj) elevated from Application Review to Threshold (weight 6) since Cj is the switching speed limiter for Schottky; Vf weight elevated to 9 (vs 8 for B1) as the dominant specification; Ir weight elevated to 7 (vs 5) due to thermal runaway risk; thermal resistance weights elevated. New attributes: Semiconductor Material Si/SiC (identity_flag, weight 9), Technology Trench/Planar (application_review, weight 4), Vf Temperature Coefficient (application_review, weight 5).

2. **Family classifier** (`lib/logicTables/familyClassifier.ts`). New variant rule: base B1 → B2 when description contains 'schottky', 'sbd', or 'sic diode'/'silicon carbide', or subcategory contains 'schottky'. Placed in a new "Discrete semiconductor variants" section.

3. **Subcategory mappings** (`lib/logicTables/index.ts`). Six new entries: 'Schottky Diode', 'Schottky Rectifier', 'Schottky Barrier Diode', 'SiC Schottky Diode', 'SiC Diode', 'Diodes - Schottky' → all map to B2.

4. **Digikey mapper** (`lib/services/digikeyMapper.ts`). Added Schottky detection in `mapSubcategory()` — category names containing 'schottky' map to 'Schottky Diode'. Placed before the 'single diode' check to ensure Schottky diodes in the "Single Diodes" category get correctly subcategorized.

5. **Context questions** (`lib/contextQuestions/schottkyDiodes.ts`). 5 questions: low-voltage application (Vf dominance), operating/ambient temperature (leakage thermal runaway risk), Si vs SiC (hard gate), parallel operation (Vf tempco concern), automotive (AEC-Q101). Context sensitivity rated moderate-high.

**Key design choices:**

- **B2 classified from B1, not a standalone family.** Digikey puts Schottky diodes in "Diodes - Rectifiers - Single" alongside standard/fast/ultrafast. The classifier detects Schottky from keywords in the description or subcategory. Direct subcategory matches (e.g., from Digikey's `mapSubcategory()`) can also route to B2 without going through the classifier.
- **No Vdc attribute.** Unlike B1 which has both Vrrm and Vdc, Schottky diodes typically specify only Vrrm.
- **SiC as identity_flag, not a separate family.** SiC Schottky shares enough rules with silicon Schottky (same 22 attributes, same logic types) that a separate family isn't warranted. The identity_flag ensures SiC cannot be replaced by silicon. Context question Q3 handles the Si/SiC distinction.
- **Digikey param map uses virtual category routing.** Schottky diodes share the "Single Diodes" Digikey category with standard rectifier diodes (B1), and Schottky arrays share "Diode Arrays" with non-Schottky arrays. Rather than modifying the existing B1 param maps, `resolveParamMapCategory()` in `digikeyMapper.ts` checks the "Technology" parameter — if it contains "Schottky", it routes to virtual categories "Schottky Diodes" or "Schottky Diode Arrays" which have their own param maps. Key differences from B1's param map: "Voltage - DC Reverse" maps to `vrrm` (not `vdc`), "Technology" multi-maps to both `schottky_technology` and `semiconductor_material` (Si vs SiC extracted via transformer), "Speed" and "trr" are intentionally skipped (misleading for Schottky). Array map uses "Diode Configuration" and "Current (per Diode)" fields unique to the "Diode Arrays" category.

**Files created:** `lib/logicTables/schottkyDiodes.ts`, `lib/contextQuestions/schottkyDiodes.ts`.

**Files modified:** `lib/logicTables/index.ts` (registry + subcategory map + last-updated), `lib/logicTables/familyClassifier.ts` (Schottky classifier rule), `lib/services/digikeyMapper.ts` (mapSubcategory + resolveParamMapCategory + 2 transformers), `lib/services/digikeyParamMap.ts` (schottkyDiodeParamMap + schottkyDiodeArrayParamMap + categoryParamMaps + familyToDigikeyCategories), `lib/contextQuestions/index.ts` (import + register), `CLAUDE.md` (family count + B2 row + docs count + param map status), `docs/application-context-attribute-map.md` (updated with B2 — 20 families).

---

## 31. Zener Diodes / Voltage Reference Diodes — Family B3

**Decision:** Added Zener Diodes as the third Block B discrete semiconductor family (B3), classified as a variant of B1 (Rectifier Diodes) via the family classifier.

**What changed:**

1. **Logic table** (`lib/logicTables/zenerDiodes.ts`). 22 rules derived from `docs/zener_diodes_logic.docx`. Key differences from B1/B2: Zener Voltage (Vz) is Identity (not threshold) — THE primary spec, this is what the component exists to do; Zener Test Current (Izt) is Identity — Vz values are only comparable at the same test current; Dynamic Impedance (Zzt) as Threshold ≤ (weight 7) — regulation quality metric; Temperature Coefficient (TC) as Threshold ≤ on absolute value (weight 7) — voltage stability over temperature; Knee Impedance (Zzk) as Application Review (weight 4) — low-current operation concern; Regulation Type (Zener vs Avalanche) as Application Review (weight 3) — noise differences; Forward Voltage (Vf) demoted to Application Review (weight 3) — only relevant in bidirectional clamp circuits; Junction Capacitance (Cj) as Application Review (weight 4) — only for ESD/signal-line protection. No reverse recovery attributes (irrelevant for Zener operation). No Vdc attribute (Zener operates in breakdown, not blocking). Uses AEC-Q101 for automotive.

2. **Family classifier** (`lib/logicTables/familyClassifier.ts`). New variant rule: base B1 → B3 when description contains 'zener' or 'voltage reference diode', or subcategory contains 'zener', or MPN starts with 'BZX', 'BZT', 'MMSZ', 'DZ', 'TZX', or 'SMZJ'. TVS diodes are explicitly excluded — checked first via keywords ('tvs', 'transient suppressor') and MPN prefixes ('SMAJ', 'SMBJ', 'P6KE', etc.) to prevent misclassification. TVS reserved for future family B4. Placed AFTER the Schottky (B2) classifier rule to maintain correct priority ordering.

3. **Subcategory mappings** (`lib/logicTables/index.ts`). Six new entries: 'Zener Diode', 'Voltage Reference Diode', 'Zener', 'Diodes - Zener - Single', 'Diodes - Zener - Array', 'Zener Voltage Regulator' → all map to B3.

4. **Context questions** (`lib/contextQuestions/zenerDiodes.ts`). 4 questions (2 conditional): Q1 Function (clamping / reference / ESD protection / level shifting) — THE critical question that completely changes matching priorities; Q2 Precision needed (conditional on reference — high/moderate/coarse); Q3 Signal speed (conditional on ESD — high-speed/low-speed); Q4 Automotive (AEC-Q101). Context sensitivity rated moderate-high.

**Key design choices:**

- **B3 classified from B1, not standalone.** Digikey puts Zener diodes in "Diodes - Zener - Single" and "Diodes - Zener - Array" categories. The classifier detects Zener from keywords in description, subcategory, or MPN. Direct subcategory matches can also route to B3 without going through the classifier.
- **Explicit TVS exclusion in classifier.** Zener and TVS both clamp voltage but are fundamentally different products: Zener = steady-state regulation with tight tolerance and specified TC; TVS = transient absorption with high peak power and loose tolerance. The classifier checks for TVS indicators first and returns false, ensuring TVS parts stay in B1 (or future B4) rather than being misclassified as Zener.
- **Vz as Identity, not Threshold.** Unlike Vrrm in B1/B2 (where higher is always safe), Zener voltage must be exact — a 5.1V Zener cannot be replaced by a 6.2V Zener. This is the fundamental semantic difference.
- **Izt as Identity.** The test current is a measurement condition, not an operating limit. If Izt differs, Vz values aren't directly comparable.
- **TC compared on absolute value.** Below ~5V TC is negative (Zener mechanism); above ~5V TC is positive (avalanche). The threshold compares |replacement TC| ≤ |original TC|.
**Files created:** `lib/logicTables/zenerDiodes.ts`, `lib/contextQuestions/zenerDiodes.ts`.

**Files modified:** `lib/logicTables/index.ts` (registry + subcategory map + last-updated), `lib/logicTables/familyClassifier.ts` (Zener classifier rule with TVS exclusion), `lib/contextQuestions/index.ts` (import + register), `CLAUDE.md` (family count + B3 row + docs count + variant families list + param map status), `docs/application-context-attribute-map.md` (updated with B3 — 21 families).

---

## 32. Zener Diodes — Digikey Parameter Map (B3)

**Decision:** Built Digikey parameter maps for Zener Diodes (B3) with two dedicated Digikey categories.

**Discovery findings:** Ran `scripts/discover-digikey-params.mjs` against 10 Zener diode MPNs spanning: SMD single (BZX84C5V1-7-F SOT-23, MMSZ5231B-7-F SOD-123, BZT52C5V1-7-F SOD-123, BZX84-A5V1,215 SOT-23 ±1%, MMSZ4684T1G SOD-123 3.3V, MMBZ5241BLT1G SOT-23 11V), through-hole (1N4733A-TP DO-41 1W), high power (1SMB5918BT3G SMB 3W), and dual arrays (BZB84-C5V1,215 Nexperia automotive, AZ23C5V1-7-F Diodes Inc).

**Two param maps:**

1. **`singleZenerDiodeParamMap`** — Digikey category "Single Zener Diodes". 10 mapped fields: Voltage - Zener (Nom) (Vz) → vz, Tolerance → vz_tolerance, Power - Max → pd, Impedance (Max) (Zzt) → zzt, Current - Reverse Leakage @ Vr → ir_leakage, Voltage - Forward (Vf) (Max) @ If → vf, Operating Temperature → operating_temp, Qualification → aec_q101, Mounting Type → mounting_style, Package / Case → package_case. Weight coverage: ~51% (76/150).

2. **`zenerDiodeArrayParamMap`** — Digikey category "Zener Diode Arrays". Adds Configuration field (e.g., "1 Pair Common Anode"). Weight coverage: ~57% (85/150).

**Key Digikey quirks:**

- **AEC-Q100, not Q101.** Digikey reports "AEC-Q100" (IC qualification) for automotive Zener diodes instead of "AEC-Q101" (discrete semiconductor qualification). Updated `transformToAecQ101()` to accept both Q100 and Q101 as indicating automotive qualification.
- **Own categories, no virtual routing needed.** Unlike Schottky (B2) which shares "Single Diodes" with B1 and needs `resolveParamMapCategory()` to distinguish via "Technology" parameter, Zener has dedicated categories. Simple substring matching in `findCategoryMap()` handles routing.
- **Zzt sometimes absent.** Low-voltage Zeners (3.3V) may omit impedance — the Zener mechanism at low voltages produces very high impedance that Digikey doesn't always list.
- **Many gaps.** Izt (w8), TC (w7), Izm (w6), Rth_ja (w6), Tj_max (w6), Cj (w4), Zzk (w4), regulation_type (w3), pin_configuration (w10), height (w5) are NOT in Digikey parametric data. These are datasheet-level specs. When both source and candidate are missing, matching engine rules pass.

**Mapper updates:** Added Zener subcategory routing in `mapSubcategory()`: "zener diode array" → "Diodes - Zener - Array", "single zener"/"zener diode" → "Zener Diode". These map to existing `subcategoryToFamily` entries in `index.ts`.

**Files modified:** `lib/services/digikeyParamMap.ts` (two new param maps + category array + familyToDigikeyCategories), `lib/services/digikeyMapper.ts` (mapSubcategory entries + transformToAecQ101 broadened), `lib/contextQuestions/zenerDiodes.ts` (fixed condition type from string to object).

---

## 33. TVS Diodes — Transient Voltage Suppressors — Family B4

**Decision:** Added TVS Diodes as the fourth and final Block B discrete semiconductor family (B4), classified as a variant of B1 (Rectifier Diodes) via the family classifier. This completes all diode families.

**What changed:**

1. **Logic table** (`lib/logicTables/tvsDiodes.ts`). 23 rules derived from `docs/tvs_diodes_logic.docx`. Key differences from B1/B2/B3: Standoff Voltage (Vrwm) is Identity — must match circuit operating voltage exactly (too low → conduction, too high → poor clamping); Clamping Voltage (Vc) is THE primary spec at Threshold ≤ (weight 10) — the voltage the circuit sees during a surge; Peak Pulse Power (Ppk) at Threshold ≥ (weight 9) and Peak Pulse Current (Ipp) at Threshold ≥ (weight 8) — energy absorption capacity; Junction Capacitance (Cj) elevated to Threshold ≤ (weight 8) — critical for signal-line protection (Cj vs Vc is THE fundamental TVS tradeoff); ESD Rating as Threshold ≥ (weight 7) — IEC 61000-4-2 compliance; Surge Standard as identity_flag (weight 8) — automotive 100V, telecom 1kV; Polarity as Identity (weight 10) — Uni vs Bi fundamental topology choice. Zero application_review rules — protection is binary (works or doesn't). Total weight: 177.

2. **Family classifier** (`lib/logicTables/familyClassifier.ts`). New variant rule placed BEFORE B3: base B1 → B4 when description contains 'tvs', 'transient voltage', 'transient suppressor', 'esd protection', 'esd suppressor', or subcategory contains 'tvs'; also matches MPN prefixes SMAJ, SMBJ, SMCJ, P6KE, PESD, 1.5KE, 5KP, SMLVT, TPD, ESDA, PRTR, USBLC. B4 must be checked before B3 because B3's TVS exclusion safety net assumes B4 catches them first.

3. **Subcategory mappings** (`lib/logicTables/index.ts`). Eight new entries: 'TVS Diode', 'TVS', 'Transient Voltage Suppressor', 'TVS - Diodes', 'Diodes - TVS', 'ESD Protection Diode', 'ESD Suppressor', 'Surge Suppressor' → all map to B4.

4. **Context questions** (`lib/contextQuestions/tvsDiodes.ts`). 4 questions (1 conditional): Q1 Application type (power_rail / signal_line / interface / automotive_load_dump) — determines Cj importance; Q2 Transient source (esd / eft_burst / surge / lightning / load_dump) — determines energy rating requirements; Q3 Interface speed (conditional on signal_line — usb2 / usb3 / hdmi / ethernet / spi_i2c / can_lin) — determines Cj budget; Q4 Automotive (AEC-Q101). Context sensitivity: high.

5. **Digikey parameter map** (`lib/services/digikeyParamMap.ts`). Single `tvsDiodeParamMap` — all TVS in one "TVS Diodes" Digikey category (no separate array category). 13 mapped fields: Voltage - Reverse Standoff (Typ) → vrwm, Voltage - Breakdown (Min) → vbr, Voltage - Clamping (Max) @ Ipp → vc, Current - Peak Pulse (10/1000µs) → ipp, Power - Peak Pulse → ppk, Capacitance @ Frequency → cj, Unidirectional Channels → num_channels, Bidirectional Channels → num_channels, Type → configuration, Operating Temperature → operating_temp, Qualification → aec_q101, Mounting Type → mounting_style, Package / Case → package_case. Weight coverage: ~61% (108/177). Polarity (w10) is added by mapper enrichment, not param map, so not counted by `computeFamilyParamCoverage()`. Packaging not mapped.

6. **Digikey mapper** (`lib/services/digikeyMapper.ts`). Added TVS subcategory routing in `mapSubcategory()`. Added `transformToTvsTopology()`: "Zener" → "Discrete", "Steering (Rail to Rail)" → "Steering Diode Array". Added TVS polarity enrichment — polarity derived from FIELD NAME presence ("Unidirectional Channels" vs "Bidirectional Channels"), not from a separate polarity parameter. This required post-processing in `mapDigikeyProductToAttributes()` rather than the standard param map approach.

**Key design choices:**

- **B4 classifier checked BEFORE B3.** B3 has a TVS exclusion safety net (checks TVS keywords first and returns false). But relying on B3's exclusion alone is fragile — if B4's classifier runs first, TVS parts are caught positively rather than excluded negatively. The B4→B3 ordering is more robust.
- **Polarity from field name, not field value.** Digikey encodes polarity in the parameter name itself: "Unidirectional Channels" (ID 1729) vs "Bidirectional Channels" (ID 1730). The param map architecture maps field values to attributes, but here the information is in which field exists. Solved by adding a post-processing enrichment step in the mapper rather than forcing an awkward param map entry.
- **Configuration transformer safe for all diode families.** `transformToTvsTopology()` only converts exact "Zener" string and "Steering" substring. B1/B2/B3 configuration values ("Single", "Dual Common Cathode", "1 Pair Common Anode") don't match these patterns.
- **Zero application_review rules.** Unlike every other family, TVS has no application_review rules. Protection is binary — the TVS either clamps below the IC's absolute maximum rating or it doesn't. There are no "judgment call" parameters.
- **Single Digikey category.** Unlike B1 (Single Diodes + Bridge Rectifiers), B2 (virtual Schottky Diodes + Schottky Diode Arrays), and B3 (Single Zener Diodes + Zener Diode Arrays), TVS has a single "TVS Diodes" category covering all form factors (discrete, arrays, multi-channel).

**Discovery findings:** Ran `scripts/discover-digikey-params.mjs` against 6 TVS MPNs: SMBJ5.0A-13-F (Diodes Inc uni 5V), SMAJ12A-E3/61 (Vishay uni 12V), SMCJ24A-E3/57T (Vishay uni 24V), PESD5V0S2BT,215 (Nexperia bi ESD array), TPD2E001DRLR (TI ESD array), SMBJ5.0CA-13-F (Diodes Inc bi 5V). All in single "TVS Diodes" category. Polarity encoded in field name, not separate parameter. AEC-Q101 present in "Qualification" field for automotive parts.

**Known data gaps (accepted):** ir_leakage (w5), response_time (w6), esd_rating (w7), pin_configuration (w10), height (w5), rth_ja (w5), tj_max (w6), pd (w5), surge_standard (w8) are NOT in Digikey parametric data. These are datasheet-level specs requiring manufacturer PDF parsing.

**Files created:** `lib/logicTables/tvsDiodes.ts`, `lib/contextQuestions/tvsDiodes.ts`.

**Files modified:** `lib/logicTables/index.ts` (registry + subcategory map + last-updated), `lib/logicTables/familyClassifier.ts` (B4 classifier rule before B3), `lib/services/digikeyParamMap.ts` (tvsDiodeParamMap + categoryParamMaps + familyToDigikeyCategories), `lib/services/digikeyMapper.ts` (mapSubcategory + transformToTvsTopology + polarity enrichment), `lib/contextQuestions/index.ts` (import + register), `CLAUDE.md` (family count 23 + B4 row + docs count 17 + param map status 4 discrete).

---

## 34. MOSFETs — N-Channel & P-Channel — Family B5

**Decision:** Added MOSFETs as the fifth Block B discrete semiconductor family (B5). This is a standalone base family — NOT a variant of B1 (Rectifier Diodes) because MOSFETs are fundamentally different components (voltage-controlled switches vs. PN junction rectifiers).

**What changed:**

1. **Logic table** (`lib/logicTables/mosfets.ts`). 27 rules derived from `docs/mosfet_logic_b5.docx`. The most complex family to date. Key differences from all diode families: Channel Type (N/P) as hard Identity gate — determines circuit topology; Technology (Si/SiC/GaN) as identity_flag — different semiconductor physics and gate drive requirements; Rds(on) as Threshold ≤ (weight 9) — THE critical DC performance spec, but only valid when compared at matching Vgs drive voltage; Gate charge parameters (Qg w8, Qgd w7, Qgs w6) all Threshold ≤ — determine switching speed and driver requirements; Coss as Application Review (w7) — cannot be reduced to simple ≤ comparison because it's a resonant tank component in ZVS/LLC topologies; Body diode trr as Threshold ≤ (w8) — BLOCKING in synchronous rectification at ≥50kHz (shoot-through risk); SOA as Application Review (w7) — mandatory graphical comparison for linear-mode applications; 5 Application Review rules (vs 0 for TVS). Total weight: ~199.

2. **Context questions** (`lib/contextQuestions/mosfets.ts`). 5 questions, context sensitivity: high. Q1 Switching topology (hard-switching / soft-switching / linear mode / DC low-frequency) — THE critical question that completely changes which parameters dominate; Q2 Synchronous rectification (yes ≥50kHz / yes <50kHz / no) — triggers BLOCKING escalation for body diode trr; Q3 Parallel operation (yes / no) — Vgs(th) tempco concern for current sharing; Q4 Drive voltage (logic-level / standard / high-voltage SiC) — determines Rds(on) comparison validity; Q5 Automotive (AEC-Q101).

3. **Family registry** (`lib/logicTables/index.ts`). B5 registered as standalone family with 9 subcategory mappings: MOSFET, Power MOSFET, N-Channel MOSFET, P-Channel MOSFET, SiC MOSFET, GaN FET, GaN MOSFET, FETs - MOSFETs - Single, FETs - MOSFETs - Arrays.

4. **Digikey mapper** (`lib/services/digikeyMapper.ts`). Added MOSFET detection in `mapSubcategory()` — distinguishes N-Channel, P-Channel, SiC, and GaN from Digikey category names.

5. **Digikey param map** (`lib/services/digikeyParamMap.ts`). Placeholder `mosfetParamMap` with 18 expected fields (FET Type, Technology, Vdss, Id, Vgs(th), Rds On, Vgs Max, Ciss, Coss, Crss, Qg, Qgd, Qgs, Pd, Operating Temp, Qualification, Mounting Type, Package). Field names are estimated — must be verified by running discovery script against representative MOSFETs.

**Key design choices:**

- **Standalone base family, not a variant of B1.** MOSFETs are voltage-controlled switches with completely different operating principles from diodes. They share AEC-Q101 and some thermal attributes but have entirely different electrical parameters. No delta derivation is appropriate.
- **Rds(on) at matching Vgs.** The engineering reason explicitly states that Rds(on) comparisons across different Vgs test conditions are invalid. The drive_voltage context question flags when logic-level vs standard drive may cause invalid comparisons. This mirrors the Izt pattern in B3 (Zener) where the test current must match for Vz to be comparable.
- **Body diode trr BLOCKING.** The synchronous_rectification context question with "yes_above_50khz" escalates body_diode_trr to mandatory (w10) with an explicit engineering sign-off note. This ensures worse trr = hard fail, and even better trr gets a review flag.
- **Coss as application_review, not threshold.** Unlike Ciss and Crss which are straightforwardly "lower is better", Coss behavior depends entirely on the switching topology. In resonant/ZVS designs, Coss is a deliberate resonant tank component — different Coss changes the resonant frequency and ZVS window.
- **No variant classifier needed.** B5 is detected via subcategory mapping and mapSubcategory(). N-ch vs P-ch differentiation is handled by the channel_type identity rule, not by separate sub-families.

**Files created:** `lib/logicTables/mosfets.ts`, `lib/contextQuestions/mosfets.ts`.

**Files modified:** `lib/logicTables/index.ts` (registry + subcategory map + last-updated), `lib/contextQuestions/index.ts` (import + register), `lib/services/digikeyMapper.ts` (mapSubcategory MOSFET routing), `lib/services/digikeyParamMap.ts` (mosfetParamMap + categoryParamMaps + familyToDigikeyCategories), `CLAUDE.md` (family count 24 + B5 row + docs count 18 + param map status 5 discrete), `__tests__/services/familyClassifier.test.ts` (B5 tests), `__tests__/services/digikeyMapper.test.ts` (MOSFET subcategory tests).

---

## 35. Admin Data & Logic — Parameter Mappings Panel Redesign

**Decision:** Redesigned the Parameter Mappings admin panel (`/admin?section=param-mappings`) to show a single unified table of all attributes in a family's logic table schema, with Digikey-mapped parameters at the top and unmapped (datasheet-only) rules below, separated by a thicker horizontal divider.

**What changed:**

1. **Unified table.** Previously two separate tables (mapped parameters, then unmapped rules). Now one continuous table with consecutive row numbers. Mapped rows show the Digikey ParameterText; unmapped rows show an em-dash and are rendered at 60% opacity.

2. **Coverage percentage.** Added `computeFamilyParamCoverage()` output at the top — e.g., "Digikey parameter coverage: **72%** (80 / 111 weight)". Color-coded: green ≥70%, amber 40–69%, red <40%.

3. **Weight and Rule Type on mapped rows.** Both tables now share the same 6 columns: #, Digikey Parameter, Attribute ID, Attribute Name, Rule Type (color-coded chip), Weight. Weight/logicType looked up from `table.rules` via `ruleMap` (Map keyed by attributeId). Dropped Unit and Sort Order columns (internal plumbing).

4. **Shared constants.** Extracted `typeColors` and `typeLabels` into `components/admin/logicConstants.ts`, shared by both `LogicPanel.tsx` and `ParamMappingsPanel.tsx`.

5. **Vertical divider.** A `borderLeft` on the Attribute ID column creates a visual boundary between Digikey fields and internal fields.

**Rationale:** The previous layout made it hard to do weight accounting — you couldn't see at a glance which high-weight rules lacked Digikey data. The unified table makes coverage gaps immediately visible, sorted by weight descending in the unmapped section.

**Files created:** `components/admin/logicConstants.ts`.

**Files modified:** `components/admin/ParamMappingsPanel.tsx` (unified table + coverage + ruleMap lookup), `components/admin/LogicPanel.tsx` (import shared constants), `locales/en.json`, `locales/de.json`, `locales/zh-CN.json` (i18n keys for weight, ruleType, unmappedRules, parameterText rename).

---

## 36. BJTs — Family B6 (NPN & PNP)

**Decision:** Added Bipolar Junction Transistors as the sixth Block B discrete semiconductor family (B6), as a standalone base family (like B5 MOSFETs).

**What changed:**

1. **`blockOnMissing` mechanism** — new cross-cutting feature. Added `blockOnMissing?: boolean` to `MatchingRule` and `AttributeEffect` in `lib/types.ts`. When a threshold rule has `blockOnMissing: true` and the candidate is missing the attribute, the matching engine returns 'fail' instead of 'review' (50% credit). This enables BLOCKING behavior for BJT storage time (tst) at >100kHz switching, and also benefits B5's body_diode_trr. The flag is propagated by `contextModifier.ts` from context question effects to rules at evaluation time.

2. **Logic table** (`lib/logicTables/bjtTransistors.ts`). 18 rules derived from `docs/bjt_logic_b6.docx`. Key design choices:
   - **hFE as `application_review` (w8)** — NOT a simple threshold. hFE varies with Ic, temperature, and manufacturing lot (min/max ratios of 3:1 common). Must verify hFE(min) at the actual operating Ic against base drive overdrive ratio. The engineering reason documents this explicitly.
   - **Storage time (tst) as `threshold lte` (w8)** — the unique BJT switching liability with no MOSFET equivalent. Context modifier escalates to `blockOnMissing` at >100kHz.
   - **Polarity (NPN/PNP) as `identity` (w10)** — hard gate, no cross-polarity substitution.
   - **Package/case as `identity` (w10)** — pin ordering varies by manufacturer even within named packages (TO-92: E-B-C vs C-B-E).
   - **SOA as `application_review` (w7)** — includes Second Breakdown (S/B), a BJT-specific thermal runaway mode.
   - **ft as `threshold gte` (w7)** — per the logic document. Context adjusts weight per operating mode.
   - **Fundamental trade-off documented**: Vce(sat) × Storage Time ≈ constant. Deeper saturation → lower Vce(sat) → longer tst.

3. **Context questions** (`lib/contextQuestions/bjtTransistors.ts`). 4 questions: Q1 Operating mode (saturated switching / linear-analog / class AB pair) — THE critical bifurcation that completely changes which parameters dominate; Q2 Switching frequency (conditional on Q1=saturated_switching — low/medium/high, with `blockOnMissing: true` on tst at >100kHz); Q3 Complementary pair (conditional on Q1=class_ab_pair or linear_analog — context flags only, dual-device engine deferred); Q4 Automotive (AEC-Q101). Context sensitivity: high.

4. **Subcategory mappings** (`lib/logicTables/index.ts`). 11 entries: BJT, NPN Transistor, PNP Transistor, NPN BJT, PNP BJT, Bipolar Transistor, Bipolar Junction Transistor, Transistors - Bipolar (BJT) - Single, Transistors - Bipolar (BJT) - Array, Small Signal Transistor, General Purpose Transistor → all map to B6.

5. **Digikey mapper** (`lib/services/digikeyMapper.ts`). BJT detection in `mapSubcategory()` after the MOSFET block: 'bjt' or 'bipolar transistor' keywords → 'BJT' (with NPN/PNP polarity variants). General 'transistor' fallback excludes MOSFET/IGBT/JFET.

6. **Digikey param map** (`lib/services/digikeyParamMap.ts`). Placeholder `bjtParamMap` with 11 mapped fields: Transistor Type, Vceo, Ic, hFE, Vce(sat), ft, Pd, Operating Temp, Qualification, Mounting Type, Package/Case. Known gaps: vces_max, vbe_sat, tst, ton, toff, rth_jc, tj_max, soa — datasheet-only specs. Weight coverage: ~55%.

**Key design choices:**

- **Standalone base family, not a variant.** BJTs are fundamentally different devices from diodes (B1-B4) and MOSFETs (B5). Detection via subcategory mapping only, no classifier rule needed.
- **`blockOnMissing` as a cross-cutting mechanism.** Rather than special-casing tst in the engine, the mechanism is generic — any threshold rule can be marked as BLOCKING when candidate data is missing. This is set dynamically by the context modifier based on user answers (e.g., switching frequency >100kHz).
- **Complementary pair = context flags only.** Full dual-device evaluation (matching NPN + PNP halves together) deferred to a separate feature. Q3 adds review flags for hFE, Vbe(sat), and ft matching awareness.
- **ft as Threshold >= (per docx), not application_review.** Context questions adjust ft weight per operating mode: not_applicable in DC saturated switching, escalate_to_mandatory in linear/analog.

**Files created:** `lib/logicTables/bjtTransistors.ts`, `lib/contextQuestions/bjtTransistors.ts`.

**Files modified:** `lib/types.ts` (blockOnMissing on MatchingRule + AttributeEffect), `lib/services/matchingEngine.ts` (blockOnMissing check in evaluateThreshold), `lib/services/contextModifier.ts` (propagate blockOnMissing), `lib/logicTables/index.ts` (registry + subcategory map + lastUpdated), `lib/contextQuestions/index.ts` (import + register), `lib/services/digikeyMapper.ts` (BJT mapSubcategory), `lib/services/digikeyParamMap.ts` (placeholder param map), `__tests__/services/matchingEngine.test.ts` (5 blockOnMissing tests), `__tests__/services/familyClassifier.test.ts` (2 B6 tests), `__tests__/services/digikeyMapper.test.ts` (6 BJT mapping tests), `__tests__/services/contextModifier.test.ts` (2 blockOnMissing propagation tests), `CLAUDE.md` (family count 25 + B6 row + param map status + test count 224).

---

## 37. IGBTs — Insulated Gate Bipolar Transistors — Family B7

**Decision:** Added IGBTs as the seventh Block B discrete semiconductor family (B7), as a standalone base family (like B5 MOSFETs and B6 BJTs). IGBTs bridge MOSFETs and BJTs: voltage-driven gate (like MOSFET) but bipolar conduction (like BJT). They dominate high-voltage, high-current applications (motor drives, traction inverters, welders, UPS) at 600V-6500V.

**What changed:**

1. **Logic table** (`lib/logicTables/igbts.ts`). 25 rules derived from `docs/igbt_logic_b7.docx`. Key design choices:
   - **Vce(sat) as `threshold lte` (w9)** — THE primary on-state spec. Conduction loss is Ic × Vce(sat) (linear), NOT Rds(on) × Id² (quadratic) as in MOSFETs. Every 0.1V reduction saves watts directly.
   - **Eoff as `threshold lte` (w9)** — THE dominant switching loss. Includes IGBT-specific tail current energy. Psw = Eoff × fsw must fit thermal budget.
   - **Co-packaged diode as `identity_flag` (w10)** — hard gate. IGBTs have NO usable intrinsic body diode (unlike MOSFETs). A bare IGBT cannot replace an IGBT+diode in bridge topologies.
   - **tsc as `threshold gte` (w9)** — BLOCKING for motor drive/traction via context modifier `blockOnMissing`. The gate driver needs tsc microseconds to detect faults and turn off.
   - **IGBT technology as `identity_upgrade` (w9)** — hierarchy: FS > NPT > PT. FS (Field Stop) partially breaks the Vce(sat) vs Eoff trade-off. Context modifier escalates to hard identity for parallel operation (mixing technologies with different Vce(sat) tempco signs causes thermal runaway).
   - **Fundamental trade-off documented**: Vce(sat) vs Eoff ≈ constant within a technology.

2. **Context questions** (`lib/contextQuestions/igbts.ts`). 5 questions: Q1 Switching frequency (THE critical question — low ≤20kHz conduction-dominated vs high 50-100kHz switching-dominated; >100kHz flags SiC MOSFET as likely better technology); Q2 Switching topology (hard vs soft — soft eliminates Eon via ZVS); Q3 Parallel operation (escalates technology to mandatory identity, prevents mixing PT/FS/NPT); Q4 Short-circuit protection (escalates tsc to mandatory with `blockOnMissing: true`); Q5 Automotive/traction (AEC-Q101 + tsc + Tj_max 175°C). Context sensitivity: high.

3. **Digikey parameter map** (`lib/services/digikeyParamMap.ts`). Verified against 6 real IGBTs from 4 manufacturers (Infineon, onsemi, ST, Rohm). Digikey category: "Single IGBTs" — 15-16 params per product with consistent field names. **Two compound fields** requiring transformers: "Switching Energy" → eon + eoff (e.g., "600µJ (on), 580µJ (off)"), "Td (on/off) @ 25°C" → td_on + td_off (e.g., "60ns/160ns"). Co-packaged diode inferred from "Reverse Recovery Time (trr)" presence. Notable gap: **no Qualification/AEC-Q101 field** (unlike MOSFETs/BJTs).

4. **Value transformers** (`lib/services/digikeyMapper.ts`). 5 new transformers: `transformToIgbtTechnology()` (normalizes "Trench Field Stop" → "FS", "NPT and Trench" → "NPT"), `transformToEon()`/`transformToEoff()` (extract from compound Switching Energy), `transformToTdOn()`/`transformToTdOff()` (extract from compound Td field). Plus co-packaged diode enrichment from trr presence.

5. **Candidate search improvement** (`lib/services/partDataService.ts`). Extended `buildCandidateSearchQuery()` with discrete semiconductor voltage keyword extraction (`vds_max`, `vces_max`, `vrrm`, `vceo_max` → "600V"). Benefits all discrete families B1-B7, not just IGBTs.

**Key design choices:**

- **Standalone base family, not a variant.** IGBTs are fundamentally different from both MOSFETs (bipolar conduction, tail current) and BJTs (voltage-driven gate, no base current). Detection via subcategory mapping only.
- **Compound field transformers for Digikey data.** Unlike MOSFETs and BJTs where each Digikey parameter maps to one internal attribute, IGBTs have compound fields ("Switching Energy", "Td") that pack two values into one string. The multi-map array pattern (same as Film Capacitors' "Ratings") handles this cleanly.
- **Co-packaged diode inferred from trr.** Digikey has no explicit "co-packaged diode" parameter. Instead, IGBTs with a co-packaged diode list "Reverse Recovery Time (trr)" while bare IGBTs don't. This is enriched in `mapDigikeyProductToAttributes()`.

**Files created:** `lib/logicTables/igbts.ts`, `lib/contextQuestions/igbts.ts`.

**Files modified:** `lib/logicTables/index.ts` (registry + 6 subcategory mappings + lastUpdated), `lib/contextQuestions/index.ts` (import + register), `lib/services/digikeyMapper.ts` (mapCategory + mapSubcategory + 5 transformers + placeholders + co-packaged diode enrichment), `lib/services/digikeyParamMap.ts` (igbtParamMap with 14 fields incl. 2 compound + categoryParamMaps + familyToDigikeyCategories + familyTaxonomyOverrides), `lib/services/partDataService.ts` (voltage keyword for discrete candidate search), `__tests__/services/familyClassifier.test.ts` (2 B7 tests), `__tests__/services/digikeyMapper.test.ts` (5 IGBT mapping tests), `CLAUDE.md`, `docs/BACKLOG.md`.

---

## 38. QC Promoted to Top-Level Page

**Decision:** Extracted the QC section from the Admin panel (`/admin?section=qc`) into its own top-level route (`/qc`) with a dedicated sidebar icon. Feedback and Logs, previously MUI Tabs within `QcPanel`, become section-nav items in a left sidebar (matching the SettingsShell/OrgShell pattern).

**Rationale:** QC/Feedback is a high-frequency admin workflow that deserves its own navigation entry rather than being buried two levels deep inside the Admin panel. The Organization extraction (Decision #24) set the precedent for promoting admin sub-sections to top-level pages.

**What changed:**

1. **New components**: `components/qc/QcShell.tsx` (Suspense-wrapped shell with header + section nav + content), `components/qc/QcSectionNav.tsx` (Feedback/Logs section list). Follows the SettingsShell/SettingsSectionNav pattern exactly.
2. **New route**: `app/qc/page.tsx` — AppSidebar + ChatHistoryDrawer + QcShell. Default section: `feedback` (feedback-first). URL: `/qc?section=feedback|logs`.
3. **Sidebar icon**: `RateReviewOutlinedIcon` added to `AppSidebar.tsx`, admin-only, positioned above the wrench icon.
4. **Settings toggle**: Moved from the old QcPanel tab header into QcShell's page header (right-aligned). Visible from both sections.
5. **Admin cleanup**: Removed `'qc'` from `AdminSection` type, removed QC from `AdminSectionNav` sections array, removed QcPanel import/rendering from `AdminShell`, deleted `QcPanel.tsx`.

**Files created:** `components/qc/QcShell.tsx`, `components/qc/QcSectionNav.tsx`, `app/qc/page.tsx`.

**Files modified:** `components/AppSidebar.tsx` (QC icon), `components/admin/AdminSectionNav.tsx` (removed QC), `components/admin/AdminShell.tsx` (removed QcPanel).

**Files deleted:** `components/admin/QcPanel.tsx`.

---

## 39. Thyristors (B8) — Single Family with Context-Driven Sub-Type Suppression

**Decision:** Thyristors (SCR, TRIAC, DIAC) are encoded as a single family B8 with 22 rules. Sub-type-specific rules (TRIAC-only: quadrant operation, snubberless; SCR-only: tq) are suppressed via context question Q1 using `not_applicable` effects, rather than creating 3 separate families.

**Rationale:** The three sub-types share 16 of 22 rules. Creating 3 families (B8/B9/B10) would triplicate the common rules and complicate the registry. The context question approach uses existing infrastructure (`not_applicable` effect in contextModifier) without requiring changes to the matching engine core. The identity rule on `device_type` (weight 10) ensures sub-type mismatches always fail regardless of whether context questions are answered. Digikey's separate leaf categories ("Thyristors - SCRs", "Thyristors - TRIACs") provide natural candidate filtering at search time via the `digikeyCategoryId` filter.

**Key implementation details:**
- **"Triac Type" is a compound field** — encodes both gate sensitivity and snubberless status. Values: "Alternistor - Snubberless" (Standard gate, snubberless=Yes), "Logic - Sensitive Gate" (Sensitive, snubberless=No), "Standard" (Standard, snubberless=No). Two transformers: `transformToGateSensitivity()` and `transformToSnubberless()`.
- **IT(AV) vs IT(RMS)** — SCRs use "Current - On State (It (AV)) (Max)", TRIACs use "Current - On State (It (RMS)) (Max)". Both map to the same `on_state_current` attributeId. Since the identity gate prevents cross-sub-type comparison, the correct metric is always compared.
- **`device_type` enrichment** — Inferred from Digikey category name in `mapDigikeyProductToAttributes()` (SCR/TRIAC/DIAC), not from a Digikey parametric field.
- **Snubberless BLOCKING** — Context Q3 "No snubber" escalates snubberless to mandatory with `blockOnMissing: true`, preventing non-snubberless candidates from appearing.
- **New ComponentCategory** — `'Thyristors'` added to the `ComponentCategory` union type (distinct from 'Transistors' and 'Diodes').
- **Weight coverage** — SCR param map: ~48% (67/136). TRIAC param map: ~51% (69/136). Major gaps: vdsm, i2t, il, dv_dt, di_dt, tgt, tq, quadrant_operation, rth_jc, tj_max (all datasheet-only).

**Files created:** `lib/logicTables/thyristors.ts`, `lib/contextQuestions/thyristors.ts`.

**Files modified:** `lib/types.ts` (ComponentCategory), `lib/logicTables/index.ts` (registry + subcategory map), `lib/contextQuestions/index.ts`, `lib/services/digikeyMapper.ts` (mapCategory, mapSubcategory, transformers, device_type enrichment), `lib/services/digikeyParamMap.ts` (scrParamMap, triacParamMap, category registrations), `lib/services/partDataService.ts` (vdrm keyword), `__tests__/services/familyClassifier.test.ts`, `__tests__/services/digikeyMapper.test.ts`.

---

## 40. JFETs (B9) — New `identity_range` LogicType for Range Overlap Matching

**Decision:** JFETs are encoded as Family B9 with 17 rules including a new `identity_range` LogicType for Vp (pinch-off voltage) and Idss (drain saturation current). B9 is classified as a variant of B5 (MOSFETs) when JFET-specific keywords or MPN prefixes are detected.

**Rationale:** JFETs have 3-4:1 manufacturing spread on Vp and Idss. A replacement is valid only if its specified range overlaps the original's — meaning there exist devices in both populations that could operate at the same bias point. Existing LogicTypes couldn't handle this: `identity` requires exact match, `threshold` compares single values, and `range_superset` checks containment (not overlap). The `identity_range` evaluator parses range strings (e.g., "-0.5V to -6V"), ensures min <= max, and checks overlap: `srcMax >= candMin && candMax >= srcMin`. Falls back to exact string comparison when ranges can't be parsed.

**Key implementation details:**
- **`identity_range` is a new LogicType** added to the `LogicType` union in `lib/types.ts`. It scores identically to `identity` (pass=full credit, fail=hard failure). No additional fields needed on `MatchingRule`.
- **`parseRange()` utility** handles formats: "X to Y", "X ~ Y", "X...Y", en-dash/em-dash separators, and single values (degenerate range {min: val, max: val}). Applies SI prefixes (m, µ, n, p, k, M, G, T).
- **Context questions (3):** Q1 Application domain (audio/RF/ultra-high-Z/general) — drives major rule weight changes. Audio escalates 1/f corner + NF, suppresses ft/Ciss/Crss. RF escalates ft/Ciss/Crss/NF, suppresses 1/f. Ultra-high-Z makes Igss BLOCKING with `blockOnMissing: true`. Q2 Matched pair — escalates `matched_pair_review` (weight 0→8). Q3 Automotive — escalates AEC-Q101 to mandatory.
- **Classifier uses baseFamilyId B5** — JFETs arriving with generic "FET" subcategory are redirected to B9 by description keywords ('JFET', 'J-FET', 'junction field effect', 'depletion mode FET') or MPN prefixes (2N54xx, 2SK, 2SJ, J112-J113, J174, MPF102, BF245, IFxxx).
- **Digikey category is "JFETs"** — 10 mapped fields, ~45% weight coverage. Major gaps: NF, fc (1/f corner), Igss, gfs, ft, Crss all datasheet-only. No Qualification/AEC-Q101 field for JFETs in Digikey.
- **Completes Block B** — all 9 discrete semiconductor families (B1-B9) are now encoded.

**Files created:** `lib/logicTables/jfets.ts`, `lib/contextQuestions/jfets.ts`.

**Files modified:** `lib/types.ts` (LogicType union), `lib/services/matchingEngine.ts` (parseRange, evaluateIdentityRange, dispatch), `lib/logicTables/index.ts` (registry + subcategory map), `lib/logicTables/familyClassifier.ts` (B9 variant rule), `lib/contextQuestions/index.ts`, `lib/services/digikeyParamMap.ts` (jfetParamMap, category registrations), `__tests__/services/matchingEngine.test.ts` (identity_range tests), `__tests__/services/familyClassifier.test.ts` (B9 detection tests).
