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

/**
 * @param sourceResolved whether a source part has resolved at all — deliberately
 *   NOT "does it have parametric data". A zero-parameter part still gets
 *   recommendations (and a chat message announcing them), so gating on
 *   parameter count hid the panel while chat promised results.
 */
export function usePanelVisibility(
  phase: AppPhase,
  sourceResolved: boolean,
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
    'awaiting-action',
    'finding-matches',
    'viewing',
    'comparing',
    'unsupported',
  ].includes(phase);
  const showRightPanel = recsRevealed && sourceResolved;
  const isLoadingRecs = phase === 'finding-matches';

  return {
    recsRevealed,
    setRecsRevealed,
    showAttributesPanel,
    showRightPanel,
    isLoadingRecs,
  };
}
