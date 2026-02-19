import { FamilyContextConfig } from '../types';
import { chipResistorsContext } from './chipResistors';

export const throughHoleResistorsContext: FamilyContextConfig = {
  familyIds: ['53'],
  contextSensitivity: 'low',
  questions: [
    ...chipResistorsContext.questions,
  ],
};
