'use client';

import { Box, Typography, Paper, Chip, Divider } from '@mui/material';
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
          {/* 2. How It Works                                           */}
          {/* -------------------------------------------------------- */}
          <Typography variant="body1" fontWeight={600} sx={{ mb: 2 }}>
            How It Works
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
            <StepCard number={1} title="Search for a Part">
              Enter a manufacturer part number (MPN) into the search bar. XQ
              queries Digikey&apos;s Product Information API to identify the part
              and retrieve its full parametric specifications &mdash; capacitance,
              voltage rating, package size, tolerance, temperature range, and
              dozens more depending on the component type.
            </StepCard>

            <StepCard number={2} title="Answer Context Questions">
              Every component family has targeted questions about your application.
              Is this going into an automotive environment? A flex PCB? A precision
              measurement circuit? Your answers dynamically adjust which matching
              rules become critical. For example, selecting &ldquo;Automotive&rdquo;
              makes AEC-Q200 qualification mandatory rather than optional.
            </StepCard>

            <StepCard number={3} title="Review Scored Recommendations">
              The scoring engine evaluates every candidate replacement against the
              family&apos;s engineering rules (typically 13&ndash;23 rules per
              family). Each rule carries a weight reflecting its criticality. The
              match percentage is the ratio of earned weight to total weight. A
              candidate that fails any critical rule &mdash; wrong capacitance,
              incompatible package &mdash; is flagged regardless of its overall
              score. Rules that require human judgment, like DC bias derating, are
              marked for review rather than auto-decided.
            </StepCard>
          </Box>

          <Paper
            elevation={0}
            sx={{
              px: 2,
              py: 1.5,
              mb: 4,
              border: 1,
              borderColor: 'primary.main',
              borderRadius: 1.5,
              bgcolor: 'transparent',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', lineHeight: 1.6 }}>
              The AI helps you have a conversation. The engineering rules decide if
              a replacement is valid. No AI model ever decides whether a part is a
              good match &mdash; that decision is always made by deterministic
              logic derived from component engineering specifications.
            </Typography>
          </Paper>

          <Divider sx={{ mb: 4 }} />

          {/* -------------------------------------------------------- */}
          {/* 3. Supported Component Families                           */}
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
          {/* 4. What the Rules Check                                   */}
          {/* -------------------------------------------------------- */}
          <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
            What the Rules Check
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block', lineHeight: 1.6 }}>
            Each family&apos;s logic table is built from component engineering
            specification documents. Rules fall into seven types:
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4 }}>
            <RuleRow
              name="Exact Match"
              description="The replacement must have the same value."
              example="Capacitance: 100 nF must be replaced by exactly 100 nF."
            />
            <RuleRow
              name="Upgrade Allowed"
              description="The replacement can match or be superior per a defined hierarchy."
              example="Dielectric: X5R can be replaced by X7R or C0G, but not by Y5V."
            />
            <RuleRow
              name="Required Flag"
              description="If the original part has a qualification or feature, the replacement must have it too."
              example="AEC-Q200 automotive qualification, flexible termination."
            />
            <RuleRow
              name="Threshold"
              description="A numeric value must meet or exceed (or stay below) a limit."
              example="Voltage rating must be equal to or higher than the original."
            />
            <RuleRow
              name="Physical Fit"
              description="The replacement must physically fit in the same footprint."
              example="Component height cannot exceed the original."
            />
            <RuleRow
              name="Needs Human Review"
              description="Some checks cannot be fully automated and are flagged for an engineer to verify."
              example="DC bias derating curves, which depend on application voltage ratios."
            />
            <RuleRow
              name="Operational"
              description="Non-electrical attributes related to manufacturing or logistics."
              example="Packaging format (tape-and-reel vs. bulk) for the production line."
            />
          </Box>

          <Divider sx={{ mb: 4 }} />

          {/* -------------------------------------------------------- */}
          {/* 5. Known Limitations                                      */}
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
              {totalFamilies} component families covering passive components and
              discrete semiconductors. ICs, connectors, LEDs, and many other
              component types are not yet supported.
            </LimitationItem>
            <LimitationItem>
              <strong>Single data source.</strong> All part data comes from
              Digikey&apos;s catalog. If a part is not listed in Digikey, XQ
              cannot find or evaluate it.
            </LimitationItem>
            <LimitationItem>
              <strong>Incomplete parametric data for some families.</strong> Digikey
              does not provide every parameter needed for full evaluation in all
              categories. PTC thermistors, supercapacitors, and varistors have
              notably sparse data coverage, which means some rules cannot be
              evaluated and are skipped.
            </LimitationItem>
            <LimitationItem>
              <strong>Automotive qualification gaps.</strong> AEC-Q200 and AEC-Q101
              qualification status is unreliable in Digikey&apos;s data for certain
              categories (e.g., tantalum capacitors, rectifier diodes). XQ flags
              these for review rather than making incorrect assertions.
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

function StepCard({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      elevation={0}
      sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            width: 20,
            height: 20,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '0.68rem',
            fontWeight: 700,
            position: 'relative',
            top: 1,
          }}
        >
          {number}
        </Typography>
        <Typography variant="body2" fontWeight={600}>
          {title}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ pl: 3.5, lineHeight: 1.6, display: 'block' }}>
        {children}
      </Typography>
    </Paper>
  );
}

function RuleRow({
  name,
  description,
  example,
}: {
  name: string;
  description: string;
  example: string;
}) {
  return (
    <Box>
      <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
        {name}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        {description}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', lineHeight: 1.6 }}>
        Example: {example}
      </Typography>
    </Box>
  );
}

function LimitationItem({ children }: { children: React.ReactNode }) {
  return (
    <Typography component="li" variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
      {children}
    </Typography>
  );
}
