import { describe, expect, it } from 'vitest';
import { buildAvailability } from '../roster/availability';
import { codes, flight, roster } from './fixtures';

const window = { dayStartMinutes: 8 * 60, dayEndMinutes: 23 * 60 };

describe('day state', () => {
  it('reads a rostered day off at base as free for the whole sociable day', () => {
    const [day] = buildAvailability(
      roster({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') }),
      window,
    );
    expect(day.state).toBe('free');
    expect(day.station).toBe('ALA');
    expect(day.free).toEqual([{ start: 480, end: 1380 }]);
    expect(day.label).toBe('Day off');
  });

  it('treats annual leave as free and says so', () => {
    const [day] = buildAvailability(
      roster({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('VAC', '2026-10-01') }),
      window,
    );
    expect(day.state).toBe('leave');
    expect(day.freeMinutes).toBe(900);
    expect(day.label).toBe('Annual leave');
  });

  it('marks standby free but distinguishable', () => {
    const [day] = buildAvailability(
      roster({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('HOMS', '2026-10-01') }),
      window,
    );
    expect(day.state).toBe('standby');
    expect(day.label).toBe('Home standby');
  });

  it('reads an uncovered day as unknown with no free time', () => {
    const days = buildAvailability(roster({ start: '2026-10-01', end: '2026-10-02' }), window);
    // Nothing rostered at all still means "at base with nothing on", which is free; the unknown
    // case is a date outside coverage entirely.
    expect(days.every((day) => day.state === 'free')).toBe(true);
    expect(days).toHaveLength(2);
  });
});

describe('duty time', () => {
  it('takes report-to-release out of the day, with both buffers', () => {
    const [day] = buildAvailability(
      roster({
        start: '2026-10-01',
        end: '2026-10-01',
        duties: [{
          date: '2026-10-01',
          start: '2026-10-01T10:00',
          end: '2026-10-01T16:00',
          flights: [flight('2026-10-01', '931', 'ALA', 'TSE', '11:00', '12:30'), flight('2026-10-01', '932', 'TSE', 'ALA', '13:30', '15:00')],
        }],
      }),
      { ...window, preDutyBufferMinutes: 90, postDutyBufferMinutes: 60 },
    );
    expect(day.state).toBe('duty');
    expect(day.station).toBe('ALA');
    // Busy runs 08:30 (10:00 less 90m) to 17:00 (16:00 plus 60m).
    expect(day.busy).toEqual([{ start: 510, end: 1020 }]);
    expect(day.free).toEqual([{ start: 480, end: 510 }, { start: 1020, end: 1380 }]);
  });

  it('bleeds an early report backwards into the evening before', () => {
    const days = buildAvailability(
      roster({
        start: '2026-10-01',
        end: '2026-10-02',
        duties: [{
          date: '2026-10-02',
          start: '2026-10-02T05:00',
          end: '2026-10-02T12:00',
          flights: [flight('2026-10-02', '931', 'ALA', 'TSE', '06:00', '07:30')],
        }],
      }),
      { ...window, preDutyBufferMinutes: 180, postDutyBufferMinutes: 60 },
    );
    // A 05:00 report with a three-hour run-up starts at 02:00, so the previous day loses nothing
    // inside its sociable window — but a longer buffer must reach it, which is the point of the
    // backwards spread.
    const evening = days[0];
    expect(evening.date).toBe('2026-10-01');
    expect(evening.busy).toEqual([]);
    expect(days[1].busy[0].start).toBe(120);
  });

  it('spreads a duty that crosses midnight over both days', () => {
    const days = buildAvailability(
      roster({
        start: '2026-10-01',
        end: '2026-10-02',
        duties: [{
          date: '2026-10-01',
          start: '2026-10-01T20:00',
          end: '2026-10-02T04:00',
          flights: [flight('2026-10-01', '901', 'ALA', 'DXB', '21:00', '23:30', { arrivalDate: '2026-10-01' })],
        }],
      }),
      { ...window, preDutyBufferMinutes: 60, postDutyBufferMinutes: 60 },
    );
    expect(days[0].busy).toEqual([{ start: 1140, end: 1440 }]);
    expect(days[1].busy).toEqual([{ start: 0, end: 300 }]);
  });

  it('closes an overnight duty whose release time reads earlier than its report', () => {
    const days = buildAvailability(
      roster({
        start: '2026-10-01',
        end: '2026-10-02',
        duties: [{ date: '2026-10-01', start: '2026-10-01T22:00', end: '2026-10-01T03:00', flights: [] }],
      }),
      { ...window, preDutyBufferMinutes: 0, postDutyBufferMinutes: 0 },
    );
    expect(days[0].busy).toEqual([{ start: 1320, end: 1440 }]);
    expect(days[1].busy).toEqual([{ start: 0, end: 180 }]);
  });
});

describe('where the person is', () => {
  it('follows sectors out of base and keeps them there on a blank layover day', () => {
    const days = buildAvailability(
      roster({
        start: '2026-10-01',
        end: '2026-10-04',
        duties: [
          {
            date: '2026-10-01',
            start: '2026-10-01T18:00',
            end: '2026-10-01T23:00',
            flights: [flight('2026-10-01', '901', 'ALA', 'DXB', '19:00', '22:00')],
          },
          {
            date: '2026-10-04',
            start: '2026-10-04T06:00',
            end: '2026-10-04T12:00',
            flights: [flight('2026-10-04', '902', 'DXB', 'ALA', '07:00', '11:00')],
          },
        ],
      }),
      window,
    );
    expect(days.map((day) => day.station)).toEqual(['DXB', 'DXB', 'DXB', 'ALA']);
    // The two middle days carry no roster entry at all, and they are still away.
    expect(days[1].state).toBe('away');
    expect(days[1].label).toBe('In DXB');
    expect(days[2].atBase).toBe(false);
    expect(days[3].state).toBe('duty');
  });

  it('keeps free hours on a layover day so two people down route can still match', () => {
    const days = buildAvailability(
      roster({
        start: '2026-10-01',
        end: '2026-10-02',
        duties: [{
          date: '2026-10-01',
          start: '2026-10-01T06:00',
          end: '2026-10-01T12:00',
          flights: [flight('2026-10-01', '901', 'ALA', 'DXB', '07:00', '11:00')],
        }],
      }),
      window,
    );
    const layover = days[1];
    expect(layover.state).toBe('away');
    expect(layover.station).toBe('DXB');
    expect(layover.freeMinutes).toBe(900);
  });

  it('believes a roster that starts mid-trip rather than assuming everyone wakes up at home', () => {
    const days = buildAvailability(
      roster({
        start: '2026-10-01',
        end: '2026-10-01',
        duties: [{
          date: '2026-10-01',
          start: '2026-10-01T06:00',
          end: '2026-10-01T12:00',
          flights: [flight('2026-10-01', '902', 'DXB', 'ALA', '07:00', '11:00')],
        }],
      }),
      window,
    );
    expect(days[0].station).toBe('ALA');
  });

  it('labels a flying day with its route', () => {
    const days = buildAvailability(
      roster({
        start: '2026-10-01',
        end: '2026-10-01',
        duties: [{
          date: '2026-10-01',
          start: '2026-10-01T06:00',
          end: '2026-10-01T16:00',
          flights: [flight('2026-10-01', '931', 'ALA', 'TSE', '07:00', '08:30'), flight('2026-10-01', '932', 'TSE', 'ALA', '09:30', '11:00')],
        }],
      }),
      window,
    );
    expect(days[0].label).toBe('KC931 ALA→ALA');
  });
});

describe('ground duties', () => {
  it('occupies a day with training even though nothing flies', () => {
    const [day] = buildAvailability(
      roster({
        start: '2026-10-01',
        end: '2026-10-01',
        groundDuties: [{ date: '2026-10-01', code: 'SIM', start: '09:00', end: '13:00' }],
      }),
      { ...window, preDutyBufferMinutes: 60, postDutyBufferMinutes: 60 },
    );
    expect(day.state).toBe('duty');
    expect(day.busy).toEqual([{ start: 480, end: 840 }]);
    expect(day.free).toEqual([{ start: 840, end: 1380 }]);
  });
});
