import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  saved: boolean;
  canUndo: boolean;
  undo: () => void;
  replaceState: (state: MatchState) => void;
  demo: boolean;
  startDemo: (you: Roster, them: Roster) => void;
  endDemo: () => void;
  updatePerson: (who: 'you' | 'them', changes: Partial<Person>) => void;
}

const MatchContext = createContext<MatchContextValue | undefined>(undefined);

export function MatchProvider({ children, initialState }: { children: ReactNode; initialState?: MatchState }) {
  const [state, setState] = useState<MatchState>(() => initialState ?? loadState());

  const [saved, setSaved] = useState(true);
  const [previous, setPrevious] = useState<MatchState>();
  const [demo, setDemo] = useState(false);
  const realState = useRef<MatchState | undefined>(undefined);
  useEffect(() => { if (!demo) setSaved(saveState(state)); }, [state, demo]);
  const mutate = useCallback((change: (state: MatchState) => MatchState) => {
    setState(current => { setPrevious(current); return change(current); });
  }, []);
  const undo = useCallback(() => { if (previous) { setState(previous); setPrevious(undefined); } }, [previous]);
  const replaceState = useCallback((next: MatchState) => mutate(() => next), [mutate]);
  const startDemo = useCallback((you: Roster, them: Roster) => {
    realState.current = state; setDemo(true); setPrevious(undefined);
    setState(current => ({ ...current, you: { ...current.you, roster: { ...you, source: 'sample' } }, them: { ...current.them, roster: { ...them, source: 'sample' } } }));
  }, [state]);
  const endDemo = useCallback(() => { if (realState.current) setState(realState.current); setDemo(false); setPrevious(undefined); }, []);
  const updatePerson = useCallback((who: 'you' | 'them', changes: Partial<Person>) => mutate(current => setPerson(current, who, changes)), [mutate]);

  const availabilityOptions = useMemo(() => ({
    base: state.settings.base ?? DEFAULT_SETTINGS.base,
    preDutyBufferMinutes: state.settings.preDutyBufferMinutes,
    postDutyBufferMinutes: state.settings.postDutyBufferMinutes,
    dayStartMinutes: state.settings.dayStartMinutes,
    dayEndMinutes: state.settings.dayEndMinutes,
  }), [state.settings]);

  const yourDays = useMemo(
    () => (state.you.roster ? buildAvailability(state.you.roster, { ...availabilityOptions, base: state.you.base, preDutyBufferMinutes: state.you.preDutyBufferMinutes ?? availabilityOptions.preDutyBufferMinutes, postDutyBufferMinutes: state.you.postDutyBufferMinutes ?? availabilityOptions.postDutyBufferMinutes }) : []),
    [availabilityOptions, state.you],
  );
  const theirDays = useMemo(
    () => (state.them.roster ? buildAvailability(state.them.roster, { ...availabilityOptions, base: state.them.base, preDutyBufferMinutes: state.them.preDutyBufferMinutes ?? availabilityOptions.preDutyBufferMinutes, postDutyBufferMinutes: state.them.postDutyBufferMinutes ?? availabilityOptions.postDutyBufferMinutes }) : []),
    [availabilityOptions, state.them],
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
    mutate((current) => setRoster(current, who, roster));
  }, [mutate]);
  const removeRoster = useCallback((who: 'you' | 'them') => {
    mutate((current) => clearRoster(current, who));
  }, [mutate]);
  const renamePerson = useCallback((who: 'you' | 'them', name: string) => {
    setState((current) => setPerson(current, who, { name }));
  }, []);
  const updateSettings = useCallback((settings: Partial<MatchSettings>) => {
    setState((current) => ({ ...current, settings: { ...current.settings, ...settings } }));
  }, []);
  const reset = useCallback(() => {
    mutate((current) => {
      const fresh = current;
      return { ...fresh, you: { ...fresh.you, roster: undefined }, them: { ...fresh.them, roster: undefined } };
    });
  }, [mutate]);

  const value = useMemo<MatchContextValue>(() => ({
    state,
    saved, canUndo: Boolean(previous), undo, replaceState, demo, startDemo, endDemo, updatePerson,
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
  }), [saved, previous, undo, replaceState, demo, startDemo, endDemo, updatePerson, days, importRoster, removeRoster, renamePerson, reset, state, theirDays, updateSettings, windows, yourDays]);

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatch(): MatchContextValue {
  const value = useContext(MatchContext);
  if (!value) throw new Error('useMatch must be used inside a MatchProvider');
  return value;
}
