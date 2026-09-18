import type { Roster, RosterDuty } from '@match/core';
import { addDays, eachDate } from '@match/core';

/**
 * Two rosters to look at before you have your own.
 *
 * An empty app cannot show what it is for, and the thing it is for — the shape of two schedules
 * against each other — is impossible to describe without an example. These are invented, marked as
 * such in the UI, and thrown away the moment a real roster is imported.
 *
 * They are written out trip by trip rather than generated from one pattern with an offset. The
 * offset version read as plausible and quietly could not demonstrate the app: both people were
 * away on the same days and never once in the same city, so the shared-layover match — the rarest
 * and best thing this app finds — never fired in the only data a new visitor can see.
 */

interface Trip {
  /** Days after the start of the month that the trip departs. */
  day: number;
  flightNumber: number;
  station: string;
  /** 0 is a there-and-back day; 1 or more night-stops down route. */
  nights: number;
}

/*
 * Roughly a fortnight of flying each, which is what a month on a line actually looks like. Sparser
 * than this and the sample flatters the app: three weeks of days off would have it reporting time
 * together that no real pair of rosters would leave.
 */
const YOUR_TRIPS: Trip[] = [
  { day: 0, flightNumber: 901, station: 'DXB', nights: 2 },
  { day: 4, flightNumber: 931, station: 'TSE', nights: 0 },
  { day: 6, flightNumber: 875, station: 'IST', nights: 1 },
  { day: 10, flightNumber: 963, station: 'FRU', nights: 0 },
  { day: 12, flightNumber: 941, station: 'BKK', nights: 1 },
  // The shared one: both of you are in Dubai for these two nights.
  { day: 17, flightNumber: 901, station: 'DXB', nights: 2 },
  { day: 22, flightNumber: 931, station: 'TSE', nights: 0 },
  { day: 24, flightNumber: 875, station: 'IST', nights: 1 },
];

const THEIR_TRIPS: Trip[] = [
  { day: 1, flightNumber: 941, station: 'BKK', nights: 1 },
  { day: 5, flightNumber: 963, station: 'FRU', nights: 0 },
  { day: 8, flightNumber: 931, station: 'TSE', nights: 0 },
  { day: 10, flightNumber: 875, station: 'IST', nights: 1 },
  { day: 14, flightNumber: 907, station: 'DXB', nights: 1 },
  // Same station, same nights, a different flight out and a different flight home.
  { day: 17, flightNumber: 907, station: 'DXB', nights: 2 },
  { day: 23, flightNumber: 963, station: 'FRU', nights: 0 },
  { day: 26, flightNumber: 931, station: 'TSE', nights: 0 },
];

export function sampleRosters(from: string): { you: Roster; them: Roster } {
  return {
    you: buildSample(from, YOUR_TRIPS, '06:30'),
    them: buildSample(from, THEIR_TRIPS, '11:00'),
  };
}

/**
 * Lays a month out from a list of trips, filling everything they do not use with days off.
 *
 * `report` staggers the two people's days so the shared trip still has them arriving and leaving
 * at different times — which is what a shared layover really looks like, and what makes the
 * arrival day read as an evening together rather than a whole one.
 */
function buildSample(start: string, trips: Trip[], report: string): Roster {
  const end = addDays(start, 27);
  const period = { start, end };
  const duties: RosterDuty[] = [];
  const working = new Set<string>();

  const shift = (time: string, hours: number) => {
    const [h, m] = time.split(':').map(Number);
    return `${String((h + hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  for (const trip of trips) {
    const outbound = addDays(start, trip.day);
    if (outbound > end) continue;
    const departure = shift(report, 1);

    if (trip.nights === 0) {
      const back = shift(report, 9);
      duties.push({
        date: outbound,
        start: `${outbound}T${report}`,
        end: `${outbound}T${shift(report, 10)}`,
        flights: [
          { flightNumber: `KC${trip.flightNumber}`, date: outbound, origin: 'ALA', destination: trip.station, departure, arrival: shift(report, 3) },
          { flightNumber: `KC${trip.flightNumber + 1}`, date: outbound, origin: trip.station, destination: 'ALA', departure: back, arrival: shift(report, 11) },
        ],
      });
      working.add(outbound);
      continue;
    }

    const inbound = addDays(outbound, trip.nights);
    if (inbound > end) continue;
    duties.push({
      date: outbound,
      start: `${outbound}T${report}`,
      end: `${outbound}T${shift(report, 5)}`,
      flights: [{ flightNumber: `KC${trip.flightNumber}`, date: outbound, origin: 'ALA', destination: trip.station, departure, arrival: shift(report, 4) }],
    });
    duties.push({
      date: inbound,
      start: `${inbound}T${report}`,
      end: `${inbound}T${shift(report, 6)}`,
      flights: [{ flightNumber: `KC${trip.flightNumber + 1}`, date: inbound, origin: trip.station, destination: 'ALA', departure, arrival: shift(report, 5) }],
    });
    // Every day of the trip is spoken for, including the nights in between.
    for (const date of eachDate(outbound, inbound)) working.add(date);
  }

  // Everything a trip did not claim is a day off at home.
  const dayCodes = eachDate(start, end)
    .filter((date) => !working.has(date))
    .map((date, index) => ({ date, code: index % 3 === 0 ? 'DOFF' : 'OFF' }));

  return { period, coverage: period, duties, dayCodes, base: 'ALA', importedAt: new Date().toISOString() };
}
