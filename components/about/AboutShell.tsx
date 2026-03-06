'use client';

import { Box, Typography, Chip, Divider } from '@mui/material';
import { PAGE_HEADER_HEIGHT } from '@/lib/layoutConstants';
import { getAllLogicTables } from '@/lib/logicTables';

/* ------------------------------------------------------------------ */
/*  Family groupings — `category` on LogicTable only distinguishes    */
/*  "Passives" vs "Discrete Semiconductors", so we define visual      */
/*  subcategories here.                                                */
/* ------------------------------------------------------------------ */
const FAMILY_GROUPS: { label: string; familyIds: string[] }[] = [
  { label: 'Capacitors', familyIds: ['12', '13', '59', '58', '60', '64', '61'] },
  { label: 'Resistors', familyIds: ['52', '53', '54', '55'] },
  { label: 'Inductors & EMI Suppression', familyIds: ['71', '72', '70', '69'] },
  { label: 'Circuit Protection', familyIds: ['65', '66', '67', '68'] },
  { label: 'Discrete Semiconductors', familyIds: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'] },
  { label: 'Power Management ICs', familyIds: ['C1', 'C2', 'C3'] },
  { label: 'Analog ICs', familyIds: ['C4', 'C6'] },
  { label: 'Digital & Interface ICs', familyIds: ['C5', 'C7'] },
  { label: 'Data Converters', familyIds: ['C9', 'C10'] },
  { label: 'Timing', familyIds: ['C8'] },
];

const allTables = getAllLogicTables();
const familyLookup = new Map(allTables.map((t) => [t.familyId, t]));
const totalFamilies = allTables.length;
const totalRules = allTables.reduce((sum, t) => sum + t.rules.length, 0);

/* ================================================================== */

export default function AboutShell() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Header — matches Settings / Admin pattern */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 3,
          height: PAGE_HEADER_HEIGHT,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" fontWeight={400} color="text.secondary" sx={{ lineHeight: 1 }}>
          About
        </Typography>
      </Box>

      {/* Scrollable content */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Box sx={{ maxWidth: 720, mx: 'auto', px: 3, py: 4 }}>

          {/* -------------------------------------------------------- */}
          {/* 1. Intro                                                  */}
          {/* -------------------------------------------------------- */}
          <Typography variant="body1" fontWeight={600} sx={{ mb: 1 }}>
            What is in this XQv2 Alpha?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, lineHeight: 1.7 }}>
            This is a cross-reference recommendation engine with a focus on
            Chinese components. You enter or describe a product and the app will
            ask you questions (if necessary) and provide replacement
            recommendations. It will score every candidate using deterministic
            engineering rules and rank the suggestion with a breakdown of why
            each part does or doesn&apos;t meet your requirements.
          </Typography>

          <Divider sx={{ mb: 4 }} />

          {/* -------------------------------------------------------- */}
          {/* 2. Supported Component Families                           */}
          {/* -------------------------------------------------------- */}
          <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
            Supported Component Families
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2.5, display: 'block' }}>
            {totalFamilies} families &middot; {totalRules} engineering rules.
            New families are added regularly.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
            {FAMILY_GROUPS.map((group) => (
              <Box key={group.label}>
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{ mb: 0.75, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
                  {group.label}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {group.familyIds.map((id) => {
                    const table = familyLookup.get(id);
                    if (!table) return null;
                    return (
                      <Chip
                        key={id}
                        variant="outlined"
                        size="small"
                        label={`${table.familyName} (${table.rules.length})`}
                        sx={{ fontSize: '0.72rem', height: 24 }}
                      />
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Box>

          <Divider sx={{ mb: 4 }} />

          {/* -------------------------------------------------------- */}
          {/* 3. Known Limitations                                      */}
          {/* -------------------------------------------------------- */}
          <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
            Known Limitations
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block', lineHeight: 1.6 }}>
            XQ is a powerful starting point, but it has boundaries you should be
            aware of:
          </Typography>

          <Box
            component="ul"
            sx={{
              pl: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              mb: 4,
            }}
          >
            <LimitationItem>
              <strong>Limited family coverage.</strong> XQ currently supports{' '}
              {totalFamilies} component families covering passive components,
              discrete semiconductors, and ICs (power management, analog, logic,
              interface, data converters, and timing). Connectors, LEDs, sensors,
              and many other component types are not yet supported.
            </LimitationItem>
            <LimitationItem>
              <strong>Single data source.</strong> All part data comes from
              Digikey&apos;s catalog. If a part is not listed in Digikey, XQ
              cannot find or evaluate it.
            </LimitationItem>
            <LimitationItem>
              <strong>Incomplete parametric data for some families.</strong> Digikey
              does not provide every parameter needed for full evaluation in all
              categories. Datasheet-only parameters (e.g., ENOB for ADCs, glitch
              energy for DACs, CMRR for op-amps) cannot be checked automatically.
              Coverage ranges from ~30% to ~63% of rule weight depending on the
              family.
            </LimitationItem>
            <LimitationItem>
              <strong>Automotive qualification gaps.</strong> AEC-Q200, AEC-Q101,
              and AEC-Q100 qualification status is unreliable or absent in
              Digikey&apos;s data for certain categories (e.g., tantalum
              capacitors, IGBTs, ADCs/DACs). XQ flags these for review rather
              than making incorrect assertions.
            </LimitationItem>
            <LimitationItem>
              <strong>Static rules.</strong> The matching rules are derived from
              engineering specification documents and encoded as static logic. XQ
              does not learn from user feedback or adapt its rules over time.
            </LimitationItem>
            <LimitationItem>
              <strong>Human review still needed.</strong> Some rules &mdash; like DC
              bias derating for ceramic capacitors &mdash; inherently require
              engineering judgment and datasheet review. These are flagged for
              manual verification, not decided automatically.
            </LimitationItem>
            <LimitationItem>
              <strong>Not a substitute for qualification testing.</strong>{' '}
              Cross-reference recommendations are a starting point for evaluation.
              Final validation should include testing per your
              organization&apos;s qualification process.
            </LimitationItem>
          </Box>

        </Box>
      </Box>
    </Box>
  );
}

/* ================================================================== */
/*  Small presentational helpers                                       */
/* ================================================================== */

function LimitationItem({ children }: { children: React.ReactNode }) {
  return (
    <Typography component="li" variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
      {children}
    </Typography>
  );
}
