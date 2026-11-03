/**
 * Calendar-date helpers. Expiry dates are calendar days ("2026-10-20"), not instants,
 * so all arithmetic is done on UTC-midnight values to avoid daylight-saving and
 * time-zone drift.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/** True if year/month/day is a real calendar date. */
export function isValidYMD(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function toISODate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parses "YYYY-MM-DD" into parts, or null if it is not a real date. */
export function parseISODate(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return isValidYMD(year, month, day) ? { year, month, day } : null;
}

export function isValidISODate(value: string | null | undefined): boolean {
  return parseISODate(value) !== null;
}

function toUTCms(value: string): number {
  const p = parseISODate(value);
  if (!p) throw new RangeError(`Invalid date: ${value}`);
  return Date.UTC(p.year, p.month - 1, p.day);
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function diffInDays(from: string, to: string): number {
  return Math.round((toUTCms(to) - toUTCms(from)) / MS_PER_DAY);
}

export function addDays(date: string, days: number): string {
  const d = new Date(toUTCms(date) + days * MS_PER_DAY);
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Adds calendar months, clamping to the end of the month
 * (31 Jan + 1 month = 28/29 Feb), the usual reading of "best before N months".
 */
export function addMonths(date: string, months: number): string {
  const p = parseISODate(date);
  if (!p) throw new RangeError(`Invalid date: ${date}`);
  const total = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return toISODate(year, month, Math.min(p.day, daysInMonth(year, month)));
}

/** Today's calendar date in the given IANA time zone (defaults to the runtime's zone). */
export function todayISO(timeZone?: string, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
}

/** "20 Oct 2026" */
export function formatDate(value: string | null | undefined): string {
  const p = parseISODate(value);
  if (!p) return "Not set";
  return `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year}`;
}

/** "20 October 2026" */
export function formatDateLong(value: string | null | undefined): string {
  const p = parseISODate(value);
  if (!p) return "Not set";
  return `${p.day} ${MONTHS_LONG[p.month - 1]} ${p.year}`;
}

/** Formats an ISO timestamp as a short local date. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Converts an ISO timestamp to the local calendar date (YYYY-MM-DD). */
export function timestampToLocalISODate(value: string): string {
  const d = new Date(value);
  return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export { MONTHS_SHORT, MONTHS_LONG };
