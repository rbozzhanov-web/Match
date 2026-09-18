import { describe, expect, it } from 'vitest';
import { parsePdfRoster } from '../roster/pdf/parseRoster';
import { extractDayColumns, resolveGridDate } from '../roster/pdf/grid';
import { readGrid } from '../roster/pdf/readGrid';
import { parsePeriod, parseSubject } from '../roster/pdf/header';
import { buildAvailability } from '../roster/availability';
import { matchDays } from '../match/matchDays';
import { flyingDay, rosterPage } from './pdfFixtures';

const PERIOD = '01/10/2026 - 31/10/2026';
const SUBJECT = '12345 IVANOV ALA-FO-A320';

describe('reading the report header', () => {
  it('reads the roster period', () => {
    expect(parsePeriod([rosterPage({ period: PERIOD, days: [] })]))
      .toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('reads the crew member and their base', () => {
    const subject = parseSubject([rosterPage({ period: PERIOD, subject: SUBJECT, days: [] })]);
    expect(subject).toMatchObject({ staffId: '12345', name: 'IVANOV', base: 'ALA', rank: 'FO' });
  });

  it('refuses a PDF that is not this report', () => {
    const page = rosterPage({ period: PERIOD, days: [], omitMarkers: true });
    expect(() => parsePdfRoster([page])).toThrow(/Air Astana Personal Crew Schedule Report/);
  });
});

describe('finding the grid', () => {
  it('files each cell under the day it sits below', () => {
    const page = rosterPage({
      period: PERIOD,
      days: [
        { label: '01/10', cells: ['OFF'] },
        { label: '02/10', cells: ['DOFF'] },
        { label: '03/10', cells: flyingDay('931', 'ALA', 'TSE') },
      ],
    });
    const columns = extractDayColumns(page);
    expect(columns.map((column) => column.label)).toEqual(['01/10', '02/10', '03/10']);
    expect(columns[0].cells).toEqual(['OFF']);
    expect(columns[2].cells).toEqual(flyingDay('931', 'ALA', 'TSE'));
  });

  it('gives a DD/MM heading the year that lands inside the period', () => {
    expect(resolveGridDate('05/01', '2026-12-25', '2027-01-24')).toBe('2027-01-05');
    expect(resolveGridDate('28/12', '2026-12-25', '2027-01-24')).toBe('2026-12-28');
    expect(resolveGridDate('15/06', '2026-12-25', '2027-01-24')).toBeUndefined();
  });
});

describe('what the grid reader keeps', () => {
  it('keeps every rostered day off, not only the payroll codes', () => {
    // This is the whole reason the reader was forked: the roster app it came from dropped OFF and
    // DOFF, because a logbook does not care. Here they are the answer.
    const reading = readGrid([
      { label: '01/10', cells: ['OFF'] },
      { label: '02/10', cells: ['DOFF'] },
      { label: '03/10', cells: ['VAC'] },
      { label: '04/10', cells: ['HOMS'] },
      { label: '05/10', cells: ['SICK'] },
    ], '2026-10-01', '2026-10-31');

    expect(reading.dayCodes).toEqual([
      { date: '2026-10-01', code: 'OFF' },
      { date: '2026-10-02', code: 'DOFF' },
      { date: '2026-10-03', code: 'VAC' },
      { date: '2026-10-04', code: 'HOMS' },
      { date: '2026-10-05', code: 'SICK' },
    ]);
  });

  it('reads a day of flying into a duty with its report and release', () => {
    const reading = readGrid(
      [{ label: '03/10', cells: flyingDay('931', 'ALA', 'TSE') }],
      '2026-10-01',
      '2026-10-31',
    );

    expect(reading.duties).toHaveLength(1);
    expect(reading.duties[0].start).toBe('2026-10-03T06:00');
    expect(reading.duties[0].end).toBe('2026-10-03T16:00');
    // Both sectors belong to the one duty, which is what the report-to-release pair describes.
    expect(reading.sectors).toHaveLength(2);
    expect(reading.sectors.every((sector) => sector.dutyIndex === 0)).toBe(true);
    expect(reading.sectors[0]).toMatchObject({
      flightNumber: '931',
      date: '2026-10-03',
      departureAirport: 'ALA',
      arrivalAirport: 'TSE',
      timeOut: '07:00',
      timeIn: '08:30',
      aircraftType: '320',
    });
    expect(reading.sectors[1]).toMatchObject({
      flightNumber: '932',
      departureAirport: 'TSE',
      arrivalAirport: 'ALA',
      timeOut: '14:00',
      timeIn: '15:30',
    });
  });

  it('joins a sector split across midnight by the arrow glyphs', () => {
    const reading = readGrid([
      { label: '03/10', cells: ['20:00', '901', '21:00', 'ALA', '→'] },
      { label: '04/10', cells: ['↓', 'DXB', '01:30', '03:00'] },
    ], '2026-10-01', '2026-10-31');

    expect(reading.sectors).toHaveLength(1);
    expect(reading.sectors[0]).toMatchObject({
      date: '2026-10-03',
      departureAirport: 'ALA',
      arrivalAirport: 'DXB',
      timeOut: '21:00',
      timeIn: '01:30',
      arrivalDate: '2026-10-04',
    });
  });

  it('marks a deadhead station and an actual time', () => {
    const reading = readGrid(
      [{ label: '03/10', cells: ['06:00', '931', 'A07:05', '*ALA', 'TSE', 'A08:40', '16:00'] }],
      '2026-10-01',
      '2026-10-31',
    );
    expect(reading.sectors[0]).toMatchObject({ deadhead: true, actualTimes: true, timeOut: '07:05' });
  });

  it('reads a ground duty with its own hours', () => {
    const reading = readGrid(
      [{ label: '03/10', cells: ['SIM', '09:00', '13:00'] }],
      '2026-10-01',
      '2026-10-31',
    );
    expect(reading.groundDuties).toEqual([{ date: '2026-10-03', code: 'SIM', start: '09:00', end: '13:00' }]);
    expect(reading.duties).toHaveLength(0);
  });

  it('keeps a ground duty the report gives no hours for', () => {
    const reading = readGrid(
      [{ label: '03/10', cells: ['COURSE'] }],
      '2026-10-01',
      '2026-10-31',
    );
    expect(reading.groundDuties).toEqual([{ date: '2026-10-03', code: 'COURSE' }]);
  });

  it('reports cells it could not account for instead of swallowing them', () => {
    const reading = readGrid(
      [{ label: '03/10', cells: ['???', '!!'] }],
      '2026-10-01',
      '2026-10-31',
    );
    expect(reading.unreadCells).toEqual(['???', '!!']);
  });
});

describe('a whole PDF roster', () => {
  const page = rosterPage({
    period: PERIOD,
    subject: SUBJECT,
    days: [
      { label: '01/10', cells: flyingDay('931', 'ALA', 'TSE') },
      { label: '02/10', cells: ['OFF'] },
      { label: '03/10', cells: ['OFF'] },
      { label: '04/10', cells: ['VAC'] },
    ],
  });

  it('comes out as a roster the match engine can read', () => {
    const { roster, subject, unreadCells } = parsePdfRoster([page]);

    expect(subject).toMatchObject({ name: 'IVANOV', base: 'ALA' });
    expect(unreadCells).toEqual([]);
    expect(roster.period).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(roster.base).toBe('ALA');
    expect(roster.duties).toHaveLength(1);
    expect(roster.duties[0].flights[0]).toMatchObject({
      flightNumber: 'KC931',
      origin: 'ALA',
      destination: 'TSE',
    });
    expect(roster.dayCodes).toEqual([
      { date: '2026-10-02', code: 'OFF' },
      { date: '2026-10-03', code: 'OFF' },
      { date: '2026-10-04', code: 'VAC' },
    ]);
  });

  it('covers the days the grid drew, not the month the header claimed', () => {
    // The header says the whole of October; the grid holds four days of it. Believing the header
    // would leave twenty-seven unrostered days reading as free, and every one of them would be
    // offered as a day together.
    const { roster } = parsePdfRoster([page]);
    expect(roster.period).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(roster.coverage).toEqual({ start: '2026-10-01', end: '2026-10-04' });

    const days = buildAvailability(roster, { dayStartMinutes: 8 * 60, dayEndMinutes: 23 * 60 });
    expect(days).toHaveLength(4);
    expect(days.at(-1)?.date).toBe('2026-10-04');
  });

  it('keeps an empty column inside coverage, because a layover day prints nothing', () => {
    const withLayover = rosterPage({
      period: PERIOD,
      subject: SUBJECT,
      days: [
        { label: '01/10', cells: ['18:00', '901', '19:00', 'ALA', 'DXB', '22:00', '23:00'] },
        { label: '02/10', cells: [] },
        { label: '03/10', cells: ['06:00', '902', '07:00', 'DXB', 'ALA', '11:00', '12:00'] },
      ],
    });
    const { roster } = parsePdfRoster([withLayover]);
    expect(roster.coverage).toEqual({ start: '2026-10-01', end: '2026-10-03' });

    const days = buildAvailability(roster, { dayStartMinutes: 8 * 60, dayEndMinutes: 23 * 60 });
    // The blank middle day is a day down route, not a day with no roster.
    expect(days[1]).toMatchObject({ date: '2026-10-02', state: 'away', station: 'DXB' });
  });

  it('takes the base from the report rather than assuming one', () => {
    const tse = rosterPage({ period: PERIOD, subject: '99999 PETROV TSE-CP-A321', days: [{ label: '01/10', cells: ['OFF'] }] });
    expect(parsePdfRoster([tse]).roster.base).toBe('TSE');
  });

  it('drives the availability and match engines end to end', () => {
    const { roster } = parsePdfRoster([page]);
    const options = { dayStartMinutes: 8 * 60, dayEndMinutes: 23 * 60 };
    const days = buildAvailability(roster, options).slice(0, 4);

    expect(days.map((day) => day.state)).toEqual(['duty', 'free', 'free', 'leave']);

    // The same roster against itself. The days off and the leave day line up, and so does the
    // evening of the flying day: that duty lands back at base at 15:30, which leaves a real
    // evening behind it rather than a day written off as "working".
    const matched = matchDays(buildAvailability(roster, options), buildAvailability(roster, options))
      .filter((day) => day.matched)
      .slice(0, 4);
    expect(matched.map((day) => day.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(matched[0].quality).toBe('evening');
    expect(matched[1].quality).toBe('whole-day');
  });
});
