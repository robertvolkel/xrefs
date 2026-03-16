import { useCallback, useEffect, useRef, useState } from 'react';

interface ScrollIndicators {
  canScrollUp: boolean;
  canScrollDown: boolean;
}

export function useScrollIndicators<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [indicators, setIndicators] = useState<ScrollIndicators>({
    canScrollUp: false,
    canScrollDown: false,
  });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIndicators({
      canScrollUp: el.scrollTop > 0,
      canScrollDown: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [update]);

  return { ref, ...indicators };
}
