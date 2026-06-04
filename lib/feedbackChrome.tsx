import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import type { AppFeedbackCategory, AppFeedbackStatus } from './types';

export function statusChipColor(status: AppFeedbackStatus): 'default' | 'warning' | 'info' | 'success' {
  switch (status) {
    case 'open': return 'warning';
    case 'reviewed': return 'info';
    case 'resolved': return 'success';
    case 'dismissed': return 'default';
  }
}

export function categoryIcon(category: AppFeedbackCategory, fontSize: string = '0.9rem') {
  switch (category) {
    case 'idea': return <LightbulbOutlinedIcon sx={{ fontSize }} />;
    case 'issue': return <BugReportOutlinedIcon sx={{ fontSize }} />;
    case 'other': return <ChatBubbleOutlineIcon sx={{ fontSize }} />;
  }
}

export function categoryLabel(category: AppFeedbackCategory): string {
  switch (category) {
    case 'idea': return 'Idea';
    case 'issue': return 'Issue';
    case 'other': return 'Other';
  }
}

export function statusLabel(status: AppFeedbackStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.round(months / 12)} yr ago`;
}
