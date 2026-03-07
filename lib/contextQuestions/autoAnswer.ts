import type { PartAttributes } from '../types';

/**
 * Maps enriched part attributes to context question answers for families
 * where the first question is a disambiguation gate (device category,
 * protocol, architecture, etc.) that's already answered by the part data.
 *
 * When the attribute is present with a known value, the corresponding
 * context question is auto-answered so the user isn't asked redundantly.
 */
const DISAMBIGUATION_MAP: Record<string, {
  questionId: string;
  attributeId: string;
  valueMap: Record<string, string>; // attribute value → context answer option value
}> = {
  // C8: Timers/Oscillators — device_category enriched from MPN + Digikey "Type" field
  'C8': {
    questionId: 'device_category_type',
    attributeId: 'device_category',
    valueMap: {
      '555 Timer': '555_timer',
      'XO': 'xo',
      'MEMS': 'mems',
      'TCXO': 'tcxo',
      'VCXO': 'vcxo',
      'OCXO': 'ocxo',
    },
  },
  // C4: Op-Amps/Comparators — device_type enriched from MPN + Digikey category
  'C4': {
    questionId: 'device_function',
    attributeId: 'device_type',
    valueMap: {
      'Op-Amp': 'op_amp',
      'Comparator': 'comparator',
      'Instrumentation Amplifier': 'instrumentation_amp',
    },
  },
  // C7: Interface ICs — protocol enriched from MPN + Digikey "Protocol" field
  'C7': {
    questionId: 'interface_protocol',
    attributeId: 'protocol',
    valueMap: {
      'RS-485': 'rs485',
      'CAN': 'can',
      'I2C': 'i2c',
      'USB': 'usb',
    },
  },
  // C9: ADCs — architecture enriched from MPN + Digikey "Architecture" field
  'C9': {
    questionId: 'adc_architecture',
    attributeId: 'architecture',
    valueMap: {
      'SAR': 'sar',
      'Delta-Sigma': 'delta_sigma',
      'Pipeline': 'pipeline',
      'Flash': 'flash',
    },
  },
  // C10: DACs — output_type enriched from compound "Output Type" Digikey field
  'C10': {
    questionId: 'dac_output_type',
    attributeId: 'output_type',
    valueMap: {
      'Voltage': 'voltage_output',
      'Current': 'current_output',
    },
  },
  // B8: Thyristors — device_type inferred from Digikey category name
  'B8': {
    questionId: 'device_subtype',
    attributeId: 'device_type',
    valueMap: {
      'SCR': 'scr',
      'TRIAC': 'triac',
      'DIAC': 'diac',
    },
  },
};

/**
 * Checks whether any disambiguation context questions can be auto-answered
 * from the part's already-enriched attributes.
 *
 * Returns a record of { questionId: answerValue } for questions that should
 * be pre-filled and hidden from the user. Returns empty object if nothing
 * can be auto-answered (attribute missing, value unknown, or family has no
 * disambiguation mapping).
 */
export function deriveAutoAnswers(
  sourceAttrs: PartAttributes,
  familyId: string,
): Record<string, string> {
  const mapping = DISAMBIGUATION_MAP[familyId];
  if (!mapping) return {};

  const param = sourceAttrs.parameters.find(
    (p) => p.parameterId === mapping.attributeId,
  );
  if (!param?.value) return {};

  const answerValue = mapping.valueMap[param.value];
  if (!answerValue) return {};

  return { [mapping.questionId]: answerValue };
}
