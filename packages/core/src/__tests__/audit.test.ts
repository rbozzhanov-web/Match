import { describe, expect, it } from 'vitest';
import { buildAvailability, matchDays, remainingMatches, togetherWindows, stationInstant, parsePdfRoster, type Roster } from '../index';
import { rosterPage } from './pdfFixtures';

const date = '2026-09-20';
const empty = (start = date, end = start, base = 'ALA'): Roster => ({ period: { start, end }, duties: [], base });
const trip = (origin = 'ALA', destination = 'NQZ'): Roster => ({ ...empty(), duties: [{ date, start: `${date}T15:00`, end: `${date}T18:00`, flights: [{ flightNumber: 'KC1', date, origin, destination, departure: '16:00', arrival: '17:30' }] }] });

describe('audit regressions: reliable availability', () => {
  it('does not turn gaps or uncertain dates into days off', () => {
    const source = { ...empty('2026-09-01', '2026-09-03'), coveredDates: ['2026-09-01', '2026-09-03'], uncertainDates: ['2026-09-03'] };
    expect(buildAvailability(source).map(d => [d.state, d.freeMinutes])).toEqual([['free', 900], ['unknown', 0], ['unknown', 0]]);
  });
  it('blocks manually entered work and unknown codes', () => {
    for (const code of ['SIM', 'WORK', 'TYPO']) expect(buildAvailability({ ...empty(), dayCodes: [{date,code}] })[0].freeMinutes).toBe(0);
  });
  it('keeps morning at origin and evening at destination', () => {
    const you = buildAvailability(trip());
    const home = matchDays(you, buildAvailability(empty()))[0];
    expect(home.station).toBe('ALA'); expect(home.overlap).toEqual([{ start: 480, end: 810 }]);
    const away = matchDays(you, buildAvailability(empty(date, date, 'NQZ')))[0];
    expect(away.station).toBe('NQZ'); expect(away.overlap).toEqual([{ start: 1140, end: 1380 }]);
  });
  it('keeps both locations when both people travel', () => {
    const days = matchDays(buildAvailability(trip()), buildAvailability(trip()));
    expect(days[0].sessions?.map(s => s.station)).toEqual(['ALA', 'NQZ']);
    expect(togetherWindows(days).map(w => w.station).sort()).toEqual(['ALA', 'NQZ']);
    expect(days[0].minutes).toBe(570);
  });
  it('normalizes TSE and NQZ', () => {
    const days = matchDays(buildAvailability(empty(date,date,'TSE')), buildAvailability(empty(date,date,'NQZ')));
    expect(days[0].matched).toBe(true);
  });
  it('does not infer a location across a gap in roster coverage', () => {
    const r = trip(); r.period.end = '2026-09-23'; r.coveredDates = [date, '2026-09-23'];
    expect(buildAvailability(r).find(d => d.date === '2026-09-23')?.locations?.[0].station).toBe('ALA');
  });
  it('rejects an unreadable PDF grid and quarantines damaged days', () => {
    expect(() => parsePdfRoster([rosterPage({ period:'01/09/2026 - 30/09/2026', days:[] })])).toThrow(/grid/);
    const parsed = parsePdfRoster([rosterPage({period:'01/09/2026 - 30/09/2026',days:[{label:'20/09',cells:['???']},{label:'21/09',cells:[]},{label:'22/09',cells:['OFF']} ]})]);
    expect(buildAvailability(parsed.roster).every(d => d.state === 'unknown')).toBe(true);
  });
  it('does not guess for an unknown station zone', () => {
    expect(buildAvailability(trip('ALA','ZZZ'))[0].state).toBe('unknown');
  });
  it('uses summer and winter station offsets and rejects ambiguous DST times', () => {
    expect(stationInstant('2026-07-01', 720, 'FRA')).toBe(Date.parse('2026-07-01T10:00Z') / 60000);
    expect(stationInstant('2026-12-01', 720, 'FRA')).toBe(Date.parse('2026-12-01T11:00Z') / 60000);
    expect(stationInstant('2026-10-25', 150, 'FRA')).toBeUndefined();
    expect(stationInstant('2026-03-29', 150, 'FRA')).toBeUndefined();
  });
  it('does not treat ambiguous ground-duty hours as free', () => {
    const r = empty('2026-10-25', '2026-10-25', 'FRA');
    r.groundDuties = [{date: '2026-10-25', code: 'SIM', start: '02:30', end: '12:00'}];
    const day = buildAvailability(r)[0];
    expect(day.state).toBe('unknown');
    expect(day.freeMinutes).toBe(0);
  });
  it('trims elapsed days and hours using the station clock', () => {
    const days = matchDays(buildAvailability(empty('2026-09-19','2026-09-21')),buildAvailability(empty('2026-09-19','2026-09-21')));
    const remaining = remainingMatches(days, new Date('2026-09-20T15:00:00Z'));
    expect(remaining.map(d => d.date)).toEqual(['2026-09-20','2026-09-21']);
    expect(remaining[0].overlap).toEqual([{start:1200,end:1380}]);
    expect(togetherWindows(remaining)[0].days).toBe(2);
  });
  it('does not count a night occupied by work', () => {
    const r = empty(date,'2026-09-21'); r.groundDuties = [{ date, code:'WORK', start:'23:00',end:'07:00' }];
    const days = matchDays(buildAvailability(r),buildAvailability(empty(date,'2026-09-21')));
    expect(togetherWindows(days)[0].nights).toBe(0);
  });
});
