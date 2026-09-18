import type { AvailabilityOptions, MatchOptions, Person, Roster } from '@match/core';

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
    const fallback = emptyState();
    return {
      you: { ...fallback.you, ...parsed.you },
      them: { ...fallback.them, ...parsed.them },
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
  } catch {
    // A corrupt or unreadable store must not take the app down with it; a fresh state is always
    // recoverable by importing the rosters again.
    return emptyState();
  }
}

export function saveState(state: MatchState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private-mode and quota failures leave the session working from memory.
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
