import '@testing-library/jest-dom/vitest';

/**
 * jsdom has no layout, so the pager's scroll mechanics have nothing to act on. Stubbing them keeps
 * a swipe-shell component testable without every test having to know the shell exists.
 */
Element.prototype.scrollTo ??= function scrollTo() {};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

// jsdom implements neither, and the app frame reads both on mount.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
