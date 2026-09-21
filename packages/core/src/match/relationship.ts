import { intersectIntervals, subtractIntervals, totalMinutes, weekday, type Interval } from '../time';
import type { MatchDay } from './matchDays';

/**
 * The app is for one couple, not an abstract pair of rosters. Until they share a home, an evening
 * when the children are home is not an available date. School and nursery give them a reliable
 * weekday pocket instead. Once they live together, the same hours are still valuable but the
 * surrounding time is honestly marked as family time rather than discarded.
 */
export const DEFAULT_MOVE_IN_DATE = '2026-11-01';
export const DEFAULT_CHILDCARE_HOURS: Interval = { start: 8 * 60, end: 17 * 60 };

export type RelationshipMomentKind = 'private' | 'family' | 'layover';

export interface RelationshipMoment {
  date: string;
  station: string;
  kind: RelationshipMomentKind;
  interval: Interval;
  minutes: number;
}

export interface RelationshipOptions {
  moveInDate?: string;
  childcareHours?: Interval;
}

/**
 * Splits ordinary roster overlap into the context in which it can actually be used.
 *
 * - Before moving in, home overlap only counts during weekday childcare.
 * - A shared layover is private by nature and stays visible at any time.
 * - After moving in, time outside childcare is family time: it matters, but is not presented as
 *   the same thing as a quiet date together.
 */
export function relationshipMoments(days: MatchDay[], options: RelationshipOptions = {}): RelationshipMoment[] {
  const moveInDate = options.moveInDate ?? DEFAULT_MOVE_IN_DATE;
  const childcare = options.childcareHours ?? DEFAULT_CHILDCARE_HOURS;
  const moments: RelationshipMoment[] = [];

  for (const day of days) {
    if (!day.matched) continue;
    const sessions = day.sessions ?? (day.station && day.kind ? [{ station: day.station, kind: day.kind, overlap: day.overlap }] : []);
    for (const session of sessions) {
      if (session.kind === 'layover') {
        for (const interval of session.overlap) moments.push(moment(day.date, session.station, 'layover', interval));
        continue;
      }

      const privateIntervals = isChildcareDay(day.date)
        ? intersectIntervals(session.overlap, [childcare])
        : [];
      for (const interval of privateIntervals) moments.push(moment(day.date, session.station, 'private', interval));

      if (day.date >= moveInDate) {
        const familyIntervals = subtractAll(session.overlap, privateIntervals);
        for (const interval of familyIntervals) moments.push(moment(day.date, session.station, 'family', interval));
      }
    }
  }

  return moments.sort((a, b) => a.date.localeCompare(b.date) || a.interval.start - b.interval.start || a.station.localeCompare(b.station));
}

export function relationshipMinutes(moments: RelationshipMoment[], kind?: RelationshipMomentKind): number {
  return moments.filter(moment => !kind || moment.kind === kind).reduce((sum, moment) => sum + moment.minutes, 0);
}

function moment(date: string, station: string, kind: RelationshipMomentKind, interval: Interval): RelationshipMoment {
  return { date, station, kind, interval, minutes: totalMinutes([interval]) };
}

function isChildcareDay(date: string): boolean {
  const day = weekday(date);
  return day >= 1 && day <= 5;
}

function subtractAll(intervals: Interval[], blocks: Interval[]): Interval[] {
  return intervals.flatMap(interval => subtractIntervals(interval, blocks));
}
