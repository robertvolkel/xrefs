import { FamilyContextConfig } from '../types';
import { mlccContext } from './mlcc';
import { micaCapacitorsContext } from './micaCapacitors';
import { chipResistorsContext } from './chipResistors';
import { throughHoleResistorsContext } from './throughHoleResistors';
import { currentSenseResistorsContext } from './currentSenseResistors';
import { chassisMountResistorsContext } from './chassisMountResistors';
import { alElectrolyticContext } from './alElectrolytic';
import { aluminumPolymerContext } from './aluminumPolymer';
import { tantalumContext } from './tantalum';
import { supercapacitorContext } from './supercapacitor';
import { filmCapacitorContext } from './filmCapacitor';
import { varistorsMOVsContext } from './varistorsMOVs';
import { ptcResettableFusesContext } from './ptcResettableFuses';
import { ntcThermistorContext } from './ntcThermistor';
import { ptcThermistorContext } from './ptcThermistor';
import { commonModeChokeContext } from './commonModeChoke';
import { ferriteBeadContext } from './ferriteBead';
import { powerInductorContext } from './powerInductor';
import { rfSignalInductorsContext } from './rfSignalInductors';
// Block B: Discrete Semiconductors
import { rectifierDiodesContext } from './rectifierDiodes';
import { schottkyDiodesContext } from './schottkyDiodes';
import { zenerDiodesContext } from './zenerDiodes';
import { tvsDiodesContext } from './tvsDiodes';
import { mosfetsContext } from './mosfets';
import { bjtTransistorsContext } from './bjtTransistors';
import { igbtsContext } from './igbts';
import { thyristorsContext } from './thyristors';
import { jfetsContext } from './jfets';
// Block C: Power Management ICs
import { ldoContext } from './ldo';

const allConfigs: FamilyContextConfig[] = [
  mlccContext,
  micaCapacitorsContext,
  chipResistorsContext,
  throughHoleResistorsContext,
  currentSenseResistorsContext,
  chassisMountResistorsContext,
  alElectrolyticContext,
  aluminumPolymerContext,
  tantalumContext,
  supercapacitorContext,
  filmCapacitorContext,
  varistorsMOVsContext,
  ptcResettableFusesContext,
  ntcThermistorContext,
  ptcThermistorContext,
  commonModeChokeContext,
  ferriteBeadContext,
  powerInductorContext,
  rfSignalInductorsContext,
  // Block B: Discrete Semiconductors
  rectifierDiodesContext,
  schottkyDiodesContext,
  zenerDiodesContext,
  tvsDiodesContext,
  mosfetsContext,
  bjtTransistorsContext,
  igbtsContext,
  thyristorsContext,
  jfetsContext,
  // Block C: Power Management ICs
  ldoContext,
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
