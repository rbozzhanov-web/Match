import { describe, expect, it } from 'vitest';

import { relationshipMoments, type MatchDay } from '..';

function matched(date: string, overlap: { start: number; end: number }[], kind: 'home' | 'layover' = 'home'): MatchDay {
  return {
    date,
    matched: true,
    station: 'ALA',
    kind,
    overlap,
    minutes: overlap.reduce((sum, interval) => sum + interval.end - interval.start, 0),
    tentative: false,
    headline: 'Together',
    sessions: [{ station: 'ALA', kind, overlap, minutes: overlap.reduce((sum, interval) => sum + interval.end - interval.start, 0) }],
    you: {} as MatchDay['you'],
    them: {} as MatchDay['them'],
  };
}

describe('relationshipMoments', () => {
  it('keeps only weekday childcare overlap at home before moving in', () => {
    const moments = relationshipMoments([matched('2026-10-30', [{ start: 7 * 60, end: 19 * 60 }])]);
    expect(moments).toEqual([{ date: '2026-10-30', station: 'ALA', kind: 'private', interval: { start: 8 * 60, end: 17 * 60 }, minutes: 9 * 60, tentative: false }]);
  });

  it('does not offer a weekend at home as a private date before moving in', () => {
    expect(relationshipMoments([matched('2026-10-31', [{ start: 8 * 60, end: 17 * 60 }])])).toEqual([]);
  });

  it('keeps the non-childcare part as family time after moving in', () => {
    const moments = relationshipMoments([matched('2026-11-02', [{ start: 7 * 60, end: 19 * 60 }])]);
    expect(moments).toEqual([
      { date: '2026-11-02', station: 'ALA', kind: 'family', interval: { start: 7 * 60, end: 8 * 60 }, minutes: 60, tentative: false },
      { date: '2026-11-02', station: 'ALA', kind: 'private', interval: { start: 8 * 60, end: 17 * 60 }, minutes: 9 * 60, tentative: false },
      { date: '2026-11-02', station: 'ALA', kind: 'family', interval: { start: 17 * 60, end: 19 * 60 }, minutes: 120, tentative: false },
    ]);
  });

  it('keeps shared layovers visible regardless of the children schedule', () => {
    expect(relationshipMoments([matched('2026-10-31', [{ start: 20 * 60, end: 22 * 60 }], 'layover')])[0]).toMatchObject({ kind: 'layover', minutes: 120 });
  });

  it('carries the standby asterisk into each usable moment', () => {
    const day = matched('2026-10-30', [{ start: 8 * 60, end: 17 * 60 }]);
    day.tentative = true;
    expect(relationshipMoments([day])[0]).toMatchObject({ kind: 'private', tentative: true });
  });
});
