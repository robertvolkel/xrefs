'use client';

/**
 * IngestHowToDrawer — operator runbook overlay for the Atlas Ingest page.
 *
 * Mirrors docs/RUNBOOK_INGESTION.md with MUI components for proper visual
 * formatting. Source-of-truth content lives in the .md; this is the
 * in-app rendering. Update both if the workflow changes.
 */

import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PhaseRow {
  step: string;
  action: React.ReactNode;
  why: React.ReactNode;
}

const PHASE_1_ROWS: PhaseRow[] = [
  {
    step: '1',
    action: <><b>Drag-drop new MFR JSON file(s)</b> onto the Atlas Ingest page</>,
    why: 'Each file becomes a Pending batch. Nothing has touched atlas_products yet.',
  },
  {
    step: '1a',
    action: <>If a new-MFR confirmation panel appears, <b>register the MFR</b></>,
    why: 'New MFRs must be registered in atlas_manufacturers before their report can generate.',
  },
  {
    step: '2',
    action: <><b>Wait for batch reports</b> to populate (polls every 5s, can take 5–30 min depending on file size)</>,
    why: "Background script generates per-MFR IngestDiffReport with the unmapped-params list. Batches sit at status='pending' until done — don't proceed early.",
  },
  {
    step: '3',
    action: <><b>Switch to Triage page</b> (?section=atlas-dict-triage)</>,
    why: 'Triage now shows unmapped params from your new Pending batches PLUS any leftover unresolved rows from older batches.',
  },
  {
    step: '4',
    action: <>(Optional) Click <b>"Generate N"</b> for bulk AI suggestions, OR click ✨ per-row as you go</>,
    why: 'Sonnet 4.6 reads param context + sample values, suggests attributeId / attributeName / unit. ~$0.005 per row. Per-row is cheaper if you only triage a subset.',
  },
  {
    step: '5',
    action: <><b>Accept rows you're confident about.</b> For B4/B5/L2/etc. canonicals, AI's "schema-canonical match" cases are usually safe.</>,
    why: 'Every accept becomes a live dict override that the Proceed step will apply at ingest time.',
  },
  {
    step: '5a',
    action: <><b>Edit attributeId before accepting</b> when the AI picks a sub-optimal canonical (e.g. L2-context name when an L3 canonical equivalent exists)</>,
    why: 'Just change the attributeId field, leave name/unit alone, then Accept. Future-proofs against later product reclassification.',
  },
  {
    step: '5b',
    action: <><b>Defer rows you can't map</b>: click 🚩 flag, add a team note explaining why</>,
    why: 'Better than accepting junk-drawer canonicals (type/style/kind/category/material/characteristic) that pollute matching. Engineer follows up.',
  },
  {
    step: '6',
    action: <>After an accept burst (20+ rows), click <b>"Regen affected batches"</b> at the top of Triage</>,
    why: 'Load-bearing, NOT cosmetic: re-classifies each batch\'s risk field against current overrides. Without this, batches stay marked attention/review from upload-time and Proceed All Clean stays at (0).',
  },
  {
    step: '6a',
    action: <>If you navigated away and the Regen banner disappeared: <b>click Regen on each batch card</b> individually</>,
    why: 'The Triage banner is client-side React state and resets on tab navigation (known gap, backlogged). Per-batch Regen does the same recalculation.',
  },
];

const PHASE_2_ROWS: PhaseRow[] = [
  {
    step: '7',
    action: <><b>Switch to Atlas Ingest → Pending tab</b></>,
    why: 'Dashboard shows updated risk distribution after Regen ran.',
  },
  {
    step: '8',
    action: <>Click <b>"Proceed All Clean (N)"</b> for bulk-apply of clean batches, OR per-batch <b>Proceed</b> for review/attention</>,
    why: 'Proceed reads current dict overrides at ingest time. Products land in atlas_products already correctly translated. No backfill required.',
  },
  {
    step: '8a',
    action: <>For review/attention batches that need engineer input: leave them Pending, document what's blocking in a team note</>,
    why: "Don't force-apply — attention typically means a real semantic gap (unmapped param spans multiple concepts, ambiguous unit).",
  },
];

const PHASE_3_ROWS: PhaseRow[] = [
  {
    step: '9',
    action: <><b>Glance at Domain Cards Health column</b> for newly-yellow / red chips</>,
    why: 'Grounding-drift signals fire when the new MFR shifts family-cohort statistics (≥3 MFR drift = yellow, ≥5 MFR or ≥500 product drift = red).',
  },
  {
    step: '10',
    action: <>On a drifted family, click <b>Generate</b> to create a draft card</>,
    why: 'Opus 4.7 generates a new draft using current atlas_products grounding. Anti-hallucination rules constrain output to verified MFRs only.',
  },
  {
    step: '11',
    action: <><b>Review the auto-audit panel</b> on the draft. <Chip size="small" label="block" color="error" sx={{ mx: 0.5 }} />-severity findings disable Approve. <Chip size="small" label="warn" color="warning" sx={{ mx: 0.5 }} /> is advisory.</>,
    why: "Auto-audit catches hallucinations Opus is most prone to. Don't override a block finding — edit card text to remove the offending claim and re-audit.",
  },
  {
    step: '12',
    action: <>Click <b>Approve</b> once audit is clean</>,
    why: 'Flips card status to active. Auto-clears stale flags older than the approve timestamp.',
  },
];

const PHASE_4_ROWS: PhaseRow[] = [
  {
    step: '13',
    action: <>Run <code>npm run atlas:backfill</code></>,
    why: 'ONLY if you accepted overrides this session that benefit older, already-applied batches\' products. Skip if you only worked on today\'s Pending → Proceed flow.',
  },
  {
    step: '14',
    action: <>Alternative: <b>"Refresh from accepts"</b> button on a specific MFR's admin detail page</>,
    why: 'Same effect as backfill but scoped to one MFR. Use when you know exactly which MFR needs retranslation.',
  },
];

const PHASE_5_ROWS: PhaseRow[] = [
  {
    step: '15',
    action: <>Click <b>"Scan legacy MFRs"</b> (header) — or CLI <code>--discover-legacy</code></>,
    why: 'MFRs loaded before the batch pipeline have no batch row, so Triage can\'t see their unmapped params. This writes slim status=\'discovery\' batches so they become triageable. Does NOT touch atlas_products.',
  },
  {
    step: '16',
    action: <>Open <b>Dictionary Triage</b> and Accept the now-visible legacy params</>,
    why: 'Legacy MFRs\' unmapped params appear with original vendor names alongside batch rows. Accepts write dict overrides exactly as normal.',
  },
  {
    step: '17',
    action: <>Run <code>npm run atlas:backfill</code> (or <code>-- --mfr &lt;slug&gt;</code>)</>,
    why: 'Discovery never writes products, so the backfill is what applies the new overrides into atlas_products. This is the one case where the backfill round-trip is required.',
  },
];

interface GotchaRow {
  symptom: string;
  cause: string;
  fix: string;
}

const GOTCHAS: GotchaRow[] = [
  {
    symptom: 'Proceed All Clean (0) stays at zero after Triage accepts',
    cause: 'Batch risk classifications are stale from upload-time',
    fix: 'Click "Regen affected batches" (step 6)',
  },
  {
    symptom: '"Regen affected batches" banner disappeared mid-session',
    cause: 'Client-side React state reset on tab navigation',
    fix: 'Click per-batch Regen on each BatchCard (step 6a)',
  },
  {
    symptom: 'AI suggests a canonical that doesn\'t exist in code',
    cause: 'Either a hallucination OR a legit prior accept in atlas_dictionary_overrides',
    fix: 'Verify with scripts/atlas-revoke-bad-canonical.mjs --id <name> (dry-run). Revoke if low-confidence hallucinated accept.',
  },
  {
    symptom: 'Same fabricated canonical keeps surfacing across rows after a revoke',
    cause: '/suggest cache staleness (backlogged — Decision #187 extension pending)',
    fix: 'Manually edit attributeId per row to the correct canonical before Accept',
  },
  {
    symptom: 'Triage row\'s sample values look like MPN strings, not parametric values',
    cause: 'Pivot-style source data (column header encodes the value, MPN goes in cell)',
    fix: 'Defer the row with note; not a dict-override fit',
  },
];

const PHASE_TABLE_HEADERS = (
  <TableHead>
    <TableRow>
      <TableCell sx={{ width: 60, fontWeight: 700 }}>Step</TableCell>
      <TableCell sx={{ width: '50%', fontWeight: 700 }}>Action</TableCell>
      <TableCell sx={{ fontWeight: 700 }}>Why this position</TableCell>
    </TableRow>
  </TableHead>
);

function PhaseTable({ rows }: { rows: PhaseRow[] }) {
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
      <Table size="small">
        {PHASE_TABLE_HEADERS}
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.step} hover>
              <TableCell sx={{ fontWeight: 600, color: 'primary.main', verticalAlign: 'top' }}>{r.step}</TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>{r.action}</TableCell>
              <TableCell sx={{ verticalAlign: 'top', color: 'text.secondary' }}>{r.why}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function PhaseHeader({ num, label, intro }: { num: number; label: string; intro: string }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
        <Chip size="small" label={`Phase ${num}`} color="primary" sx={{ fontWeight: 700 }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>{label}</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">{intro}</Typography>
    </Box>
  );
}

export default function IngestHowToDrawer({ open, onClose }: Props) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', md: 720 } } }}
    >
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Atlas Ingest — How To</Typography>
            <Typography variant="caption" color="text.secondary">
              Operator workflow for ingesting a new MFR. Source: docs/RUNBOOK_INGESTION.md
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Stack>

        {/* Core principle callout */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'primary.dark', color: 'primary.contrastText' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Core principle: Triage BEFORE Proceed
          </Typography>
          <Typography variant="caption">
            Mapping unmapped params while batches are still Pending means the Proceed step writes products to atlas_products already correctly translated — no retroactive backfill required.
          </Typography>
        </Paper>

        <Divider sx={{ mb: 3 }} />

        {/* Phase 1 */}
        <PhaseHeader num={1} label="Upload + Triage" intro="Before any products land in atlas_products" />
        <PhaseTable rows={PHASE_1_ROWS} />

        {/* Phase 2 */}
        <PhaseHeader num={2} label="Apply the batches" intro="Proceed reads live overrides — products land already translated" />
        <PhaseTable rows={PHASE_2_ROWS} />

        {/* Phase 3 */}
        <PhaseHeader num={3} label="Domain Cards" intro="Refresh family cards drifted by the new MFR cohort" />
        <PhaseTable rows={PHASE_3_ROWS} />

        {/* Phase 4 */}
        <PhaseHeader num={4} label="Retroactive cleanup (optional)" intro="Only when overrides affect already-applied older batches" />
        <PhaseTable rows={PHASE_4_ROWS} />

        {/* Phase 5 */}
        <PhaseHeader num={5} label="Legacy MFR discovery (occasional)" intro="Make pre-batch-pipeline MFRs' unmapped params triageable" />
        <PhaseTable rows={PHASE_5_ROWS} />

        <Divider sx={{ mb: 3 }} />

        {/* Key principles */}
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>Key principles to teach new operators</Typography>
        <Box component="ol" sx={{ pl: 3, mb: 3, '& li': { mb: 1 } }}>
          <li>
            <Typography variant="body2"><b>Triage BEFORE Proceed.</b> Mapping first means Proceed writes correct translations directly — no backfill round-trip.</Typography>
          </li>
          <li>
            <Typography variant="body2"><b>Regen is the unlock for bulk-apply, not cosmetic.</b> It refreshes batch risk classifications against current overrides. Without it, Proceed All Clean (0) stays inert.</Typography>
          </li>
          <li>
            <Typography variant="body2"><b>Defer is better than wrong.</b> Junk-drawer canonicals (type, style, kind, category, material, characteristic) pollute the matching engine. When in doubt, flag + team note.</Typography>
          </li>
          <li>
            <Typography variant="body2"><b>Each phase has a clean "done" signal.</b> Triage done = Regen flushed, risk chips reflect reality. Proceed done = no batches in Pending. Domain Cards done = no red/yellow drift chips.</Typography>
          </li>
          <li>
            <Typography variant="body2"><b>Backfill is for the past, not the present.</b> If today's accepts only affect today's batches, skip step 13.</Typography>
          </li>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Gotchas */}
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>Common gotchas</Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '35%' }}>Symptom</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '30%' }}>Cause</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Fix</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {GOTCHAS.map((g, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ verticalAlign: 'top' }}>{g.symptom}</TableCell>
                  <TableCell sx={{ verticalAlign: 'top', color: 'text.secondary' }}>{g.cause}</TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>{g.fix}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="caption" color="text.secondary">
          Edit docs/RUNBOOK_INGESTION.md to update this content — this drawer mirrors it.
        </Typography>
      </Box>
    </Drawer>
  );
}
