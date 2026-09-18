import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildAvailability,
  matchDays,
  togetherWindows,
  type DayAvailability,
  type MatchDay,
  type Person,
  type Roster,
  type TogetherWindow,
} from '@match/core';

import {
  DEFAULT_SETTINGS,
  clearRoster,
  loadState,
  saveState,
  setPerson,
  setRoster,
  type MatchSettings,
  type MatchState,
} from '../storage/people';

/**
 * The app's one piece of state, and everything derived from it.
 *
 * The derivation is the whole app: two rosters in, a list of days together out. It is kept in a
 * memo rather than stored, because a stored answer would go stale the moment a setting moved and
 * recomputing a couple of months of days costs nothing.
 */

interface MatchContextValue {
  state: MatchState;
  you: Person;
  them: Person;
  settings: MatchSettings;
  /** Days both rosters cover, matched. Empty until both people have a roster. */
  days: MatchDay[];
  windows: TogetherWindow[];
  yourDays: DayAvailability[];
  theirDays: DayAvailability[];
  hasBothRosters: boolean;
  importRoster: (who: 'you' | 'them', roster: Roster) => void;
  removeRoster: (who: 'you' | 'them') => void;
  renamePerson: (who: 'you' | 'them', name: string) => void;
  updateSettings: (settings: Partial<MatchSettings>) => void;
  reset: () => void;
}

const MatchContext = createContext<MatchContextValue | undefined>(undefined);

export function MatchProvider({ children, initialState }: { children: ReactNode; initialState?: MatchState }) {
  const [state, setState] = useState<MatchState>(() => initialState ?? loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const availabilityOptions = useMemo(() => ({
    base: state.settings.base ?? DEFAULT_SETTINGS.base,
    preDutyBufferMinutes: state.settings.preDutyBufferMinutes,
    postDutyBufferMinutes: state.settings.postDutyBufferMinutes,
    dayStartMinutes: state.settings.dayStartMinutes,
    dayEndMinutes: state.settings.dayEndMinutes,
  }), [state.settings]);

  const yourDays = useMemo(
    () => (state.you.roster ? buildAvailability(state.you.roster, { ...availabilityOptions, base: state.you.base }) : []),
    [availabilityOptions, state.you.base, state.you.roster],
  );
  const theirDays = useMemo(
    () => (state.them.roster ? buildAvailability(state.them.roster, { ...availabilityOptions, base: state.them.base }) : []),
    [availabilityOptions, state.them.base, state.them.roster],
  );

  const days = useMemo(() => {
    if (!yourDays.length || !theirDays.length) return [];
    return matchDays(yourDays, theirDays, {
      minimumMinutes: state.settings.minimumMinutes,
      allowLayoverMatches: state.settings.allowLayoverMatches,
      includeStandby: state.settings.includeStandby,
    });
  }, [state.settings, theirDays, yourDays]);

  const windows = useMemo(() => togetherWindows(days), [days]);

  const importRoster = useCallback((who: 'you' | 'them', roster: Roster) => {
    setState((current) => setRoster(current, who, roster));
  }, []);
  const removeRoster = useCallback((who: 'you' | 'them') => {
    setState((current) => clearRoster(current, who));
  }, []);
  const renamePerson = useCallback((who: 'you' | 'them', name: string) => {
    setState((current) => setPerson(current, who, { name }));
  }, []);
  const updateSettings = useCallback((settings: Partial<MatchSettings>) => {
    setState((current) => ({ ...current, settings: { ...current.settings, ...settings } }));
  }, []);
  const reset = useCallback(() => {
    setState(() => {
      const fresh = loadState();
      return { ...fresh, you: { ...fresh.you, roster: undefined }, them: { ...fresh.them, roster: undefined } };
    });
  }, []);

  const value = useMemo<MatchContextValue>(() => ({
    state,
    you: state.you,
    them: state.them,
    settings: state.settings,
    days,
    windows,
    yourDays,
    theirDays,
    hasBothRosters: Boolean(state.you.roster && state.them.roster),
    importRoster,
    removeRoster,
    renamePerson,
    updateSettings,
    reset,
  }), [days, importRoster, removeRoster, renamePerson, reset, state, theirDays, updateSettings, windows, yourDays]);

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatch(): MatchContextValue {
  const value = useContext(MatchContext);
  if (!value) throw new Error('useMatch must be used inside a MatchProvider');
  return value;
}
