import { parsePdfRoster, type Roster } from '@match/core';

import { mergeRoster, parseAimsArchive } from './aims';

/**
 * One way in for both kinds of roster file.
 *
 * A crew member has two exports available and no reason to care which one this app prefers: the
 * Crew Schedule saved as a web archive, and the Personal Crew Schedule Report as a PDF. They carry
 * the same roster and are read by completely different parsers, so the choice is made here, from
 * the file itself, rather than by asking.
 */

export interface RosterImport {
  roster: Roster;
  source: 'pdf' | 'webarchive';
  /** Named in the report header, where it had one — used to offer a real name for the person. */
  subjectName?: string;
  /** Cells the PDF reader could not account for. Empty for an archive import. */
  unreadCells: string[];
}

const PDF_EXTENSION = /\.pdf$/i;
const PDF_MAGIC = '%PDF-';

export async function importRosterFile(file: File, base = 'ALA'): Promise<RosterImport> {
  if (file.size > 25_000_000) throw new Error('Roster file is too large (maximum 25 MB).');
  if (await looksLikePdf(file)) {
    // PDF.js is several times the size of everything else in this app, so it is fetched only when
    // a PDF is actually picked rather than carried in the entry chunk for everyone.
    const { extractPdfText } = await import('./pdf/extractText');
    const pages = await extractPdfText(file);
    const parsed = parsePdfRoster(pages, base);
    return {
      roster: parsed.roster,
      source: 'pdf',
      subjectName: parsed.subject?.name,
      unreadCells: parsed.unreadCells,
    };
  }

  return { roster: await parseAimsArchive(file, base), source: 'webarchive', unreadCells: [] };
}

export { mergeRoster };

/**
 * Decides whether a file is a PDF.
 *
 * The extension is checked first because it is free, but the header is what settles it: a roster
 * saved from a browser can arrive with any name at all, and reading the magic number costs five
 * bytes. A file that claims .pdf and is not one falls through to the archive parser, which gives a
 * better error than the PDF reader would.
 */
async function looksLikePdf(file: File): Promise<boolean> {
  if (file.type === 'application/pdf') return true;
  try {
    const head = await file.slice(0, PDF_MAGIC.length).text();
    if (head === PDF_MAGIC) return true;
  } catch {
    // Unreadable slice: fall back to the name alone.
  }
  return PDF_EXTENSION.test(file.name) && file.type === '';
}
