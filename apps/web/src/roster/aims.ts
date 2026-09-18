import type { Roster, RosterDayCode, RosterDuty, RosterFlight, RosterGroundDuty } from '@match/core';
import { isNonDutyCode } from '@match/core';

/**
 * Reads an AIMS Crew Schedule saved from the browser.
 *
 * Ported from the eScrew / KhaVair roster importer, which is the part of those apps worth not
 * rewriting: the AIMS payload is a JSON blob assigned inside a script tag, its sectors are printed
 * as text rather than fields, and both the overnight-rollover marks and the charset confusion below
 * were found against real rosters. What changed here is only the destination — the same reading
 * lands in this app's roster contract, where a day code matters as much as a sector does.
 *
 * Nothing here touches the network and no session data is used: the file is read locally.
 */

type RecordValue = Record<string, unknown>;

const SECTOR_PATTERN = /\b(?:KC\s*)?(\d{1,5})\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})((?:⁺¹|\+\s*1)?)\)\s*-\s*([A-Z]{3,4})\s*\(([A]?)(\d{4})((?:⁺¹|\+\s*1)?)\)/g;
const ABSENCE_CODES = ['SICK', 'UFF', 'VAC', 'CHLD'] as const;

export async function parseAimsArchive(file: File, base = 'ALA'): Promise<Roster> {
  const html = decodeArchive(await file.arrayBuffer());
  if (!/CrewSchedule/i.test(html) || !/initialResult/.test(html)) {
    throw new Error('Unsupported AIMS file. Save the fully loaded Crew Schedule as a Web Archive, then import it here.');
  }

  const result = assignedJson(html);
  const periodStart = readLocalStorage(html, 'PeriodStart');
  const periodEnd = readLocalStorage(html, 'PeriodEnd');
  if (!validDate(periodStart) || !validDate(periodEnd)) {
    throw new Error('Could not read the roster period from this AIMS archive.');
  }

  const events = Array.isArray(result.SchedulerEvents) ? result.SchedulerEvents : assignedArray(html, /var\s+Events\s*=/);
  const duties: RosterDuty[] = [];
  const dayCodes: RosterDayCode[] = [];
  const groundDuties: RosterGroundDuty[] = [];

  for (const event of events) {
    if (!record(event)) continue;
    const dutyDate = datePart(text(event.start));
    if (!dutyDate) continue;

    const absence = absenceCode(event);
    if (absence) dayCodes.push({ date: dutyDate, code: absence });

    const flights = sectors(event, dutyDate);
    if (flights.length) {
      duties.push({
        date: flights[0].date,
        start: boundary(text(event.report), dutyDate) ?? boundary(text(event.start)),
        end: boundary(text(event.debrief), dutyDate) ?? boundary(text(event.end)),
        flights,
      });
      continue;
    }

    const code = eventCode(event);
    if (!code) continue;
    // This is the fork that makes an AIMS schedule useful to this app rather than to a logbook: a
    // day the roster names OFF or VAC is a day someone is available, while a day it names SIM is a
    // day they are at work without flying. The KhaVair code table decides which is which.
    if (isNonDutyCode(code)) {
      dayCodes.push({ date: dutyDate, code });
    } else {
      groundDuties.push({
        date: dutyDate,
        code,
        start: clock(boundary(text(event.start))),
        end: clock(boundary(text(event.end))),
        station: text(event.location).trim() || undefined,
      });
    }
  }

  if (!duties.length && !dayCodes.length && !groundDuties.length) {
    throw new Error('This AIMS schedule has nothing in it. Make sure the calendar was fully loaded before saving the page.');
  }

  duties.sort((a, b) => (a.start ?? a.date).localeCompare(b.start ?? b.date));
  const period = { start: periodStart, end: periodEnd };
  return {
    period,
    coverage: period,
    duties,
    dayCodes: dedupe(dayCodes, (entry) => entry.date),
    groundDuties,
    base,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Merges a newly imported roster into one already held.
 *
 * Two people comparing months will import more than one file each, and a match is only as wide as
 * the narrower roster's coverage — so coverage has to grow with every import rather than being
 * replaced by the latest month.
 */
export function mergeRoster(existing: Roster | undefined, incoming: Roster): Roster {
  if (!existing) return incoming;
  const duties = dedupe(
    [...existing.duties, ...incoming.duties],
    (duty) => `${duty.date}|${duty.flights.map((flight) => flight.flightNumber).join(',')}`,
  ).sort((a, b) => a.date.localeCompare(b.date));

  return {
    period: incoming.period,
    coverage: {
      start: min(existing.coverage?.start ?? existing.period.start, incoming.coverage?.start ?? incoming.period.start),
      end: max(existing.coverage?.end ?? existing.period.end, incoming.coverage?.end ?? incoming.period.end),
    },
    duties,
    dayCodes: dedupe([...(incoming.dayCodes ?? []), ...(existing.dayCodes ?? [])], (entry) => entry.date),
    groundDuties: dedupe(
      [...(existing.groundDuties ?? []), ...(incoming.groundDuties ?? [])],
      (entry) => `${entry.date}|${entry.code}|${entry.start ?? ''}`,
    ),
    base: incoming.base ?? existing.base,
    importedAt: incoming.importedAt,
  };
}

function sectors(event: RecordValue, dutyDate: string): RosterFlight[] {
  const parsed: RosterFlight[] = [];
  const dutyStartClock = clock(boundary(text(event.report), dutyDate)) ?? clock(boundary(text(event.start), dutyDate));
  let rollingDate = dutyDate;
  let previousDeparture: string | undefined;
  const details = sectorDetails(event);
  SECTOR_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SECTOR_PATTERN.exec(details))) {
    const [, flightNumber, origin, , out, outNext, destination, , incoming, inNext] = match;
    const departure = time(out);
    const arrival = time(incoming);
    // A sector whose printed departure runs backwards against the one before it has crossed
    // midnight without AIMS saying so.
    if (outNext) rollingDate = addDays(dutyDate, 1);
    else if (previousDeparture ? departure < previousDeparture : Boolean(dutyStartClock && departure < dutyStartClock)) {
      rollingDate = addDays(rollingDate, 1);
    }
    const date = rollingDate;
    let arrivalDate = inNext ? addDays(dutyDate, 1) : date;
    if (arrivalDate < date) arrivalDate = date;
    if (arrivalDate === date && arrival < departure) arrivalDate = addDays(date, 1);

    parsed.push({
      flightNumber: /^KC/i.test(flightNumber) ? flightNumber.toUpperCase() : `KC${flightNumber}`,
      date,
      origin,
      destination,
      departure,
      arrival,
      arrivalDate: arrivalDate !== date ? arrivalDate : undefined,
      deadhead: Boolean(event.IsDeadhead),
    });
    previousDeparture = departure;
  }
  return parsed;
}

function sectorDetails(event: RecordValue): string {
  return clean(text(event.details))
    .replace(/&#(?:8195|x2003);/gi, ' ')
    .replace(/[   ]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\b(\d{2}):(\d{2})\b/g, '$1$2');
}

function absenceCode(event: RecordValue): string | undefined {
  const value = `${text(event.type)} ${text(event.text)} ${text(event.details)}`.toUpperCase();
  return ABSENCE_CODES.find((code) => new RegExp(`\\b${code}\\b`).test(value));
}

function eventCode(event: RecordValue): string | undefined {
  return /^([A-Z0-9]{2,8})\b/i.exec(clean(text(event.text)).trim())?.[1]?.toUpperCase();
}

/**
 * Finds the JSON object assigned to `initialResult`.
 *
 * Counts braces while respecting strings rather than reaching for a regex, because the payload
 * routinely contains braces inside quoted text.
 */
function assignedJson(source: string): RecordValue {
  const marker = /var\s+initialResult\s*=/.exec(source);
  if (!marker) throw new Error('Could not find AIMS data in this saved file.');
  const parsed = balanced(source, source.indexOf('{', marker.index), '{', '}');
  if (record(parsed)) return parsed;
  throw new Error('AIMS schedule data is incomplete.');
}

function assignedArray(source: string, pattern: RegExp): unknown[] {
  const marker = pattern.exec(source);
  if (!marker) return [];
  const parsed = balanced(source, source.indexOf('[', marker.index), '[', ']');
  return Array.isArray(parsed) ? parsed : [];
}

function balanced(source: string, start: number, open: string, close: string): unknown {
  if (start < 0) return undefined;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === open) depth += 1;
    if (char === close && --depth === 0) {
      try {
        return JSON.parse(source.slice(start, i + 1)) as unknown;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * AIMS pages sometimes declare `charset=windows-1251` while the bytes served are UTF-8 — a stale
 * meta tag, not the real encoding. Trusting it mangles every multi-byte character, including the
 * ⁺¹ overnight mark the sector pattern depends on, which quietly drops whole duties. Real UTF-8
 * almost never decodes as valid UTF-8 by accident, so it is verified strictly first and the
 * declared charset is trusted only once that fails.
 */
function decodeArchive(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Not UTF-8; fall through to the declared charset.
  }
  const probe = new TextDecoder('windows-1252').decode(bytes.subarray(0, 256 * 1024));
  const declared = /charset\s*=\s*["']?\s*([a-z0-9._-]+)/i.exec(probe)?.[1]?.toLowerCase();
  return new TextDecoder(declared === 'windows-1251' || declared === 'cp1251' ? 'windows-1251' : 'utf-8').decode(bytes);
}

function readLocalStorage(source: string, key: string): string | undefined {
  return new RegExp(`localStorage\\[['"]${key}['"]\\]\\s*=\\s*['"]([^'"]+)['"]`).exec(source)?.[1];
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function min(a: string, b: string) { return a < b ? a : b; }
function max(a: string, b: string) { return a > b ? a : b; }
function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function record(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function clean(value: string) {
  return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim();
}
function validDate(value?: string): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function datePart(value: string) { return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0]; }
function boundary(value: string, date?: string) {
  const result = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  if (result) return result.slice(1, 3).join('T');
  return date && /^\d{2}:\d{2}/.test(value) ? `${date}T${value.slice(0, 5)}` : undefined;
}
function time(value: string) { return `${value.slice(0, 2)}:${value.slice(2, 4)}`; }
function clock(value?: string) { return value?.includes('T') ? value.slice(11, 16) : undefined; }
function addDays(value: string, days: number) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
