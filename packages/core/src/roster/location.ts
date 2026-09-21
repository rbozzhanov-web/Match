import { addDays, dayNumber, hhmmToMinutes, intersectIntervals, subtractIntervals, type Interval } from '../time';
import { rosterDates, type Roster, type RosterFlight } from './contract';

// IANA identifiers let the runtime apply historical offsets and daylight saving rules.
const ZONES: Record<string, string> = {
  ALA: 'Asia/Almaty', NQZ: 'Asia/Almaty', TSE: 'Asia/Almaty', CIT: 'Asia/Almaty',
  KGF: 'Asia/Almaty', UKK: 'Asia/Almaty', PWQ: 'Asia/Almaty', KSN: 'Asia/Qostanay',
  KZO: 'Asia/Qyzylorda', GUW: 'Asia/Atyrau', SCO: 'Asia/Aqtau', AKX: 'Asia/Aqtobe', URA: 'Asia/Oral',
  FRA: 'Europe/Berlin', LHR: 'Europe/London', AMS: 'Europe/Amsterdam', CDG: 'Europe/Paris',
  MXP: 'Europe/Rome', PRG: 'Europe/Prague', HER: 'Europe/Athens', TBS: 'Asia/Tbilisi',
  DXB: 'Asia/Dubai', AUH: 'Asia/Dubai', SHJ: 'Asia/Dubai', DOH: 'Asia/Qatar',
  JED: 'Asia/Riyadh', MED: 'Asia/Riyadh', RUH: 'Asia/Riyadh', MCT: 'Asia/Muscat',
  IST: 'Europe/Istanbul', AYT: 'Europe/Istanbul', BJV: 'Europe/Istanbul',
  FRU: 'Asia/Bishkek', TAS: 'Asia/Tashkent', SKD: 'Asia/Samarkand', DYU: 'Asia/Dushanbe',
  GYD: 'Asia/Baku', DEL: 'Asia/Kolkata', BOM: 'Asia/Kolkata', GOI: 'Asia/Kolkata', GOX: 'Asia/Kolkata',
  BKK: 'Asia/Bangkok', HKT: 'Asia/Bangkok', SGN: 'Asia/Ho_Chi_Minh', CXR: 'Asia/Ho_Chi_Minh',
  HAN: 'Asia/Ho_Chi_Minh', PQC: 'Asia/Ho_Chi_Minh', KUL: 'Asia/Kuala_Lumpur', SIN: 'Asia/Singapore',
  PEK: 'Asia/Shanghai', PKX: 'Asia/Shanghai', URC: 'Asia/Shanghai', CAN: 'Asia/Shanghai',
  SYX: 'Asia/Shanghai', HKG: 'Asia/Hong_Kong', ICN: 'Asia/Seoul', NRT: 'Asia/Tokyo',
  MLE: 'Indian/Maldives', CMB: 'Asia/Colombo', HBE: 'Africa/Cairo', SSH: 'Africa/Cairo',
  SVO: 'Europe/Moscow', DME: 'Europe/Moscow', LED: 'Europe/Moscow', OVB: 'Asia/Novosibirsk',
};
export const normalizeStation = (station: string): string => station.trim().toUpperCase() === 'TSE' ? 'NQZ' : station.trim().toUpperCase();
export const stationZone = (station: string): string | undefined => ZONES[normalizeStation(station)];
const formatters = new Map<string, Intl.DateTimeFormat>();
function partsAt(ms: number, zone: string): number {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formatters.set(zone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) / 60000;
}
/** Rejects nonexistent and ambiguous wall times instead of choosing an offset silently. */
export function stationInstant(date: string, minute: number, station: string): number | undefined {
  const zone = stationZone(station);
  if (!zone) return undefined;
  const wall = dayNumber(date) * 1440 + minute;
  const offsets = new Set([-1440, 0, 1440].map(delta => partsAt((wall + delta) * 60000, zone) - wall - delta));
  const candidates = [...offsets].map(offset => wall - offset).filter(value => partsAt(value * 60000, zone) === wall);
  return candidates.length === 1 ? candidates[0] : undefined;
}
export function stationClock(now: Date, station: string): { date: string; minute: number } | undefined {
  const zone = stationZone(station);
  if (!zone) return undefined;
  const wall = partsAt(now.getTime(), zone);
  return { date: new Date(Math.floor(wall / 1440) * 86400000).toISOString().slice(0, 10), minute: ((wall % 1440) + 1440) % 1440 };
}
export function compareFlights(a: RosterFlight, b: RosterFlight): number {
  const instant = (flight: RosterFlight) => {
    const minute = hhmmToMinutes(flight.departure);
    return minute === null ? undefined : stationInstant(flight.date, minute, flight.origin);
  };
  const left = instant(a), right = instant(b);
  return left !== undefined && right !== undefined ? left - right : `${a.date}T${a.departure}`.localeCompare(`${b.date}T${b.departure}`);
}

export interface LocatedInterval extends Interval { station: string; atBase: boolean }
interface Stay extends Interval { station: string }
interface Settings { preDutyBufferMinutes: number; postDutyBufferMinutes: number; dayStartMinutes: number; dayEndMinutes: number }
interface Movement { start: number; end: number; origin: string; destination: string }

/** Availability is intersected only inside a confirmed stay at one station. UTC orders movements. */
export function locatedAvailability(roster: Roster, base: string, settings: Settings): { slots: Map<string, LocatedInterval[]>; fullDay: Map<string, LocatedInterval[]>; issues: Map<string, string> } {
  const dates = [...new Set(rosterDates(roster))].sort();
  const slots = new Map<string, LocatedInterval[]>();
  const fullDay = new Map<string, LocatedInterval[]>();
  const issues = new Map<string, string>();
  const runs: string[][] = [];
  for (const date of dates) {
    const run = runs[runs.length - 1];
    if (run && addDays(run[run.length - 1], 1) === date) run.push(date);
    else runs.push([date]);
  }
  const stamp = (value: string, station: string) => {
    const [date, clock] = value.split('T');
    const minute = hhmmToMinutes(clock);
    return minute === null ? undefined : stationInstant(date, minute, station);
  };
  for (const run of runs) {
    const firstDate = run[0], lastDate = run[run.length - 1];
    const duties = roster.duties.filter(d => d.date >= firstDate && d.date <= lastDate);
    const movements: Movement[] = [];
    let invalid = false;
    for (const duty of duties.filter(d => d.flights.length)) {
      const flights = [...duty.flights].sort(compareFlights);
      const first = flights[0], last = flights[flights.length - 1];
      const origin = normalizeStation(first.origin), destination = normalizeStation(last.destination);
      const start = stamp(duty.start ?? `${first.date}T${first.departure}`, origin);
      let end = stamp(duty.end ?? `${last.arrivalDate ?? last.date}T${last.arrival}`, destination);
      if (start !== undefined && end !== undefined && end <= start && (duty.end?.slice(0, 10) ?? last.arrivalDate ?? last.date) === (duty.start?.slice(0, 10) ?? first.date)) end += 1440;
      if (start === undefined || end === undefined || end <= start || flights.some(f => !stationZone(f.origin) || !stationZone(f.destination))) { invalid = true; break; }
      movements.push({ start: start - settings.preDutyBufferMinutes, end: end + settings.postDutyBufferMinutes, origin, destination });
    }
    movements.sort((a,b) => a.start - b.start);
    let position = movements[0]?.origin ?? base;
    let cursor = stationInstant(firstDate, 0, position);
    const finish = stationInstant(addDays(lastDate, 1), 0, movements.at(-1)?.destination ?? base);
    if (invalid || cursor === undefined || finish === undefined) {
      for (const date of run) issues.set(date, 'Location or time zone could not be verified. Check the imported roster.');
      continue;
    }
    const stays: Stay[] = [];
    for (const movement of movements) {
      if (movement.origin === position && movement.start > cursor) stays.push({ start: cursor, end: movement.start, station: position });
      // A discontinuous route is not evidence of where the person spent the intervening time.
      cursor = Math.max(cursor, movement.end);
      position = movement.destination;
    }
    if (cursor < finish) stays.push({ start: cursor, end: finish, station: position });
    for (const date of run) {
      if (roster.uncertainDates?.includes(date)) continue;
      const ground = (roster.groundDuties ?? []).filter(g => g.date === date || g.date === addDays(date, -1) || g.date === addDays(date, 1));
      const untimed = ground.some(g => g.date === date && (!g.start || !g.end));
      if (untimed) { slots.set(date, []); fullDay.set(date, []); continue; }
      const located: LocatedInterval[] = [], all: LocatedInterval[] = [];
      for (const stay of stays) {
        const dayStart = stationInstant(date, 0, stay.station), dayEnd = stationInstant(addDays(date, 1), 0, stay.station);
        if (dayStart === undefined || dayEnd === undefined) continue;
        const occupied: Interval[] = [];
        for (const duty of duties.filter(d => !d.flights.length)) {
          if (!duty.start || !duty.end) { if (duty.date === date) occupied.push({start: dayStart,end:dayEnd}); continue; }
          const start = stamp(duty.start, stay.station); let end = stamp(duty.end, stay.station);
          if (start !== undefined && end !== undefined) {
            if (end <= start) end += 1440;
            occupied.push({start: start - settings.preDutyBufferMinutes,end:end + settings.postDutyBufferMinutes});
          } else if (duty.date === date) {
            issues.set(date, 'Duty time is ambiguous in this station time zone. Check the source roster.');
            occupied.push({start:dayStart,end:dayEnd});
          }
        }
        for (const g of ground) {
          if (g.station && normalizeStation(g.station) !== stay.station) { if (g.date === date) occupied.push({start:dayStart,end:dayEnd}); continue; }
          const a=hhmmToMinutes(g.start), b=hhmmToMinutes(g.end);
          if (a === null || b === null) continue;
          const start=stationInstant(g.date,a,stay.station),end=stationInstant(b<=a?addDays(g.date,1):g.date,b,stay.station);
          if (start!==undefined && end!==undefined) occupied.push({start:start-settings.preDutyBufferMinutes,end:end+settings.postDutyBufferMinutes});
          else {
            issues.set(date, 'Ground-duty time is ambiguous in this station time zone. Check the source roster.');
            occupied.push({start:dayStart,end:dayEnd});
          }
        }
        const intersection = intersectIntervals([stay], [{start:dayStart,end:dayEnd}]);
        for (const region of intersection) for (const free of subtractIntervals(region,occupied)) {
          // Convert each endpoint to this station's wall clock; keep midnight as 1440.
          const localStart=partsAt(free.start*60000,stationZone(stay.station)!)-dayNumber(date)*1440;
          const localEnd=partsAt(free.end*60000,stationZone(stay.station)!)-dayNumber(date)*1440;
          if(localEnd<=localStart) continue;
          const entry={start:localStart,end:localEnd,station:stay.station,atBase:stay.station===base};
          all.push(entry);
          for(const window of intersectIntervals([entry],[{start:settings.dayStartMinutes,end:settings.dayEndMinutes}])) located.push({...entry,...window});
        }
      }
      slots.set(date,located); fullDay.set(date,all);
    }
  }
  return {slots,fullDay,issues};
}
