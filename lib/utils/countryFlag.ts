export function countryCodeToFlagEmoji(iso2: string | null | undefined): string {
  if (!iso2 || iso2.length !== 2) return '';
  const upper = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '';
  const A = 0x1f1e6;
  const a = 'A'.charCodeAt(0);
  return String.fromCodePoint(A + upper.charCodeAt(0) - a, A + upper.charCodeAt(1) - a);
}
