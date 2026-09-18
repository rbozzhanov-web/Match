import { dayNumber, minutesToHHMM, type Interval } from '@match/core';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today, as the app's own ISO date, read from the device's local clock rather than UTC. */
export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function formatDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[value.getUTCDay()]} ${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]}`;
}

export function formatDayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

export function formatMonth(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  return `${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

/** "Fri 3 – Sun 5 Oct", collapsing to one date when the window is a single day. */
export function formatRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function formatInterval(interval: Interval): string {
  return `${minutesToHHMM(interval.start)}–${minutesToHHMM(interval.end)}`;
}

/** "in 3 days", "tomorrow", "today" — the phrasing a countdown wants. */
export function formatCountdown(from: string, to: string): string {
  const days = dayNumber(to) - dayNumber(from);
  if (days < 0) return 'now';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 14) return 'next week';
  return `in ${Math.round(days / 7)} weeks`;
}
