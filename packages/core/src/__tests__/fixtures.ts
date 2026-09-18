import type { Roster, RosterFlight } from '../roster/contract';

/** Builds a sector without making every test spell out the fields it does not care about. */
export function flight(
  date: string,
  flightNumber: string,
  origin: string,
  destination: string,
  departure: string,
  arrival: string,
  extra: Partial<RosterFlight> = {},
): RosterFlight {
  return { date, flightNumber, origin, destination, departure, arrival, ...extra };
}

/** A roster covering one month with nothing in it but the days the test adds. */
export function roster(input: Partial<Roster> & { start: string; end: string }): Roster {
  const { start, end, ...rest } = input;
  return {
    period: { start, end },
    coverage: { start, end },
    duties: [],
    base: 'ALA',
    ...rest,
  };
}

/** Marks every date in the list with one roster code. */
export function codes(code: string, ...dates: string[]) {
  return dates.map((date) => ({ date, code }));
}
