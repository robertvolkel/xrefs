import { FamilyContextConfig } from '../types';
import { mlccContext } from './mlcc';
import { chipResistorsContext } from './chipResistors';
import { alElectrolyticContext } from './alElectrolytic';
import { tantalumContext } from './tantalum';
import { supercapacitorContext } from './supercapacitor';
import { filmCapacitorContext } from './filmCapacitor';
import { ntcThermistorContext } from './ntcThermistor';
import { ptcThermistorContext } from './ptcThermistor';
import { commonModeChokeContext } from './commonModeChoke';
import { ferriteBeadContext } from './ferriteBead';
import { powerInductorContext } from './powerInductor';

const allConfigs: FamilyContextConfig[] = [
  mlccContext,
  chipResistorsContext,
  alElectrolyticContext,
  tantalumContext,
  supercapacitorContext,
  filmCapacitorContext,
  ntcThermistorContext,
  ptcThermistorContext,
  commonModeChokeContext,
  ferriteBeadContext,
  powerInductorContext,
];

/** Build a lookup map: familyId → FamilyContextConfig */
const configByFamilyId = new Map<string, FamilyContextConfig>();
for (const config of allConfigs) {
  for (const id of config.familyIds) {
    configByFamilyId.set(id, config);
  }
}

/** Get context question configuration for a component family, or null if none exists */
export function getContextQuestionsForFamily(familyId: string): FamilyContextConfig | null {
  return configByFamilyId.get(familyId) ?? null;
}

/** Get all registered family context configs */
export function getAllContextConfigs(): FamilyContextConfig[] {
  return allConfigs;
}
