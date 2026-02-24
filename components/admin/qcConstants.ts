import { FeedbackStatus } from '@/lib/types';

export const DOT_GREEN = '#69F0AE';
export const DOT_YELLOW = '#FFD54F';
export const DOT_RED = '#FF5252';
export const DOT_GREY = '#90A4AE';

export function resultDotColor(result?: string): string {
  switch (result) {
    case 'pass': case 'upgrade': return DOT_GREEN;
    case 'review': return DOT_YELLOW;
    case 'fail': return DOT_RED;
    default: return DOT_GREY;
  }
}

export function statusColor(status: FeedbackStatus): 'default' | 'warning' | 'info' | 'success' | 'error' {
  switch (status) {
    case 'open': return 'warning';
    case 'reviewed': return 'info';
    case 'resolved': return 'success';
    case 'dismissed': return 'default';
  }
}
