import { describe, expect, it } from 'vitest';
import { buildAvailability } from '../roster/availability';
import { matchDays, matchedDays, nextMatch, totalTogetherMinutes } from '../match/matchDays';
import { codes, flight, roster } from './fixtures';

const window = { dayStartMinutes: 8 * 60, dayEndMinutes: 23 * 60 };

function availability(input: Parameters<typeof roster>[0]) {
  return buildAvailability(roster(input), window);
}

describe('matching two days off', () => {
  it('calls a day both of you have off a whole day together', () => {
    const you = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') });
    const them = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('DOFF', '2026-10-01') });

    const [day] = matchDays(you, them);
    expect(day.matched).toBe(true);
    expect(day.minutes).toBe(900);
    expect(day.quality).toBe('whole-day');
    expect(day.kind).toBe('home');
    expect(day.station).toBe('ALA');
    expect(day.headline).toBe('All day together');
    expect(day.tentative).toBe(false);
  });

  it('counts leave as time together', () => {
    const you = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('VAC', '2026-10-01') });
    const them = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') });
    expect(matchDays(you, them)[0].matched).toBe(true);
  });

  it('marks a day resting on standby as tentative', () => {
    const you = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('AVLB', '2026-10-01') });
    const them = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') });

    const [day] = matchDays(you, them);
    expect(day.matched).toBe(true);
    expect(day.tentative).toBe(true);
  });

  it('can be told not to count standby at all', () => {
    const you = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('AVLB', '2026-10-01') });
    const them = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') });

    const [day] = matchDays(you, them, { includeStandby: false });
    expect(day.matched).toBe(false);
    expect(day.reason).toBe('both-working');
  });

  it('flags sick leave on an otherwise matching day', () => {
    const you = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('SICK', '2026-10-01') });
    const them = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') });

    const [day] = matchDays(you, them);
    expect(day.matched).toBe(true);
    expect(day.caution).toBe('One of you is on sick leave');
  });
});

describe('when you are not in the same place', () => {
  it('refuses a day one of you spends down route', () => {
    const you = availability({
      start: '2026-10-01',
      end: '2026-10-02',
      duties: [{
        date: '2026-10-01',
        start: '2026-10-01T06:00',
        end: '2026-10-01T12:00',
        flights: [flight('2026-10-01', '901', 'ALA', 'DXB', '07:00', '11:00')],
      }],
    });
    const them = availability({ start: '2026-10-01', end: '2026-10-02', dayCodes: codes('OFF', '2026-10-01', '2026-10-02') });

    const days = matchDays(you, them);
    expect(days[1].matched).toBe(false);
    expect(days[1].reason).toBe('different-stations');
    expect(days[1].headline).toBe('DXB and ALA');
  });

  it('matches two people who are down route in the same city', () => {
    const trip = {
      start: '2026-10-01',
      end: '2026-10-02',
      duties: [{
        date: '2026-10-01',
        start: '2026-10-01T06:00',
        end: '2026-10-01T12:00',
        flights: [flight('2026-10-01', '901', 'ALA', 'DXB', '07:00', '11:00')],
      }],
    };
    const you = availability({ ...trip });
    const them = availability({ ...trip });

    const [, layover] = matchDays(you, them);
    expect(layover.matched).toBe(true);
    expect(layover.kind).toBe('layover');
    expect(layover.station).toBe('DXB');
    expect(layover.headline).toBe('All day together in DXB');
  });

  it('can be told to ignore layover matches', () => {
    const trip = {
      start: '2026-10-01',
      end: '2026-10-02',
      duties: [{
        date: '2026-10-01',
        start: '2026-10-01T06:00',
        end: '2026-10-01T12:00',
        flights: [flight('2026-10-01', '901', 'ALA', 'DXB', '07:00', '11:00')],
      }],
    };
    const days = matchDays(availability({ ...trip }), availability({ ...trip }), { allowLayoverMatches: false });
    expect(days[1].matched).toBe(false);
  });

  it('never matches a day one roster does not cover', () => {
    const you = availability({ start: '2026-10-01', end: '2026-10-03', dayCodes: codes('OFF', '2026-10-01', '2026-10-02', '2026-10-03') });
    const them = availability({ start: '2026-10-01', end: '2026-10-02', dayCodes: codes('OFF', '2026-10-01', '2026-10-02') });

    const days = matchDays(you, them);
    // The third day is simply absent from the answer rather than guessed at.
    expect(days).toHaveLength(2);
    expect(days.every((day) => day.matched)).toBe(true);
  });
});

describe('partial days', () => {
  it('finds the evening left after a morning duty', () => {
    const you = availability({
      start: '2026-10-01',
      end: '2026-10-01',
      duties: [{
        date: '2026-10-01',
        start: '2026-10-01T06:00',
        end: '2026-10-01T14:00',
        flights: [flight('2026-10-01', '931', 'ALA', 'TSE', '07:00', '08:30'), flight('2026-10-01', '932', 'TSE', 'ALA', '12:00', '13:30')],
      }],
    });
    const them = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') });

    const [day] = matchDays(you, them);
    expect(day.matched).toBe(true);
    // Released 14:00 plus an hour to get home.
    expect(day.overlap).toEqual([{ start: 900, end: 1380 }]);
    expect(day.quality).toBe('half-day');
  });

  it('grades a short late window as an evening', () => {
    const you = availability({
      start: '2026-10-01',
      end: '2026-10-01',
      duties: [{ date: '2026-10-01', start: '2026-10-01T06:00', end: '2026-10-01T18:00', flights: [] }],
    });
    const them = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') });

    const [day] = matchDays(you, them);
    expect(day.quality).toBe('evening');
    expect(day.headline).toBe('Evening together · 19:00–23:00');
  });

  it('reports a day that is too short rather than padding the count', () => {
    const you = availability({
      start: '2026-10-01',
      end: '2026-10-01',
      duties: [{ date: '2026-10-01', start: '2026-10-01T06:00', end: '2026-10-01T21:00', flights: [] }],
    });
    const them = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') });

    const [day] = matchDays(you, them, { minimumMinutes: 120 });
    expect(day.matched).toBe(false);
    expect(day.reason).toBe('too-short');
    expect(day.minutes).toBe(60);
    expect(day.headline).toBe('Only 1h together');
  });

  it('finds no overlap when two duties fill the day between them', () => {
    const you = availability({
      start: '2026-10-01',
      end: '2026-10-01',
      duties: [{ date: '2026-10-01', start: '2026-10-01T05:00', end: '2026-10-01T23:30', flights: [] }],
    });
    const them = availability({ start: '2026-10-01', end: '2026-10-01', dayCodes: codes('OFF', '2026-10-01') });

    const [day] = matchDays(you, them);
    expect(day.matched).toBe(false);
    expect(day.reason).toBe('both-working');
  });
});

describe('reading a month', () => {
  it('totals and finds the next day together', () => {
    const you = availability({ start: '2026-10-01', end: '2026-10-05', dayCodes: codes('OFF', '2026-10-03', '2026-10-04') });
    const them = availability({ start: '2026-10-01', end: '2026-10-05', dayCodes: codes('OFF', '2026-10-04', '2026-10-05') });

    const days = matchDays(you, them);
    expect(matchedDays(days)).toHaveLength(5);
    expect(totalTogetherMinutes(days)).toBe(4500);
    expect(nextMatch(days, '2026-10-02')?.date).toBe('2026-10-02');
  });

  it('gives back nothing for a month with no shared roster', () => {
    const you = availability({ start: '2026-10-01', end: '2026-10-02' });
    const them = availability({ start: '2026-11-01', end: '2026-11-02' });
    expect(matchDays(you, them)).toHaveLength(0);
  });
});
