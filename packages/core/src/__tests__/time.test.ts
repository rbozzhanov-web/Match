import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayNumber,
  eachDate,
  formatDuration,
  hhmmToMinutes,
  intersectIntervals,
  isIsoDate,
  longestInterval,
  mergeIntervals,
  minutesToHHMM,
  subtractIntervals,
  totalMinutes,
} from '../time';

describe('clock parsing', () => {
  it('reads and writes HH:MM', () => {
    expect(hhmmToMinutes('05:30')).toBe(330);
    expect(hhmmToMinutes('00:00')).toBe(0);
    expect(hhmmToMinutes('23:59')).toBe(1439);
    expect(minutesToHHMM(330)).toBe('05:30');
  });

  it('rejects what is not a time', () => {
    expect(hhmmToMinutes('24:00')).toBeNull();
    expect(hhmmToMinutes('7:60')).toBeNull();
    expect(hhmmToMinutes(undefined)).toBeNull();
  });

  it('wraps a time past midnight rather than printing 25:30', () => {
    expect(minutesToHHMM(1530)).toBe('01:30');
  });

  it('speaks durations the way the app does', () => {
    expect(formatDuration(150)).toBe('2h 30m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(45)).toBe('45m');
  });
});

describe('dates', () => {
  it('validates real calendar dates', () => {
    expect(isIsoDate('2026-10-05')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists a range inclusively and yields nothing when inverted', () => {
    expect(eachDate('2026-10-01', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(eachDate('2026-10-03', '2026-10-01')).toEqual([]);
  });

  it('counts whole days between dates', () => {
    expect(dayNumber('2026-10-02') - dayNumber('2026-10-01')).toBe(1);
  });
});

describe('interval arithmetic', () => {
  it('merges overlapping and touching runs', () => {
    expect(mergeIntervals([{ start: 60, end: 120 }, { start: 100, end: 180 }, { start: 180, end: 200 }]))
      .toEqual([{ start: 60, end: 200 }]);
  });

  it('drops empty intervals', () => {
    expect(mergeIntervals([{ start: 60, end: 60 }])).toEqual([]);
  });

  it('subtracts a block from the middle of a day', () => {
    expect(subtractIntervals({ start: 0, end: 1440 }, [{ start: 480, end: 720 }]))
      .toEqual([{ start: 0, end: 480 }, { start: 720, end: 1440 }]);
  });

  it('subtracts blocks that overhang both ends', () => {
    expect(subtractIntervals({ start: 480, end: 1380 }, [{ start: 0, end: 600 }, { start: 1300, end: 1600 }]))
      .toEqual([{ start: 600, end: 1300 }]);
  });

  it('returns nothing when the day is entirely taken', () => {
    expect(subtractIntervals({ start: 480, end: 1380 }, [{ start: 0, end: 1440 }])).toEqual([]);
  });

  it('intersects two sets of free time', () => {
    const shared = intersectIntervals(
      [{ start: 480, end: 720 }, { start: 1000, end: 1380 }],
      [{ start: 600, end: 1100 }],
    );
    expect(shared).toEqual([{ start: 600, end: 720 }, { start: 1000, end: 1100 }]);
    expect(totalMinutes(shared)).toBe(220);
  });

  it('finds the longest stretch', () => {
    expect(longestInterval([{ start: 0, end: 60 }, { start: 200, end: 500 }])).toEqual({ start: 200, end: 500 });
    expect(longestInterval([])).toBeUndefined();
  });
});
