import {
  type Interval,
  intersectIntervals,
  longestInterval,
  minutesToHHMM,
  totalMinutes,
} from '../time';
import { availabilityByDate, type DayAvailability } from '../roster/availability';

/**
 * How much of a day two people actually get.
 *
 * The grades are about what you can do with the time, not about how the roster printed it: a
 * `whole-day` is a day to leave the city on, an `evening` is dinner, a `brief` is a couple of
 * hours that are worth knowing about but not worth booking anything for.
 */
export type MatchQuality = 'whole-day' | 'most-of-day' | 'half-day' | 'evening' | 'morning' | 'brief';

/** Why a day did not match, in the order the engine rules it out. */
export type MissReason =
  | 'no-roster'
  | 'different-stations'
  | 'both-working'
  | 'too-short';

export interface MatchDay {
  date: string;
  matched: boolean;
  /** Where the two of you are on a matched day. Undefined when you are not in the same place. */
  station?: string;
  /** `home` is at base, `layover` is the rarer gift: both down route in the same city. */
  kind?: 'home' | 'layover';
  /** The shared free time, in station-local minutes from midnight. */
  overlap: Interval[];
  minutes: number;
  /** The longest unbroken stretch — the one you can actually plan inside. */
  longest?: Interval;
  quality?: MatchQuality;
  /** One or both of you is on standby, so the day is real but revocable. */
  tentative: boolean;
  /** Set when a matched day carries something worth saying out loud, such as sick leave. */
  caution?: string;
  headline: string;
  reason?: MissReason;
  you: DayAvailability;
  them: DayAvailability;
}

export interface MatchOptions {
  /**
   * The least shared time a day needs before the app will call it a day together. Below this the
   * day is reported honestly as too short rather than padded into the count.
   */
  minimumMinutes?: number;
  /** Count days where both of you are down route in the same city. */
  allowLayoverMatches?: boolean;
  /** Count days where one of you is on standby. They are marked tentative either way. */
  includeStandby?: boolean;
}

export const DEFAULT_MATCH_OPTIONS: Required<MatchOptions> = {
  minimumMinutes: 120,
  allowLayoverMatches: true,
  includeStandby: true,
};

/**
 * Fills in whatever the caller did not set.
 *
 * Deliberately not a spread. `{ ...defaults, ...options }` keeps a key whose value is `undefined`,
 * so a caller passing `allowLayoverMatches: settings.allowLayoverMatches` from a settings object
 * that happens not to carry the field overwrites the default with `undefined` — which is falsy,
 * and silently turns shared layovers off. The symptom is a feature that simply never fires, with
 * nothing anywhere to say why.
 */
function resolveMatchOptions(options: MatchOptions): Required<MatchOptions> {
  return {
    minimumMinutes: options.minimumMinutes ?? DEFAULT_MATCH_OPTIONS.minimumMinutes,
    allowLayoverMatches: options.allowLayoverMatches ?? DEFAULT_MATCH_OPTIONS.allowLayoverMatches,
    includeStandby: options.includeStandby ?? DEFAULT_MATCH_OPTIONS.includeStandby,
  };
}

/** States that can never be shared, whatever the clock says. */
const UNAVAILABLE: ReadonlySet<string> = new Set(['unknown']);

/**
 * Finds every day the two of you can be in the same place at the same time.
 *
 * Both rosters are read as day timelines first, so this reduces to three questions per date: is
 * either day unknown, are you in the same station, and does your free time overlap. Everything
 * subtle — overnight duties, the sleep a 05:00 report eats out of last night, a second layover day
 * the roster prints nothing on — has already been settled by the availability engine.
 */
export function matchDays(
  you: DayAvailability[],
  them: DayAvailability[],
  options: MatchOptions = {},
): MatchDay[] {
  const settings = resolveMatchOptions(options);
  const theirs = availabilityByDate(them);

  const days: MatchDay[] = [];
  for (const mineDay of you) {
    const theirDay = theirs.get(mineDay.date);
    if (!theirDay) continue;
    days.push(matchOneDay(mineDay, theirDay, settings));
  }
  return days;
}

/** The single-day rule, exposed so a calendar cell can ask about one date without matching a month. */
export function matchOneDay(
  you: DayAvailability,
  them: DayAvailability,
  options: MatchOptions = {},
): MatchDay {
  const settings = resolveMatchOptions(options);
  const miss = (reason: MissReason, headline: string): MatchDay => ({
    date: you.date,
    matched: false,
    overlap: [],
    minutes: 0,
    tentative: false,
    headline,
    reason,
    you,
    them,
  });

  if (UNAVAILABLE.has(you.state) || UNAVAILABLE.has(them.state)) {
    return miss('no-roster', 'No roster for this day');
  }
  if (you.station !== them.station) {
    return miss('different-stations', `${you.station} and ${them.station}`);
  }

  const kind: 'home' | 'layover' = you.atBase && them.atBase ? 'home' : 'layover';
  if (kind === 'layover' && !settings.allowLayoverMatches) {
    return miss('different-stations', `Both down route in ${you.station}`);
  }

  const standby = you.state === 'standby' || them.state === 'standby';
  if (standby && !settings.includeStandby) {
    return miss('both-working', 'On standby');
  }

  const overlap = intersectIntervals(you.free, them.free);
  const minutes = totalMinutes(overlap);
  if (!minutes) return miss('both-working', 'Both on duty');
  if (minutes < settings.minimumMinutes) {
    return { ...miss('too-short', `Only ${formatShort(minutes)} together`), overlap, minutes };
  }

  const longest = longestInterval(overlap);
  const span = sociableSpan(you, them);
  const quality = gradeMatch(minutes, span, longest);
  const sick = you.state === 'sick' || them.state === 'sick';

  return {
    date: you.date,
    matched: true,
    station: you.station,
    kind,
    overlap,
    minutes,
    longest,
    quality,
    tentative: standby,
    caution: sick ? 'One of you is on sick leave' : undefined,
    headline: headlineFor(quality, longest, kind, you.station),
    you,
    them,
  };
}

export function matchedDays(days: MatchDay[]): MatchDay[] {
  return days.filter((day) => day.matched);
}

/** Total time together across a run of days. */
export function totalTogetherMinutes(days: MatchDay[]): number {
  return matchedDays(days).reduce((sum, day) => sum + day.minutes, 0);
}

/**
 * The next day the two of you can be together, from `from` onwards.
 *
 * `from` is compared as a plain ISO date, so "today" counts: a day with an evening still in it is
 * the answer people want, not the one after it.
 */
export function nextMatch(days: MatchDay[], from: string): MatchDay | undefined {
  return matchedDays(days).find((day) => day.date >= from);
}

function sociableSpan(you: DayAvailability, them: DayAvailability): number {
  // Both sides are built from the same sociable window, so either one gives its length; the free
  // intervals alone would not, since duty has already been cut out of them.
  const span = Math.max(spanOf(you), spanOf(them));
  return span || 15 * 60;
}

function spanOf(day: DayAvailability): number {
  const all = [...day.free, ...day.busy];
  if (!all.length) return 0;
  const start = Math.min(...all.map((interval) => interval.start));
  const end = Math.max(...all.map((interval) => interval.end));
  return Math.max(0, end - start);
}

function gradeMatch(minutes: number, span: number, longest: Interval | undefined): MatchQuality {
  const share = span > 0 ? minutes / span : 0;
  if (share >= 0.9) return 'whole-day';
  if (share >= 0.6) return 'most-of-day';
  if (longest) {
    if (longest.start >= 16 * 60) return 'evening';
    if (longest.end <= 14 * 60) return 'morning';
  }
  if (share >= 0.35) return 'half-day';
  return 'brief';
}

function headlineFor(
  quality: MatchQuality,
  longest: Interval | undefined,
  kind: 'home' | 'layover',
  station: string,
): string {
  const where = kind === 'layover' ? ` in ${station}` : '';
  const window = longest ? ` · ${minutesToHHMM(longest.start)}–${minutesToHHMM(longest.end)}` : '';
  switch (quality) {
    case 'whole-day':
      return `All day together${where}`;
    case 'most-of-day':
      return `Most of the day together${where}`;
    case 'half-day':
      return `Half a day together${where}${window}`;
    case 'evening':
      return `Evening together${where}${window}`;
    case 'morning':
      return `Morning together${where}${window}`;
    default:
      return `A few hours together${where}${window}`;
  }
}

function formatShort(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
