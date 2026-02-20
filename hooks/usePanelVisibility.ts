'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppPhase } from '@/lib/types';

interface PanelVisibilityResult {
  recsRevealed: boolean;
  setRecsRevealed: (v: boolean) => void;
  recsDismissed: boolean;
  attrsDismissed: boolean;
  showAttributesPanel: boolean;
  showRightPanel: boolean;
  isLoadingRecs: boolean;
  showRecsClose: boolean;
  showAttrsClose: boolean;
  handleCloseRecs: () => void;
  handleCloseAttrs: () => void;
  resetDismissed: () => void;
}

export function usePanelVisibility(
  phase: AppPhase,
  hasAttributes: boolean,
  mfrOpen: boolean,
): PanelVisibilityResult {
  // Delay showing the skeleton panel by 2s after attributes load
  const [recsRevealed, setRecsRevealed] = useState(false);
  useEffect(() => {
    if (phase === 'finding-matches') {
      const timer = setTimeout(() => setRecsRevealed(true), 2000);
      return () => clearTimeout(timer);
    }
    if (phase === 'viewing' || phase === 'comparing') {
      setRecsRevealed(true);
    } else {
      setRecsRevealed(false);
    }
  }, [phase]);

  // Panel dismissed state (user closed via X button)
  const [recsDismissed, setRecsDismissed] = useState(false);
  const [attrsDismissed, setAttrsDismissed] = useState(false);

  // Reset dismissed state when starting a new search
  useEffect(() => {
    if (['idle', 'searching', 'resolving'].includes(phase)) {
      setRecsDismissed(false);
      setAttrsDismissed(false);
    }
  }, [phase]);

  const showAttributesPanel = !attrsDismissed && [
    'loading-attributes',
    'awaiting-attributes',
    'awaiting-context',
    'finding-matches',
    'viewing',
    'comparing',
    'unsupported',
  ].includes(phase);
  const showRightPanel = !recsDismissed && recsRevealed && hasAttributes;
  const isLoadingRecs = phase === 'finding-matches';

  // Close handlers for panel dismiss
  const handleCloseRecs = useCallback(() => setRecsDismissed(true), []);
  const handleCloseAttrs = useCallback(() => {
    setAttrsDismissed(true);
    setRecsDismissed(true); // closing attrs also hides recs
  }, []);

  // Only the rightmost panel gets a close button (MFR has its own)
  const showRecsClose = !mfrOpen && showRightPanel;
  const showAttrsClose = !mfrOpen && !showRightPanel && showAttributesPanel;

  const resetDismissed = useCallback(() => {
    setRecsDismissed(false);
    setAttrsDismissed(false);
  }, []);

  return {
    recsRevealed,
    setRecsRevealed,
    recsDismissed,
    attrsDismissed,
    showAttributesPanel,
    showRightPanel,
    isLoadingRecs,
    showRecsClose,
    showAttrsClose,
    handleCloseRecs,
    handleCloseAttrs,
    resetDismissed,
  };
}
