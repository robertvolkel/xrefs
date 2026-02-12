import { ManufacturerProfile } from './types';

const DISTRIBUTOR_URLS: Record<string, string> = {
  'Digi-Key': 'https://www.digikey.com',
  'Mouser': 'https://www.mouser.com',
  'Arrow': 'https://www.arrow.com',
  'Avnet': 'https://www.avnet.com',
  'Newark': 'https://www.newark.com',
  'Farnell': 'https://www.farnell.com',
  'TTI': 'https://www.ttiinc.com',
  'LCSC': 'https://www.lcsc.com',
  'Szlcsc': 'https://www.szlcsc.com',
};

function dist(names: string[]) {
  return names.map(name => ({ name, url: DISTRIBUTOR_URLS[name] ?? '' }));
}

const profiles: ManufacturerProfile[] = [
  {
    id: 'murata',
    name: 'Murata Manufacturing',
    logoUrl: 'https://logo.clearbit.com/murata.com',
    headquarters: 'Nagaokakyo, Kyoto, Japan',
    country: 'Japan',
    countryFlag: '\u{1F1EF}\u{1F1F5}',
    foundedYear: 1944,
    catalogSize: 120000,
    familyCount: 45,
    distributorCount: 38,
    isSecondSource: false,
    productCategories: ['MLCCs', 'Chip Inductors', 'EMI Filters', 'Resonators', 'Sensors', 'Power Modules', 'RF Components', 'Thermistors'],
    certifications: [
      { name: 'IATF 16949', category: 'automotive' },
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
      { name: 'AEC-Q200', category: 'automotive' },
    ],
    designResources: [
      { type: 'SPICE Models' },
      { type: 'Selection Guides' },
      { type: 'Online Simulation' },
      { type: 'CAD Libraries' },
      { type: 'Application Notes' },
    ],
    manufacturingLocations: [
      { location: 'Nagaokakyo, Japan', type: 'fab' },
      { location: 'Yokaichi, Japan', type: 'fab' },
      { location: 'Izumo, Japan', type: 'fab' },
      { location: 'Wuxi, China', type: 'assembly_test' },
      { location: 'Philippines', type: 'assembly_test' },
    ],
    authorizedDistributors: dist(['Digi-Key', 'Mouser', 'Arrow', 'Avnet', 'Newark', 'Farnell']),
    complianceFlags: ['RoHS', 'REACH', 'Halogen-Free', 'Conflict-Free Minerals'],
    summary: 'Global leader in ceramic passive components. Murata dominates the MLCC market with the widest range of capacitance values, voltage ratings, and package sizes. Known for ultra-miniature components and automotive-grade reliability.',
  },
  {
    id: 'samsung-electro-mechanics',
    name: 'Samsung Electro-Mechanics',
    logoUrl: 'https://logo.clearbit.com/samsungsem.com',
    headquarters: 'Suwon, South Korea',
    country: 'South Korea',
    countryFlag: '\u{1F1F0}\u{1F1F7}',
    foundedYear: 1973,
    catalogSize: 85000,
    familyCount: 32,
    distributorCount: 25,
    isSecondSource: false,
    productCategories: ['MLCCs', 'Chip Inductors', 'Chip Resistors', 'Camera Modules', 'Substrates'],
    certifications: [
      { name: 'IATF 16949', category: 'automotive' },
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
      { name: 'AEC-Q200', category: 'automotive' },
    ],
    designResources: [
      { type: 'SPICE Models' },
      { type: 'Selection Guides' },
      { type: 'CAD Libraries' },
    ],
    manufacturingLocations: [
      { location: 'Suwon, South Korea', type: 'fab' },
      { location: 'Tianjin, China', type: 'fab' },
      { location: 'Philippines', type: 'assembly_test' },
    ],
    authorizedDistributors: dist(['Digi-Key', 'Mouser', 'Arrow', 'Avnet']),
    complianceFlags: ['RoHS', 'REACH', 'Halogen-Free'],
    summary: 'Major MLCC producer and part of the Samsung Group. Strong in high-capacitance MLCCs and automotive-grade components. Second largest MLCC manufacturer globally with significant investment in next-gen dielectrics.',
  },
  {
    id: 'yageo',
    name: 'Yageo',
    logoUrl: 'https://logo.clearbit.com/yageo.com',
    headquarters: 'New Taipei City, Taiwan',
    country: 'Taiwan',
    countryFlag: '\u{1F1F9}\u{1F1FC}',
    foundedYear: 1977,
    catalogSize: 95000,
    familyCount: 38,
    distributorCount: 30,
    isSecondSource: false,
    productCategories: ['MLCCs', 'Chip Resistors', 'Chip Inductors', 'Tantalum Capacitors', 'Film Capacitors', 'Ferrite Beads'],
    certifications: [
      { name: 'IATF 16949', category: 'automotive' },
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
      { name: 'AEC-Q200', category: 'automotive' },
    ],
    designResources: [
      { type: 'Selection Guides' },
      { type: 'CAD Libraries' },
      { type: 'Application Notes' },
    ],
    manufacturingLocations: [
      { location: 'Kaohsiung, Taiwan', type: 'fab' },
      { location: 'Suzhou, China', type: 'fab' },
      { location: 'Batangas, Philippines', type: 'assembly_test' },
    ],
    authorizedDistributors: dist(['Digi-Key', 'Mouser', 'Arrow', 'Avnet', 'Newark']),
    complianceFlags: ['RoHS', 'REACH', 'Halogen-Free', 'Conflict-Free Minerals'],
    summary: 'One of the world\'s largest passive component manufacturers. After acquiring KEMET and Pulse Electronics, Yageo offers a comprehensive portfolio spanning resistors, capacitors, and inductors. Strong presence in automotive and industrial markets.',
  },
  {
    id: 'tdk',
    name: 'TDK Corporation',
    logoUrl: 'https://logo.clearbit.com/tdk.com',
    headquarters: 'Tokyo, Japan',
    country: 'Japan',
    countryFlag: '\u{1F1EF}\u{1F1F5}',
    foundedYear: 1935,
    catalogSize: 110000,
    familyCount: 52,
    distributorCount: 35,
    isSecondSource: false,
    productCategories: ['MLCCs', 'Inductors', 'Ferrite Beads', 'Transformers', 'Film Capacitors', 'Aluminum Electrolytic Capacitors', 'Sensors', 'Power Supplies'],
    certifications: [
      { name: 'IATF 16949', category: 'automotive' },
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
      { name: 'AEC-Q200', category: 'automotive' },
      { name: 'UL', category: 'safety' },
    ],
    designResources: [
      { type: 'SPICE Models' },
      { type: 'Reference Designs' },
      { type: 'Selection Guides' },
      { type: 'Online Simulation' },
      { type: 'CAD Libraries' },
      { type: 'Application Notes' },
    ],
    manufacturingLocations: [
      { location: 'Nikaho, Japan', type: 'fab' },
      { location: 'Dalian, China', type: 'fab' },
      { location: 'Zhuhai, China', type: 'assembly_test' },
      { location: 'Philippines', type: 'assembly_test' },
    ],
    authorizedDistributors: dist(['Digi-Key', 'Mouser', 'Arrow', 'Avnet', 'Newark', 'Farnell']),
    complianceFlags: ['RoHS', 'REACH', 'Halogen-Free', 'Conflict-Free Minerals'],
    summary: 'Pioneer in ferrite technology and a major diversified electronic components manufacturer. TDK excels in inductors, ferrite beads, and capacitors. Strong presence in automotive, industrial, and consumer electronics through brands including TDK, EPCOS, and InvenSense.',
  },
  {
    id: 'kemet',
    name: 'KEMET',
    logoUrl: 'https://logo.clearbit.com/kemet.com',
    headquarters: 'Fort Lauderdale, FL, USA',
    country: 'USA',
    countryFlag: '\u{1F1FA}\u{1F1F8}',
    foundedYear: 1919,
    catalogSize: 70000,
    familyCount: 28,
    distributorCount: 22,
    isSecondSource: false,
    productCategories: ['MLCCs', 'Tantalum Capacitors', 'Polymer Capacitors', 'Film Capacitors', 'Aluminum Electrolytic Capacitors', 'EMI Filters'],
    certifications: [
      { name: 'IATF 16949', category: 'automotive' },
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
      { name: 'AEC-Q200', category: 'automotive' },
      { name: 'MIL-PRF-55681', category: 'military' },
    ],
    designResources: [
      { type: 'SPICE Models' },
      { type: 'Selection Guides' },
      { type: 'Online Simulation' },
      { type: 'Application Notes' },
    ],
    manufacturingLocations: [
      { location: 'Simpsonville, SC, USA', type: 'fab' },
      { location: 'Matamoros, Mexico', type: 'fab' },
      { location: 'Suzhou, China', type: 'assembly_test' },
    ],
    authorizedDistributors: dist(['Digi-Key', 'Mouser', 'Arrow', 'Avnet', 'Newark']),
    complianceFlags: ['RoHS', 'REACH', 'ITAR-compliant', 'Conflict-Free Minerals'],
    summary: 'A Yageo company specializing in capacitor technologies. Known for their polymer, tantalum, and film capacitor expertise. KEMET offers strong flex-termination MLCC options and is a trusted supplier for defense/aerospace applications.',
  },
  {
    id: 'vishay',
    name: 'Vishay Dale',
    logoUrl: 'https://logo.clearbit.com/vishay.com',
    headquarters: 'Malvern, PA, USA',
    country: 'USA',
    countryFlag: '\u{1F1FA}\u{1F1F8}',
    foundedYear: 1962,
    catalogSize: 130000,
    familyCount: 55,
    distributorCount: 40,
    isSecondSource: false,
    productCategories: ['Chip Resistors', 'Wirewound Resistors', 'Current Sense Resistors', 'MLCCs', 'Film Capacitors', 'Inductors', 'Diodes', 'MOSFETs'],
    certifications: [
      { name: 'IATF 16949', category: 'automotive' },
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
      { name: 'AEC-Q200', category: 'automotive' },
      { name: 'MIL-PRF-55342', category: 'military' },
    ],
    designResources: [
      { type: 'SPICE Models' },
      { type: 'Reference Designs' },
      { type: 'Selection Guides' },
      { type: 'CAD Libraries' },
      { type: 'Application Notes' },
    ],
    manufacturingLocations: [
      { location: 'Columbus, NE, USA', type: 'fab' },
      { location: 'Selb, Germany', type: 'fab' },
      { location: 'Tianjin, China', type: 'assembly_test' },
      { location: 'Israel', type: 'fab' },
    ],
    authorizedDistributors: dist(['Digi-Key', 'Mouser', 'Arrow', 'Avnet', 'Newark', 'Farnell', 'TTI']),
    complianceFlags: ['RoHS', 'REACH', 'ITAR-compliant', 'Conflict-Free Minerals'],
    summary: 'One of the largest manufacturers of discrete semiconductors and passive components. The Dale brand is synonymous with precision resistors. Vishay offers the broadest portfolio of resistors, inductors, and capacitors across all tolerance ranges.',
  },
  {
    id: 'cctc',
    name: 'CCTC (China Component Technology Co.)',
    headquarters: 'Shenzhen, China',
    country: 'China',
    countryFlag: '\u{1F1E8}\u{1F1F3}',
    foundedYear: 2001,
    catalogSize: 25000,
    familyCount: 12,
    distributorCount: 8,
    isSecondSource: true,
    productCategories: ['MLCCs', 'Chip Resistors'],
    certifications: [
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
      { name: 'AEC-Q200', category: 'automotive' },
    ],
    designResources: [
      { type: 'Selection Guides' },
    ],
    manufacturingLocations: [
      { location: 'Shenzhen, China', type: 'both' },
      { location: 'Dongguan, China', type: 'fab' },
    ],
    authorizedDistributors: dist(['LCSC', 'Szlcsc']),
    complianceFlags: ['RoHS', 'REACH'],
    summary: 'Chinese MLCC manufacturer focused on cost-competitive alternatives to Japanese and Korean brands. Strong in standard capacitance values with growing automotive qualification portfolio. Popular in Chinese domestic market and increasingly exported globally.',
  },
  {
    id: 'fenghua',
    name: 'Fenghua Advanced Technology',
    headquarters: 'Zhaoqing, Guangdong, China',
    country: 'China',
    countryFlag: '\u{1F1E8}\u{1F1F3}',
    foundedYear: 1994,
    catalogSize: 35000,
    familyCount: 18,
    distributorCount: 12,
    isSecondSource: true,
    productCategories: ['MLCCs', 'Chip Resistors', 'Chip Inductors', 'Varistors', 'Thermistors'],
    certifications: [
      { name: 'IATF 16949', category: 'automotive' },
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
    ],
    designResources: [
      { type: 'Selection Guides' },
      { type: 'Application Notes' },
    ],
    manufacturingLocations: [
      { location: 'Zhaoqing, Guangdong, China', type: 'both' },
      { location: 'Huizhou, Guangdong, China', type: 'fab' },
    ],
    authorizedDistributors: dist(['LCSC', 'Digi-Key', 'Mouser']),
    complianceFlags: ['RoHS', 'REACH', 'Halogen-Free'],
    summary: 'Leading Chinese passive component manufacturer. Publicly listed (SHE: 000636), Fenghua produces MLCCs, chip resistors, and inductors. One of the first Chinese manufacturers to achieve IATF 16949 automotive certification. Active second-source for Japanese and Korean parts.',
  },
  {
    id: 'three-circle',
    name: 'Three-Circle (Sanyuan)',
    headquarters: 'Chaozhou, Guangdong, China',
    country: 'China',
    countryFlag: '\u{1F1E8}\u{1F1F3}',
    foundedYear: 1970,
    catalogSize: 20000,
    familyCount: 10,
    distributorCount: 6,
    isSecondSource: true,
    productCategories: ['MLCCs', 'Ceramic Substrates', 'Electronic Ceramics'],
    certifications: [
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
    ],
    designResources: [
      { type: 'Selection Guides' },
    ],
    manufacturingLocations: [
      { location: 'Chaozhou, Guangdong, China', type: 'both' },
    ],
    authorizedDistributors: dist(['LCSC']),
    complianceFlags: ['RoHS', 'REACH'],
    summary: 'One of China\'s original ceramic component manufacturers. State-owned enterprise focused on MLCC production for consumer and industrial markets. Known for competitive pricing on standard-grade ceramic capacitors.',
  },
  {
    id: 'stackpole',
    name: 'Stackpole Electronics',
    logoUrl: 'https://logo.clearbit.com/seielect.com',
    headquarters: 'Raleigh, NC, USA',
    country: 'USA',
    countryFlag: '\u{1F1FA}\u{1F1F8}',
    foundedYear: 1928,
    catalogSize: 15000,
    familyCount: 8,
    distributorCount: 15,
    isSecondSource: false,
    productCategories: ['Chip Resistors', 'Current Sense Resistors', 'Thin Film Resistors', 'Anti-Surge Resistors'],
    certifications: [
      { name: 'IATF 16949', category: 'automotive' },
      { name: 'ISO 9001', category: 'quality' },
      { name: 'AEC-Q200', category: 'automotive' },
    ],
    designResources: [
      { type: 'Selection Guides' },
      { type: 'Application Notes' },
    ],
    manufacturingLocations: [
      { location: 'Ciudad Juarez, Mexico', type: 'both' },
    ],
    authorizedDistributors: dist(['Digi-Key', 'Mouser', 'Arrow', 'Newark']),
    complianceFlags: ['RoHS', 'REACH', 'Conflict-Free Minerals'],
    summary: 'Specialized resistor manufacturer known for high-quality chip resistors and current sense resistors. A subsidiary of SEI (Stackpole Electronics Inc.), focused on automotive and industrial resistor applications with competitive pricing.',
  },
  {
    id: 'panasonic',
    name: 'Panasonic',
    logoUrl: 'https://logo.clearbit.com/panasonic.com',
    headquarters: 'Kadoma, Osaka, Japan',
    country: 'Japan',
    countryFlag: '\u{1F1EF}\u{1F1F5}',
    foundedYear: 1918,
    catalogSize: 100000,
    familyCount: 48,
    distributorCount: 35,
    isSecondSource: false,
    productCategories: ['Aluminum Electrolytic Capacitors', 'Film Capacitors', 'MLCCs', 'Chip Resistors', 'Inductors', 'Relays', 'Connectors', 'Sensors'],
    certifications: [
      { name: 'IATF 16949', category: 'automotive' },
      { name: 'ISO 9001', category: 'quality' },
      { name: 'ISO 14001', category: 'environmental' },
      { name: 'AEC-Q200', category: 'automotive' },
      { name: 'UL', category: 'safety' },
    ],
    designResources: [
      { type: 'SPICE Models' },
      { type: 'Selection Guides' },
      { type: 'Online Simulation' },
      { type: 'CAD Libraries' },
      { type: 'Application Notes' },
    ],
    manufacturingLocations: [
      { location: 'Osaka, Japan', type: 'fab' },
      { location: 'Suzhou, China', type: 'fab' },
      { location: 'Thailand', type: 'assembly_test' },
      { location: 'Indonesia', type: 'assembly_test' },
    ],
    authorizedDistributors: dist(['Digi-Key', 'Mouser', 'Arrow', 'Avnet', 'Newark', 'Farnell']),
    complianceFlags: ['RoHS', 'REACH', 'Halogen-Free', 'Conflict-Free Minerals'],
    summary: 'Major Japanese electronics conglomerate with a broad passive component portfolio. Particularly strong in aluminum electrolytic capacitors, film capacitors, and resistors. Panasonic Industry Solutions serves automotive, industrial, and consumer markets worldwide.',
  },
];

// Build lookup map with normalized name keys
const profileMap = new Map<string, ManufacturerProfile>();
for (const profile of profiles) {
  profileMap.set(profile.id, profile);
  profileMap.set(profile.name.toLowerCase().trim(), profile);
  // Also index by common short names
  const shortName = profile.name.split('(')[0].trim().toLowerCase();
  if (shortName !== profile.name.toLowerCase().trim()) {
    profileMap.set(shortName, profile);
  }
}

// Add common name variants
profileMap.set('vishay dale', profiles.find(p => p.id === 'vishay')!);
profileMap.set('vishay', profiles.find(p => p.id === 'vishay')!);
profileMap.set('samsung', profiles.find(p => p.id === 'samsung-electro-mechanics')!);
profileMap.set('samsung electro-mechanics', profiles.find(p => p.id === 'samsung-electro-mechanics')!);
profileMap.set('murata', profiles.find(p => p.id === 'murata')!);
profileMap.set('murata manufacturing', profiles.find(p => p.id === 'murata')!);
profileMap.set('tdk', profiles.find(p => p.id === 'tdk')!);
profileMap.set('tdk corporation', profiles.find(p => p.id === 'tdk')!);
profileMap.set('sanyuan', profiles.find(p => p.id === 'three-circle')!);
profileMap.set('three-circle', profiles.find(p => p.id === 'three-circle')!);
profileMap.set('stackpole electronics', profiles.find(p => p.id === 'stackpole')!);
profileMap.set('stackpole', profiles.find(p => p.id === 'stackpole')!);
profileMap.set('fenghua advanced technology', profiles.find(p => p.id === 'fenghua')!);
profileMap.set('fenghua', profiles.find(p => p.id === 'fenghua')!);

export function getManufacturerProfile(name: string): ManufacturerProfile | null {
  return profileMap.get(name.toLowerCase().trim()) ?? null;
}
