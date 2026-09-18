/// <reference types="vite/client" />

import type { ExtractedPage } from '@match/core';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Bundled and served from this origin rather than fetched from a CDN, so a PDF import works with
// no network at all — which is the whole promise of an offline-first app.
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Lifts positioned text off a PDF in the browser.
 *
 * The parser downstream needs coordinates, not a string: an Air Astana roster is a grid drawn with
 * absolute positions and no table structure, so where a cell sits is the only thing that says
 * which day it belongs to. `convertToViewportPoint` puts everything in one top-left origin space,
 * which is what the grid reader assumes.
 *
 * This module is the expensive half of a PDF import — PDF.js is far larger than the parser it
 * feeds — so it is imported lazily, only once someone actually picks a file.
 */
export async function extractPdfText(file: File): Promise<ExtractedPage[]> {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let document: Awaited<typeof loadingTask.promise> | undefined;

  try {
    document = await loadingTask.promise;
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const items = content.items
        .filter((item) => 'str' in item)
        .map((item) => {
          const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          return { str: item.str, x, y, width: item.width };
        });

      pages.push({ items, width: viewport.width, height: viewport.height });
    }

    return pages;
  } finally {
    // Both are needed: cleanup releases the parsed document, destroy tears down the worker. Without
    // the second, importing several rosters in a row leaks a worker per file.
    try {
      await document?.cleanup();
    } finally {
      await loadingTask.destroy();
    }
  }
}
