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

describe('audit regressions: corrected imports', () => {
  it('preserves gaps between months', () => {
    const merged = mergeRoster(parseDayCodeText('2026-09-01 OFF'), parseDayCodeText('2026-11-01 OFF')!);
    expect(buildAvailability(merged).find(d => d.date === '2026-10-15')?.state).toBe('unknown');
  });
  it('replaces a cancelled flight and its old day code with the latest snapshot', () => {
    const old = { ...parseDayCodeText('2026-09-20 OFF')!, duties: [{ date:'2026-09-20', start:'2026-09-20T10:00',end:'2026-09-20T16:00',flights:[] }],groundDuties:[{date:'2026-09-20',code:'SIM'}] };
    const merged = mergeRoster(old, parseDayCodeText('2026-09-20 VAC')!);
    expect(merged.duties).toEqual([]); expect(merged.groundDuties).toEqual([]);
    expect(merged.dayCodes?.[0].code).toBe('VAC');
  });
  it('uses the latest report and retains non-overlapping dates', () => {
    const old = { ...parseDayCodeText('2026-09-20 OFF\n2026-09-21 OFF')!, duties:[{date:'2026-09-20',start:'2026-09-20T15:00',end:'2026-09-20T18:00',flights:[]}] };
    const fresh = {...parseDayCodeText('2026-09-20 OFF')!, duties:[{...old.duties[0],start:'2026-09-20T10:00'}]};
    const merged = mergeRoster(old, fresh);
    expect(merged.duties[0].start).toBe('2026-09-20T10:00'); expect(merged.coveredDates).toContain('2026-09-21');
  });
});

describe('AIMS time zone boundaries', () => {
  it('does not roll a westbound arrival or following departure into tomorrow', async () => {
    const {parseAimsArchive} = await import('../aims');
    const html = `CrewSchedule localStorage['PeriodStart']='2026-09-20'; localStorage['PeriodEnd']='2026-09-20'; var initialResult = ${JSON.stringify({SchedulerEvents:[{start:'2026-09-20T09:00',end:'2026-09-20T18:00',details:'1 - ALA (1000) - IST (0900) 2 - IST (1000) - ALA (1700)'}]})};`;
    const bytes = new TextEncoder().encode(html);
    const file = {arrayBuffer: async () => bytes.buffer} as File;
    const roster=await parseAimsArchive(file);
    expect(roster.duties[0].flights.map(f=>[f.date,f.arrivalDate])).toEqual([['2026-09-20',undefined],['2026-09-20',undefined]]);
  });
});
