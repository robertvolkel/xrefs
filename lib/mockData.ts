import {
  Part,
  PartAttributes,
  ParametricAttribute,
  XrefRecommendation,
  PartSummary,
} from './types';

// ============================================================
// MLCC CAPACITORS (Family 12)
// ============================================================

const murataGRM188R71E105: Part = {
  mpn: 'GRM188R71E105KA12',
  manufacturer: 'Murata Manufacturing',
  description: 'MLCC 1µF 25V X7R 0603 ±10%',
  detailedDescription: 'CAP CER 1UF 25V X7R 0603',
  category: 'Capacitors',
  subcategory: 'MLCC',
  status: 'Active',
};

const murataGRM188R71E105Params: ParametricAttribute[] = [
  { parameterId: 'capacitance', parameterName: 'Capacitance', value: '1 µF', numericValue: 1, unit: 'µF', sortOrder: 1 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: '0603 (1608 Metric)', sortOrder: 2 },
  { parameterId: 'voltage_rated', parameterName: 'Voltage Rating', value: '25 V', numericValue: 25, unit: 'V', sortOrder: 3 },
  { parameterId: 'dielectric', parameterName: 'Dielectric / Temp Characteristic', value: 'X7R', sortOrder: 4 },
  { parameterId: 'tolerance', parameterName: 'Tolerance', value: '±10%', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temp Range', value: '-55°C ~ 125°C', sortOrder: 6 },
  { parameterId: 'height', parameterName: 'Height (Seated Max)', value: '0.90 mm', numericValue: 0.9, unit: 'mm', sortOrder: 7 },
  { parameterId: 'esr', parameterName: 'ESR', value: '—', sortOrder: 8 },
  { parameterId: 'esl', parameterName: 'ESL', value: '—', sortOrder: 9 },
  { parameterId: 'flexible_termination', parameterName: 'Flexible Termination', value: 'No', sortOrder: 10 },
  { parameterId: 'msl', parameterName: 'Moisture Sensitivity Level', value: '1', numericValue: 1, sortOrder: 11 },
  { parameterId: 'aec_q200', parameterName: 'AEC-Q200', value: 'No', sortOrder: 12 },
  { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: '~60% at 15V', sortOrder: 13 },
  { parameterId: 'packaging', parameterName: 'Packaging', value: 'Tape & Reel', sortOrder: 14 },
];

const samsungCL10B105KA8: Part = {
  mpn: 'CL10B105KA8NNNC',
  manufacturer: 'Samsung Electro-Mechanics',
  description: 'MLCC 1µF 25V X7R 0603 ±10%',
  detailedDescription: 'CAP CER 1UF 25V X7R 0603',
  category: 'Capacitors',
  subcategory: 'MLCC',
  status: 'Active',
};

const samsungCL10B105KA8Params: ParametricAttribute[] = [
  { parameterId: 'capacitance', parameterName: 'Capacitance', value: '1 µF', numericValue: 1, unit: 'µF', sortOrder: 1 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: '0603 (1608 Metric)', sortOrder: 2 },
  { parameterId: 'voltage_rated', parameterName: 'Voltage Rating', value: '25 V', numericValue: 25, unit: 'V', sortOrder: 3 },
  { parameterId: 'dielectric', parameterName: 'Dielectric / Temp Characteristic', value: 'X7R', sortOrder: 4 },
  { parameterId: 'tolerance', parameterName: 'Tolerance', value: '±10%', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temp Range', value: '-55°C ~ 125°C', sortOrder: 6 },
  { parameterId: 'height', parameterName: 'Height (Seated Max)', value: '0.88 mm', numericValue: 0.88, unit: 'mm', sortOrder: 7 },
  { parameterId: 'esr', parameterName: 'ESR', value: '—', sortOrder: 8 },
  { parameterId: 'esl', parameterName: 'ESL', value: '—', sortOrder: 9 },
  { parameterId: 'flexible_termination', parameterName: 'Flexible Termination', value: 'No', sortOrder: 10 },
  { parameterId: 'msl', parameterName: 'Moisture Sensitivity Level', value: '1', numericValue: 1, sortOrder: 11 },
  { parameterId: 'aec_q200', parameterName: 'AEC-Q200', value: 'No', sortOrder: 12 },
  { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: '~55% at 15V', sortOrder: 13 },
  { parameterId: 'packaging', parameterName: 'Packaging', value: 'Tape & Reel', sortOrder: 14 },
];

const kemetC0603C105K3PAC: Part = {
  mpn: 'C0603C105K3PACTU',
  manufacturer: 'KEMET',
  description: 'MLCC 1µF 25V X7R 0603 ±10%',
  detailedDescription: 'CAP CER 1UF 25V X7R 0603',
  category: 'Capacitors',
  subcategory: 'MLCC',
  status: 'Active',
};

const kemetC0603C105K3PACParams: ParametricAttribute[] = [
  { parameterId: 'capacitance', parameterName: 'Capacitance', value: '1 µF', numericValue: 1, unit: 'µF', sortOrder: 1 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: '0603 (1608 Metric)', sortOrder: 2 },
  { parameterId: 'voltage_rated', parameterName: 'Voltage Rating', value: '25 V', numericValue: 25, unit: 'V', sortOrder: 3 },
  { parameterId: 'dielectric', parameterName: 'Dielectric / Temp Characteristic', value: 'X7R', sortOrder: 4 },
  { parameterId: 'tolerance', parameterName: 'Tolerance', value: '±10%', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temp Range', value: '-55°C ~ 125°C', sortOrder: 6 },
  { parameterId: 'height', parameterName: 'Height (Seated Max)', value: '0.94 mm', numericValue: 0.94, unit: 'mm', sortOrder: 7 },
  { parameterId: 'esr', parameterName: 'ESR', value: '—', sortOrder: 8 },
  { parameterId: 'esl', parameterName: 'ESL', value: '—', sortOrder: 9 },
  { parameterId: 'flexible_termination', parameterName: 'Flexible Termination', value: 'Yes', sortOrder: 10 },
  { parameterId: 'msl', parameterName: 'Moisture Sensitivity Level', value: '1', numericValue: 1, sortOrder: 11 },
  { parameterId: 'aec_q200', parameterName: 'AEC-Q200', value: 'No', sortOrder: 12 },
  { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: '~58% at 15V', sortOrder: 13 },
  { parameterId: 'packaging', parameterName: 'Packaging', value: 'Tape & Reel', sortOrder: 14 },
];

const murataGCM188R71H105: Part = {
  mpn: 'GCM188R71H105KA12',
  manufacturer: 'Murata Manufacturing',
  description: 'MLCC 1µF 50V X7R 0603 ±10% AEC-Q200',
  detailedDescription: 'CAP CER 1UF 50V X7R 0603 AEC-Q200',
  category: 'Capacitors',
  subcategory: 'MLCC',
  status: 'Active',
};

const murataGCM188R71H105Params: ParametricAttribute[] = [
  { parameterId: 'capacitance', parameterName: 'Capacitance', value: '1 µF', numericValue: 1, unit: 'µF', sortOrder: 1 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: '0603 (1608 Metric)', sortOrder: 2 },
  { parameterId: 'voltage_rated', parameterName: 'Voltage Rating', value: '50 V', numericValue: 50, unit: 'V', sortOrder: 3 },
  { parameterId: 'dielectric', parameterName: 'Dielectric / Temp Characteristic', value: 'X7R', sortOrder: 4 },
  { parameterId: 'tolerance', parameterName: 'Tolerance', value: '±10%', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temp Range', value: '-55°C ~ 125°C', sortOrder: 6 },
  { parameterId: 'height', parameterName: 'Height (Seated Max)', value: '0.90 mm', numericValue: 0.9, unit: 'mm', sortOrder: 7 },
  { parameterId: 'esr', parameterName: 'ESR', value: '—', sortOrder: 8 },
  { parameterId: 'esl', parameterName: 'ESL', value: '—', sortOrder: 9 },
  { parameterId: 'flexible_termination', parameterName: 'Flexible Termination', value: 'No', sortOrder: 10 },
  { parameterId: 'msl', parameterName: 'Moisture Sensitivity Level', value: '1', numericValue: 1, sortOrder: 11 },
  { parameterId: 'aec_q200', parameterName: 'AEC-Q200', value: 'Yes', sortOrder: 12 },
  { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: '~45% at 25V', sortOrder: 13 },
  { parameterId: 'packaging', parameterName: 'Packaging', value: 'Tape & Reel', sortOrder: 14 },
];

const yageoCC0603KRX7R: Part = {
  mpn: 'CC0603KRX7R8BB105',
  manufacturer: 'Yageo',
  description: 'MLCC 1µF 25V X5R 0603 ±10%',
  detailedDescription: 'CAP CER 1UF 25V X5R 0603',
  category: 'Capacitors',
  subcategory: 'MLCC',
  status: 'Active',
};

const yageoCC0603KRX7RParams: ParametricAttribute[] = [
  { parameterId: 'capacitance', parameterName: 'Capacitance', value: '1 µF', numericValue: 1, unit: 'µF', sortOrder: 1 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: '0603 (1608 Metric)', sortOrder: 2 },
  { parameterId: 'voltage_rated', parameterName: 'Voltage Rating', value: '25 V', numericValue: 25, unit: 'V', sortOrder: 3 },
  { parameterId: 'dielectric', parameterName: 'Dielectric / Temp Characteristic', value: 'X5R', sortOrder: 4 },
  { parameterId: 'tolerance', parameterName: 'Tolerance', value: '±10%', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temp Range', value: '-55°C ~ 85°C', sortOrder: 6 },
  { parameterId: 'height', parameterName: 'Height (Seated Max)', value: '0.88 mm', numericValue: 0.88, unit: 'mm', sortOrder: 7 },
  { parameterId: 'esr', parameterName: 'ESR', value: '—', sortOrder: 8 },
  { parameterId: 'esl', parameterName: 'ESL', value: '—', sortOrder: 9 },
  { parameterId: 'flexible_termination', parameterName: 'Flexible Termination', value: 'No', sortOrder: 10 },
  { parameterId: 'msl', parameterName: 'Moisture Sensitivity Level', value: '1', numericValue: 1, sortOrder: 11 },
  { parameterId: 'aec_q200', parameterName: 'AEC-Q200', value: 'No', sortOrder: 12 },
  { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: '~70% at 15V', sortOrder: 13 },
  { parameterId: 'packaging', parameterName: 'Packaging', value: 'Tape & Reel', sortOrder: 14 },
];

const tdkC1608X7R1E105K: Part = {
  mpn: 'C1608X7R1E105K080AB',
  manufacturer: 'TDK Corporation',
  description: 'MLCC 1µF 25V X7R 0603 ±10%',
  detailedDescription: 'CAP CER 1UF 25V X7R 0603',
  category: 'Capacitors',
  subcategory: 'MLCC',
  status: 'Active',
};

const tdkC1608X7R1E105KParams: ParametricAttribute[] = [
  { parameterId: 'capacitance', parameterName: 'Capacitance', value: '1 µF', numericValue: 1, unit: 'µF', sortOrder: 1 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: '0603 (1608 Metric)', sortOrder: 2 },
  { parameterId: 'voltage_rated', parameterName: 'Voltage Rating', value: '25 V', numericValue: 25, unit: 'V', sortOrder: 3 },
  { parameterId: 'dielectric', parameterName: 'Dielectric / Temp Characteristic', value: 'X7R', sortOrder: 4 },
  { parameterId: 'tolerance', parameterName: 'Tolerance', value: '±10%', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temp Range', value: '-55°C ~ 125°C', sortOrder: 6 },
  { parameterId: 'height', parameterName: 'Height (Seated Max)', value: '0.80 mm', numericValue: 0.8, unit: 'mm', sortOrder: 7 },
  { parameterId: 'esr', parameterName: 'ESR', value: '—', sortOrder: 8 },
  { parameterId: 'esl', parameterName: 'ESL', value: '—', sortOrder: 9 },
  { parameterId: 'flexible_termination', parameterName: 'Flexible Termination', value: 'No', sortOrder: 10 },
  { parameterId: 'msl', parameterName: 'Moisture Sensitivity Level', value: '1', numericValue: 1, sortOrder: 11 },
  { parameterId: 'aec_q200', parameterName: 'AEC-Q200', value: 'No', sortOrder: 12 },
  { parameterId: 'dc_bias_derating', parameterName: 'DC Bias Derating', value: '~62% at 15V', sortOrder: 13 },
  { parameterId: 'packaging', parameterName: 'Packaging', value: 'Tape & Reel', sortOrder: 14 },
];

// ============================================================
// RESISTORS (kept from original)
// ============================================================

const vishayRCWP0603: Part = {
  mpn: 'CRCW060310K0FKEA',
  manufacturer: 'Vishay Dale',
  description: 'Thick Film Resistor 10kΩ 1% 0.1W 0603',
  detailedDescription: 'RES 10K OHM 1% 1/10W 0603',
  category: 'Resistors',
  subcategory: 'Thick Film',
  status: 'Active',
};

const vishayRCWP0603Params: ParametricAttribute[] = [
  { parameterId: 'resistance', parameterName: 'Resistance', value: '10 kΩ', numericValue: 10000, unit: 'Ω', sortOrder: 1 },
  { parameterId: 'tolerance', parameterName: 'Tolerance', value: '±1%', sortOrder: 2 },
  { parameterId: 'power', parameterName: 'Power (Watts)', value: '0.1W', numericValue: 0.1, unit: 'W', sortOrder: 3 },
  { parameterId: 'composition', parameterName: 'Composition', value: 'Thick Film', sortOrder: 4 },
  { parameterId: 'temp_coefficient', parameterName: 'Temperature Coefficient', value: '±100ppm/°C', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temperature', value: '-55°C ~ 155°C', sortOrder: 6 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: '0603 (1608 Metric)', sortOrder: 7 },
  { parameterId: 'size', parameterName: 'Size / Dimension', value: '1.60mm x 0.80mm', sortOrder: 8 },
  { parameterId: 'height', parameterName: 'Height (Max)', value: '0.45mm', numericValue: 0.45, unit: 'mm', sortOrder: 9 },
  { parameterId: 'mounting_type', parameterName: 'Mounting Type', value: 'Surface Mount', sortOrder: 10 },
];

const yageoRC0603: Part = {
  mpn: 'RC0603FR-0710KL',
  manufacturer: 'Yageo',
  description: 'Thick Film Resistor 10kΩ 1% 0.1W 0603',
  detailedDescription: 'RES 10K OHM 1% 1/10W 0603',
  category: 'Resistors',
  subcategory: 'Thick Film',
  status: 'Active',
};

const yageoRC0603Params: ParametricAttribute[] = [
  { parameterId: 'resistance', parameterName: 'Resistance', value: '10 kΩ', numericValue: 10000, unit: 'Ω', sortOrder: 1 },
  { parameterId: 'tolerance', parameterName: 'Tolerance', value: '±1%', sortOrder: 2 },
  { parameterId: 'power', parameterName: 'Power (Watts)', value: '0.1W', numericValue: 0.1, unit: 'W', sortOrder: 3 },
  { parameterId: 'composition', parameterName: 'Composition', value: 'Thick Film', sortOrder: 4 },
  { parameterId: 'temp_coefficient', parameterName: 'Temperature Coefficient', value: '±100ppm/°C', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temperature', value: '-55°C ~ 155°C', sortOrder: 6 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: '0603 (1608 Metric)', sortOrder: 7 },
  { parameterId: 'size', parameterName: 'Size / Dimension', value: '1.60mm x 0.80mm', sortOrder: 8 },
  { parameterId: 'height', parameterName: 'Height (Max)', value: '0.45mm', numericValue: 0.45, unit: 'mm', sortOrder: 9 },
  { parameterId: 'mounting_type', parameterName: 'Mounting Type', value: 'Surface Mount', sortOrder: 10 },
];

const stackpoleRNCP0603: Part = {
  mpn: 'RNCP0603FTD10K0',
  manufacturer: 'Stackpole Electronics',
  description: 'Thin Film Resistor 10kΩ 1% 0.1W 0603',
  detailedDescription: 'RES 10K OHM 1% 1/10W 0603',
  category: 'Resistors',
  subcategory: 'Thin Film',
  status: 'Active',
};

const stackpoleRNCP0603Params: ParametricAttribute[] = [
  { parameterId: 'resistance', parameterName: 'Resistance', value: '10 kΩ', numericValue: 10000, unit: 'Ω', sortOrder: 1 },
  { parameterId: 'tolerance', parameterName: 'Tolerance', value: '±1%', sortOrder: 2 },
  { parameterId: 'power', parameterName: 'Power (Watts)', value: '0.1W', numericValue: 0.1, unit: 'W', sortOrder: 3 },
  { parameterId: 'composition', parameterName: 'Composition', value: 'Thin Film', sortOrder: 4 },
  { parameterId: 'temp_coefficient', parameterName: 'Temperature Coefficient', value: '±25ppm/°C', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temperature', value: '-55°C ~ 155°C', sortOrder: 6 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: '0603 (1608 Metric)', sortOrder: 7 },
  { parameterId: 'size', parameterName: 'Size / Dimension', value: '1.60mm x 0.80mm', sortOrder: 8 },
  { parameterId: 'height', parameterName: 'Height (Max)', value: '0.45mm', numericValue: 0.45, unit: 'mm', sortOrder: 9 },
  { parameterId: 'mounting_type', parameterName: 'Mounting Type', value: 'Surface Mount', sortOrder: 10 },
];

// ============================================================
// ICs — Voltage Regulators (kept from original)
// ============================================================

const tiLM1117_3V3: Part = {
  mpn: 'LM1117IMPX-3.3/NOPB',
  manufacturer: 'Texas Instruments',
  description: 'Linear Voltage Regulator 3.3V 800mA SOT-223',
  detailedDescription: 'IC REG LINEAR 3.3V 800MA SOT223',
  category: 'ICs',
  subcategory: 'Linear Voltage Regulators',
  status: 'Active',
};

const tiLM1117_3V3Params: ParametricAttribute[] = [
  { parameterId: 'output_voltage', parameterName: 'Output Voltage', value: '3.3 V', numericValue: 3.3, unit: 'V', sortOrder: 1 },
  { parameterId: 'output_current', parameterName: 'Output Current', value: '800 mA', numericValue: 800, unit: 'mA', sortOrder: 2 },
  { parameterId: 'input_voltage_max', parameterName: 'Input Voltage (Max)', value: '15 V', numericValue: 15, unit: 'V', sortOrder: 3 },
  { parameterId: 'dropout_voltage', parameterName: 'Dropout Voltage', value: '1.2 V @ 800mA', numericValue: 1.2, unit: 'V', sortOrder: 4 },
  { parameterId: 'voltage_accuracy', parameterName: 'Output Voltage Accuracy', value: '±1.5%', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temperature', value: '-40°C ~ 125°C', sortOrder: 6 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: 'SOT-223-4', sortOrder: 7 },
  { parameterId: 'mounting_type', parameterName: 'Mounting Type', value: 'Surface Mount', sortOrder: 8 },
  { parameterId: 'quiescent_current', parameterName: 'Quiescent Current', value: '5 mA', numericValue: 5, unit: 'mA', sortOrder: 9 },
  { parameterId: 'psrr', parameterName: 'PSRR', value: '75 dB (120Hz)', sortOrder: 10 },
];

const tiLM1117_5V: Part = {
  mpn: 'LM1117IMPX-5.0/NOPB',
  manufacturer: 'Texas Instruments',
  description: 'Linear Voltage Regulator 5.0V 800mA SOT-223',
  detailedDescription: 'IC REG LINEAR 5.0V 800MA SOT223',
  category: 'ICs',
  subcategory: 'Linear Voltage Regulators',
  status: 'Active',
};

const tiLM1117_ADJ: Part = {
  mpn: 'LM1117IMPX-ADJ/NOPB',
  manufacturer: 'Texas Instruments',
  description: 'Linear Voltage Regulator ADJ 800mA SOT-223',
  detailedDescription: 'IC REG LINEAR ADJ 800MA SOT223',
  category: 'ICs',
  subcategory: 'Linear Voltage Regulators',
  status: 'Active',
};

const amsAMS1117_3V3: Part = {
  mpn: 'AMS1117-3.3',
  manufacturer: 'Advanced Monolithic Systems',
  description: 'Linear Voltage Regulator 3.3V 1A SOT-223',
  detailedDescription: 'IC REG LINEAR 3.3V 1A SOT223',
  category: 'ICs',
  subcategory: 'Linear Voltage Regulators',
  status: 'Active',
};

const amsAMS1117_3V3Params: ParametricAttribute[] = [
  { parameterId: 'output_voltage', parameterName: 'Output Voltage', value: '3.3 V', numericValue: 3.3, unit: 'V', sortOrder: 1 },
  { parameterId: 'output_current', parameterName: 'Output Current', value: '1 A', numericValue: 1000, unit: 'mA', sortOrder: 2 },
  { parameterId: 'input_voltage_max', parameterName: 'Input Voltage (Max)', value: '15 V', numericValue: 15, unit: 'V', sortOrder: 3 },
  { parameterId: 'dropout_voltage', parameterName: 'Dropout Voltage', value: '1.3 V @ 1A', numericValue: 1.3, unit: 'V', sortOrder: 4 },
  { parameterId: 'voltage_accuracy', parameterName: 'Output Voltage Accuracy', value: '±2%', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temperature', value: '-40°C ~ 125°C', sortOrder: 6 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: 'SOT-223-4', sortOrder: 7 },
  { parameterId: 'mounting_type', parameterName: 'Mounting Type', value: 'Surface Mount', sortOrder: 8 },
  { parameterId: 'quiescent_current', parameterName: 'Quiescent Current', value: '5 mA', numericValue: 5, unit: 'mA', sortOrder: 9 },
  { parameterId: 'psrr', parameterName: 'PSRR', value: '72 dB (120Hz)', sortOrder: 10 },
];

const micrelMIC5219_3V3: Part = {
  mpn: 'MIC5219-3.3YM5-TR',
  manufacturer: 'Microchip Technology',
  description: 'LDO Voltage Regulator 3.3V 500mA SOT-23-5',
  detailedDescription: 'IC REG LINEAR 3.3V 500MA SOT23-5',
  category: 'ICs',
  subcategory: 'Linear Voltage Regulators',
  status: 'Active',
};

const micrelMIC5219_3V3Params: ParametricAttribute[] = [
  { parameterId: 'output_voltage', parameterName: 'Output Voltage', value: '3.3 V', numericValue: 3.3, unit: 'V', sortOrder: 1 },
  { parameterId: 'output_current', parameterName: 'Output Current', value: '500 mA', numericValue: 500, unit: 'mA', sortOrder: 2 },
  { parameterId: 'input_voltage_max', parameterName: 'Input Voltage (Max)', value: '12 V', numericValue: 12, unit: 'V', sortOrder: 3 },
  { parameterId: 'dropout_voltage', parameterName: 'Dropout Voltage', value: '0.35 V @ 500mA', numericValue: 0.35, unit: 'V', sortOrder: 4 },
  { parameterId: 'voltage_accuracy', parameterName: 'Output Voltage Accuracy', value: '±1%', sortOrder: 5 },
  { parameterId: 'operating_temp', parameterName: 'Operating Temperature', value: '-40°C ~ 125°C', sortOrder: 6 },
  { parameterId: 'package_case', parameterName: 'Package / Case', value: 'SOT-23-5', sortOrder: 7 },
  { parameterId: 'mounting_type', parameterName: 'Mounting Type', value: 'Surface Mount', sortOrder: 8 },
  { parameterId: 'quiescent_current', parameterName: 'Quiescent Current', value: '0.5 mA', numericValue: 0.5, unit: 'mA', sortOrder: 9 },
  { parameterId: 'psrr', parameterName: 'PSRR', value: '60 dB (1kHz)', sortOrder: 10 },
];

// ============================================================
// HARDCODED RECOMMENDATIONS (for non-MLCC families)
// ============================================================

const vishayRCWP0603Recs: XrefRecommendation[] = [
  {
    part: yageoRC0603,
    matchPercentage: 98,
    matchDetails: [
      { parameterId: 'resistance', parameterName: 'Resistance', sourceValue: '10 kΩ', replacementValue: '10 kΩ', matchStatus: 'exact' },
      { parameterId: 'tolerance', parameterName: 'Tolerance', sourceValue: '±1%', replacementValue: '±1%', matchStatus: 'exact' },
      { parameterId: 'power', parameterName: 'Power (Watts)', sourceValue: '0.1W', replacementValue: '0.1W', matchStatus: 'exact' },
      { parameterId: 'composition', parameterName: 'Composition', sourceValue: 'Thick Film', replacementValue: 'Thick Film', matchStatus: 'exact' },
      { parameterId: 'temp_coefficient', parameterName: 'Temperature Coefficient', sourceValue: '±100ppm/°C', replacementValue: '±100ppm/°C', matchStatus: 'exact' },
      { parameterId: 'operating_temp', parameterName: 'Operating Temperature', sourceValue: '-55°C ~ 155°C', replacementValue: '-55°C ~ 155°C', matchStatus: 'exact' },
      { parameterId: 'package_case', parameterName: 'Package / Case', sourceValue: '0603', replacementValue: '0603', matchStatus: 'exact' },
      { parameterId: 'mounting_type', parameterName: 'Mounting Type', sourceValue: 'Surface Mount', replacementValue: 'Surface Mount', matchStatus: 'exact' },
    ],
    notes: 'Exact drop-in replacement. Industry-standard 0603 thick film.',
  },
  {
    part: stackpoleRNCP0603,
    matchPercentage: 85,
    matchDetails: [
      { parameterId: 'resistance', parameterName: 'Resistance', sourceValue: '10 kΩ', replacementValue: '10 kΩ', matchStatus: 'exact' },
      { parameterId: 'tolerance', parameterName: 'Tolerance', sourceValue: '±1%', replacementValue: '±1%', matchStatus: 'exact' },
      { parameterId: 'power', parameterName: 'Power (Watts)', sourceValue: '0.1W', replacementValue: '0.1W', matchStatus: 'exact' },
      { parameterId: 'composition', parameterName: 'Composition', sourceValue: 'Thick Film', replacementValue: 'Thin Film', matchStatus: 'different' },
      { parameterId: 'temp_coefficient', parameterName: 'Temperature Coefficient', sourceValue: '±100ppm/°C', replacementValue: '±25ppm/°C', matchStatus: 'better' },
      { parameterId: 'operating_temp', parameterName: 'Operating Temperature', sourceValue: '-55°C ~ 155°C', replacementValue: '-55°C ~ 155°C', matchStatus: 'exact' },
      { parameterId: 'package_case', parameterName: 'Package / Case', sourceValue: '0603', replacementValue: '0603', matchStatus: 'exact' },
      { parameterId: 'mounting_type', parameterName: 'Mounting Type', sourceValue: 'Surface Mount', replacementValue: 'Surface Mount', matchStatus: 'exact' },
    ],
    notes: 'Thin film alternative with much better tempco. Higher cost but better precision.',
  },
];

const tiLM1117Recs: XrefRecommendation[] = [
  {
    part: amsAMS1117_3V3,
    matchPercentage: 92,
    matchDetails: [
      { parameterId: 'output_voltage', parameterName: 'Output Voltage', sourceValue: '3.3 V', replacementValue: '3.3 V', matchStatus: 'exact' },
      { parameterId: 'output_current', parameterName: 'Output Current', sourceValue: '800 mA', replacementValue: '1 A', matchStatus: 'better' },
      { parameterId: 'input_voltage_max', parameterName: 'Input Voltage (Max)', sourceValue: '15 V', replacementValue: '15 V', matchStatus: 'exact' },
      { parameterId: 'dropout_voltage', parameterName: 'Dropout Voltage', sourceValue: '1.2 V @ 800mA', replacementValue: '1.3 V @ 1A', matchStatus: 'compatible' },
      { parameterId: 'voltage_accuracy', parameterName: 'Output Voltage Accuracy', sourceValue: '±1.5%', replacementValue: '±2%', matchStatus: 'worse' },
      { parameterId: 'operating_temp', parameterName: 'Operating Temperature', sourceValue: '-40°C ~ 125°C', replacementValue: '-40°C ~ 125°C', matchStatus: 'exact' },
      { parameterId: 'package_case', parameterName: 'Package / Case', sourceValue: 'SOT-223-4', replacementValue: 'SOT-223-4', matchStatus: 'exact' },
      { parameterId: 'quiescent_current', parameterName: 'Quiescent Current', sourceValue: '5 mA', replacementValue: '5 mA', matchStatus: 'exact' },
    ],
    notes: 'Popular LM1117 clone. Higher output current but slightly worse voltage accuracy.',
  },
  {
    part: micrelMIC5219_3V3,
    matchPercentage: 74,
    matchDetails: [
      { parameterId: 'output_voltage', parameterName: 'Output Voltage', sourceValue: '3.3 V', replacementValue: '3.3 V', matchStatus: 'exact' },
      { parameterId: 'output_current', parameterName: 'Output Current', sourceValue: '800 mA', replacementValue: '500 mA', matchStatus: 'worse' },
      { parameterId: 'input_voltage_max', parameterName: 'Input Voltage (Max)', sourceValue: '15 V', replacementValue: '12 V', matchStatus: 'worse' },
      { parameterId: 'dropout_voltage', parameterName: 'Dropout Voltage', sourceValue: '1.2 V @ 800mA', replacementValue: '0.35 V @ 500mA', matchStatus: 'better' },
      { parameterId: 'voltage_accuracy', parameterName: 'Output Voltage Accuracy', sourceValue: '±1.5%', replacementValue: '±1%', matchStatus: 'better' },
      { parameterId: 'operating_temp', parameterName: 'Operating Temperature', sourceValue: '-40°C ~ 125°C', replacementValue: '-40°C ~ 125°C', matchStatus: 'exact' },
      { parameterId: 'package_case', parameterName: 'Package / Case', sourceValue: 'SOT-223-4', replacementValue: 'SOT-23-5', matchStatus: 'different' },
      { parameterId: 'quiescent_current', parameterName: 'Quiescent Current', sourceValue: '5 mA', replacementValue: '0.5 mA', matchStatus: 'better' },
    ],
    notes: 'True LDO with much lower dropout. Lower current and different package. Better for battery applications.',
  },
];

// ============================================================
// LOOKUP TABLES
// ============================================================

export const searchIndex: Record<string, PartSummary[]> = {
  // MLCC exact matches
  'GRM188R71E105KA12': [{ mpn: 'GRM188R71E105KA12', manufacturer: 'Murata Manufacturing', description: 'MLCC 1µF 25V X7R 0603', category: 'Capacitors', status: 'Active' }],
  'CL10B105KA8NNNC': [{ mpn: 'CL10B105KA8NNNC', manufacturer: 'Samsung Electro-Mechanics', description: 'MLCC 1µF 25V X7R 0603', category: 'Capacitors', status: 'Active' }],
  'C0603C105K3PACTU': [{ mpn: 'C0603C105K3PACTU', manufacturer: 'KEMET', description: 'MLCC 1µF 25V X7R 0603 Flex Term', category: 'Capacitors', status: 'Active' }],

  // Resistor exact matches
  'CRCW060310K0FKEA': [{ mpn: 'CRCW060310K0FKEA', manufacturer: 'Vishay Dale', description: 'Thick Film Resistor 10kΩ 1% 0603', category: 'Resistors', status: 'Active' }],
  'RC0603FR-0710KL': [{ mpn: 'RC0603FR-0710KL', manufacturer: 'Yageo', description: 'Thick Film Resistor 10kΩ 1% 0603', category: 'Resistors', status: 'Active' }],

  // IC exact matches
  'LM1117IMPX-3.3/NOPB': [{ mpn: 'LM1117IMPX-3.3/NOPB', manufacturer: 'Texas Instruments', description: 'Linear Voltage Regulator 3.3V 800mA SOT-223', category: 'ICs', status: 'Active' }],

  // Ambiguous queries
  'LM1117': [
    { mpn: 'LM1117IMPX-3.3/NOPB', manufacturer: 'Texas Instruments', description: 'Linear Voltage Regulator 3.3V 800mA SOT-223', category: 'ICs', status: 'Active' },
    { mpn: 'LM1117IMPX-5.0/NOPB', manufacturer: 'Texas Instruments', description: 'Linear Voltage Regulator 5.0V 800mA SOT-223', category: 'ICs', status: 'Active' },
    { mpn: 'LM1117IMPX-ADJ/NOPB', manufacturer: 'Texas Instruments', description: 'Linear Voltage Regulator ADJ 800mA SOT-223', category: 'ICs', status: 'Active' },
  ],
  '1UF': [
    { mpn: 'GRM188R71E105KA12', manufacturer: 'Murata Manufacturing', description: 'MLCC 1µF 25V X7R 0603', category: 'Capacitors', status: 'Active' },
    { mpn: 'CL10B105KA8NNNC', manufacturer: 'Samsung Electro-Mechanics', description: 'MLCC 1µF 25V X7R 0603', category: 'Capacitors', status: 'Active' },
    { mpn: 'C0603C105K3PACTU', manufacturer: 'KEMET', description: 'MLCC 1µF 25V X7R 0603 Flex Term', category: 'Capacitors', status: 'Active' },
  ],
  '10K': [
    { mpn: 'CRCW060310K0FKEA', manufacturer: 'Vishay Dale', description: 'Thick Film 10kΩ 1% 0603', category: 'Resistors', status: 'Active' },
    { mpn: 'RC0603FR-0710KL', manufacturer: 'Yageo', description: 'Thick Film 10kΩ 1% 0603', category: 'Resistors', status: 'Active' },
    { mpn: 'RNCP0603FTD10K0', manufacturer: 'Stackpole Electronics', description: 'Thin Film 10kΩ 1% 0603', category: 'Resistors', status: 'Active' },
  ],
};

export const attributesDatabase: Record<string, PartAttributes> = {
  // MLCC
  'GRM188R71E105KA12': { part: murataGRM188R71E105, parameters: murataGRM188R71E105Params },
  'CL10B105KA8NNNC': { part: samsungCL10B105KA8, parameters: samsungCL10B105KA8Params },
  'C0603C105K3PACTU': { part: kemetC0603C105K3PAC, parameters: kemetC0603C105K3PACParams },
  'GCM188R71H105KA12': { part: murataGCM188R71H105, parameters: murataGCM188R71H105Params },
  'CC0603KRX7R8BB105': { part: yageoCC0603KRX7R, parameters: yageoCC0603KRX7RParams },
  'C1608X7R1E105K080AB': { part: tdkC1608X7R1E105K, parameters: tdkC1608X7R1E105KParams },
  // Resistors
  'CRCW060310K0FKEA': { part: vishayRCWP0603, parameters: vishayRCWP0603Params },
  'RC0603FR-0710KL': { part: yageoRC0603, parameters: yageoRC0603Params },
  'RNCP0603FTD10K0': { part: stackpoleRNCP0603, parameters: stackpoleRNCP0603Params },
  // ICs
  'LM1117IMPX-3.3/NOPB': { part: tiLM1117_3V3, parameters: tiLM1117_3V3Params },
  'AMS1117-3.3': { part: amsAMS1117_3V3, parameters: amsAMS1117_3V3Params },
  'MIC5219-3.3YM5-TR': { part: micrelMIC5219_3V3, parameters: micrelMIC5219_3V3Params },
};

/** All MLCC candidate parts for matching engine evaluation */
export const mlccCandidates: PartAttributes[] = [
  { part: murataGRM188R71E105, parameters: murataGRM188R71E105Params },
  { part: samsungCL10B105KA8, parameters: samsungCL10B105KA8Params },
  { part: kemetC0603C105K3PAC, parameters: kemetC0603C105K3PACParams },
  { part: murataGCM188R71H105, parameters: murataGCM188R71H105Params },
  { part: yageoCC0603KRX7R, parameters: yageoCC0603KRX7RParams },
  { part: tdkC1608X7R1E105K, parameters: tdkC1608X7R1E105KParams },
];

/** Hardcoded recommendations for non-MLCC parts (until their logic tables are built) */
export const recommendationsDatabase: Record<string, XrefRecommendation[]> = {
  'CRCW060310K0FKEA': vishayRCWP0603Recs,
  'LM1117IMPX-3.3/NOPB': tiLM1117Recs,
};
