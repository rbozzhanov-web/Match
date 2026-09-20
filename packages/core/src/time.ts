/**
 * Local date and interval primitives used for display and same-station intersections.
 * Cross-station movements are ordered in UTC by roster/location.ts before projecting free
 * intervals back into the station's local clock. These helpers never compare different zones.
 */

const HHMM_PATTERN = /^([0-1]?\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MINUTES_PER_DAY = 1440;

/** A half-open interval of minutes, `[start, end)`, measured from midnight of a given day. */
export interface Interval {
  start: number;
  end: number;
}

/** Parses "HH:MM" into minutes from midnight. Returns null if the string isn't a valid time. */
export function hhmmToMinutes(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = HHMM_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Formats minutes from midnight as "HH:MM", wrapping past a day so 25:30 prints as 01:30. */
export function minutesToHHMM(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) return '00:00';
  const wrapped = ((Math.round(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** Formats a duration in minutes the way the app speaks about time together: "2h 30m". */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function isIsoDate(value: string | undefined | null): value is string {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Days since the epoch for an ISO date. The engine's day arithmetic all goes through this. */
export function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function dateFromDayNumber(days: number): string {
  const date = new Date(days * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + days);
}

/** Every date from `start` to `end`, both ends included. An inverted range yields nothing. */
export function eachDate(start: string, end: string): string[] {
  const from = dayNumber(start);
  const to = dayNumber(end);
  const dates: string[] = [];
  for (let day = from; day <= to; day += 1) dates.push(dateFromDayNumber(day));
  return dates;
}

/** The weekday, 0 = Sunday, matching `Date.prototype.getUTCDay`. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const day = weekday(date);
  return day === 0 || day === 6;
}

/** Merges overlapping and touching intervals into a sorted, disjoint set. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

/** What is left of `within` once every one of `blocks` is taken out of it. */
export function subtractIntervals(within: Interval, blocks: Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = within.start;
  for (const block of mergeIntervals(blocks)) {
    if (block.end <= cursor) continue;
    if (block.start >= within.end) break;
    if (block.start > cursor) free.push({ start: cursor, end: Math.min(block.start, within.end) });
    cursor = Math.max(cursor, block.end);
    if (cursor >= within.end) break;
  }
  if (cursor < within.end) free.push({ start: cursor, end: within.end });
  return free.filter((interval) => interval.end > interval.start);
}

/** The parts of the day both sets of intervals have in common. */
export function intersectIntervals(left: Interval[], right: Interval[]): Interval[] {
  const a = mergeIntervals(left);
  const b = mergeIntervals(right);
  const shared: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (end > start) shared.push({ start, end });
    if (a[i].end < b[j].end) i += 1;
    else j += 1;
  }
  return shared;
}

export function totalMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
}

/** The longest single stretch in a set — the run of time you could actually plan something in. */
export function longestInterval(intervals: Interval[]): Interval | undefined {
  let longest: Interval | undefined;
  for (const interval of intervals) {
    if (!longest || interval.end - interval.start > longest.end - longest.start) longest = interval;
  }
  return longest;
}
