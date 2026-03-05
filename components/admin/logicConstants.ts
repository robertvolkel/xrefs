import { LogicType } from '@/lib/types';

export const typeColors: Record<LogicType, string> = {
  identity: '#64B5F6',
  identity_range: '#42A5F5',
  identity_upgrade: '#CE93D8',
  identity_flag: '#FFB74D',
  threshold: '#81C784',
  fit: '#4DB6AC',
  vref_check: '#7986CB',
  application_review: '#FFD54F',
  operational: '#90A4AE',
};

/** i18n translation keys for each rule type (looked up via t()) */
export const typeTranslationKeys: Record<LogicType, string> = {
  identity: 'admin.typeIdentity',
  identity_range: 'admin.typeIdentityRange',
  identity_upgrade: 'admin.typeIdentityUpgrade',
  identity_flag: 'admin.typeIdentityFlag',
  threshold: 'admin.typeThreshold',
  fit: 'admin.typeFit',
  vref_check: 'admin.typeVrefCheck',
  application_review: 'admin.typeApplicationReview',
  operational: 'admin.typeOperational',
};

/** English fallback labels (used when t() is not available) */
export const typeLabels: Record<LogicType, string> = {
  identity: 'Exact Match',
  identity_range: 'Range Overlap',
  identity_upgrade: 'Match or Upgrade',
  identity_flag: 'Flag (if required)',
  threshold: 'Threshold',
  fit: 'Physical Fit',
  vref_check: 'Vref Check',
  application_review: 'Manual Review',
  operational: 'Operational',
};
