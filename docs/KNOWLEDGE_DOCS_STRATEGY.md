# Knowledge-Docs Strategy

The project's knowledge lives in a handful of Markdown files (`CLAUDE.md`,
`docs/DECISIONS.md`, `docs/BACKLOG.md`, `MEMORY.md`, plus topic docs). For the
first five months these grew **add-only** — content was written and never
removed, demoted, or retired — until they cost real context on every session and
a single on-demand read could exhaust the window. This document is the strategy
that keeps that from recurring.

## The core rule: demote, don't delete

Nothing valuable is ever deleted. When a doc outgrows its budget, its detail
**moves to a quieter file** — one that isn't loaded every session and isn't read
whole. History is preserved; it's just moved out of the way. (Git preserves it
regardless, but keeping it in a searchable archive means a future session can
still find it.)

## Three shelves, each with a budget

Sort every piece of knowledge by **how often it must be in front of the model**,
and cap each shelf.

### Shelf 1 — Always loaded (keep small + curated)
`CLAUDE.md` and `MEMORY.md` are injected into **every** session before any work
begins, so every token here is paid for constantly.
- **Contents:** the map of the codebase, the load-bearing invariants (as
  one-liners), and pointers to where the detail lives.
- **Budget ladder** (target < enforced < cliff — the gaps are deliberate, do not
  collapse them to one number):

  | | target | enforced at | hard cliff |
  |---|---|---|---|
  | `CLAUDE.md` | 80 KB | 1,100 B per *new* Key-Patterns entry (`docs:check --strict`) | — |
  | `MEMORY.md` | 14 KB | 17,100 B, `memory-budget.mjs` **denies the write** | truncates **silently** ~24 KB |

- **Rule:** a new pattern earns a *one-line rule + a `(Decision #N)` / topic-doc
  pointer* here — never a paragraph. The paragraph goes to Shelf 2/3.
- ⚠️ **That rule is now enforced, because writing it down did not work.** It was
  added 2026-07-23; the next five entries were 1,324 / 1,299 / 1,807 / 1,474 /
  1,220 bytes — **five paragraphs out of five**, three written by the same author
  who wrote the rule. `npm run docs:check -- --strict` now fails on an added or
  changed Key-Patterns line over **1,100 bytes**.
  - The cap applies to **added/changed lines only** (diffed against `origin/main`).
    A whole-section cap would fail on every pre-existing paragraph and be switched
    off within a day.
  - **1,100 is measured, not chosen.** Backtested against every real commit *and*
    against the output a compaction pass itself produces: 700 B blocks 5/47
    legitimate entries; 1,200 B misses real regrowth; 1,100 B is the only value
    where both error rates are zero. ⚠️ **A threshold validated on one failure mode
    is not validated** — check false positives and false negatives before trusting one.

### Shelf 2 — On-demand reference ("read before touching X")
The topic docs: `docs/FAMILIES.md`, `docs/DATA_SOURCES.md`,
`docs/QA_PARAM_MAPPING.md`, the per-subsystem notes, and the memory topic files.
Full rationale lives here. Each file stays small enough to read in one go.

### Shelf 3 — Archive (kept for history, rarely opened)
Retired decisions, finished backlog items, old reports. Split so **no single
file must ever be read whole**, and kept as **flat top-level `docs/*.md`** files
(see the safety-net constraint below). Examples: `docs/DECISIONS_001-099.md`,
`docs/BACKLOG_DONE.md`.

## The safety net (why trimming Shelf 1 is safe)

`CLAUDE.md` is 89% hard facts (identifiers, file paths, thresholds); a dropped
invariant does not throw — it resurfaces months later as a bug nobody connects to
a doc edit. So Shelf 1 is never trimmed on care alone:

```
npm run docs:check              # advisory  — also runs in prebuild, can never fail a build
npm run docs:check:strict       # enforcing — runs in `npm run verify` and CI
```

It extracts every hard fact from a **union of baselines** of `CLAUDE.md` and
asserts each is still reachable in the corpus. Content may **move**; it may not
**disappear**. Run it after every structural doc change.

`--strict` adds two checks that only make sense as hard failures:
1. **the per-entry cap** described above;
2. **every source filename named in `CLAUDE.md` must exist in `git ls-files`.**

⚠️ **Three things this net does NOT do.** Green is necessary, never sufficient:
- **It is ~88% pre-satisfied for `Key Patterns`** — 789 of 889 identifiers there
  already appear in `docs/*.md`, so it stays green whether a trim is careful or
  careless. And only **0.4% of `CLAUDE.md` is word-for-word duplicated** in
  `docs/` — the *identifiers* repeat, the *sentences* do not, so **there is no
  free deletion.**
- **It protects vocabulary, not grammar.** Prohibitions, ordering chains, bare
  numeric thresholds and "bump X when you change Y" couplings match none of its
  patterns; 142 of its "facts" are bare words like `MUST`/`ONLY`/`TRUE`. Those
  invariants must be preserved by hand — **no script covers them.**
- **A single pinned baseline decays.** It was pinned 2026-07-12; by 2026-08-03
  **21.6% of current facts were covered by nothing**, 66 of them deletable with a
  green result. Hence `BASELINES` is an **append-only array** — appending keeps
  the never-measure-against-the-previously-trimmed-file property. **Append the
  pre-pass ref at the end of every compaction; never replace an entry.**

Deliberate deletions go in the `RETIRED` map in the script, each with a reason —
otherwise a legitimate removal leaves the check permanently red, and a
permanently-red check gets silenced. (That is how `|| true` reached `prebuild`.)

**Load-bearing constraint:** `docs:check` scans `CLAUDE.md` + `docs/*.md`
**non-recursively**. It does **not** look inside `docs/audits/`,
`docs/explainers/`, or any subfolder. Therefore **every archive file must be a
flat top-level `docs/*.md`** — a `docs/decisions/` subfolder would make the
check falsely report those facts as lost.

## Which files code actually depends on

Reorganizing docs is safe because **no code reads them as data** — with one
exception that must never move or be reshaped casually:
- `docs/min_attr_sets.md` — the **generated source of truth** for guided
  selection; read by `selection:audit` / `selection:check` (a `prebuild` gate)
  and by `ParamMappingsPanel.tsx`. Treat as code, not prose.

Everything else (`CLAUDE.md`, `DECISIONS*.md`, `BACKLOG*.md`, `MEMORY.md`) is
referenced only in comments, so it is free to be split, indexed, and archived.

## Go-forward checklist

1. Shelf 1 has a budget; `npm run docs:check` stays green after any doc edit.
2. New detail goes to Shelf 2/3; Shelf 1 gets a one-liner + pointer.
3. A superseded decision is **moved to the archive in the same commit** that
   supersedes it — never left in the active file.
4. Finished backlog items move to `docs/BACKLOG_DONE.md`.
5. Archive files are always flat `docs/*.md` (never a subfolder).
6. Demote, don't delete.
