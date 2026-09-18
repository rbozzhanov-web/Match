/**
 * The roster shape the match engine reads.
 *
 * This is the KhaVair / eScrew normalized roster contract, kept deliberately source-agnostic: an
 * AIMS Crew Schedule web archive, a roster PDF and a hand-built roster all normalize into it, and
 * nothing downstream of here knows or cares which file a day arrived in. Importers live in the
 * app; this package only ever sees the result.
 */

export type CrewRole = 'Flight deck' | 'Cabin';

export interface RosterCrewMember {
  id?: string;
  name: string;
  role: CrewRole;
  position?: string;
  deadhead?: boolean;
}

export interface RosterFlight {
  flightNumber: string;
  /** Departure date, ISO. */
  date: string;
  origin: string;
  destination: string;
  /** Station-local "HH:MM" at the origin. */
  departure: string;
  /** Station-local "HH:MM" at the destination. */
  arrival: string;
  /** Set when the sector lands on a later date than it departed. */
  arrivalDate?: string;
  aircraftType?: string;
  deadhead?: boolean;
  crew?: RosterCrewMember[];
}

export interface RosterDuty {
  /** The date the duty reports on, ISO. */
  date: string;
  /** Report stamp, "YYYY-MM-DDTHH:MM". Falls back to the first sector's departure. */
  start?: string;
  /** Release stamp, "YYYY-MM-DDTHH:MM". Falls back to the last sector's arrival. */
  end?: string;
  flights: RosterFlight[];
}

/**
 * A non-flying day the roster names with a code.
 *
 * These are the KhaVair roster codes. They matter here for one reason only: whether the person is
 * free that day, and how firmly. A day off and a day of annual leave both read as "at home and
 * available"; standby reads as available but liable to be taken away.
 */
export interface RosterDayCode {
  date: string;
  code: string;
}

/** A rostered non-flying duty — training, office, simulator — that still occupies the day. */
export interface RosterGroundDuty {
  date: string;
  code: string;
  /** Station-local "HH:MM". */
  start?: string;
  end?: string;
  station?: string;
}

export interface Roster {
  /** The period the most recent import was about. */
  period: { start: string; end: string };
  /**
   * Every day this roster can answer for, which is wider than `period` when several imports are
   * merged. The match engine asks for coverage, never for period: a day outside coverage is
   * unknown rather than free, and guessing "free" there would invent time together.
   */
  coverage?: { start: string; end: string };
  duties: RosterDuty[];
  dayCodes?: RosterDayCode[];
  groundDuties?: RosterGroundDuty[];
  /** The station this person goes home to. Defaults to ALA where absent. */
  base?: string;
  importedAt?: string;
}

/** A person whose roster takes part in a match. */
export interface Person {
  id: string;
  name: string;
  base: string;
  roster?: Roster;
}

export function rosterCoverage(roster: Roster): { start: string; end: string } {
  return roster.coverage ?? roster.period;
}
