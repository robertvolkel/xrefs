# Logic Table .docx Format Specification
## Component Replacement Engine — Block C and beyond

This document defines the exact format used for all component family logic table Word documents.
A working Node.js generation script is provided in `docx_template_example.js`.

---

## Page Setup
- **Orientation:** Landscape
- **Page size:** 12240 × 15840 DXA (Letter landscape)
- **Margins:** 1080 DXA on all sides (~0.75 inches)
- **Font:** Arial throughout

---

## Color Palette
| Element | Hex |
|---|---|
| Header row background | `1F3864` (dark navy) |
| Header row text | `FFFFFF` |
| Section row background | `2E75B6` (medium blue) |
| Section row text | `FFFFFF` |
| Alternating row (even) | `DDEEFF` (light blue) |
| Standard row (odd) | `FFFFFF` |

---

## Table Structure
Four columns with these fixed DXA widths:

| Column | Width (DXA) | Content |
|---|---|---|
| Attribute | 2400 | Parameter name + sub-name in parentheses. **Bold.** |
| Logic Type | 1500 | One of the 5 logic types (see below) |
| Matching Rule | 3200 | Concise rule statement |
| Engineering Reasoning | 5860 | Verbose explanation of WHY — educational, thorough |

**Total table width:** 12960 DXA (fills the page between margins)

---

## Row Types

### Header Row
- `tableHeader: true`
- All cells: fill `1F3864`, text `FFFFFF`, bold, size 20, Arial

### Section Row
- `columnSpan: 4` across all columns
- Fill `2E75B6`, text `FFFFFF`, bold, size 20, Arial
- Groups related attributes (e.g., "IDENTITY", "VOLTAGE RATINGS", "THERMAL")

### Data Row
- Alternates between `DDEEFF` (alt=true) and `FFFFFF` (alt=false)
- Attribute cell: bold
- All other cells: size 18, Arial
- `verticalAlign: TOP` on all cells
- Cell margins: top/bottom 80, left/right 120

---

## Logic Types (exact strings used in Logic Type column)
- `Identity` — must match exactly; hard gate
- `Identity (Flag)` — presence/absence or polarity must match
- `Threshold ≥` — replacement value must meet or exceed
- `Threshold ≤` — replacement value must be equal or lower
- `Application Review` — directional but context-dependent; requires judgment
- `Threshold ⊇` (range) — replacement range must include the target value
- `Operational` — production/logistics spec (packaging format, etc.)

---

## Document Structure (in order)

1. **H1 heading** — "Component Replacement Logic Table — [FamilyID]: [Family Name]"
2. **Body paragraph** — "Family ID: Cx  |  Block: C — Power Management ICs  |  Complexity: [Low/Moderate/High]  |  Total Attributes: N"
3. **Body paragraph** — One-line description of what the family covers
4. **Body paragraph** — "Related Families: ..."
5. **Empty paragraph** (spacing)
6. **Main logic table**
7. **Empty paragraph** (spacing)
8. **H2 heading** — "Engineering Notes — [Family]-Specific Trade-offs and Gotchas"
9. **3–5 H3 sections** — each covering a key engineering concept, using body paragraphs and bullet points
10. **Empty paragraph** (spacing)
11. **H2 heading** — "Logic Type Summary"
12. **Summary table** (3 columns: Logic Type | Count | Attributes)
13. **Empty paragraph**
14. **Body paragraph** — "Document generated for Component Replacement Engine — Block C: Power Management ICs. Family Cx of 7."

---

## Heading Sizes
- H1: size 32
- H2: size 26
- H3: size 22
- Body: size 18
- Bullet: size 18, indent left 480, hanging 240, bullet char `•` (U+2022)

---

## Summary Table Structure
3 columns: Logic Type (2400 DXA) | Count (600 DXA) | Attributes (9960 DXA)
- Header row: fill `1F3864`, text `FFFFFF`
- Data rows: alternating `FFFFFF` / `DDEEFF`
- Final row: colspan 3, fill `1F3864`, text `FFFFFF` — "TOTAL: N attributes"

---

## Attribute Map Integration
After generating the .docx, also update `application-context-attribute-map.md`:
1. Add a row to the **ranking table** (format: `| N | Family Name | FamilyID | **Complexity** | Brief justification |`)
2. Add a **detail section** (`### N. Family Name (Family FamilyID)`) with context questions in table format
3. Add a row to the **summary questions table** at the end of the document
4. Increment the section number of any families that come after the insertion point

The attribute map currently has **30 families** (last updated end of C3 session).
The ranking table covers ranks 1–30; Mica Capacitors is rank 30 (the last entry).
New families should be inserted at rank 29 (before Mica) or appended at rank 31+ depending on context sensitivity.

---

## npm Package
```
npm install docx
```
Uses `docx` package v9.x. Key imports:
```javascript
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        BorderStyle, WidthType, ShadingType, VerticalAlign, PageOrientation } = require('docx');
```

Output with: `Packer.toBuffer(doc).then(buf => fs.writeFileSync("output.docx", buf))`

---

## Completed Families Reference
| ID | Family | Attributes | Block |
|---|---|---|---|
| B1 | Rectifier Diodes | 23 | B |
| B2 | Schottky Diodes | 22 | B |
| B3 | Zener/Voltage Reference Diodes | 22 | B |
| B4 | TVS Diodes | 23 | B |
| B5 | MOSFETs | 27 | B |
| B6 | BJTs | 18 | B |
| B7 | IGBTs | 25 | B |
| B8 | Thyristors/TRIACs/SCRs | 22 | B |
| B9 | JFETs | 16 | B |
| C1 | Linear Voltage Regulators (LDOs) | 22 | C |
| C2 | Switching Regulators | 22 | C |
| C3 | Gate Drivers | 18 | C |

**Remaining Block C families:** C4 Op-Amps/Comparators, C5 Logic ICs, C6 Timers (555), C7 Interface ICs (RS-485/CAN)
