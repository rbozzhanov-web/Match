import { compareFlights } from '../location';
import { eachDate } from '../../time';
import type { Roster, RosterDuty, RosterFlight } from '../contract';
import { dedupeColumns, extractDayColumns } from './grid';
import { parsePeriod, parseSubject } from './header';
import { readGrid, type GridSector } from './readGrid';
import type { ExtractedPage } from './types';

export interface ParsedPdfRoster {
  roster: Roster;
  /** Who the report is about, where the header named them. */
  subject?: { staffId: string; name: string; base?: string };
  /** Cells the reader could not account for — surfaced rather than swallowed. */
  unreadCells: string[];
}

const REQUIRED_MARKERS = ['AIR ASTANA', 'Personal Crew Schedule Report'];

/**
 * Turns an Air Astana Personal Crew Schedule Report into a roster this app can match on.
 *
 * The parsing is KhaVair's; the assembly is this app's. Sectors come back tagged with the duty
 * they belong to, so they are regrouped here into the report-to-release duties the availability
 * engine expects, and the day codes and ground duties ride alongside them — which is the half of
 * the report that decides whether a day is free.
 */
export function parsePdfRoster(pages: ExtractedPage[], fallbackBase = 'ALA'): ParsedPdfRoster {
  const text = pages.flatMap((page) => page.items.map((item) => item.str)).join(' ');
  const missing = REQUIRED_MARKERS.find((marker) => !text.includes(marker));
  if (missing) {
    throw new Error('This does not look like an Air Astana Personal Crew Schedule Report. Export the roster PDF from AIMS and try that.');
  }

  const period = parsePeriod(pages);
  if (!period) throw new Error('Could not read the roster period from this PDF.');

  const columns = dedupeColumns(pages.flatMap(extractDayColumns));
  const reading = readGrid(columns, period.start, period.end);
  if (!reading.dates.length) throw new Error('No readable roster grid found. Nothing was imported.');
  const subject = parseSubject(pages);
  const base = (subject?.base ?? fallbackBase).toUpperCase();

  const duties: RosterDuty[] = reading.duties.flatMap((duty) => {
    const sectors = reading.sectors
      .filter((sector) => sector.dutyIndex === duty.index)
      .sort((a, b) => `${a.date}T${a.timeOut}`.localeCompare(`${b.date}T${b.timeOut}`));
    if (!sectors.length) return [];
    return [{
      date: sectors[0].date,
      start: duty.start,
      end: duty.end,
      flights: sectors.map(toFlight).sort(compareFlights),
    }];
  }).sort((a, b) => (a.start ?? a.date).localeCompare(b.start ?? b.date));

  // A dropped flight also makes the following blank layover days unverifiable.
  const uncertainDates = new Set(reading.uncertainDates);
  for (const date of reading.uncertainDates) {
    const nextKnown = duties.find(duty => duty.date > date)?.date;
    for (const affected of eachDate(date, reading.dates.at(-1)!)) {
      if (nextKnown && affected >= nextKnown) break;
      uncertainDates.add(affected);
    }
  }

  // Coverage is what the grid drew, not what the header claimed. A report whose period runs a
  // month while its grid holds a week can only answer for that week; taking the header at its word
  // would leave three weeks of unrostered days reading as free, and the match engine would offer
  // up every one of them.
  const coverage = reading.dates.length
    ? { start: reading.dates[0], end: reading.dates[reading.dates.length - 1] }
    : period;

  return {
    subject: subject ? { staffId: subject.staffId, name: subject.name, base: subject.base } : undefined,
    unreadCells: reading.unreadCells,
    roster: {
      period,
      coverage,
      coveredDates: reading.dates,
      uncertainDates: [...uncertainDates],
      duties,
      dayCodes: reading.dayCodes,
      groundDuties: reading.groundDuties,
      base,
      importedAt: new Date().toISOString(),
    },
  };
}

function toFlight(sector: GridSector): RosterFlight {
  return {
    flightNumber: /^KC/i.test(sector.flightNumber) ? sector.flightNumber.toUpperCase() : `KC${sector.flightNumber}`,
    date: sector.date,
    origin: sector.departureAirport,
    destination: sector.arrivalAirport,
    departure: sector.timeOut,
    arrival: sector.timeIn,
    arrivalDate: sector.arrivalDate,
    aircraftType: sector.aircraftType,
    deadhead: sector.deadhead,
  };
}
