import { FamilyContextConfig } from '../types';

export const varistorsMOVsContext: FamilyContextConfig = {
  familyIds: ['65'],
  contextSensitivity: 'moderate',
  questions: [
    {
      questionId: 'application_type',
      questionText: 'What is the transient source / application type?',
      priority: 1,
      options: [
        {
          value: 'mains',
          label: 'AC mains surge protection (lightning, switching)',
          description: 'Safety rating and thermal disconnect become mandatory; energy and surge current are primary',
          attributeEffects: [
            { attributeId: 'safety_rating', effect: 'escalate_to_mandatory', note: 'AC mains — UL 1449 / IEC 61643 certification is mandatory' },
            { attributeId: 'thermal_disconnect', effect: 'escalate_to_mandatory', note: 'AC mains — thermal disconnect is mandatory for UL-listed SPDs to prevent fire from thermal runaway' },
            { attributeId: 'energy_rating', effect: 'escalate_to_primary', note: 'Mains surge — energy rating is critical for lightning and switching transient survival' },
            { attributeId: 'peak_surge_current', effect: 'escalate_to_primary', note: 'Mains surge — peak surge current (8/20µs) must be sufficient for expected transient' },
            { attributeId: 'max_continuous_voltage', effect: 'escalate_to_primary', note: 'Mains application — max continuous AC voltage must cover mains voltage' },
          ],
        },
        {
          value: 'dc_automotive',
          label: 'DC bus / automotive protection (load dump, inductive spikes)',
          description: 'Safety rating not required; max DC voltage and response time are primary',
          attributeEffects: [
            { attributeId: 'safety_rating', effect: 'not_applicable', note: 'DC/automotive — safety rating (UL/IEC) is not required' },
            { attributeId: 'max_continuous_voltage', effect: 'escalate_to_primary', note: 'DC application — max continuous DC voltage is the primary voltage spec' },
            { attributeId: 'peak_surge_current', effect: 'escalate_to_primary', note: 'Automotive/DC — peak surge current must handle expected transients' },
            { attributeId: 'response_time', effect: 'escalate_to_primary', note: 'DC/automotive — response time is important for fast transient clamping' },
            { attributeId: 'leakage_current', effect: 'escalate_to_primary', note: 'Battery-powered DC — leakage current draws standby power' },
          ],
        },
        {
          value: 'esd',
          label: 'ESD / signal-line protection',
          description: 'Low capacitance and fast response time are critical for signal integrity',
          attributeEffects: [
            { attributeId: 'response_time', effect: 'escalate_to_mandatory', note: 'ESD protection — sub-nanosecond response time required for signal integrity' },
            { attributeId: 'clamping_voltage', effect: 'escalate_to_primary', note: 'Signal-line — tight clamping voltage is critical for downstream IC protection' },
            { attributeId: 'leakage_current', effect: 'not_applicable', note: 'ESD — leakage is less critical for signal-line ESD events' },
            { attributeId: 'energy_rating', effect: 'not_applicable', note: 'ESD — energy rating is secondary for low-energy ESD events' },
          ],
        },
      ],
    },
    {
      questionId: 'thermal_disconnect',
      questionText: 'Does the original have a thermal disconnect / fuse?',
      required: true,
      priority: 2,
      condition: { questionId: 'application_type', values: ['mains'] },
      options: [
        {
          value: 'yes',
          label: 'Yes — has thermal disconnect',
          description: 'Replacement MUST also have thermal disconnect — prevents thermal runaway and fire',
          attributeEffects: [
            { attributeId: 'thermal_disconnect', effect: 'escalate_to_mandatory', note: 'Original has thermal disconnect — replacement must also have it. Non-negotiable for UL-listed SPDs.' },
          ],
        },
        {
          value: 'no',
          label: 'No — bare MOV',
          description: 'Thermal disconnect not required but may be an upgrade; verify circuit has external overcurrent protection',
          attributeEffects: [
            { attributeId: 'thermal_disconnect', effect: 'not_applicable', note: 'Original is bare MOV — verify circuit has external overcurrent protection' },
          ],
        },
        {
          value: 'unknown',
          label: 'Unknown — need to inspect',
          description: 'Must inspect original or circuit design before proceeding',
          attributeEffects: [
            { attributeId: 'thermal_disconnect', effect: 'add_review_flag', note: 'Unknown thermal disconnect status — MUST inspect original part or circuit design. Fire safety concern.' },
          ],
        },
      ],
    },
    {
      questionId: 'environment',
      questionText: 'Is this in an automotive application?',
      priority: 3,
      options: [
        {
          value: 'automotive',
          label: 'Yes — automotive',
          description: 'AEC-Q200 mandatory; operating temp must cover automotive range; surge ratings for ISO 7637',
          attributeEffects: [
            { attributeId: 'aec_q200', effect: 'escalate_to_mandatory', note: 'Automotive application — AEC-Q200 qualification is required' },
            { attributeId: 'operating_temp', effect: 'escalate_to_primary', note: 'Automotive — operating temp range must cover -40°C to +125°C typically' },
            { attributeId: 'peak_surge_current', effect: 'escalate_to_primary', note: 'Automotive — surge ratings must cover ISO 7637 load dump transients' },
          ],
        },
        {
          value: 'no',
          label: 'No — standard / industrial',
          description: 'Standard environmental matching',
          attributeEffects: [],
        },
      ],
    },
  ],
};
