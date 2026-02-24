'use client';

import { useEffect, useState } from 'react';
import { AppPhase } from '@/lib/types';

interface PanelVisibilityResult {
  recsRevealed: boolean;
  setRecsRevealed: (v: boolean) => void;
  showAttributesPanel: boolean;
  showRightPanel: boolean;
  isLoadingRecs: boolean;
}

export function usePanelVisibility(
  phase: AppPhase,
  hasAttributes: boolean,
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

  const showAttributesPanel = [
    'loading-attributes',
    'awaiting-attributes',
    'awaiting-context',
    'finding-matches',
    'viewing',
    'comparing',
    'unsupported',
  ].includes(phase);
  const showRightPanel = recsRevealed && hasAttributes;
  const isLoadingRecs = phase === 'finding-matches';

  return {
    recsRevealed,
    setRecsRevealed,
    showAttributesPanel,
    showRightPanel,
    isLoadingRecs,
  };
}
