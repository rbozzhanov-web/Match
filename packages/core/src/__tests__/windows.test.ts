import { describe, expect, it } from 'vitest';
import { buildAvailability } from '../roster/availability';
import { matchDays } from '../match/matchDays';
import { longestWindow, nextWindow, togetherWindows } from '../match/windows';
import { buildTogetherIcs } from '../calendar/ics';
import { codes, flight, roster } from './fixtures';

const window = { dayStartMinutes: 8 * 60, dayEndMinutes: 23 * 60 };

function both(dates: string[], start: string, end: string) {
  const you = buildAvailability(roster({ start, end, dayCodes: codes('OFF', ...dates) }), window);
  const them = buildAvailability(roster({ start, end, dayCodes: codes('OFF', ...dates) }), window);
  return matchDays(you, them);
}

describe('grouping days into runs', () => {
  it('turns three consecutive days into one window with two nights', () => {
    const days = both(['2026-10-03', '2026-10-04', '2026-10-05'], '2026-10-03', '2026-10-05');
    const [run] = togetherWindows(days);

    expect(run.start).toBe('2026-10-03');
    expect(run.end).toBe('2026-10-05');
    expect(run.days).toBe(3);
    expect(run.nights).toBe(2);
    expect(run.minutes).toBe(2700);
    expect(run.headline).toBe('3 days together · 45h');
    expect(run.commonHours).toEqual({ start: 480, end: 1380 });
  });

  it('breaks a run on a gap', () => {
    const start = '2026-10-01';
    const end = '2026-10-10';
    const you = buildAvailability(roster({ start, end, dayCodes: codes('OFF', '2026-10-01', '2026-10-02', '2026-10-07') }), window);
    const them = buildAvailability(roster({ start, end, dayCodes: codes('OFF', '2026-10-01', '2026-10-02', '2026-10-07') }), window);
    // Everything not marked OFF is still an unrostered day at base, so restrict to a roster where
    // the other days carry duty.
    const busy = roster({
      start,
      end,
      dayCodes: codes('OFF', '2026-10-01', '2026-10-02', '2026-10-07'),
      duties: ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-10'].map((date) => ({
        date,
        start: `${date}T05:00`,
        end: `${date}T23:30`,
        flights: [],
      })),
    });
    const windows = togetherWindows(matchDays(buildAvailability(busy, window), buildAvailability(busy, window)));
    expect(windows.map((run) => [run.start, run.end, run.days])).toEqual([
      ['2026-10-01', '2026-10-02', 2],
      ['2026-10-07', '2026-10-07', 1],
    ]);
    void you;
    void them;
  });

  it('breaks a run when the place changes, even on touching days', () => {
    const trip = {
      start: '2026-10-01',
      end: '2026-10-03',
      dayCodes: codes('OFF', '2026-10-03'),
      duties: [
        {
          date: '2026-10-01',
          start: '2026-10-01T06:00',
          end: '2026-10-01T12:00',
          flights: [flight('2026-10-01', '901', 'ALA', 'DXB', '07:00', '11:00')],
        },
        {
          date: '2026-10-03',
          start: '2026-10-03T01:00',
          end: '2026-10-03T06:00',
          flights: [flight('2026-10-03', '902', 'DXB', 'ALA', '02:00', '05:00')],
        },
      ],
    } as const;
    const days = matchDays(buildAvailability(roster({ ...trip }), window), buildAvailability(roster({ ...trip }), window));
    const windows = togetherWindows(days);

    // They land in Dubai together on the 1st and are released into that evening, so the layover
    // run is two days long — and then it breaks at the 3rd, which is the same two people on
    // consecutive days in a different city. Adjacent, but not one stretch of time together.
    expect(windows.map((run) => [run.start, run.end, run.station])).toEqual([
      ['2026-10-01', '2026-10-02', 'DXB'],
      ['2026-10-03', '2026-10-03', 'ALA'],
    ]);
  });

  it('picks the longest and the next run', () => {
    const start = '2026-10-01';
    const end = '2026-10-12';
    const source = roster({
      start,
      end,
      dayCodes: codes('OFF', '2026-10-02', '2026-10-08', '2026-10-09', '2026-10-10'),
      duties: ['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-11', '2026-10-12'].map((date) => ({
        date,
        start: `${date}T05:00`,
        end: `${date}T23:30`,
        flights: [],
      })),
    });
    const windows = togetherWindows(matchDays(buildAvailability(source, window), buildAvailability(source, window)));

    expect(longestWindow(windows)?.days).toBe(3);
    expect(nextWindow(windows, '2026-10-03')?.start).toBe('2026-10-08');
    expect(nextWindow(windows, '2026-10-09')?.start).toBe('2026-10-08');
  });

  it('carries a standby day uncertainty up to the window', () => {
    const source = roster({
      start: '2026-10-01',
      end: '2026-10-02',
      dayCodes: [{ date: '2026-10-01', code: 'OFF' }, { date: '2026-10-02', code: 'AVLB' }],
    });
    const [run] = togetherWindows(matchDays(buildAvailability(source, window), buildAvailability(source, window)));
    expect(run.days).toBe(2);
    expect(run.tentative).toBe(true);
  });
});

describe('calendar export', () => {
  it('writes an all-day event that reaches past the last day', () => {
    const days = both(['2026-10-03', '2026-10-04'], '2026-10-03', '2026-10-04');
    const ics = buildTogetherIcs(togetherWindows(days), { partnerName: 'Khava' });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Together with Khava');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261003');
    // Exclusive end, so the 4th is included.
    expect(ics).toContain('DTEND;VALUE=DATE:20261005');
    expect(ics).toContain('TRANSP:TRANSPARENT');
    expect(ics.split('\r\n').every((line) => line.length <= 998)).toBe(true);
  });

  it('escapes text that would otherwise break the format', () => {
    const days = both(['2026-10-03'], '2026-10-03', '2026-10-03');
    const ics = buildTogetherIcs(togetherWindows(days), { partnerName: 'Khava, and family' });
    expect(ics).toContain('SUMMARY:Together with Khava\\, and family');
  });
});
