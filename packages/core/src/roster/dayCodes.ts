/**
 * What a roster day code means for being together.
 *
 * The codes are KhaVair's (`NON_DUTY_CODES` in the Air Astana roster reader). The grouping is this
 * app's, and it is the one judgement that decides whether a day can ever match: a day off and a
 * day of annual leave are both "at home, free"; standby is free but revocable, and the app says so
 * rather than promising a day that a phone call can take away.
 */

export type DayCodeKind = 'rest' | 'leave' | 'sick' | 'standby' | 'duty';

/** Rostered days away from work at home base. */
const REST_CODES = new Set(['OFF', 'DOFF', 'ROFF', 'BOFF', 'NR']);

/** Leave: still free days, and the ones worth planning around. */
const LEAVE_CODES = new Set(['VAC', 'LVE', 'ULV', 'UFF', 'CHLD']);

/** Sick leave. Free of duty, but not a day to plan a trip on. */
const SICK_CODES = new Set(['SICK']);

/** At home or at the airport, on call. Free until the phone rings. */
const STANDBY_CODES = new Set(['AVLB', 'HOMS', 'STBY', 'SBY', 'ASBY']);

/** Every code the roster reader treats as a non-flying day. */
export const NON_DUTY_CODES = new Set([
  ...REST_CODES,
  ...LEAVE_CODES,
  ...SICK_CODES,
  ...STANDBY_CODES,
]);

export function classifyDayCode(code: string): DayCodeKind {
  const value = code.trim().toUpperCase();
  if (REST_CODES.has(value)) return 'rest';
  if (LEAVE_CODES.has(value)) return 'leave';
  if (SICK_CODES.has(value)) return 'sick';
  if (STANDBY_CODES.has(value)) return 'standby';
  return 'duty';
}

export function isNonDutyCode(code: string): boolean {
  return NON_DUTY_CODES.has(code.trim().toUpperCase());
}

/** How a code should read on a day card. */
export function describeDayCode(code: string): string {
  const value = code.trim().toUpperCase();
  const labels: Record<string, string> = {
    OFF: 'Day off',
    DOFF: 'Day off',
    ROFF: 'Requested day off',
    BOFF: 'Bought day off',
    NR: 'Not rostered',
    VAC: 'Annual leave',
    LVE: 'Leave',
    ULV: 'Unpaid leave',
    UFF: 'Unpaid day off',
    CHLD: 'Child care',
    SICK: 'Sick',
    AVLB: 'Standby',
    HOMS: 'Home standby',
    STBY: 'Standby',
    SBY: 'Standby',
    ASBY: 'Airport standby',
  };
  return labels[value] ?? value;
}
