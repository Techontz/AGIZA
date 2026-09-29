/** Display helpers. Amounts arrive from the API as decimal strings and are only formatted here, never computed. */

export function money(value: string | number | null | undefined, currency = 'TZS'): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const whole = Math.round(amount) === amount || currency === 'TZS';
  const text = amount.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `${currency} ${text}`;
}

export function isFree(value: string | null | undefined) {
  return value !== null && value !== undefined && Number(value) === 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function date(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date(value)}, ${hh}:${mm}`;
}

/** Local phone input → what the API accepts (the server normalises it; this only trims). */
export function cleanPhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}
