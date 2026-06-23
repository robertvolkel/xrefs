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
import { switchingRegulatorContext } from './switchingRegulator';
import { gateDriverContext } from './gateDriver';
import { opampComparatorContext } from './opampComparator';
import { c5LogicICsContext } from './c5LogicICs';
import { voltageReferenceContext } from './voltageReference';
import { interfaceICsContext } from './interfaceICs';
import { timersOscillatorsContext } from './timersOscillators';
import { adcContext } from './adc';
import { dacContext } from './dac';
// Block D: Frequency Control & Protection
import { d1CrystalsContext } from './d1Crystals';
import { d2FusesContext } from './d2Fuses';
// Block E: Optoelectronics
import { e1OptocouplerContext } from './e1Optocouplers';
// Block F: Relays
import { f1RelayContext } from './f1Relays';
import { f2SolidStateRelayContext } from './f2SolidStateRelays';

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
  switchingRegulatorContext,
  gateDriverContext,
  opampComparatorContext,
  // Block C: Standard ICs
  c5LogicICsContext,
  voltageReferenceContext,
  interfaceICsContext,
  timersOscillatorsContext,
  adcContext,
  dacContext,
  // Block D: Frequency Control & Protection
  d1CrystalsContext,
  d2FusesContext,
  // Block E: Optoelectronics
  e1OptocouplerContext,
  // Block F: Relays
  f1RelayContext,
  f2SolidStateRelayContext,
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

/** A single answered context question, rendered in human-readable form. */
export interface DescribedContextAnswer {
  /** The human-readable question text. */
  question: string;
  /** The human-readable option label (or the raw free-text the user typed). */
  answer: string;
}

/**
 * Translate a family's submitted context answers (questionId → answerValue codes)
 * into human-readable { question, answer } pairs, in question/priority order.
 *
 * - Free-text answers (no matching option) fall back to the typed value.
 * - Unknown family / stray answer keys fall back to "questionId → raw value"
 *   rather than being dropped, so nothing the user selected goes missing.
 */
export function describeContextAnswers(
  familyId: string,
  answers: Record<string, string>,
): DescribedContextAnswer[] {
  const config = getContextQuestionsForFamily(familyId);
  const out: DescribedContextAnswer[] = [];
  const consumed = new Set<string>();

  if (config) {
    for (const q of config.questions) {
      const val = answers[q.questionId];
      if (val === undefined || val.trim() === '') continue;
      consumed.add(q.questionId);
      const opt = q.options.find((o) => o.value === val);
      out.push({ question: q.questionText, answer: opt ? opt.label : val });
    }
  }

  // Any answers not matched above (unknown family, conditional strays) — keep, don't drop.
  for (const [qId, val] of Object.entries(answers)) {
    if (consumed.has(qId) || val.trim() === '') continue;
    out.push({ question: qId, answer: val });
  }

  return out;
}

/** Get all registered family context configs */
export function getAllContextConfigs(): FamilyContextConfig[] {
  return allConfigs;
}
