// TagBooks catalog: products, expense categories, and shared helpers.

export const PRODUCTS = [
  { value: 'basic_kit', label: 'Basic Kit', price: 149, recurring: false },
  { value: 'custom_logo_kit', label: 'Custom Logo Kit', price: 229, recurring: false },
  { value: 'website', label: 'Website', price: 750, recurring: false },
  { value: 'digital_menu', label: 'Digital Menu', price: 249, recurring: false },
  { value: 'custom_menu_package', label: 'Custom Menu Package', price: 349, recurring: false },
  { value: 'care_plan', label: 'Care Plan', price: 39, recurring: true },
  { value: 'site_care', label: 'Site Care', price: 59, recurring: true },
  { value: 'menu_updates', label: 'Menu Updates', price: 29, recurring: true },
  { value: 'logo_stands', label: 'Logo Stands', price: 39, recurring: false },
  { value: 'other', label: 'Other', price: null, recurring: false },
];

export const STAGES = [
  { value: 'lead', label: 'Lead' },
  { value: 'pitched', label: 'Pitched' },
  { value: 'sold', label: 'Sold' },
  { value: 'care_plan', label: 'Care Plan' },
];

export const CATEGORIES = [
  { value: 'hardware_tags', label: 'Hardware & Tags' },
  { value: 'gas', label: 'Gas' },
  { value: 'software', label: 'Software' },
  { value: 'fees', label: 'Fees' },
  { value: 'other', label: 'Other' },
];

// Look up a product by its stored `value`.
export function productByValue(value) {
  return PRODUCTS.find((p) => p.value === value) || null;
}

// Human label for a product value (falls back to the raw value).
export function productLabel(value) {
  const p = productByValue(value);
  return p ? p.label : value || 'Other';
}

// Human label for a client stage value (falls back to the raw value).
export function stageLabel(value) {
  const s = STAGES.find((x) => x.value === value);
  return s ? s.label : value || 'Lead';
}

// Human label for an expense category value (falls back to the raw value).
export function categoryLabel(value) {
  const c = CATEGORIES.find((x) => x.value === value);
  return c ? c.label : value || 'Other';
}

// Currency formatter: money(1234.56) -> "$1,234.56"
export function money(n) {
  const num = Number(n);
  const safe = Number.isFinite(num) ? num : 0;
  return safe.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// LOCAL date as YYYY-MM-DD. NEVER use toISOString (it shifts to UTC and can
// roll the date backwards in the evening US Eastern).
export function localToday() {
  return ymd(new Date());
}

// Format any Date into a LOCAL YYYY-MM-DD string.
export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// First and last LOCAL YYYY-MM-DD of a given year/monthIndex (0-11).
// Built by hand so month comparisons never touch UTC.
export function monthRange(year, monthIndex) {
  const first = ymd(new Date(year, monthIndex, 1));
  // Day 0 of the next month == last day of this month, in LOCAL time.
  const last = ymd(new Date(year, monthIndex + 1, 0));
  return { first, last };
}

// "July 2026" style label for a year/monthIndex.
export function monthLabel(year, monthIndex) {
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

// Just the month name, e.g. "JULY".
export function monthName(monthIndex) {
  return MONTH_NAMES[monthIndex];
}

// Format a stored YYYY-MM-DD as a short LOCAL display like "Jul 22".
// Parse the parts manually so we don't construct a UTC-midnight Date.
export function shortDate( dateStr ) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const short = MONTH_NAMES[m - 1].slice(0, 3);
  return `${short} ${d}`;
}
