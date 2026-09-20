import type { DayAvailability } from '../roster/availability';
import { stationClock } from '../roster/location';
import { matchOneDay, type MatchDay, type MatchOptions } from './matchDays';

/** Trim each station in its own local date/time, including an ongoing multi-day window. */
export function remainingMatches(days: MatchDay[], now: Date, options: MatchOptions = {}): MatchDay[] {
  const trim = (day: DayAvailability): DayAvailability => ({
    ...day,
    locations: (day.locations ?? day.free.map(slot => ({ ...slot, station: day.station, atBase: day.atBase }))).flatMap(slot => {
      const clock = stationClock(now, slot.station);
      if (!clock || day.date < clock.date) return [];
      const start = day.date === clock.date ? Math.max(slot.start, clock.minute) : slot.start;
      return start < slot.end ? [{ ...slot, start }] : [];
    }),
  });
  return days.map(day => matchOneDay(trim(day.you), trim(day.them), options)).filter(day => day.matched);
}
