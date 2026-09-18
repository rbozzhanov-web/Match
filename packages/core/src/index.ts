export {
  MINUTES_PER_DAY,
  addDays,
  dateFromDayNumber,
  dayNumber,
  eachDate,
  formatDuration,
  hhmmToMinutes,
  intersectIntervals,
  isIsoDate,
  isWeekend,
  longestInterval,
  mergeIntervals,
  minutesToHHMM,
  subtractIntervals,
  totalMinutes,
  weekday,
  type Interval,
} from './time';

export {
  rosterCoverage,
  type CrewRole,
  type Person,
  type Roster,
  type RosterCrewMember,
  type RosterDayCode,
  type RosterDuty,
  type RosterFlight,
  type RosterGroundDuty,
} from './roster/contract';

export {
  NON_DUTY_CODES,
  classifyDayCode,
  describeDayCode,
  isNonDutyCode,
  type DayCodeKind,
} from './roster/dayCodes';

export {
  DEFAULT_AVAILABILITY_OPTIONS,
  availabilityByDate,
  buildAvailability,
  type AvailabilityOptions,
  type DayAvailability,
  type DayFlight,
  type DayState,
} from './roster/availability';

export {
  DEFAULT_MATCH_OPTIONS,
  matchDays,
  matchOneDay,
  matchedDays,
  nextMatch,
  totalTogetherMinutes,
  type MatchDay,
  type MatchOptions,
  type MatchQuality,
  type MissReason,
} from './match/matchDays';

export {
  longestWindow,
  nextWindow,
  togetherWindows,
  type TogetherWindow,
} from './match/windows';

export { buildTogetherIcs, type IcsOptions } from './calendar/ics';
