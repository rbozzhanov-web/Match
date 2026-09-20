import { isNonDutyCode } from '../dayCodes';
import {
  CONTINUED_GLYPH,
  CONTINUES_GLYPH,
  isFlightNumber,
  isPlainTime,
  parseCellAircraft,
  parseCellStation,
  parseCellTime,
} from './patterns';
import { resolveGridDate, type DayColumn } from './grid';

export interface GridSector {
  flightNumber: string;
  date: string;
  departureAirport: string;
  arrivalAirport: string;
  timeOut: string;
  timeIn: string;
  arrivalDate?: string;
  aircraftType?: string;
  deadhead: boolean;
  actualTimes: boolean;
  dutyIndex: number;
}

export interface GridDuty {
  index: number;
  start?: string;
  end?: string;
  sectorCount: number;
}

export interface GridGroundDuty {
  date: string;
  code: string;
  start?: string;
  end?: string;
}

export interface GridReading {
  sectors: GridSector[];
  duties: GridDuty[];
  /** Every day the roster names with a non-flying code, not only the payroll ones. */
  dayCodes: { date: string; code: string }[];
  groundDuties: GridGroundDuty[];
  /**
   * Every date the grid actually printed a column for.
   *
   * Not the same as the period on the header, and the difference matters: a report whose grid
   * covers a week inside a month-long period can answer for that week and nothing else. Reading
   * the other three weeks as "nothing rostered, so free" would invent them.
   */
  dates: string[];
  /** Cells the reader could not account for. Surfaced so a bad import is visible, not silent. */
  unreadCells: string[];
  uncertainDates: string[];
}

const DELAY_LABEL = 'Delay';
const GROUND_DUTY_CODE_RE = /^[A-Z][A-Z0-9_]{1,7}$/;
/** The memo and roster markers a cell can carry on its own. */
const MARKER_RE = /^[MR](,[MR])*$/;

/**
 * Reads the day columns of an Air Astana roster.
 *
 * The walk is KhaVair's, cell by cell, and so is every rule about what a cell can be. What differs
 * is what comes out of it. The roster reader this came from kept only the four payroll absence
 * codes and dropped the rest, because a logbook and a payslip do not care which days were days
 * off — this app cares about almost nothing else, so every non-duty code the roster prints is
 * kept, and OFF is as much a fact as a sector is.
 */
export function readGrid(columns: DayColumn[], periodStart: string, periodEnd: string): GridReading {
  const sectors: GridSector[] = [];
  const duties: GridDuty[] = [];
  const dayCodes: { date: string; code: string }[] = [];
  const groundDuties: GridGroundDuty[] = [];
  const unreadCells: string[] = [];
  const uncertainDates = new Set<string>();

  const dates: string[] = [];
  let carried: GridSector | undefined;
  let currentDuty: GridDuty | undefined;

  const openDuty = () => {
    const duty: GridDuty = { index: duties.length, sectorCount: 0 };
    duties.push(duty);
    currentDuty = duty;
    return duty;
  };

  for (const column of columns) {
    const date = resolveGridDate(column.label, periodStart, periodEnd);
    if (!date) continue;
    // Recorded before the cells are read: an empty column is still a day the roster answers for,
    // which is exactly what the middle day of a layover looks like.
    dates.push(date);
    const cells = column.cells;
    let i = 0;

    while (i < cells.length) {
      const cell = cells[i];

      // The tail of a sector that started in an earlier column.
      if (cell === CONTINUED_GLYPH) {
        i += 1;
        if (!carried) { uncertainDates.add(date); continue; }
        i = completeCarriedSector(carried, cells, i, date);
        if (!carried.arrivalAirport || !carried.timeIn) { uncertainDates.add(date); uncertainDates.add(carried.date); }
        sectors.push(carried);
        carried = undefined;
        continue;
      }

      if (isNonDutyCode(cell)) {
        dayCodes.push({ date, code: cell.trim().toUpperCase() });
        i += 1;
        // A non-duty code can be followed by times that belong to it rather than to a duty.
        while (i < cells.length && isPlainTime(cells[i])) i += 1;
        currentDuty = undefined;
        continue;
      }

      if (cell === DELAY_LABEL) {
        i += 1;
        if (i < cells.length && isPlainTime(cells[i])) i += 1;
        continue;
      }

      if (cell === CONTINUES_GLYPH) {
        i += 1;
        continue;
      }

      if (isFlightNumber(cell)) {
        const duty = currentDuty ?? openDuty();
        const read = readSector(cells, i, date, duty);
        if (!read) {
          uncertainDates.add(date);
          unreadCells.push(cell);
          i += 1;
          continue;
        }
        duty.sectorCount += 1;
        if (read.continues) carried = read.sector;
        else sectors.push(read.sector);
        i = read.next;
        continue;
      }

      if (isPlainTime(cell)) {
        i += 1;
        // A time before a flight number is a report; a time after a duty is its release.
        if (isFlightNumber(cells[i] ?? '')) openDuty().start = `${date}T${cell}`;
        else if (currentDuty) {
          currentDuty.end = `${date}T${cell}`;
          currentDuty = undefined;
        } else openDuty().start = `${date}T${cell}`;
        continue;
      }

      // A rostered ground duty: a code with its own start and end.
      if (GROUND_DUTY_CODE_RE.test(cell) && isPlainTime(cells[i + 1] ?? '') && isPlainTime(cells[i + 2] ?? '')) {
        groundDuties.push({ date, code: cell.toUpperCase(), start: cells[i + 1], end: cells[i + 2] });
        currentDuty = undefined;
        i += 3;
        continue;
      }

      if (MARKER_RE.test(cell)) {
        i += 1;
        continue;
      }

      // A ground duty the roster gives no hours for. Kept rather than dropped: something is
      // rostered that day, and calling it a free day would invent time together out of a blank.
      if (GROUND_DUTY_CODE_RE.test(cell)) {
        groundDuties.push({ date, code: cell.toUpperCase() });
        i += 1;
        continue;
      }

      uncertainDates.add(date);
      unreadCells.push(cell);
      i += 1;
    }
  }

  if (carried) uncertainDates.add(carried.date);
  return {
    uncertainDates: [...uncertainDates],
    sectors,
    duties,
    dayCodes: dedupeByDate(dayCodes),
    groundDuties,
    dates: [...new Set(dates)].sort(),
    unreadCells,
  };
}

function readSector(
  cells: string[],
  start: number,
  date: string,
  duty: GridDuty,
): { sector: GridSector; next: number; continues: boolean } | undefined {
  let i = start;
  const flightNumber = cells[i];
  i += 1;

  const departure = parseCellTime(cells[i] ?? '');
  if (!departure) return undefined;
  i += 1;

  const from = parseCellStation(cells[i] ?? '');
  if (!from) return undefined;
  i += 1;

  const sector: GridSector = {
    flightNumber,
    date,
    departureAirport: from.code,
    arrivalAirport: '',
    timeOut: departure.time,
    timeIn: '',
    deadhead: from.deadhead,
    actualTimes: departure.actual,
    dutyIndex: duty.index,
  };

  if (cells[i] === CONTINUES_GLYPH) return { sector, next: i + 1, continues: true };

  const to = parseCellStation(cells[i] ?? '');
  if (!to) return undefined;
  i += 1;

  const arrival = parseCellTime(cells[i] ?? '');
  if (!arrival) return undefined;
  i += 1;

  sector.arrivalAirport = to.code;
  sector.timeIn = arrival.time;
  sector.actualTimes = sector.actualTimes && arrival.actual;

  const aircraft = parseCellAircraft(cells[i] ?? '');
  if (aircraft) {
    sector.aircraftType = aircraft;
    i += 1;
  }

  return { sector, next: i, continues: false };
}

function completeCarriedSector(sector: GridSector, cells: string[], start: number, date: string): number {
  let i = start;
  const to = parseCellStation(cells[i] ?? '');
  if (to) {
    sector.arrivalAirport = to.code;
    i += 1;
  }
  const arrival = parseCellTime(cells[i] ?? '');
  if (arrival) {
    sector.timeIn = arrival.time;
    sector.actualTimes = sector.actualTimes && arrival.actual;
    sector.arrivalDate = date;
    i += 1;
  }
  if (parseCellAircraft(cells[i] ?? '')) i += 1;
  return i;
}

function dedupeByDate(codes: { date: string; code: string }[]): { date: string; code: string }[] {
  const seen = new Set<string>();
  return codes.filter((entry) => {
    if (seen.has(entry.date)) return false;
    seen.add(entry.date);
    return true;
  });
}
