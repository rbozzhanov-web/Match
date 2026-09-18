import {
  MINUTES_PER_DAY,
  addDays,
  dayNumber,
  eachDate,
  hhmmToMinutes,
  type Interval,
  mergeIntervals,
  subtractIntervals,
  totalMinutes,
} from '../time';
import { classifyDayCode, describeDayCode } from './dayCodes';
import { rosterCoverage, type Roster, type RosterFlight } from './contract';

/**
 * How a day reads for someone who wants to be in it with you.
 *
 * `free` and `leave` are days at home with nothing rostered. `standby` is at home but on call.
 * `duty` is a working day that still starts and ends at base, so an evening can survive it.
 * `away` is down route: the day still has free hours in it, but they are free hours in another
 * city, and only someone standing in that same city can share them. `unknown` is a day no
 * imported roster covers, and it never matches: an empty calendar is silence, not a promise.
 */
export type DayState = 'free' | 'leave' | 'standby' | 'sick' | 'duty' | 'away' | 'unknown';

export interface DayFlight {
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  deadhead: boolean;
}

export interface DayAvailability {
  date: string;
  state: DayState;
  /** Where the person is at the end of this day. */
  station: string;
  atBase: boolean;
  /** Roster code for the day, where it had one. */
  code?: string;
  /** Short human label: "Day off", "Standby", "KC931 ALA→DXB". */
  label: string;
  /** Time already spoken for, in station-local minutes from midnight. */
  busy: Interval[];
  /** What is left of the sociable day once duty and its buffers are taken out. */
  free: Interval[];
  freeMinutes: number;
  flights: DayFlight[];
}

export interface AvailabilityOptions {
  /** The station this person goes home to. */
  base?: string;
  /**
   * Minutes before report that are already gone to sleep and the drive in. This bleeds backwards
   * into the evening before, which is the whole point: a 05:00 report takes the previous night
   * with it, and a match engine that ignored that would keep proposing dinners nobody can go to.
   */
  preDutyBufferMinutes?: number;
  /** Minutes after release before the person is actually home and awake. */
  postDutyBufferMinutes?: number;
  /** Start of the sociable day, in minutes from midnight. Nothing before it counts as time together. */
  dayStartMinutes?: number;
  /** End of the sociable day. */
  dayEndMinutes?: number;
}

export const DEFAULT_AVAILABILITY_OPTIONS: Required<AvailabilityOptions> = {
  base: 'ALA',
  preDutyBufferMinutes: 90,
  postDutyBufferMinutes: 60,
  dayStartMinutes: 8 * 60,
  dayEndMinutes: 23 * 60,
};

interface DutySpan {
  /** Absolute minutes from midnight of the report date, so an overnight duty just runs past 1440. */
  startDate: string;
  start: number;
  end: number;
  flights: RosterFlight[];
}

/**
 * Turns a roster into one entry per covered day.
 *
 * The walk is chronological because position is: the engine knows where someone is at the end of a
 * day only by having followed every sector that got them there. A day with no flights inherits the
 * station the last sector left them at, which is what makes a layover day read as `away` even
 * though the roster prints nothing on it.
 */
export function buildAvailability(roster: Roster, options: AvailabilityOptions = {}): DayAvailability[] {
  // Not a spread: a key explicitly set to `undefined` would replace the default rather than leave
  // it alone, which is how an options object with a missing field silently becomes a zero buffer.
  const settings: Required<AvailabilityOptions> = {
    base: options.base ?? DEFAULT_AVAILABILITY_OPTIONS.base,
    preDutyBufferMinutes: options.preDutyBufferMinutes ?? DEFAULT_AVAILABILITY_OPTIONS.preDutyBufferMinutes,
    postDutyBufferMinutes: options.postDutyBufferMinutes ?? DEFAULT_AVAILABILITY_OPTIONS.postDutyBufferMinutes,
    dayStartMinutes: options.dayStartMinutes ?? DEFAULT_AVAILABILITY_OPTIONS.dayStartMinutes,
    dayEndMinutes: options.dayEndMinutes ?? DEFAULT_AVAILABILITY_OPTIONS.dayEndMinutes,
  };
  const base = (roster.base ?? settings.base).toUpperCase();
  const coverage = rosterCoverage(roster);
  const dates = eachDate(coverage.start, coverage.end);
  if (!dates.length) return [];

  const spans = dutySpans(roster, settings);
  const busyByDate = spreadBusy(spans, settings);
  const stationByDate = trackStations(roster, dates, base);
  const codeByDate = new Map((roster.dayCodes ?? []).map((entry) => [entry.date, entry.code.trim().toUpperCase()]));
  const flightsByDate = groupFlights(roster);

  return dates.map((date) => {
    const station = stationByDate.get(date) ?? base;
    const atBase = station === base;
    const busy = mergeIntervals(busyByDate.get(date) ?? []);
    const flights = flightsByDate.get(date) ?? [];
    const code = codeByDate.get(date);
    const state = resolveState({ code, flights: flights.length > 0, busy, atBase });
    const sociable: Interval = { start: settings.dayStartMinutes, end: settings.dayEndMinutes };
    // Free time is computed wherever the person is, including down route, and the station is
    // carried beside it. Whether that time can be shared is not this layer's question: two people
    // free in Dubai on the same night are as together as two people free at home, and it is the
    // match engine's station check — not a blanked-out day here — that tells the two apart.
    const free = state === 'unknown' ? [] : subtractIntervals(sociable, busy);

    return {
      date,
      state,
      station,
      atBase,
      code,
      label: describeDay({ state, code, flights, station }),
      busy,
      free,
      freeMinutes: totalMinutes(free),
      flights: flights.map(toDayFlight),
    };
  });
}

/** Index an availability run by date, which is how both the match engine and the UI read it. */
export function availabilityByDate(days: DayAvailability[]): Map<string, DayAvailability> {
  return new Map(days.map((day) => [day.date, day]));
}

function resolveState(input: { code?: string; flights: boolean; busy: Interval[]; atBase: boolean }): DayState {
  if (input.code) {
    const kind = classifyDayCode(input.code);
    if (kind === 'rest') return input.atBase ? 'free' : 'away';
    if (kind === 'leave') return 'leave';
    if (kind === 'sick') return 'sick';
    if (kind === 'standby') return 'standby';
  }
  if (!input.atBase) return 'away';
  if (input.flights || input.busy.length) return 'duty';
  return 'free';
}

function describeDay(input: { state: DayState; code?: string; flights: RosterFlight[]; station: string }): string {
  if (input.code) return describeDayCode(input.code);
  if (input.flights.length) {
    const first = input.flights[0];
    const last = input.flights[input.flights.length - 1];
    const number = /^KC/i.test(first.flightNumber) ? first.flightNumber.toUpperCase() : `KC${first.flightNumber}`;
    return `${number} ${first.origin}→${last.destination}`;
  }
  if (input.state === 'away') return `In ${input.station}`;
  return 'Free';
}

function toDayFlight(flight: RosterFlight): DayFlight {
  return {
    flightNumber: /^KC/i.test(flight.flightNumber) ? flight.flightNumber.toUpperCase() : `KC${flight.flightNumber}`,
    origin: flight.origin,
    destination: flight.destination,
    departure: flight.departure,
    arrival: flight.arrival,
    deadhead: Boolean(flight.deadhead),
  };
}

/** Report-to-release spans, widened by the buffers that make a duty cost more than its hours. */
function dutySpans(roster: Roster, settings: Required<AvailabilityOptions>): DutySpan[] {
  const spans: DutySpan[] = [];

  for (const duty of roster.duties) {
    const flights = [...duty.flights].sort((a, b) => stampOf(a).localeCompare(stampOf(b)));
    const first = flights[0];
    const last = flights[flights.length - 1];
    const startStamp = duty.start ?? (first ? `${first.date}T${first.departure}` : undefined);
    const endStamp = duty.end ?? (last ? `${last.arrivalDate ?? last.date}T${last.arrival}` : undefined);
    if (!startStamp || !endStamp) continue;

    const start = offsetFrom(duty.date, startStamp);
    let end = offsetFrom(duty.date, endStamp);
    if (start === undefined || end === undefined) continue;
    // A duty whose release reads earlier than its report crossed midnight without saying so.
    if (end <= start) end += MINUTES_PER_DAY;

    spans.push({
      startDate: duty.date,
      start: start - settings.preDutyBufferMinutes,
      end: end + settings.postDutyBufferMinutes,
      flights,
    });
  }

  for (const ground of roster.groundDuties ?? []) {
    const start = hhmmToMinutes(ground.start);
    const end = hhmmToMinutes(ground.end);
    if (start === null || end === null) {
      // A rostered ground duty the report gives no hours for — a course, an office day, a code the
      // grid printed bare. Something is on that day, and the honest reading of "something, we do
      // not know when" is that the day is spoken for: treating it as free would offer up a day
      // that is not there. No buffers, because there is no report time to run up to.
      spans.push({ startDate: ground.date, start: 0, end: MINUTES_PER_DAY, flights: [] });
      continue;
    }
    spans.push({
      startDate: ground.date,
      start: start - settings.preDutyBufferMinutes,
      end: (end <= start ? end + MINUTES_PER_DAY : end) + settings.postDutyBufferMinutes,
      flights: [],
    });
  }

  return spans;
}

/**
 * Cuts each duty span at midnight and files the pieces under the days they land on.
 *
 * Spans routinely reach outside their own day at both ends — backwards through the pre-duty buffer
 * into last night, forwards through an overnight sector into tomorrow morning — so this walks whole
 * days out from the report date rather than assuming a span fits in one.
 */
function spreadBusy(spans: DutySpan[], settings: Required<AvailabilityOptions>): Map<string, Interval[]> {
  const busy = new Map<string, Interval[]>();
  const add = (date: string, interval: Interval) => {
    if (interval.end <= interval.start) return;
    const existing = busy.get(date);
    if (existing) existing.push(interval);
    else busy.set(date, [interval]);
  };

  for (const span of spans) {
    const firstOffset = Math.floor(span.start / MINUTES_PER_DAY);
    const lastOffset = Math.floor((span.end - 1) / MINUTES_PER_DAY);
    for (let offset = firstOffset; offset <= lastOffset; offset += 1) {
      const dayStart = offset * MINUTES_PER_DAY;
      add(addDays(span.startDate, offset), {
        start: Math.max(span.start, dayStart) - dayStart,
        end: Math.min(span.end, dayStart + MINUTES_PER_DAY) - dayStart,
      });
    }
  }

  // The sociable window is a preference, not a fact about the roster, so it is applied here rather
  // than stored: busy time outside it is real, it simply has nothing to take away.
  void settings;
  return busy;
}

/**
 * Where the person is at the end of each covered day.
 *
 * Starts at base and applies every sector in order. A day the roster prints nothing on inherits
 * yesterday's station, so the second day of a two-day layover is still `away`.
 */
function trackStations(roster: Roster, dates: string[], base: string): Map<string, string> {
  const arrivals = new Map<string, string>();
  const flights = roster.duties
    .flatMap((duty) => duty.flights)
    .sort((a, b) => stampOf(a).localeCompare(stampOf(b)));

  for (const flight of flights) {
    arrivals.set(flight.arrivalDate ?? flight.date, flight.destination.toUpperCase());
  }

  const stations = new Map<string, string>();
  let position = base;
  // A roster whose first sector departs from somewhere else was imported mid-trip; believe it
  // rather than the assumption that everyone starts at home.
  const firstFlight = flights[0];
  if (firstFlight && dayNumber(firstFlight.date) <= dayNumber(dates[0])) {
    position = firstFlight.origin.toUpperCase();
  }

  for (const date of dates) {
    position = arrivals.get(date) ?? position;
    stations.set(date, position);
  }
  return stations;
}

function groupFlights(roster: Roster): Map<string, RosterFlight[]> {
  const byDate = new Map<string, RosterFlight[]>();
  for (const duty of roster.duties) {
    for (const flight of duty.flights) {
      const existing = byDate.get(flight.date);
      if (existing) existing.push(flight);
      else byDate.set(flight.date, [flight]);
    }
  }
  for (const flights of byDate.values()) flights.sort((a, b) => a.departure.localeCompare(b.departure));
  return byDate;
}

function stampOf(flight: RosterFlight): string {
  return `${flight.date}T${flight.departure}`;
}

/** Minutes from midnight of `origin` to the moment a "YYYY-MM-DDTHH:MM" stamp names. */
function offsetFrom(origin: string, stamp: string): number | undefined {
  const [date, time] = stamp.split('T');
  const minutes = hhmmToMinutes(time);
  if (!date || minutes === null) return undefined;
  return (dayNumber(date) - dayNumber(origin)) * MINUTES_PER_DAY + minutes;
}
