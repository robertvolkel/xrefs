# XRefs: Component Intelligence Platform

## The Problem

When an electronics engineer or buyer needs to replace a part — whether due to obsolescence, supply shortages, cost optimization, or strategic sourcing — they face a slow, error-prone process:

- Hunting through manufacturer datasheets to find equivalent parts
- Comparing dozens of parametric specifications side-by-side
- Verifying availability and pricing across distributors
- Checking compliance, lifecycle status, and qualifications
- Considering business context (preferred vendors, country sourcing, certifications)

A single part replacement can take hours. A typical Bill of Materials has hundreds of parts.

## What XRefs Does

XRefs takes a part number (or an entire Bill of Materials) and finds equivalent replacements automatically. For each suggestion it provides:

- A match score showing how closely the replacement aligns with the original
- Side-by-side parametric comparison with every spec accounted for
- Live pricing and inventory across roughly 80 distributors worldwide
- Lifecycle, compliance, and qualification flags
- Personalized ranking based on the user's role, goals, and constraints

The system covers 43 component families — capacitors, resistors, inductors, diodes, transistors, voltage regulators, op-amps, logic ICs, ADCs, DACs, crystals, optocouplers, relays, and more.

## How It Works

### 1. A Deterministic Matching Engine

XRefs does not use AI to decide whether two parts match. Matching is governed by a rule engine that encodes the expertise of component engineers.

Each component family has its own set of rules. A multilayer ceramic capacitor is evaluated against rules covering capacitance, voltage rating, tolerance, dielectric material, package size, and automotive qualification. A MOSFET has rules for drain-source voltage, on-state resistance, gate threshold, total gate charge, package, and so on. The rules came directly from component-engineering specification documents — one per family — and were translated into structured logic.

Each rule produces one of three outcomes:
- **Pass** — the replacement matches the original spec
- **Fail** — a real mismatch (the replacement will not work in this slot)
- **Review** — the data is missing and a human should verify

A weighted scoring system rolls those outcomes up into an overall match percentage. The user always sees exactly which rules passed, failed, or need review, with the actual values displayed side-by-side.

This approach matters because engineers need to trust the result. A black-box AI model saying "these parts are similar" is not actionable. An engineer needs to see "voltage rating fails — candidate is 16V, original is 25V" to make a decision. Every recommendation is auditable down to the individual rule.

### 2. A Multi-Source Data Pipeline

No single distributor catalog can answer every question about a part. XRefs combines four data sources in parallel and merges them with explicit conflict-resolution rules:

- **DigiKey** — primary parametric data, pricing, and availability for Western components
- **Parts.io (Accuris)** — fills gaps that DigiKey's parametrics miss; these are typically datasheet-derived specs like thyristor turn-off times, relay coil details, or low-dropout regulator characteristics
- **Atlas** — a curated database of Chinese component manufacturers covering more than 1,000 companies and over 100,000 products, with specifications translated from Chinese datasheets
- **FindChips** — real-time pricing and inventory across roughly 80 distributors worldwide, including Chinese distributors such as LCSC and Winsource

When a user searches for a part, the system queries all four sources in parallel, normalizes the results into a single internal representation, and presents a unified view of what is known about that part.

### 3. The Atlas Difference

Most cross-reference tools focus only on Western manufacturers — Texas Instruments, Analog Devices, ON Semi, Vishay, and so on. XRefs treats Chinese manufacturers as first-class citizens.

The Atlas dataset captures Chinese components that traditional distributors do not catalog — parts from manufacturers like 3PEAK, SG Micro, GigaDevice, ISC, Sunlord, and dozens of others. For each manufacturer, XRefs maintains rich profile information: company background, certifications, core product lines, contact details, and a curated alias graph so the system recognizes that "ISC" and "无锡固电" refer to the same company.

This unlocks a category of replacement that competitors cannot offer: when a Western part is in short supply, has been deprecated, or is simply too expensive for a given program, XRefs can suggest a viable Chinese alternative with full parametric matching and real-time pricing from Chinese distributors. The user sees the same comparison view, the same match score, and the same level of detail — the only difference is a small flag indicator showing the manufacturer's country of origin.

The data behind Atlas is continuously curated. Chinese datasheets are translated, parameter names are normalized to a common dictionary, and a quality-control pipeline reviews new manufacturer data before it goes live. Engineers can see what is known, what is missing, and which specifications were extracted from a datasheet versus declared by the manufacturer.

### 4. Personalization Through User Context

The same part-replacement question has different right answers depending on who is asking.

A design engineer at a medical device company prioritizes pin-to-pin compatibility and safety certifications. A purchasing manager at a contract manufacturer cares more about price and lead time. An automotive supplier needs automotive-grade qualification at the top of every result. A small-volume product company may prefer Chinese parts to keep costs competitive, while a defense contractor may need to avoid them entirely.

XRefs captures context at three levels, each more specific than the last:

- **User profile** — role, industry, default compliance requirements, preferred manufacturers
- **List context** — per-Bill-of-Materials objectives, urgency, sourcing constraints
- **Application context** — family-specific questions answered for the part in question ("Is this used in a half-bridge circuit?", "What is the load type for this relay?")

These contexts adjust rule weights, escalate certain checks to blocking status, and re-rank results — without modifying the underlying matching logic. The same rules produce different rankings for different users. An automotive engineer searching for an op-amp sees automotive-qualified parts at the top. A consumer-electronics buyer searching for the same part sees the cheapest viable option.

### 5. A Conversational Interface

Engineers should not have to learn a query language. XRefs is built around a chat interface powered by Claude (Anthropic's large language model):

- "Find me a Chinese replacement for LM358 under 50 cents."
- "Why does this part have a fail rating?"
- "What other op-amps from Analog Devices are pin-compatible?"
- "Which of these have automotive qualification?"

The language model acts as an orchestrator — it understands the user's intent, calls the appropriate matching and search tools, and presents results in plain language. Importantly, the language model does **not** decide matches. It uses the deterministic rule engine and translates results into conversation. This separation is intentional: the matching itself stays auditable and reproducible, while the user experience stays natural.

### 6. A Continuous Quality-Control Loop

Every recommendation is logged with its full context — source part attributes, candidate evaluations, rule outcomes, the user's application context. Users can flag specific rules they disagree with directly from the comparison view, with a comment explaining what they think went wrong.

Administrators have a dedicated quality-control interface to:

- Review user feedback against the original recommendation snapshot
- Apply corrections to rule weights or thresholds at the database level, without a code release
- Analyze patterns across thousands of recommendations using AI-assisted aggregation
- Maintain a single source of truth for the matching logic that improves with field experience

When a user flags a rule and an administrator confirms the issue, the fix lives in a database override that takes effect on the next search. The system gets smarter over time, driven by real-world engineering judgment rather than guesses.

## What Makes This Different

Most cross-reference tools fall into one of two camps:

1. **Manufacturer-published cross-references.** Accurate but narrow — limited to what manufacturers themselves have already declared. No coverage for new parts, indirect equivalents, or competitive crosses.
2. **AI-based similarity search.** Flexible but opaque. The user has no way to audit why a suggestion was made, no way to verify it is actually safe to use, and no way to course-correct when the model gets it wrong.

XRefs is built around a different combination:

- A **transparent, rule-based matching engine** that an engineer can audit line by line
- **Multi-source data fusion** including Western, Chinese, and global distributor data
- **Personalization** that respects the business context of each user
- **A conversational interface** that meets users where they work
- **A live feedback loop** that improves the matching logic without releases

The platform combines the rigor of a deterministic system with the breadth of a multi-source data graph and the accessibility of a chat interface. Engineers, buyers, and supply chain professionals all use the same product, but each sees results filtered through their own context.

## Current Status

XRefs supports cross-reference recommendations across 43 component families, with DigiKey as the primary parametric source and the Atlas Chinese manufacturer dataset as a first-class peer. Live pricing comes from roughly 80 distributors. The system is in active use processing real Bills of Materials, and the matching logic is refined continuously based on user feedback through the built-in quality-control pipeline.

The roadmap extends the platform from cross-reference matching into broader component intelligence: deeper commercial intelligence (lead times, market trends), compliance and lifecycle tracking (end-of-life forecasting, environmental and trade compliance), and supply chain awareness (geopolitical risk signals, proactive alerts on parts the customer depends on).

The shared foundation across all of these is the same: deterministic, auditable matching; rich multi-source data with Chinese manufacturers treated as peers; and personalization that turns the platform from a search tool into an extension of the user's own judgment.
