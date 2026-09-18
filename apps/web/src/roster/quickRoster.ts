import type { Roster, RosterGroundDuty } from '@match/core';
import { eachDate, isIsoDate, isWeekend } from '@match/core';

/**
 * Rosters for the person who does not fly.
 *
 * Half the couples this app is for are one pilot and one everyone-else, and an AIMS import has
 * nothing to offer the second of them. A working week is a roster too: this turns "these are my
 * days off" into the same contract the match engine reads, so a nine-to-five and a crew roster can
 * be compared without either side being a special case.
 */

export interface QuickRosterInput {
  start: string;
  end: string;
  base?: string;
  /** Dates with nothing on them. Everything else in the range becomes a working day. */
  freeDates: string[];
  /** The working day, station-local. */
  workStart?: string;
  workEnd?: string;
}

export const DEFAULT_WORK_DAY = { start: '09:00', end: '18:00' };

export function buildQuickRoster(input: QuickRosterInput): Roster {
  const free = new Set(input.freeDates.filter(isIsoDate));
  const period = { start: input.start, end: input.end };
  const groundDuties: RosterGroundDuty[] = [];
  const dayCodes = [];

  for (const date of eachDate(input.start, input.end)) {
    if (free.has(date)) {
      dayCodes.push({ date, code: 'OFF' });
      continue;
    }
    groundDuties.push({
      date,
      code: 'WORK',
      start: input.workStart ?? DEFAULT_WORK_DAY.start,
      end: input.workEnd ?? DEFAULT_WORK_DAY.end,
    });
  }

  return {
    period,
    coverage: period,
    duties: [],
    dayCodes,
    groundDuties,
    base: input.base ?? 'ALA',
    importedAt: new Date().toISOString(),
  };
}

/** Weekends off, everything else worked — the starting point most non-crew rosters need. */
export function weekendsOff(start: string, end: string, base = 'ALA'): Roster {
  return buildQuickRoster({ start, end, base, freeDates: eachDate(start, end).filter(isWeekend) });
}

/**
 * Reads pasted lines of "YYYY-MM-DD CODE".
 *
 * Deliberately forgiving about separators and case, and silent about lines it cannot read: this is
 * a paste box, and one malformed line should not throw away the thirty good ones above it.
 */
export function parseDayCodeText(source: string, base = 'ALA'): Roster | undefined {
  const entries: { date: string; code: string }[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(\d{4}-\d{2}-\d{2})[\s,;:\t]+([A-Za-z0-9]{1,8})\s*$/.exec(line);
    if (!match || !isIsoDate(match[1])) continue;
    entries.push({ date: match[1], code: match[2].toUpperCase() });
  }
  if (!entries.length) return undefined;

  const dates = entries.map((entry) => entry.date).sort();
  const period = { start: dates[0], end: dates[dates.length - 1] };
  return {
    period,
    coverage: period,
    duties: [],
    dayCodes: entries,
    base,
    importedAt: new Date().toISOString(),
  };
}
