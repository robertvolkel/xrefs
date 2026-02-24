import { classifyListTheme } from '@/lib/themeClassifier';

describe('classifyListTheme', () => {
  // ============================================================
  // DOMAIN THEMES
  // ============================================================

  it('classifies automotive from description keywords', () => {
    expect(classifyListTheme(
      'BMS Cell Monitor',
      'This is a high-stakes module for automotive applications',
      'Mercedes',
    )).toBe('automotive');
  });

  it('classifies automotive from AEC-Q keyword', () => {
    expect(classifyListTheme('Power Module', 'Must be AEC-Q200 qualified', '')).toBe('automotive');
  });

  it('classifies medical from description', () => {
    expect(classifyListTheme('Sensor Board', 'IEC-60601 compliant patient monitor', '')).toBe('medical');
  });

  it('classifies aerospace from mil-spec keyword', () => {
    expect(classifyListTheme('Radar Module', 'mil-spec components for defense', '')).toBe('aerospace');
  });

  it('classifies industrial from factory automation', () => {
    expect(classifyListTheme('PLC IO Board', 'factory automation controller', '')).toBe('industrial');
  });

  it('classifies telecom', () => {
    expect(classifyListTheme('Base Station Filter', 'telecom 5G base-station', '')).toBe('telecom');
  });

  it('classifies IoT from embedded keyword', () => {
    expect(classifyListTheme('Sensor Node', 'LoRaWAN embedded gateway', '')).toBe('iot');
  });

  // ============================================================
  // TECHNICAL THEMES
  // ============================================================

  it('classifies battery from lithium-ion description', () => {
    expect(classifyListTheme(
      'Cell Monitor Board',
      'sits on top of lithium-ion cells for cell balancing',
      '',
    )).toBe('battery');
  });

  it('classifies power from DC-DC converter', () => {
    expect(classifyListTheme('Buck Converter', 'DC-DC converter module', '')).toBe('power');
  });

  it('classifies motor from BLDC keyword', () => {
    expect(classifyListTheme('Motor Driver', 'BLDC motor controller', '')).toBe('motor');
  });

  it('classifies LED from lighting keyword', () => {
    expect(classifyListTheme('LED Driver', 'backlight luminaire dimmer', '')).toBe('led');
  });

  it('classifies audio from amplifier keyword', () => {
    expect(classifyListTheme('Class D Amp', 'audio amplifier board', '')).toBe('audio');
  });

  it('classifies sensor from accelerometer keyword', () => {
    expect(classifyListTheme('IMU Board', 'accelerometer and gyroscope module', '')).toBe('sensor');
  });

  // ============================================================
  // OBJECTIVE THEMES
  // ============================================================

  it('classifies cost reduction', () => {
    expect(classifyListTheme('Q3 Resourcing', 'cost reduction for value engineering', '')).toBe('cost_reduction');
  });

  it('classifies obsolescence from EOL keyword', () => {
    expect(classifyListTheme('EOL Replacements', 'end-of-life parts need replacement', '')).toBe('obsolescence');
  });

  it('classifies second source', () => {
    expect(classifyListTheme('Dual Source Audit', 'second source qualification for supply chain', '')).toBe('second_source');
  });

  // ============================================================
  // PRIORITY ORDERING
  // ============================================================

  it('automotive beats battery when both keywords present', () => {
    expect(classifyListTheme(
      'BMS Board',
      'automotive battery management system with lithium cells',
      '',
    )).toBe('automotive');
  });

  it('medical beats sensor when both keywords present', () => {
    expect(classifyListTheme('Patient Sensor', 'medical patient temperature sensor', '')).toBe('medical');
  });

  // ============================================================
  // SHORT KEYWORD WORD-BOUNDARY MATCHING
  // ============================================================

  it('matches short keyword "ev" at word boundary', () => {
    expect(classifyListTheme('EV Charger Board', '', '')).toBe('automotive');
  });

  it('does not match "ev" inside "every" or "prevent"', () => {
    expect(classifyListTheme('Every Board', 'prevent issues', '')).toBe('general');
  });

  it('matches short keyword "5g" at word boundary', () => {
    expect(classifyListTheme('5G Module', '', '')).toBe('telecom');
  });

  it('matches short keyword "led" at word boundary', () => {
    expect(classifyListTheme('LED Board', '', '')).toBe('led');
  });

  it('matches short keyword "plc" at word boundary', () => {
    expect(classifyListTheme('PLC Board', '', '')).toBe('industrial');
  });

  it('matches short keyword "eol" at word boundary', () => {
    expect(classifyListTheme('EOL Replacements', '', '')).toBe('obsolescence');
  });

  // ============================================================
  // FALLBACK
  // ============================================================

  it('returns general for empty inputs', () => {
    expect(classifyListTheme('', '', '')).toBe('general');
  });

  it('returns general for unrecognized content', () => {
    expect(classifyListTheme('My Parts List', 'Some generic board', 'ACME Corp')).toBe('general');
  });

  // ============================================================
  // CUSTOMER FIELD
  // ============================================================

  it('can classify from customer field alone', () => {
    expect(classifyListTheme('Parts List', '', 'Automotive OEM')).toBe('automotive');
  });
});
