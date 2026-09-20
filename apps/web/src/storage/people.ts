import { dayNumber, isIsoDate, hhmmToMinutes, type AvailabilityOptions, type MatchOptions, type Person, type Roster } from '@match/core';

/**
 * Everything the app knows, kept in this browser.
 *
 * Two rosters between two people is the most personal data this app could hold, so it holds it the
 * way eScrew and the Pilot Logbook hold theirs: in localStorage on the device, with no account and
 * no backend to send it to. A roster leaves the phone only when its owner exports it.
 */

const STORAGE_KEY = 'match.state.v1';

export interface MatchSettings extends AvailabilityOptions, MatchOptions {}

export interface MatchState {
  you: Person;
  them: Person;
  settings: MatchSettings;
}

export const DEFAULT_SETTINGS: Required<MatchSettings> = {
  base: 'ALA',
  preDutyBufferMinutes: 90,
  postDutyBufferMinutes: 60,
  dayStartMinutes: 8 * 60,
  dayEndMinutes: 23 * 60,
  minimumMinutes: 120,
  allowLayoverMatches: true,
  includeStandby: true,
};

export function emptyState(): MatchState {
  return {
    you: { id: 'you', name: 'You', base: 'ALA' },
    them: { id: 'them', name: 'Them', base: 'ALA' },
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function loadState(): MatchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<MatchState>;
    if (!validState(parsed)) return emptyState();
    const fallback = emptyState();
    return {
      you: { ...fallback.you, ...parsed.you, roster: parsed.you?.roster ? migrateRoster(parsed.you.roster) : undefined },
      them: { ...fallback.them, ...parsed.them, roster: parsed.them?.roster ? migrateRoster(parsed.them.roster) : undefined },
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
  } catch {
    // A corrupt or unreadable store must not take the app down with it; a fresh state is always
    // recoverable by importing the rosters again.
    return emptyState();
  }
}

export function saveState(state: MatchState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function setRoster(state: MatchState, who: 'you' | 'them', roster: Roster): MatchState {
  return { ...state, [who]: { ...state[who], roster, base: roster.base ?? state[who].base } } as MatchState;
}

export function setPerson(state: MatchState, who: 'you' | 'them', person: Partial<Person>): MatchState {
  return { ...state, [who]: { ...state[who], ...person } } as MatchState;
}

export function clearRoster(state: MatchState, who: 'you' | 'them'): MatchState {
  const { roster, ...rest } = state[who];
  void roster;
  return { ...state, [who]: rest } as MatchState;
}

export function validRoster(value: unknown): value is Roster {
  if (!value || typeof value !== 'object') return false;
  const r = value as Roster;
  const period = (v: Roster['period']) => v && isIsoDate(v.start) && isIsoDate(v.end) && v.start <= v.end && dayNumber(v.end) - dayNumber(v.start) <= 1830;
  const stamp = (v: string | undefined) => v === undefined || (typeof v === 'string' && isIsoDate(v.slice(0, 10)) && hhmmToMinutes(v.slice(11)) !== null);
  const station = (v: unknown) => typeof v === 'string' && /^[A-Z]{3,4}$/.test(v);
  if (!period(r.period) || (r.coverage && !period(r.coverage)) || (r.base !== undefined && !station(r.base))) return false;
  if (!Array.isArray(r.duties) || r.duties.length > 10000) return false;
  if (!r.duties.every(d => d && isIsoDate(d.date) && stamp(d.start) && stamp(d.end) && Array.isArray(d.flights) && d.flights.every(f => f && typeof f.flightNumber === 'string' && isIsoDate(f.date) && (!f.arrivalDate || isIsoDate(f.arrivalDate)) && station(f.origin) && station(f.destination) && hhmmToMinutes(f.departure) !== null && hhmmToMinutes(f.arrival) !== null))) return false;
  if (r.dayCodes && (!Array.isArray(r.dayCodes) || !r.dayCodes.every(d => d && isIsoDate(d.date) && typeof d.code === 'string'))) return false;
  if (r.groundDuties && (!Array.isArray(r.groundDuties) || !r.groundDuties.every(d => d && isIsoDate(d.date) && typeof d.code === 'string' && (d.start === undefined || hhmmToMinutes(d.start) !== null) && (d.end === undefined || hhmmToMinutes(d.end) !== null)))) return false;
  return [r.coveredDates, r.uncertainDates].every(dates => dates === undefined || (Array.isArray(dates) && dates.length <= 1830 && dates.every(isIsoDate)));
}
export function validState(value: unknown): value is MatchState {
  if (!value || typeof value !== 'object') return false;
  const s = value as MatchState;
  if (![s.you, s.them].every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && [p.preDutyBufferMinutes, p.postDutyBufferMinutes].every(v => v === undefined || (Number.isFinite(v) && v >= 0 && v <= 1440)) && typeof p.base === 'string' && /^[A-Z]{3,4}$/.test(p.base) && (!p.roster || validRoster(p.roster)))) return false;
  if (!s.settings || typeof s.settings !== 'object') return false;
  for (const field of ['preDutyBufferMinutes', 'postDutyBufferMinutes', 'dayStartMinutes', 'dayEndMinutes', 'minimumMinutes'] as const) {
    const v = s.settings[field]; if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1440)) return false;
  }
  if (['includeStandby', 'allowLayoverMatches'].some(key => key in s.settings && typeof s.settings[key as 'includeStandby'] !== 'boolean')) return false;
  return (s.settings.dayStartMinutes ?? 480) < (s.settings.dayEndMinutes ?? 1380);
}
export function backupText(state: MatchState): string {
  return JSON.stringify({ app: 'Match', version: 1, state }, null, 2);
}
export function readBackup(text: string): MatchState {
  const value = JSON.parse(text);
  if (value.app !== 'Match' || value.version !== 1 || !validState(value.state)) throw new Error('This is not a valid Match backup.');
  return {
    ...value.state,
    you: { ...value.state.you, roster: value.state.you.roster ? migrateRoster(value.state.you.roster) : undefined },
    them: { ...value.state.them, roster: value.state.them.roster ? migrateRoster(value.state.them.roster) : undefined },
  };
}

/** Older merged snapshots cannot prove coverage in the gaps between imports. */
function migrateRoster(roster: Roster): Roster {
  if (roster.coveredDates) return roster;
  const coveredDates = [...new Set([
    ...roster.duties.flatMap(d => [d.date, ...d.flights.flatMap(f => [f.date, ...(f.arrivalDate ? [f.arrivalDate] : [])])]), ...(roster.dayCodes ?? []).map(d => d.date),
    ...(roster.groundDuties ?? []).map(d => d.date),
  ])].sort();
  return { ...roster, coveredDates };
}
