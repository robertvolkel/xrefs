'use client';

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { PartsListRow, XrefRecommendation, PartAttributes } from '@/lib/types';
import ModalChatPanel from './ModalChatPanel';
import RecommendationsPanel from '../RecommendationsPanel';
import ComparisonView from '../ComparisonView';

interface PartDetailModalProps {
  open: boolean;
  row: PartsListRow | null;
  selectedRec: XrefRecommendation | null;
  comparisonAttrs: PartAttributes | null;
  isComparing: boolean;
  onClose: () => void;
  onSelectRec: (rec: XrefRecommendation) => void;
  onBackToRecs: () => void;
  onConfirmReplacement: (rec: XrefRecommendation) => void;
  onRecommendationsRefreshed: (recs: XrefRecommendation[]) => void;
}

const PANEL_HEIGHT = '70vh';

export default function PartDetailModal({
  open,
  row,
  selectedRec,
  comparisonAttrs,
  isComparing,
  onClose,
  onSelectRec,
  onBackToRecs,
  onConfirmReplacement,
  onRecommendationsRefreshed,
}: PartDetailModalProps) {
  const { t } = useTranslation();
  if (!row) return null;

  const recs = row.allRecommendations ?? (row.suggestedReplacement ? [row.suggestedReplacement] : []);
  const title = row.resolvedPart
    ? `${row.resolvedPart.mpn} — ${row.resolvedPart.manufacturer}`
    : row.rawMpn;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { bgcolor: 'background.default', height: '85vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }} component="div">
        <Box sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1rem' }}>
          {title}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Refinement chat panel */}
        <Box sx={{ width: isComparing ? '33%' : '40%', height: PANEL_HEIGHT, overflow: 'hidden', transition: 'width 0.2s ease', borderRight: 1, borderColor: 'divider' }}>
          <ModalChatPanel
            row={row}
            open={open}
            onRecommendationsRefreshed={onRecommendationsRefreshed}
          />
        </Box>

        {/* Recommendations panel */}
        {!isComparing && (
          <Box sx={{ width: '60%', height: PANEL_HEIGHT, overflow: 'hidden' }}>
            <RecommendationsPanel
              recommendations={recs}
              onSelect={onSelectRec}
            />
          </Box>
        )}

        {/* Comparison view (when a rec is selected) */}
        {isComparing && selectedRec && row.sourceAttributes && comparisonAttrs && (
          <Box sx={{ width: '67%', height: PANEL_HEIGHT, overflow: 'hidden' }}>
            <ComparisonView
              sourceAttributes={row.sourceAttributes}
              replacementAttributes={comparisonAttrs}
              recommendation={selectedRec}
              onBack={onBackToRecs}
            />
          </Box>
        )}
      </DialogContent>

      {isComparing && selectedRec && (
        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button onClick={onBackToRecs} color="inherit">
            {t('partDetail.backToRecommendations')}
          </Button>
          <Button
            variant="contained"
            onClick={() => onConfirmReplacement(selectedRec)}
          >
            {t('partDetail.useThisReplacement')}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
