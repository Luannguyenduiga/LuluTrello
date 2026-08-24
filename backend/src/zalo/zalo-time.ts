/**
 * Small timezone helpers built on Intl, so the assistant can think in the
 * team's local time (Asia/Ho_Chi_Minh by default) without pulling in a date
 * library. Node ships full ICU, so named zones are available out of the box.
 */

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsIn(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const raw: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') raw[part.type] = part.value;
  }

  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    // 'en-US' with hour12:false renders midnight as 24, which must fold to 0.
    hour: Number(raw.hour) % 24,
    minute: Number(raw.minute),
    second: Number(raw.second),
  };
}

/** 'YYYY-MM-DD' in the given zone - used to decide what counts as "today". */
export function dateKey(date: Date, timeZone: string): string {
  const { year, month, day } = partsIn(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 'DD/MM/YYYY', the format the report is read in. */
export function formatDate(date: Date, timeZone: string): string {
  const { year, month, day } = partsIn(date, timeZone);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** 'DD/MM' - deadlines inside an activity line, where the year is noise. */
export function formatDayMonth(date: Date, timeZone: string): string {
  const { month, day } = partsIn(date, timeZone);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/** 'HH:MM' in the given zone. */
export function formatTime(date: Date, timeZone: string): string {
  const { hour, minute } = partsIn(date, timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Parses 'HH:MM'; falls back to the given default when the value is unusable. */
export function parseTimeOfDay(
  value: string | undefined,
  fallback: string,
): { hour: number; minute: number } {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value || '');
  const source = match ? match : /^(\d{1,2}):(\d{2})$/.exec(fallback)!;
  const hour = Number(source[1]);
  const minute = Number(source[2]);
  if (hour > 23 || minute > 59) {
    const [h, m] = fallback.split(':');
    return { hour: Number(h), minute: Number(m) };
  }
  return { hour, minute };
}

/** Milliseconds from `now` until the next HH:MM in `timeZone` (never 0). */
export function msUntilNext(
  hour: number,
  minute: number,
  timeZone: string,
  now = new Date(),
): number {
  const current = partsIn(now, timeZone);
  const nowSeconds = current.hour * 3600 + current.minute * 60 + current.second;
  const targetSeconds = hour * 3600 + minute * 60;
  const dayInSeconds = 24 * 3600;
  let delta = targetSeconds - nowSeconds;
  if (delta <= 0) delta += dayInSeconds;
  return delta * 1000;
}

/** Whole days from `now` to an ISO date, in the given zone; negative = overdue. */
export function daysUntil(isoDate: string, timeZone: string, now = new Date()): number | null {
  const due = new Date(isoDate);
  if (Number.isNaN(due.getTime())) return null;
  const toUtcDays = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000;
  return Math.round(toUtcDays(dateKey(due, timeZone)) - toUtcDays(dateKey(now, timeZone)));
}
