import { describe, expect, it } from 'vitest';
import { buildAvailability, matchDays } from '@match/core';

import { buildQuickRoster, parseDayCodeText, weekendsOff } from '../quickRoster';
import { mergeRoster } from '../aims';

describe('a roster for someone who does not fly', () => {
  it('turns days off into free days and everything else into a working day', () => {
    const roster = buildQuickRoster({ start: '2026-10-01', end: '2026-10-03', freeDates: ['2026-10-02'] });
    const days = buildAvailability(roster, { dayStartMinutes: 480, dayEndMinutes: 1380, preDutyBufferMinutes: 0, postDutyBufferMinutes: 0 });

    expect(days.map((day) => day.state)).toEqual(['duty', 'free', 'duty']);
    expect(days[0].busy).toEqual([{ start: 540, end: 1080 }]);
    expect(days[1].freeMinutes).toBe(900);
  });

  it('gives a weekday worker their weekends', () => {
    // 2026-10-03 is a Saturday, 2026-10-04 a Sunday.
    const roster = weekendsOff('2026-10-01', '2026-10-07');
    const free = (roster.dayCodes ?? []).map((entry) => entry.date);
    expect(free).toEqual(['2026-10-03', '2026-10-04']);
  });

  it('leaves a nine-to-five and a crew day off matching in the evening', () => {
    const office = buildQuickRoster({ start: '2026-10-01', end: '2026-10-01', freeDates: [] });
    const crew = buildQuickRoster({ start: '2026-10-01', end: '2026-10-01', freeDates: ['2026-10-01'] });
    const options = { dayStartMinutes: 480, dayEndMinutes: 1380, preDutyBufferMinutes: 0, postDutyBufferMinutes: 0 };

    const [day] = matchDays(buildAvailability(office, options), buildAvailability(crew, options));
    expect(day.matched).toBe(true);
    expect(day.overlap).toEqual([{ start: 480, end: 540 }, { start: 1080, end: 1380 }]);
  });
});

describe('typed day codes', () => {
  it('reads dates and codes, ignoring lines it cannot parse', () => {
    const roster = parseDayCodeText('2026-10-03 OFF\nnonsense\n2026-10-04, vac\n2026-13-99 OFF');
    expect(roster?.dayCodes).toEqual([
      { date: '2026-10-03', code: 'OFF' },
      { date: '2026-10-04', code: 'VAC' },
    ]);
    expect(roster?.coverage).toEqual({ start: '2026-10-03', end: '2026-10-04' });
  });

  it('gives back nothing when there is nothing to read', () => {
    expect(parseDayCodeText('no dates here')).toBeUndefined();
  });
});

describe('merging imports', () => {
  it('widens coverage rather than replacing it', () => {
    const october = parseDayCodeText('2026-10-03 OFF')!;
    const november = parseDayCodeText('2026-11-05 OFF')!;
    const merged = mergeRoster(october, november);

    expect(merged.coverage).toEqual({ start: '2026-10-03', end: '2026-11-05' });
    expect(merged.dayCodes).toHaveLength(2);
  });

  it('keeps one entry per day when the same month is imported twice', () => {
    const first = parseDayCodeText('2026-10-03 OFF')!;
    const second = parseDayCodeText('2026-10-03 VAC')!;
    const merged = mergeRoster(first, second);

    expect(merged.dayCodes).toHaveLength(1);
    // The newer import wins, which is what re-importing a corrected roster is for.
    expect(merged.dayCodes?.[0].code).toBe('VAC');
  });
});
