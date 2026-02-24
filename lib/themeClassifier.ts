/**
 * Theme Classifier for Parts Lists
 *
 * Extracts application theme from list name + description + customer text
 * using keyword matching, then maps to an MUI outlined icon.
 * Classified once at save time and stored in the database.
 */

import type { SvgIconProps } from '@mui/material';
import type { ComponentType } from 'react';

import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined';
import LocalHospitalOutlined from '@mui/icons-material/LocalHospitalOutlined';
import FlightOutlined from '@mui/icons-material/FlightOutlined';
import PrecisionManufacturingOutlined from '@mui/icons-material/PrecisionManufacturingOutlined';
import CellTowerOutlined from '@mui/icons-material/CellTowerOutlined';
import SensorsOutlined from '@mui/icons-material/SensorsOutlined';
import BatteryChargingFullOutlined from '@mui/icons-material/BatteryChargingFullOutlined';
import BoltOutlined from '@mui/icons-material/BoltOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import GraphicEqOutlined from '@mui/icons-material/GraphicEqOutlined';
import DeviceThermostatOutlined from '@mui/icons-material/DeviceThermostatOutlined';
import SavingsOutlined from '@mui/icons-material/SavingsOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import SwapHorizOutlined from '@mui/icons-material/SwapHorizOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';

export type ListThemeId =
  | 'automotive'
  | 'medical'
  | 'aerospace'
  | 'industrial'
  | 'telecom'
  | 'iot'
  | 'battery'
  | 'power'
  | 'motor'
  | 'led'
  | 'audio'
  | 'sensor'
  | 'cost_reduction'
  | 'obsolescence'
  | 'second_source'
  | 'general';

interface ThemeEntry {
  id: ListThemeId;
  keywords: string[];
}

/**
 * Ordered by priority — first match wins.
 * Domain themes (automotive, medical, aerospace) checked before
 * technical themes (battery, power) and objectives (cost, obsolescence).
 */
const THEME_TAXONOMY: ThemeEntry[] = [
  {
    id: 'automotive',
    keywords: [
      'automotive', 'vehicle', 'adas', 'ecu', 'abs', 'eps', 'obd',
      'can-bus', 'canbus', 'lidar', 'infotainment', 'dashboard',
      'drivetrain', 'phev', 'hev', 'aec-q', 'aecq',
      // short keywords handled with word-boundary matching below
    ],
  },
  {
    id: 'medical',
    keywords: [
      'medical', 'implant', 'patient', 'surgical', 'diagnostic',
      'ventilator', 'defibrillator', 'pacemaker', 'ultrasound',
      'iec-60601', 'iec60601', 'iso-13485', 'iso13485',
    ],
  },
  {
    id: 'aerospace',
    keywords: [
      'aerospace', 'aviation', 'avionics', 'satellite', 'mil-spec', 'milspec',
      'mil-std', 'milstd', 'defense', 'defence', 'military',
      'radar', 'spacecraft', 'flight-computer', 'munition',
    ],
  },
  {
    id: 'industrial',
    keywords: [
      'industrial', 'factory', 'automation', 'motor-drive',
      'cnc', 'robot', 'robotics', 'hvac', 'scada',
    ],
  },
  {
    id: 'telecom',
    keywords: [
      'telecom', 'telecommunications', 'antenna', 'base-station',
      'basestation', 'router', 'optical', 'fiber', 'fibre', 'ethernet',
      'network-switch', 'networking',
    ],
  },
  {
    id: 'iot',
    keywords: [
      'iot', 'embedded', 'wearable', 'zigbee', 'lorawan', 'lora',
      'mesh-network', 'smart-home', 'smarthome', 'gateway', 'edge-device',
    ],
  },
  {
    id: 'battery',
    keywords: [
      'battery', 'bms', 'cell-monitor', 'cell monitor', 'cell-balancing',
      'cell balancing', 'lithium', 'li-ion', 'lipo', 'supercap',
      'energy-storage', 'charger', 'charging', 'solar', 'inverter', 'mppt',
    ],
  },
  {
    id: 'power',
    keywords: [
      'power-supply', 'power supply', 'dc-dc', 'converter', 'regulator',
      'smps', 'buck', 'boost', 'igbt', 'rectifier', 'transformer',
    ],
  },
  {
    id: 'motor',
    keywords: [
      'motor', 'bldc', 'stepper', 'servo', 'h-bridge', 'hbridge',
      'actuator', 'esc',
    ],
  },
  {
    id: 'led',
    keywords: [
      'lighting', 'backlight', 'luminaire', 'dimmer',
      'display-backlight',
    ],
  },
  {
    id: 'audio',
    keywords: [
      'audio', 'amplifier', 'speaker', 'microphone', 'codec',
      'headphone', 'earphone',
    ],
  },
  {
    id: 'sensor',
    keywords: [
      'sensor', 'accelerometer', 'gyroscope', 'thermocouple',
      'pressure-sensor', 'humidity', 'temperature-sensor', 'proximity',
      'gas-sensor',
    ],
  },
  {
    id: 'cost_reduction',
    keywords: [
      'cost-reduction', 'cost reduction', 'cost-save', 'cost save',
      'cost-down', 'cost down', 'value-engineering', 'value engineering',
      'resourcing', 'cheaper', 'budget', 'lower cost', 'lower-cost',
    ],
  },
  {
    id: 'obsolescence',
    keywords: [
      'obsolescence', 'obsolete', 'end-of-life', 'end of life',
      'discontinued', 'nrnd', 'last-time-buy', 'last time buy',
      'replacement',
    ],
  },
  {
    id: 'second_source',
    keywords: [
      'second-source', 'second source', 'dual-source', 'dual source',
      'alternate', 'backup-supplier', 'backup supplier',
      'supply-chain', 'supply chain', 'qualification',
    ],
  },
];

/** Short keywords that need word-boundary matching to avoid false positives */
const SHORT_KEYWORD_THEMES: { themeId: ListThemeId; keywords: string[] }[] = [
  { themeId: 'automotive', keywords: ['ev', 'bms'] },
  { themeId: 'telecom', keywords: ['5g', 'lte', 'rf'] },
  { themeId: 'iot', keywords: ['ble'] },
  { themeId: 'power', keywords: ['psu', 'ldo', 'pfc'] },
  { themeId: 'led', keywords: ['led'] },
  { themeId: 'audio', keywords: ['dac', 'adc'] },
  { themeId: 'sensor', keywords: ['imu'] },
  { themeId: 'industrial', keywords: ['plc', 'vfd'] },
  { themeId: 'obsolescence', keywords: ['eol', 'pcn'] },
];

/**
 * Tests whether a short keyword appears at a word boundary in the text.
 * Matches "ev" in "EV charging" or "ev-based" but not in "every" or "prevent".
 */
function matchesWordBoundary(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[\\s\\-_/,()])${escaped}(?:$|[\\s\\-_/,()])`, 'i');
  return re.test(text);
}

/** Build a lookup map for short keywords: themeId → keywords[] */
const shortByTheme = new Map(SHORT_KEYWORD_THEMES.map((s) => [s.themeId, s.keywords]));

/**
 * Classify a parts list into a theme based on its name, description, and customer.
 * Returns the first matching theme ID, or 'general' if no keywords match.
 *
 * For each theme (in priority order), checks both long keywords (substring match)
 * and short keywords (word-boundary match) before moving to the next theme.
 */
export function classifyListTheme(
  name: string,
  description: string,
  customer: string,
): ListThemeId {
  const text = `${name || ''} ${description || ''} ${customer || ''}`.toLowerCase();

  if (!text.trim()) return 'general';

  // Check each theme in priority order: long keywords then short keywords
  for (const entry of THEME_TAXONOMY) {
    // Long keywords — simple substring match
    for (const kw of entry.keywords) {
      if (text.includes(kw)) {
        return entry.id;
      }
    }
    // Short keywords — word-boundary match
    const shorts = shortByTheme.get(entry.id);
    if (shorts) {
      for (const kw of shorts) {
        if (matchesWordBoundary(text, kw)) {
          return entry.id;
        }
      }
    }
  }

  return 'general';
}

/** Map from theme ID to MUI outlined icon component */
export const THEME_ICON_MAP: Record<ListThemeId, ComponentType<SvgIconProps>> = {
  automotive: DirectionsCarOutlined,
  medical: LocalHospitalOutlined,
  aerospace: FlightOutlined,
  industrial: PrecisionManufacturingOutlined,
  telecom: CellTowerOutlined,
  iot: SensorsOutlined,
  battery: BatteryChargingFullOutlined,
  power: BoltOutlined,
  motor: SettingsOutlined,
  led: LightbulbOutlined,
  audio: GraphicEqOutlined,
  sensor: DeviceThermostatOutlined,
  cost_reduction: SavingsOutlined,
  obsolescence: WarningAmberOutlined,
  second_source: SwapHorizOutlined,
  general: DescriptionOutlined,
};
