import { FamilyContextConfig } from '../types';

export const filmCapacitorContext: FamilyContextConfig = {
  familyIds: ['64'],
  contextSensitivity: 'high',
  questions: [
    {
      questionId: 'application_type',
      questionText: 'What is the primary application of this film capacitor?',
      priority: 1,
      options: [
        {
          value: 'emi',
          label: 'AC mains filtering / EMI suppression',
          description: 'Safety rating (X/Y class) becomes mandatory; AC voltage rating is primary',
          attributeEffects: [
            { attributeId: 'safety_rating', effect: 'escalate_to_mandatory', note: 'Mains EMI suppression — safety class rating (X/Y) is legally mandatory' },
            { attributeId: 'flammability', effect: 'escalate_to_mandatory', note: 'Mains application — UL 94 V-0 flammability rating is mandatory' },
            { attributeId: 'voltage_rated_ac', effect: 'escalate_to_primary', note: 'AC mains application — AC voltage rating is the primary voltage spec' },
            { attributeId: 'self_healing', effect: 'escalate_to_primary', note: 'Metallized construction with self-healing is expected for mains EMI' },
          ],
        },
        {
          value: 'dc_filtering',
          label: 'DC filtering / coupling / bypass',
          description: 'DC voltage rating is primary; safety rating not required',
          attributeEffects: [
            { attributeId: 'voltage_rated_dc', effect: 'escalate_to_primary', note: 'DC filtering — DC voltage rating is the primary spec' },
            { attributeId: 'safety_rating', effect: 'not_applicable', note: 'DC filtering — safety class rating not required' },
            { attributeId: 'flammability', effect: 'not_applicable', note: 'DC filtering — flammability rating not required' },
          ],
        },
        {
          value: 'snubber',
          label: 'Snubber / pulse discharge',
          description: 'dV/dt and peak pulse current are primary — film/foil construction preferred',
          attributeEffects: [
            { attributeId: 'dv_dt', effect: 'escalate_to_mandatory', note: 'Snubber application — dV/dt rating is the primary spec, more important than capacitance' },
            { attributeId: 'ripple_current', effect: 'escalate_to_primary', note: 'Snubber — peak pulse current capability is critical' },
            { attributeId: 'esr', effect: 'escalate_to_primary', note: 'Snubber — low ESR required for pulse applications' },
            { attributeId: 'safety_rating', effect: 'not_applicable', note: 'Snubber — safety class not applicable' },
          ],
        },
        {
          value: 'motor_run',
          label: 'Motor-run / power factor correction',
          description: 'AC voltage rating and ripple current are primary; must be rated for continuous AC',
          attributeEffects: [
            { attributeId: 'voltage_rated_ac', effect: 'escalate_to_mandatory', note: 'Motor-run — must be rated for continuous AC duty' },
            { attributeId: 'ripple_current', effect: 'escalate_to_mandatory', note: 'Motor-run — continuous ripple current rating is critical for reliability' },
          ],
        },
        {
          value: 'precision',
          label: 'Precision timing / resonant circuit',
          description: 'Dissipation factor, temperature coefficient, and tolerance become primary',
          attributeEffects: [
            { attributeId: 'dissipation_factor', effect: 'escalate_to_primary', note: 'Precision application — low dissipation factor (tan δ) is critical' },
            { attributeId: 'tolerance', effect: 'escalate_to_primary', note: 'Precision/resonant — tight tolerance is critical for frequency accuracy' },
            { attributeId: 'dielectric_type', effect: 'escalate_to_primary', note: 'Precision — polypropylene (PP) dielectric is almost certainly required for stability' },
          ],
        },
      ],
    },
    {
      questionId: 'safety_class',
      questionText: 'What safety class is required?',
      priority: 2,
      condition: { questionId: 'application_type', values: ['emi'] },
      options: [
        {
          value: 'x1',
          label: 'X1 (line-to-line, highest)',
          attributeEffects: [
            { attributeId: 'safety_rating', effect: 'escalate_to_mandatory', note: 'X1 safety class — highest line-to-line rating required' },
          ],
        },
        {
          value: 'x2',
          label: 'X2 (line-to-line, standard)',
          attributeEffects: [
            { attributeId: 'safety_rating', effect: 'escalate_to_mandatory', note: 'X2 safety class — standard line-to-line rating required' },
          ],
        },
        {
          value: 'y1',
          label: 'Y1 (line-to-ground, highest)',
          attributeEffects: [
            { attributeId: 'safety_rating', effect: 'escalate_to_mandatory', note: 'Y1 safety class — highest line-to-ground rating required' },
          ],
        },
        {
          value: 'y2',
          label: 'Y2 (line-to-ground, standard)',
          attributeEffects: [
            { attributeId: 'safety_rating', effect: 'escalate_to_mandatory', note: 'Y2 safety class — standard line-to-ground rating required' },
          ],
        },
      ],
    },
    {
      questionId: 'dvdt_requirement',
      questionText: "What is the circuit's dV/dt requirement?",
      priority: 3,
      condition: { questionId: 'application_type', values: ['snubber'] },
      allowFreeText: true,
      freeTextPlaceholder: 'e.g., 1000 V/µs, or "unknown"',
      options: [
        {
          value: 'unknown',
          label: 'Unknown',
          description: 'All candidates will be flagged for dV/dt review — do not substitute without verifying',
          attributeEffects: [
            { attributeId: 'dv_dt', effect: 'add_review_flag', note: 'Unknown dV/dt requirement — do not substitute a general-purpose film cap into a snubber without verifying pulse specs' },
          ],
        },
      ],
    },
  ],
};
