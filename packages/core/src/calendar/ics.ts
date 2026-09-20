import { addDays, minutesToHHMM } from '../time';
import type { TogetherWindow } from '../match/windows';

/**
 * Writes days together out as calendar events.
 *
 * Adapted from the eScrew roster export, with the same deliberate choice of floating local times:
 * a roster prints station-local clock times and no offset, so stamping these as UTC would shift
 * every event by the base's offset. A floating time means "this wall clock, wherever you are",
 * which is exactly what a day off at home is.
 */

export interface IcsOptions {
  /** Shown as the calendar name in apps that read it. */
  calendarName?: string;
  /** Who the days are with, used in the event titles. */
  partnerName?: string;
}

export function buildTogetherIcs(windows: TogetherWindow[], options: IcsOptions = {}): string {
  const calendarName = options.calendarName ?? 'Match';
  const events = windows.flatMap((window) => buildWindowEvent(window, options));
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Match//Days Together//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function buildWindowEvent(window: TogetherWindow, options: IcsOptions): string[] {
  const summary = options.partnerName
    ? `Together with ${options.partnerName}`
    : 'Days together';
  const description = [
    window.headline,
    window.tentative ? 'One of you is on standby — this can still be called away.' : '',
    window.commonHours
      ? `Free together every day ${minutesToHHMM(window.commonHours.start)}–${minutesToHHMM(window.commonHours.end)}.`
      : '',
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VEVENT',
    `UID:${escapeIcs(`match-${window.start}-${window.end}-${window.station}@match.local`)}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    // All-day events are exclusive at the end, so a window has to reach one day past its last date
    // or the final day silently drops out of every calendar app that reads this.
    `DTSTART;VALUE=DATE:${compactDate(window.start)}`,
    `DTEND;VALUE=DATE:${compactDate(addDays(window.end, 1))}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `LOCATION:${escapeIcs(window.station)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'STATUS:CONFIRMED',
    // Days off should not make you look busy to anyone scheduling around your calendar.
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

function compactDate(date: string): string {
  return date.replaceAll('-', '');
}

function utcStamp(date: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}T${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}Z`;
}

function escapeIcs(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r?\n/g, '\\n');
}
