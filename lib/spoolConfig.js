// PLACEHOLDER - replace with real spool prices/colors.
// The user will provide actual filament inventory + pricing later. These are
// common Bambu PLA entries with placeholder pricePerKg so the printer page has
// a reference spool list to render today.

import { money } from './catalog';

export const SPOOLS = [
  { id: 'pla_black', name: 'PLA Basic Black', colorHex: '#000000', pricePerKg: 24.99 },
  { id: 'pla_white', name: 'PLA Basic White', colorHex: '#FFFFFF', pricePerKg: 24.99 },
  { id: 'pla_green', name: 'PLA Basic Bambu Green', colorHex: '#00AE42', pricePerKg: 24.99 },
  { id: 'pla_gray', name: 'PLA Basic Gray', colorHex: '#8A8A8A', pricePerKg: 24.99 },
];

// Formatted price per kg, e.g. "$24.99/kg". Reuses catalog's money().
export function spoolPrice(spool) {
  if (!spool || spool.pricePerKg == null) return '';
  return `${money(spool.pricePerKg)}/kg`;
}
