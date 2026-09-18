import { parseDateDdMmYyyy } from './patterns';
import { tokenizeLines } from './tokenize';
import type { ExtractedPage } from './types';

export interface ReportSubject {
  staffId: string;
  name: string;
  base?: string;
  rank?: string;
  qualification?: string;
}

export interface ReportPeriod {
  start: string;
  end: string;
}

const SUBJECT_RE = /^(\d{2,6})\s+([A-Z][A-Z' -]*?)\s+([A-Z]{3})-([A-Z]{2,3})-([A-Z0-9]{2,6})$/;
const SUBJECT_MINIMAL_RE = /^(\d{2,6})\s+([A-Z][A-Z' -]+)$/;
const PERIOD_RE = /(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/;

/**
 * Who the report is about.
 *
 * Worth reading for one reason here: the header names the crew member's base, which is the station
 * the whole availability model is measured against. A roster imported for someone based in TSE and
 * assumed to be ALA would read every day at home as a day down route.
 */
export function parseSubject(pages: ExtractedPage[]): ReportSubject | undefined {
  for (const page of pages) {
    for (const line of tokenizeLines(page)) {
      const full = SUBJECT_RE.exec(line.text.trim());
      if (full) {
        const [, staffId, name, base, rank, qualification] = full;
        return { staffId, name: name.trim(), base, rank, qualification };
      }
      const minimal = SUBJECT_MINIMAL_RE.exec(line.text.trim());
      if (minimal) return { staffId: minimal[1], name: minimal[2].trim() };
    }
  }
  return undefined;
}

export function parsePeriod(pages: ExtractedPage[]): ReportPeriod | undefined {
  for (const page of pages) {
    for (const line of tokenizeLines(page)) {
      const match = PERIOD_RE.exec(line.text);
      if (!match) continue;
      const start = parseDateDdMmYyyy(match[1]);
      const end = parseDateDdMmYyyy(match[2]);
      if (start && end) return { start, end };
    }
  }
  return undefined;
}
