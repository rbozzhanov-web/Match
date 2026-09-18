import type { ExtractedPage, TextItem } from '../roster/pdf/types';

/**
 * Builds a page shaped like an Air Astana Personal Crew Schedule Report.
 *
 * The parser only ever sees positioned text, so a fixture only has to place text the way the real
 * report does: a heading row of DD/MM columns, and each day's cells stacked underneath its own
 * heading. The geometry here matches what the grid reader assumes — columns found from the
 * headings' own pitch, and a "Total Hours" line closing the grid.
 */

const COLUMN_X = 40;
const COLUMN_PITCH = 60;
const HEADING_Y = 100;
const FIRST_CELL_Y = 120;
const CELL_LEADING = 12;

export interface RosterPageSpec {
  /** Printed as "DD/MM/YYYY - DD/MM/YYYY". */
  period: string;
  /** The header line naming the crew member, e.g. "12345 IVANOV ALA-FO-A320". */
  subject?: string;
  days: { label: string; cells: string[] }[];
  /** Drop the report's identifying lines, to test that a foreign PDF is refused. */
  omitMarkers?: boolean;
}

export function rosterPage(spec: RosterPageSpec): ExtractedPage {
  const items: TextItem[] = [];
  const put = (str: string, x: number, y: number) => items.push({ str, x, y, width: str.length * 5 });

  if (!spec.omitMarkers) {
    put('AIR ASTANA', 40, 20);
    put('Personal Crew Schedule Report', 40, 36);
  }
  if (spec.subject) put(spec.subject, 40, 52);
  put(spec.period, 40, 68);

  spec.days.forEach((day, index) => {
    const x = COLUMN_X + index * COLUMN_PITCH;
    put(day.label, x, HEADING_Y);
    day.cells.forEach((cell, cellIndex) => put(cell, x, FIRST_CELL_Y + cellIndex * CELL_LEADING));
  });

  // Closes the grid; anything below it is a summary rather than a day.
  put('Total Hours', 40, FIRST_CELL_Y + 40 * CELL_LEADING);

  return { items, width: 800, height: 600 };
}

/**
 * A day of flying: report, out, back, release.
 *
 * Both sectors matter. A one-way day would leave the crew member down route for the rest of the
 * roster — which is what the station tracking would then correctly report, and not what a plain
 * "day of flying" is meant to stand for in a test.
 */
export function flyingDay(flightNumber: string, from: string, to: string): string[] {
  const inbound = String(Number(flightNumber) + 1);
  return [
    '06:00',
    flightNumber, '07:00', from, to, '08:30', '[320]',
    inbound, '14:00', to, from, '15:30', '[320]',
    '16:00',
  ];
}
