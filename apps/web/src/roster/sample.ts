import type { Roster } from '@match/core';
import { addDays, eachDate } from '@match/core';

/**
 * Two rosters to look at before you have your own.
 *
 * An empty app cannot show what it is for, and the thing it is for — the shape of two schedules
 * against each other — is impossible to describe without an example. These are invented, marked as
 * such in the UI, and thrown away the moment a real roster is imported.
 */

const PAIRINGS: [string, string, string][] = [
  ['901', 'DXB', '2'],
  ['931', 'TSE', '0'],
  ['963', 'FRU', '0'],
  ['875', 'IST', '2'],
  ['941', 'BKK', '1'],
];

export function sampleRosters(from: string): { you: Roster; them: Roster } {
  return {
    you: buildSample(from, 0, 'ALA'),
    them: buildSample(from, 3, 'ALA'),
  };
}

/**
 * Lays out a month of trips and days off from a fixed pattern.
 *
 * `offset` shifts the whole pattern, which is what makes the two sample rosters interesting: they
 * overlap on some days and miss each other on others, exactly as two real crew rosters do.
 */
function buildSample(start: string, offset: number, base: string): Roster {
  const end = addDays(start, 27);
  const period = { start, end };
  const duties: Roster['duties'] = [];
  const dayCodes: NonNullable<Roster['dayCodes']> = [];
  const dates = eachDate(start, end);

  let index = offset;
  let cursor = 0;
  while (cursor < dates.length) {
    const [flightNumber, station, nights] = PAIRINGS[index % PAIRINGS.length];
    const outbound = dates[cursor];
    const nightCount = Number(nights);
    const inbound = dates[cursor + nightCount];

    if (!inbound) break;

    duties.push({
      date: outbound,
      start: `${outbound}T06:30`,
      end: nightCount ? `${outbound}T14:00` : `${outbound}T18:00`,
      flights: nightCount
        ? [{ flightNumber: `KC${flightNumber}`, date: outbound, origin: base, destination: station, departure: '07:30', arrival: '12:30' }]
        : [
            { flightNumber: `KC${flightNumber}`, date: outbound, origin: base, destination: station, departure: '07:30', arrival: '09:00' },
            { flightNumber: `KC${Number(flightNumber) + 1}`, date: outbound, origin: station, destination: base, departure: '15:00', arrival: '16:30' },
          ],
    });

    if (nightCount) {
      duties.push({
        date: inbound,
        start: `${inbound}T08:00`,
        end: `${inbound}T15:00`,
        flights: [{ flightNumber: `KC${Number(flightNumber) + 1}`, date: inbound, origin: station, destination: base, departure: '09:00', arrival: '14:00' }],
      });
    }

    cursor += nightCount + 1;
    // Two days off after every trip, which is roughly what a real pattern leaves and is what gives
    // the match engine something to find.
    for (let rest = 0; rest < 2 && cursor < dates.length; rest += 1, cursor += 1) {
      dayCodes.push({ date: dates[cursor], code: rest === 0 ? 'OFF' : 'DOFF' });
    }
    index += 1;
  }

  return { period, coverage: period, duties, dayCodes, base, importedAt: new Date().toISOString() };
}
