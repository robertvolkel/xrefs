# Siemens Brand Identity — Visual System

Apply these rules to all generated marketing material (slides, one-pagers,
cards, web pages, data-viz) unless explicitly overridden.

## Feel
Dark, technical, premium, calm, high-contrast. "Engineered," not colorful.
Color is used for hierarchy and gradient, not decoration. Relies on negative space.

## Color palette

### Core (use for ~95% of everything)
| Role | Name | HEX |
|---|---|---|
| Primary background | Siemens Deep Blue | `#000028` |
| Accent / gradient end | Siemens Petrol | `#009999` (paint variant `#008C95`) |
| Mid-gradient transition | Deep Teal | `#004A5C` |
| Text / logos | White | `#FFFFFF` |
| Footer / secondary text | Soft White | `#CFE3E6` |

Use ONE accent (petrol), sparingly.

### Hero / title-slide colors (cover + section dividers only)
| Role | Name | HEX |
|---|---|---|
| Hero base (darkest) | Indigo Black | `#080814` |
| Hero mid | Deep Indigo | `#2A2C5E` |
| Hero highlight | Soft Violet | `#4E4B82` |

### Secondary data-viz tints (ONLY inside multi-category charts/tables, muted)
Maroon `#491734` · Steel `#174262` · Forest `#1A5A4C` · Sage `#457055` · Indigo `#3C4D78` · Sky `#1E79A8`

## Gradients

```css
/* A. Content gradient — default background for all content slides */
background: linear-gradient(180deg,
  #000028 0%, #000028 30%, #001A3B 45%,
  #004A5C 65%, #007C84 82%, #009999 100%);

/* B. Hero/title gradient — covers & dividers ONLY */
background: radial-gradient(120% 120% at 75% 15%,
  #4E4B82 0%, #2A2C5E 35%, #080814 80%);
```

## Typography
Font: `"Siemens Sans", "Arial", "Helvetica Neue", Helvetica, sans-serif`
If Siemens Sans is unavailable, use Arial (the official fallback) — never a
stylistically different font.

Hierarchy:
- Cover title: ~54–72pt, regular/medium, white, generous letter-spacing
- Slide title: ~28–32pt bold, white, top-left
- Section label/subtitle: ~20–24pt regular, white or soft white
- Body/bullets: ~18–20pt regular, white, simple round bullet marker
- Footer legal: ~10–11pt, soft white, centered

Headlines left-aligned, near top-left. High-contrast white on dark. Avoid
italics except an occasional cover subtitle.

## Layout
- Aspect ratio: 16:9
- Background: content gradient for content slides; hero gradient for covers
- Title: top-left, bold white, comfortable top/left margin (~4–5% of width)
- Generous left margin; content starts well in from the edge
- SIEMENS wordmark bottom-right (white, bold all-caps); on light surfaces
  it flips to petrol/teal or black

## Footer legal line (match exactly)
```
Restricted | © Siemens 2025 | Siemens Digital Industries Software | Page N
```
(Classification swaps: Restricted / Unrestricted / Confidential. Update year + page.)

## Don't
- No off-brand colors (no mint green, no orange, no gradients outside the two above)
- No body text on the violet hero background — covers are titles only
- Never recolor/outline/shadow the SIEMENS wordmark
- Don't crowd the layout; don't use secondary tints as primary surfaces

## Paste-ready CSS tokens
```css
:root {
  --x-deep-blue:#000028; --x-petrol:#009999; --x-petrol-paint:#008C95;
  --x-deep-teal:#004A5C; --x-white:#FFFFFF; --x-soft-white:#CFE3E6;
  --x-indigo-black:#080814; --x-deep-indigo:#2A2C5E; --x-soft-violet:#4E4B82;
  --x-gradient-content:linear-gradient(180deg,#000028 0%,#000028 30%,#001A3B 45%,#004A5C 65%,#007C84 82%,#009999 100%);
  --x-gradient-hero:radial-gradient(120% 120% at 75% 15%,#4E4B82 0%,#2A2C5E 35%,#080814 80%);
  --x-font:"Siemens Sans","Arial","Helvetica Neue",Helvetica,sans-serif;
}
```
