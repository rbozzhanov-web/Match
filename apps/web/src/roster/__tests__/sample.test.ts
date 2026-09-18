import { describe, expect, it } from 'vitest';
import { buildAvailability, matchDays, togetherWindows } from '@match/core';

import { sampleRosters } from '../sample';

const options = { dayStartMinutes: 8 * 60, dayEndMinutes: 23 * 60 };

function sampleMatches(from = '2026-09-01') {
  const { you, them } = sampleRosters(from);
  return matchDays(buildAvailability(you, options), buildAvailability(them, options));
}

describe('the sample month', () => {
  /*
   * The sample is the only data a new visitor can see, so it is the app's whole demonstration of
   * itself. An earlier version generated both rosters from one pattern with an offset, which read
   * as plausible and put the two people in different cities every single time they were both away
   * — so the shared-layover match, the rarest thing this app finds, never once fired in the demo.
   * It looked exactly like the feature was broken.
   */
  it('puts the two of you down route in the same city', () => {
    const layovers = sampleMatches().filter((day) => day.matched && day.kind === 'layover');
    expect(layovers.length).toBeGreaterThan(0);
    expect(layovers.every((day) => day.station === 'DXB')).toBe(true);
    expect(layovers.every((day) => day.you.state === 'away' && day.them.state === 'away')).toBe(true);
  });

  it('groups the shared layover into a window of its own', () => {
    const windows = togetherWindows(sampleMatches());
    const layover = windows.find((window) => window.kind === 'layover');
    expect(layover).toBeDefined();
    expect(layover?.station).toBe('DXB');
    expect(layover?.days).toBeGreaterThanOrEqual(2);
  });

  it('is a month someone could actually be rostered', () => {
    const days = sampleMatches();
    const matched = days.filter((day) => day.matched);

    // Both people fly: there are days apart, and they are apart because of where they are.
    const apart = days.filter((day) => !day.matched);
    expect(apart.length).toBeGreaterThan(3);
    expect(apart.some((day) => day.reason === 'different-stations')).toBe(true);

    // And there is real time together at home, not only the one shared trip.
    expect(matched.some((day) => day.kind === 'home')).toBe(true);
    expect(matched.length).toBeLessThan(days.length);
  });
});
