# How XRefs Turns Data Into Decisions: The Logic Layer

*An explainer for the semantic layer that wraps the canonical attribute
schema with rules, context, economics, and editability — and turns
parametric data into engineering recommendations.*

---

## The Difference Between Data and Decisions

The canonical schema described in the data-mapping explainer answers the
question *"what is this part?"* Every value is normalized, every source
is reconciled, every attribute is keyed against the same canonical
identifier. By itself that's a clean inventory. But it doesn't help an
engineer choose.

The questions an engineer actually asks are different:

- *Is this 24 V LDO acceptable as a replacement for that 28 V LDO?*
- *Does the answer change if the application is automotive?*
- *Would I accept a 5 percent worse cost-down candidate if its lifecycle
  status is better?*
- *Can I cross from a Murata commercial-grade MLCC to a Yageo
  industrial-grade MLCC for a medical device?*

None of those are data questions. They're decisions, and they depend on
engineering judgment, application context, business priorities, and
safety constraints. The logic layer is what turns the data layer into a
decision system. It wraps the canonical schema with semantics — *what
matters, how to compare, when to block, when to allow, when to escalate
to a human* — and it adapts those semantics to the user, the
application, and the moment.

This explainer covers how that wrapping works: rules, scoring, the four
distinct kinds of context that shape verdicts, and the admin overrides
that let the team revise engineering judgment without writing code.

---

## Part 1 — Rules Are Engineering Judgment Encoded

### The Guiding Principle

**Every rule is one engineer's answer to one question: how do we know if
two parts are equivalent on this attribute?**

A logic table is not an arbitrary collection of comparisons. Each rule
is a captured judgment with three components: which canonical attribute
matters, how to compare values on it, and how much weight to give the
verdict.

### What a Rule Encodes

Each rule in a family's logic table carries four pieces of semantic
information beyond the bare canonical-schema fields:

- **A `logicType`**, choosing one of nine comparison modes — exact match,
  range overlap, a substitution hierarchy, a boolean gate, a numeric
  threshold with direction, a physical-fit constraint, a cross-attribute
  formula, a flag-for-review marker, or a non-electrical-context marker.
  This is not just "do the values match" — it's "what *kind* of match
  is appropriate here." A capacitance value needs exact-with-tolerance.
  A dielectric needs a hierarchy. A voltage rating needs a one-sided
  threshold. Each rule picks the comparison its attribute actually
  deserves.
- **A `weight`** from 0 to 10. This is the engineer's call about how
  much this attribute matters relative to others in the same family.
  Capacitance on an MLCC is weight 10; packaging type is weight 2.
  Channel type on a MOSFET is weight 10; gate charge is weight 6.
- **A `blockOnMissing` flag**, optional. When set, missing data on a
  candidate is treated as a hard fail rather than a soft "review"
  verdict. Used sparingly on safety-critical attributes (voltage rating,
  AEC qualification, isolation voltage).
- **An `engineeringReason`** — prose that explains *why* this rule
  exists and *why* the weight is what it is. This is the field that
  preserves the original engineer's reasoning so that, six months later,
  any teammate reading the rule can understand the call without
  re-deriving it.

### Pass, Fail, Review — Three Possible Verdicts

When the engine evaluates a rule, it produces one of three outcomes:

- **Pass** — the candidate's value matches the source's per the rule's
  logic.
- **Fail** — a real value mismatch. The values are both known and they
  disagree. A single fail verdict on any rule rejects the candidate
  entirely.
- **Review** — the candidate's value is missing or unparseable. The
  system flags it for human verification rather than rejecting it.

The principle behind the review verdict: **missing data should never be
treated as failure unless safety requires it.** An obscure manufacturer
whose datasheet doesn't publish gate charge isn't necessarily a bad
substitute — they might just have spotty data. Filtering on the absence
of data is how good replacements get hidden. Only rules tagged
`blockOnMissing` treat absence as a hard fail.

Two rule types get partial credit rather than full pass/fail:
`application_review` rules contribute 50 percent of their weight (the
engine can't automate the comparison, so it gives partial credit and
flags for human review), and `operational` mismatches contribute 80
percent (non-electrical differences like packaging type shouldn't fully
disqualify an otherwise good candidate).

---

## Part 2 — Scoring Composes Rules Into a Match Percentage

### The Guiding Principle

**Every score is explainable.** A 73 percent match isn't a black-box
number. It traces directly back to a list of per-rule verdicts, each
with its own weight and reasoning.

### The Composition

For each candidate, the engine evaluates every rule in the family's
logic table and produces:

    matchPercentage = (sum of earned weight) / (sum of total weight) × 100

Earned weight comes from passing rules (full weight),
`application_review` rules (half weight), and `operational` mismatches
(80 percent of weight). Failed rules contribute zero — *and they also
reject the candidate entirely*, so a candidate that reaches the
displayed list has zero hard fails by definition. The percentage
expresses how completely it satisfies the *informational* rules; the
absence of fails is a separate, prior guarantee.

This composition is what makes recommendation cards explainable. Click
into any cross-reference and the comparison view shows the source
versus the candidate side by side, attribute by attribute, with the
verdict and weight for every rule. The 73 percent is itemized. There's
no opaque scoring function — just a transparent sum.

---

## Part 3 — Application Context: Same Part, Different Verdict

### The Guiding Principle

**A part that's perfect for one application can be unacceptable for
another.** A 105 °C-rated capacitor is fine for a consumer device and
unacceptable for an engine-compartment ECU. A 60 ns gate driver is fine
for a low-side switch and dangerous in a half-bridge without dead-time
control. The logic layer captures these context shifts directly — the
*same* canonical schema produces *different* verdicts depending on what
the user is building.

### How Context Questions Work

Each L3 family has a context-questions module that defines one to four
application questions the user can answer when running a cross-reference.
The questions are family-specific because the relevant context is
family-specific: gate drivers ask about topology, op-amps ask about
device function and source impedance, crystals ask about precision class
and temperature range, relays ask about load type.

Each answer carries a list of **attribute effects** that modify the
logic table at evaluation time. There are five effect types:

- **`escalate_to_mandatory`** — sets the rule's weight to 10 and flips
  on `blockOnMissing`. Used when context makes an attribute
  safety-critical.
- **`escalate_to_primary`** — raises weight to at least 9 without making
  it blocking. Used when context makes an attribute more important but
  not non-negotiable.
- **`not_applicable`** — sets weight to 0, effectively suppressing the
  rule. Used when context makes an attribute irrelevant (a comparator
  doesn't have a meaningful gain-bandwidth product, so don't compare on
  it).
- **`add_review_flag`** — switches the rule's logic type to
  `application_review`, forcing human verification. Used when the
  attribute can't be automatically evaluated in the given context.
- **`set_threshold`** — captured as a note for engineering review.
  Reserved for more complex changes the team wants to handle manually.

### Three Concrete Examples

**Gate drivers, Q1 = half-bridge topology:** the engine escalates
`output_polarity`, `dead_time_control`, and `dead_time` to mandatory
with `blockOnMissing`. Cross-conduction (shoot-through) is a destructive
failure mode unique to half-bridge applications, so any candidate
missing or mismatching these attributes is rejected outright.

**Op-amps, Q1 = device function:** if the user is replacing an op-amp,
the engine suppresses `output_type` and `response_time` (comparator
attributes). If they're replacing a comparator, the engine suppresses
`gain_bandwidth_product` and `min_stable_gain` (op-amp attributes). One
canonical schema serves all three sub-types because context tells the
engine which dimensions actually matter for the current substitution.

**Crystals, Q3 = extended temperature or automotive:** the engine
escalates `esr_max` and `aec_q200` to mandatory. Industrial-temperature
crystals fail differently from consumer-grade ones, and the team
wants candidates filtered accordingly only when the application
demands it.

The principle worth restating: **context doesn't change the schema, the
engine, or the data. It changes which rules are blocking, which are
informational, and which are irrelevant for this particular
substitution.**

---

## Part 4 — User Context: Preferences That Span Searches

### The Guiding Principle

**Some context isn't per-search — it follows the user across every
search they run.** An automotive engineer cares about AEC-Q100 on every
IC they ever look at. A medical-device engineer cares about
biocompatibility certifications on every connector. Asking them to
re-answer the same context question every time they cross-reference a
new part would be both annoying and error-prone.

### The User Profile Layer

The user's profile carries persistent preferences in a JSONB field on
the `profiles` table: compliance defaults (AEC-Q200, AEC-Q100, MIL-STD),
industries (automotive, medical, aerospace, industrial), goals
(cost-down, supply-chain resilience, compliance), preferred
manufacturers, and so on.

A resolver (`contextResolver.ts`) translates these preferences into the
same `AttributeEffect` shape that application context questions
produce. An automotive industry preference becomes an
`escalate_to_primary` effect on temperature-range and qualification
attributes for every family. An AEC-Q100 compliance default becomes
`escalate_to_mandatory` on the relevant qualification rule. The
mechanism is identical to per-search application context — just at a
different scope.

### The Layered Hierarchy

When the engine evaluates a candidate, it composes the logic table in a
fixed order:

1. **Base logic table** from the family's encoded rules.
2. **Admin overrides** from the database (described in Part 7).
3. **User-profile effects** from the resolver.
4. **Application-context effects** from any context questions the user
   answered for this search.

Each later step can override earlier ones on the same rule. The
principle is **more specific wins**: a per-search "this is a low-power
prototype" answer can soften an industry-level "automotive defaults"
preference if the user explicitly opts in. The system always reflects
the most recently expressed intent.

(A third layer — *list context* on saved BOMs — is typed and persisted
but not yet wired into the matching engine. When it ships it will sit
between user profile and per-search context.)

---

## Part 5 — Economics, Risk, Lifecycle: Replacement Preferences

### The Guiding Principle

**Technical match is necessary but not sufficient.** Two candidates
with identical match percentages can be very different recommendations
once you account for economics, supply-chain risk, and product
lifecycle. The logic layer exposes those non-technical dimensions as
first-class scoring inputs.

### The Four Axes

For each parts list, the user can configure how four non-technical axes
factor into ranking:

- **Lifecycle** — Active beats NRND (Not Recommended for New Designs)
  beats Last-Time-Buy beats Discontinued beats Obsolete. Blended with
  the manufacturer's published risk rank where available.
- **Compliance** — extra certifications the candidate has that the
  source lacks contribute positively; missing certifications the source
  has contribute negatively.
- **Cost** — relative savings versus the source part's unit price.
- **Stock** — distributor inventory levels, *but only when the source
  part itself is low-stock* (under 100 units). When supply is plentiful,
  stock differences between candidates don't matter; when supply is
  tight, they matter a lot.

For each axis the user sets:

- **Order**: priority ranking. The axis in position one contributes
  four times as much weight as the axis in position four.
- **Enabled**: per-axis on/off. Disabled axes contribute zero weight.

### The Composite Score

Per candidate, the engine computes a normalized score in `[0, 1]` for
each enabled axis (using the candidate's actual lifecycle status,
certifications, price, and stock), weights it by position in the
priority order, and produces a final composite score from 0 to 100.

The composite score doesn't replace the technical match percentage. It
becomes the tiebreaker *within* each result bucket. Two
manufacturer-certified candidates with 90 percent match get sorted by
composite. So do two engine-scored Logic candidates that fall within
two percentage points of each other.

The principle: **engineering match decides the bucket; preferences decide
the order within the bucket.**

### Display Filters

In addition to scoring inputs, the user can apply pure display filters:
hide candidates with zero stock, cap the displayed alternates per row,
restrict to specific result buckets. These don't affect scoring — they
just narrow what's shown. The distinction matters because filters can
be toggled without re-running the recommendation pipeline, but scoring
inputs require a refresh.

### Concrete Examples

- *Cost-down design review:* set order to `[cost, lifecycle, compliance,
  stock]`, with cost dominant. Every candidate gets ranked by savings
  first.
- *Supply-chain resilience for a long-running BOM:* set order to
  `[lifecycle, stock, compliance, cost]`. The system surfaces the most
  durable candidates, accepting cost penalties for lifecycle safety.
- *Regulated medical or automotive build:* set order to `[compliance,
  lifecycle, cost, stock]`. Candidates with the deepest certification
  coverage float to the top.

The same canonical schema, the same matching rules, the same data — but
the recommendations the user sees reflect what they actually care about
*right now*.

---

## Part 6 — Qualification Domain: A Hard Safety Gate

### The Guiding Principle

**Some substitutions are unsafe regardless of any score, any
certification, or any preference.** A medical-implant part should never
appear as a candidate for an automotive engine controller, even if it
matches every parametric attribute. A consumer-grade MLCC should never
appear as a candidate for an avionics power supply, even if it's
form-fit-function identical to the source.

### How It Works

A classifier maps every source and candidate part to one of ten
qualification domains: `automotive_q200`, `automotive_q100`,
`automotive_q101`, `industrial_harsh`, `commercial`, `medical_implant`,
`medical_general`, `mil_spec`, `space`, or `unknown`. Classification
draws on manufacturer-specific series patterns, parametric flags like
`aec_q200`, and other heuristics.

When the user's context expresses a domain (an automotive intent, say),
the engine hard-excludes candidates classified into incompatible
domains *before* any other scoring or bucketing happens. Cross-domain
candidates never appear in the ranked list at all.

### Why It Runs Before Certified-Cross Bypass

A separate mechanism — the certified-cross bypass — lets
industry-published equivalents skip the engine's blocking-rule filters
on the principle that an explicit human certification outranks an
inferred rule. The qualification-domain filter is **not** part of that
bypass. Certification can excuse a categorical mismatch on op-amp
sub-type or gate-driver topology, but it cannot excuse a cross-domain
substitution. Safety-domain mismatches are inviolable.

`unknown`-domain candidates are deliberately not excluded. Many Atlas
products and non-classified manufacturers lack the structured attribute
the classifier looks for, even when they're legitimately qualified.
Filtering them out would erase coverage the team has worked hard to
build. The UI badges them with "verify qualification" instead.

---

## Part 7 — Editable Without Code Changes

### The Guiding Principle

**Engineering judgment evolves. The schema should not require a code
deploy to evolve with it.**

The logic tables live in code so they can be reviewed, type-checked,
and tested. But individual rules — their weights, their logic types,
their blocking flags, their aliases — are editable through the admin
UI, and the edits live in the database. The composition happens at
evaluation time.

### The Override Merge Pattern

When the engine loads a family's logic table, it follows a three-step
merge pattern:

1. **Remove** rules marked for removal by an override.
2. **Modify** rules where an override patches specific fields. Patchable
   fields include weight, logic type, blocking flag, threshold
   direction, upgrade hierarchy, value aliases, tolerance percentage,
   engineering reason, attribute name, and sort order. The override
   record carries only the fields it changes; everything else inherits
   from the base.
3. **Add** entirely new rules from `add`-action override records.

Context questions are overridable through the same mechanism, with
actions to modify or disable existing questions, add new questions, and
add or modify options on existing questions.

### The Audit Trail

Every override record carries a `previousValues` snapshot of the state
it replaced. Edit history is preserved indefinitely. The admin UI lets
engineers review the full change history for any rule, see who made
each change and why (via an explicit `changeReason` field), and restore
to any prior version with one click.

Engineers can also leave annotations on rules — short prose notes that
sit alongside the rule for peer commentary. This is how informal
engineering discussion ("we tried this at weight 7 and got too many
false negatives, dropped to 5") gets captured in the system without
modifying the rule itself.

### The Principle Behind the Split

The schema lives in code because code is the right medium for things
that need to be type-checked and tested. The edits live in the database
because rule weights and context effects are *engineering opinions*
that change as the team learns, and opinions belong in a place where
they can be revised without redeploys, reviewed in an audit log, and
reverted in one click.

The composition of code-baseline plus database-overrides happens at
evaluation time, with a 60-second cache. An engineer can adjust a rule
weight from the admin UI and have the new value reflected in every
cross-reference within a minute.

---

## Closing — Principles That Tie the Logic Layer Together

**Data describes; logic decides.** The data layer normalizes parametric
values into a canonical schema. The logic layer wraps that schema with
the semantics needed to turn comparisons into engineering verdicts.

**Every rule is one engineer's judgment, captured with reasoning.**
Weights, blocking flags, comparison modes, and the prose
`engineeringReason` field all preserve the original call so it can be
understood and revised later.

**Context shifts what matters without changing the engine.** Per-search
application context, user-profile preferences, and (eventually)
list-level context all flow through the same effect mechanism. They
adapt the rule weights and blocking flags for a specific situation
without touching the schema, the data, or the matching algorithm.

**Beyond pass/fail: economics, risk, lifecycle, and stock are
first-class.** The replacement-preferences layer lets the user weight
non-technical dimensions explicitly. A 92 percent technical match with
an Obsolete lifecycle status loses to a 90 percent match with an Active
lifecycle status when the user has expressed that preference.

**Safety domains are inviolable; everything else is negotiable.** The
qualification-domain filter is a categorical hard gate that no
certification, no preference, and no override can bypass. Every other
rule in the system is editable and contextual.

**The schema lives in code; the judgments evolve in the database.** The
structure of a rule is fixed by the type system. The values inside the
rule — what matters, how much, when it blocks — are revisable through
the admin UI with a full audit trail and one-click revert.

The net effect: a recommendation in XRefs is not just "this part is
parametrically similar to that part." It's "given what this part is,
given what the user is building, given what the team has learned
about how to compare parts in this family, given the user's economic
and risk preferences, and given the safety domain the application
requires, here is the ranked list of substitutions that satisfy all of
those constraints — with the reasoning for every score laid out for
inspection." That's the difference between data and decisions, and it's
what the logic layer is for.
