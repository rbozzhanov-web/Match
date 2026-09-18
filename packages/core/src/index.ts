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

/*
 * The PDF roster reader. Pure text-position parsing with no dataset behind it, so it costs little
 * to carry here; the weight of a PDF import is PDF.js itself, which lives in the app and is loaded
 * only when someone actually picks a file.
 */
export {
  parsePdfRoster,
  type ParsedPdfRoster,
} from './roster/pdf/parseRoster';
export type { ExtractedPage, TextItem } from './roster/pdf/types';
export { extractDayColumns, dedupeColumns, resolveGridDate, type DayColumn } from './roster/pdf/grid';
export { readGrid, type GridReading } from './roster/pdf/readGrid';
export { tokenizeLines, type Line } from './roster/pdf/tokenize';
export { parsePeriod, parseSubject, type ReportPeriod, type ReportSubject } from './roster/pdf/header';
