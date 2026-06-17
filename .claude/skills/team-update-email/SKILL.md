---
name: team-update-email
description: Draft a non-technical progress-update email to the team summarizing what changed in the XRefs app over a date range, grouped into Data / Logic / Usability plus a "What's next" section. Use when the user asks to write, draft, or generate a team update, progress email, stakeholder update, or "what's new" summary for a given period. Always verifies live numbers before stating them.
---

# Team Update Email

Generate a progress-update email Rob can send to a mostly **business / non-technical** audience. They care about progress and new capabilities, not implementation detail.

## Parameters (the fixed shape — keep these constant)

- **Audience:** business users. Plain language. No jargon, no file/code references, no decision numbers.
- **Length:** hard cap ~600 words. Aim for 400–500.
- **Structure:** three buckets + a forward look, in this order:
  1. **Data** — coverage, dataset size/growth, data quality, new sources.
  2. **Logic** — recommendation accuracy, safety/qualification rules, newly supported families.
  3. **Experience / Usability** — features and changes a user actually feels.
  4. **What's next** — in-progress and upcoming work.
- **Emphasis:** lead with *new functionality and capabilities*. Mention fixes only when the impact is user-visible and material. Skip internal/admin-only tooling unless it clearly moves the product.
- **Tone:** confident, concise, a little momentum. End with an offer to walk anyone through details.
- **Format:** Subject line + body. Sign off with `[Your name]`.

## Step 1 — Get the date range

If the user didn't give one, ask. Convert anything relative ("last 4 weeks") to absolute dates using today's date. Default window is the last 4 weeks.

## Step 2 — VERIFY LIVE NUMBERS FIRST (do not skip)

Quantitative, time-sensitive metrics (product counts, growth, coverage, manufacturer counts) change daily and the repo docs (CLAUDE.md, MEMORY.md, DECISIONS.md) are **always stale**. Never quote them from memory or docs. Pull them live:

```bash
node .claude/skills/team-update-email/atlas-stats.mjs --since <YYYY-MM-DD> --until <YYYY-MM-DD>
# or: --days 28
```

This returns total products, products added in the window, the growth multiple, and a reminder to confirm the "live manufacturers" and "category" counts against the **Atlas Coverage Report** dashboard (those two come from the dashboard, not a single table — ask Rob for a screenshot or current values if unsure).

Rule of thumb: if a sentence in the email contains a number, either it came from this script / a dashboard Rob gave you in this conversation, or you flag it as "needs confirming." Page-load timings and similar are documented before/after figures — state them softly ("seconds rather than the better part of a minute") and note they're not freshly measured.

## Step 3 — Gather what actually changed in the window

Mine, then translate to business value:

- `git log --since=<date> --until=<date> --pretty=format:'%ad %s' --date=short` for shipped work.
- `docs/DECISIONS.md` — read entries dated within the window (decisions are dated).
- `docs/BACKLOG.md` and the current branch for in-progress / "what's next" candidates.

Sort each change into Data / Logic / Usability. Collapse many small related commits into one user-facing sentence. Drop anything a business user wouldn't notice or care about (refactors, cache internals, test changes, mirror-drift fixes, etc.).

## Step 4 — Draft

Write the email to the shape above, under the word cap. Translate every technical item into a benefit ("expanded translation dictionaries" → "unlocked thousands of previously-invisible parts"). For "What's next," ask Rob if he has specific items to include — he often does and they may not be inferable from the repo.

## Step 5 — Offer follow-ups

- Show the word count.
- Offer to drop it into a Gmail draft (Gmail MCP `create_draft` is available — load its schema via ToolSearch first).
- Note any figures still marked "needs confirming."

## Reference: the canonical example

The first email of this kind (window 2026-05-16 → 2026-06-15) is the quality bar. Its shape:

- **Data:** 410k+ parts / 379 MFRs / 34 categories; ~300k added in the month (>3x growth); translation work unlocking relay/optocoupler/LED/isolator parts; coverage repair for odd-format manufacturers.
- **Logic:** automotive AEC enforcement complete across all 11 families; cross-domain (medical/mil/aerospace) guarding; relays + optocouplers fully supported.
- **Experience:** collaborative two-way feedback; in-app notifications; clickable cross-ref filters + manufacturer profile links; faster pages.
- **What's next:** multi-part comparison; user-defined per-attribute tolerances; save discovered parts to any list; richer MFR profiles (qualifications + market/financial strength); ~150 more MFRs to ingest; thousands of attribute mappings in progress.
