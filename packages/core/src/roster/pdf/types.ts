/**
 * What a PDF looks like once its text has been lifted off the page.
 *
 * The parser never sees a PDF. It sees positioned text, because an Air Astana roster is a grid
 * drawn with absolute coordinates and no table structure at all — the only thing that says which
 * day a cell belongs to is how far across the page it sits. Extraction is the browser's job
 * (PDF.js); everything downstream of this shape is pure and runs in node under test.
 */

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export interface ExtractedPage {
  items: TextItem[];
  width: number;
  height: number;
}
