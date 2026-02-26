import { LogicType } from '@/lib/types';

export const typeColors: Record<LogicType, string> = {
  identity: '#64B5F6',
  identity_range: '#42A5F5',
  identity_upgrade: '#CE93D8',
  identity_flag: '#FFB74D',
  threshold: '#81C784',
  fit: '#4DB6AC',
  application_review: '#FFD54F',
  operational: '#90A4AE',
};

export const typeLabels: Record<LogicType, string> = {
  identity: 'Exact Match',
  identity_range: 'Range Overlap',
  identity_upgrade: 'Match or Upgrade',
  identity_flag: 'Flag (if required)',
  threshold: 'Threshold',
  fit: 'Physical Fit',
  application_review: 'Manual Review',
  operational: 'Operational',
};
