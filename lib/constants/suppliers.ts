/**
 * Display-name normalization for supplier identifiers returned by upstream
 * APIs (FindChips, Mouser, Digikey). Upstream casing is inconsistent —
 * "rs", "ELEMENT14", "stmicro", etc. — so anywhere we render a supplier
 * name to the user (right-panel SupplierCard, chat answers, parts-list
 * columns) goes through `formatSupplierName()` for a consistent look.
 *
 * Some entries intentionally preserve unusual casing (e.g., "element14" is
 * the registered brand spelling — lowercase 'e', no space).
 */

export const SUPPLIER_DISPLAY: Record<string, string> = {
  digikey: 'Digikey',
  mouser: 'Mouser',
  arrow: 'Arrow',
  lcsc: 'LCSC',
  element14: 'element14',
  farnell: 'Farnell',
  newark: 'Newark',
  rs: 'RS Components',
  tme: 'TME',
  avnet: 'Avnet',
  future: 'Future Electronics',
  rochester: 'Rochester',
  rutronik: 'Rutronik',
  verical: 'Verical',
  chip1stop: 'Chip One Stop',
  stmicro: 'Stmicro',
};

/**
 * Resolve a raw supplier identifier to its preferred display name. Falls back
 * to title-casing the first character so unmapped suppliers (e.g., a new
 * distributor FindChips just added) render as "Newdist" rather than "newdist".
 */
export function formatSupplierName(raw: string | undefined | null): string {
  if (!raw) return '';
  const key = raw.toLowerCase();
  if (SUPPLIER_DISPLAY[key]) return SUPPLIER_DISPLAY[key];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
