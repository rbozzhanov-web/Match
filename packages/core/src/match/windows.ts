import { addDays, formatDuration, type Interval, intersectIntervals } from '../time';
import { matchOneDay, type MatchDay, type MatchQuality } from './matchDays';

/**
 * A run of consecutive days together.
 *
 * Days are what the roster deals in; windows are what people actually plan around. Three days off
 * in a row is not three separate evenings, it is a trip — and the difference only shows once the
 * matched days are grouped back into the stretches they came in.
 */
export interface TogetherWindow {
  start: string;
  end: string;
  /** Every date in the window, in order. */
  dates: string[];
  days: number;
  /** Nights you are both in the same place at the end of and the start of the next day. */
  nights: number;
  /** Total shared time across the window. */
  minutes: number;
  station: string;
  kind: 'home' | 'layover';
  /** True when any day in the run rests on a standby that could be called. */
  tentative: boolean;
  /** The best grade any single day in the run reaches. */
  quality: MatchQuality;
  /** The shared hours common to every day of the run, where the run has any. */
  commonHours?: Interval;
  headline: string;
}

const QUALITY_ORDER: MatchQuality[] = ['brief', 'morning', 'evening', 'half-day', 'most-of-day', 'whole-day'];

/**
 * Groups matched days into consecutive runs.
 *
 * A run breaks on a gap in the dates, and also on a change of station: a Thursday at home and a
 * Friday in Dubai are two different kinds of time together even when they touch, and calling them
 * one two-day window would describe a trip that never happened.
 */
export function togetherWindows(days: MatchDay[]): TogetherWindow[] {
  const matched = days.filter(day => day.matched).flatMap(day => {
    if (!day.sessions?.length) return [day];
    return day.sessions.map(session => matchOneDay(
      { ...day.you, locations: day.you.locations?.filter(slot => slot.station === session.station) },
      { ...day.them, locations: day.them.locations?.filter(slot => slot.station === session.station) },
      { minimumMinutes: 0 },
    ));
  }).sort((a, b) => (a.station ?? '').localeCompare(b.station ?? '') || a.date.localeCompare(b.date));
  const windows: TogetherWindow[] = [];
  let run: MatchDay[] = [];

  const flush = () => {
    if (run.length) windows.push(toWindow(run));
    run = [];
  };

  for (const day of matched) {
    const previous = run[run.length - 1];
    const continues = previous
      && addDays(previous.date, 1) === day.date
      && previous.station === day.station;
    if (!continues) flush();
    run.push(day);
  }
  flush();

  return windows.sort((a,b) => a.start.localeCompare(b.start) || a.station.localeCompare(b.station));
}

/** The longest run in a set — the one worth booking something around. */
export function longestWindow(windows: TogetherWindow[]): TogetherWindow | undefined {
  return windows.reduce<TogetherWindow | undefined>(
    (best, window) => (!best || window.days > best.days || (window.days === best.days && window.minutes > best.minutes) ? window : best),
    undefined,
  );
}

/** The next run starting on or spanning `from`. */
export function nextWindow(windows: TogetherWindow[], from: string): TogetherWindow | undefined {
  return windows.find((window) => window.end >= from);
}

function toWindow(run: MatchDay[]): TogetherWindow {
  const first = run[0];
  const last = run[run.length - 1];
  const minutes = run.reduce((sum, day) => sum + day.minutes, 0);
  const quality = run.reduce<MatchQuality>(
    (best, day) => (day.quality && QUALITY_ORDER.indexOf(day.quality) > QUALITY_ORDER.indexOf(best) ? day.quality : best),
    'brief',
  );
  const common = run
    .map((day) => day.overlap)
    .reduce((shared, overlap) => intersectIntervals(shared, overlap));
  const commonHours = common.length
    ? common.reduce((widest, interval) => (interval.end - interval.start > widest.end - widest.start ? interval : widest))
    : undefined;

  return {
    start: first.date,
    end: last.date,
    dates: run.map((day) => day.date),
    days: run.length,
    // A night belongs to the gap between two consecutive days together, so a single day has none.
    nights: run.slice(1).filter((day, i) => {
      const previous = run[i];
      const free = (person: MatchDay['you'], start: number, end: number) => person.fullDayLocations?.some(slot => slot.station === first.station && slot.start <= start && slot.end >= end);
      return free(previous.you, 23 * 60, 1440) && free(previous.them, 23 * 60, 1440) && free(day.you, 0, 8 * 60) && free(day.them, 0, 8 * 60);
    }).length,
    minutes,
    station: first.station ?? '',
    kind: first.kind ?? 'home',
    tentative: run.some((day) => day.tentative),
    quality,
    commonHours,
    headline: headlineFor(run.length, minutes, first.kind ?? 'home', first.station ?? ''),
  };
}

function headlineFor(days: number, minutes: number, kind: 'home' | 'layover', station: string): string {
  const where = kind === 'layover' ? ` in ${station}` : '';
  if (days === 1) return `One day together${where} · ${formatDuration(minutes)}`;
  return `${days} days together${where} · ${formatDuration(minutes)}`;
}
