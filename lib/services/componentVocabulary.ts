/**
 * Shared, CLIENT-SAFE component-type vocabulary.
 *
 * Single source of truth for "what free-text words name a component type"
 * (capacitor, MLCC, voltage regulator, op-amp, …). Pure data — NO server
 * imports — so it can be used from both server code (Atlas manufacturer
 * discovery) and client code (the chat search-result origin-filter detector).
 *
 * Two consumers, one list, so they can't drift:
 *  - `atlasManufacturerDiscovery.ts` (server) maps these terms → query scope.
 *  - `filterIntentDetector.ts` (client) uses `namesComponentType()` to tell
 *    "show me the Chinese ones" (refine the current cards) from
 *    "find Chinese capacitors" (start a new search).
 */

import type { ComponentCategory } from '@/lib/types';

/**
 * High-level group synonyms → registry `LogicTable.category` value. The family
 * set is derived from the registry at call time so it stays correct as families
 * are added. Sorted longest-first at match time so "discrete semiconductors"
 * wins over bare "discrete".
 */
export const GROUP_SYNONYMS: Record<string, string> = {
  'passive': 'Passives',
  'passives': 'Passives',
  'passive component': 'Passives',
  'passive components': 'Passives',
  'discrete': 'Discrete Semiconductors',
  'discretes': 'Discrete Semiconductors',
  'discrete semiconductor': 'Discrete Semiconductors',
  'discrete semiconductors': 'Discrete Semiconductors',
  'integrated circuit': 'Integrated Circuits',
  'integrated circuits': 'Integrated Circuits',
  'ic': 'Integrated Circuits',
  'ics': 'Integrated Circuits',
};

/**
 * Component-supertype synonyms → ComponentCategory value (the atlas_products.category
 * grain). Covers the L3 supertypes plus the common L0 categories (MCUs, sensors,
 * LEDs, …) — a category filter answers "who makes X" even where we have no logic
 * table. Multi-word synonyms (e.g. "voltage regulator") are matched longest-first.
 */
export const SUPERTYPE_SYNONYMS: Record<string, ComponentCategory> = {
  // L3 supertypes
  'capacitor': 'Capacitors',
  'capacitors': 'Capacitors',
  'cap': 'Capacitors',
  'caps': 'Capacitors',
  'resistor': 'Resistors',
  'resistors': 'Resistors',
  'inductor': 'Inductors',
  'inductors': 'Inductors',
  'diode': 'Diodes',
  'diodes': 'Diodes',
  'transistor': 'Transistors',
  'transistors': 'Transistors',
  'thyristor': 'Thyristors',
  'thyristors': 'Thyristors',
  'voltage regulator': 'Voltage Regulators',
  'voltage regulators': 'Voltage Regulators',
  'regulator': 'Voltage Regulators',
  'regulators': 'Voltage Regulators',
  'gate driver': 'Gate Drivers',
  'gate drivers': 'Gate Drivers',
  'amplifier': 'Amplifiers',
  'amplifiers': 'Amplifiers',
  'op-amp': 'Amplifiers',
  'op-amps': 'Amplifiers',
  'op amp': 'Amplifiers',
  'op amps': 'Amplifiers',
  'opamp': 'Amplifiers',
  'opamps': 'Amplifiers',
  'comparator': 'Amplifiers',
  'comparators': 'Amplifiers',
  'logic ic': 'Logic ICs',
  'logic ics': 'Logic ICs',
  'logic gate': 'Logic ICs',
  'logic gates': 'Logic ICs',
  'voltage reference': 'Voltage References',
  'voltage references': 'Voltage References',
  'interface ic': 'Interface ICs',
  'interface ics': 'Interface ICs',
  'timer': 'Timers and Oscillators',
  'timers': 'Timers and Oscillators',
  'oscillator': 'Timers and Oscillators',
  'oscillators': 'Timers and Oscillators',
  'adc': 'ADCs',
  'adcs': 'ADCs',
  'dac': 'DACs',
  'dacs': 'DACs',
  'crystal': 'Crystals',
  'crystals': 'Crystals',
  'optocoupler': 'Optocouplers',
  'optocouplers': 'Optocouplers',
  'photocoupler': 'Optocouplers',
  'photocouplers': 'Optocouplers',
  'relay': 'Relays',
  'relays': 'Relays',
  // Common L0 categories (no logic table, but category filter still answers "who makes X")
  'microcontroller': 'Microcontrollers',
  'microcontrollers': 'Microcontrollers',
  'mcu': 'Microcontrollers',
  'mcus': 'Microcontrollers',
  'memory': 'Memory',
  'sensor': 'Sensors',
  'sensors': 'Sensors',
  'led': 'LEDs and Optoelectronics',
  'leds': 'LEDs and Optoelectronics',
  'connector': 'Connectors',
  'connectors': 'Connectors',
  'switch': 'Switches',
  'switches': 'Switches',
  'transformer': 'Transformers',
  'transformers': 'Transformers',
};

/**
 * Every word/phrase that names a component type — the union of the supertype and
 * group synonym keys, plus a few specific-family nouns (mlcc, mosfet, jfet, igbt,
 * fuse, varistor, thermistor, ferrite bead, choke) that users say but that the
 * supertype map doesn't carry. All lowercase and single-spaced so
 * `namesComponentType` can whole-word match multi-word terms uniformly.
 */
export const COMPONENT_NOUNS: ReadonlySet<string> = new Set<string>([
  ...Object.keys(SUPERTYPE_SYNONYMS),
  ...Object.keys(GROUP_SYNONYMS),
  'mlcc', 'mlccs',
  'mosfet', 'mosfets',
  'jfet', 'jfets',
  'igbt', 'igbts',
  'bjt', 'bjts',
  'scr', 'scrs', 'triac', 'triacs',
  'fuse', 'fuses',
  'varistor', 'varistors', 'mov', 'movs',
  'thermistor', 'thermistors',
  'ferrite bead', 'ferrite beads', 'ferrite',
  'choke', 'chokes',
  'zener', 'zeners',
  'schottky',
  'ldo', 'ldos',
  'supercapacitor', 'supercapacitors', 'supercap', 'supercaps',
  // Material / sub-type qualifiers that name a part type on their own
  // ("chinese tantalum", "ceramic ones", "electrolytic"). Only the ones that
  // unambiguously imply a component — bare "bridge"/"power" are excluded.
  'tantalum', 'ceramic', 'electrolytic', 'film', 'aluminum', 'aluminium',
  'mica', 'polymer', 'ntc', 'ptc', 'tvs', 'rectifier',
]);

/**
 * True if `text` names a component TYPE (a product noun), as opposed to being only
 * origin words + descriptors. Whole-word / whole-phrase match after normalizing
 * punctuation to single spaces, so "op-amp" matches "op amp" and "PRC-based
 * options" matches nothing. Used to decide new-search vs refine-current-cards.
 */
export function namesComponentType(text: string): boolean {
  const norm = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  for (const noun of COMPONENT_NOUNS) {
    if (norm.includes(` ${noun} `)) return true;
  }
  return false;
}
