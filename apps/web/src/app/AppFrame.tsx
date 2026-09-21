import type { UIEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { CalendarPage } from '../features/calendar/CalendarPage';
import { PeoplePage } from '../features/people/PeoplePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { useMatch } from './matchState';
import { TogetherPage } from '../features/together/TogetherPage';

type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'match.theme-preference.v1';

const items = [
  { to: '/', title: 'Together', label: 'Together', icon: '♥', end: true },
  { to: '/calendar', title: 'Calendar', label: 'Calendar', icon: '▦' },
  { to: '/people', title: 'Rosters', label: 'Rosters', icon: '✈' },
  { to: '/more', title: 'More', label: 'More', icon: '•••' },
];

function scrollElement(element: HTMLElement, options: ScrollToOptions) {
  if (typeof element.scrollTo === 'function') element.scrollTo(options);
  else {
    if (options.top !== undefined) element.scrollTop = options.top;
    if (options.left !== undefined) element.scrollLeft = options.left;
  }
}

/**
 * The swipeable tab shell, carried over from the Pilot Logbook.
 *
 * All four tabs are mounted at once inside a horizontally snapping pager, so a swipe moves real
 * rendered pages rather than mounting one on arrival. The URL follows the pager instead of driving
 * it, which is what keeps a drag continuous: navigating on every frame of a swipe would re-render
 * the tree mid-gesture.
 */
export function AppFrame() {
  const { saved, demo, endDemo } = useMatch();
  const location = useLocation();
  const navigate = useNavigate();
  const pagerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const settleTimer = useRef<number | undefined>(undefined);
  const nearestIndex = useRef(0);

  const routeIndex = items.findIndex((item) => item.to === location.pathname);
  const isPrimaryRoute = routeIndex >= 0;
  const [visualIndex, setVisualIndex] = useState(routeIndex >= 0 ? routeIndex : 0);

  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    try {
      const value = window.localStorage.getItem(THEME_KEY);
      return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    } catch {
      return 'system';
    }
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  const usesDarkTheme = themePreference === 'dark' || (themePreference === 'system' && systemPrefersDark);

  const displayProgress = useCallback((value: number) => {
    navRef.current?.style.setProperty('--tab-progress', String(value));
  }, []);

  const settleAtCurrentPage = useCallback(() => {
    const pager = pagerRef.current;
    if (!pager?.clientWidth) return;
    const index = Math.max(0, Math.min(items.length - 1, Math.round(pager.scrollLeft / pager.clientWidth)));
    nearestIndex.current = index;
    setVisualIndex(index);
    displayProgress(index);
    if (location.pathname !== items[index].to) navigate(items[index].to);
  }, [displayProgress, location.pathname, navigate]);

  useLayoutEffect(() => {
    if (!isPrimaryRoute) return;
    const pager = pagerRef.current;
    if (!pager) return;
    window.clearTimeout(settleTimer.current);
    nearestIndex.current = routeIndex;
    // "instant" rather than "auto": auto defers to the stylesheet's smooth scroll, and iOS kills a
    // smooth scroll mid-flight when the app is backgrounded, stranding the pager between pages.
    scrollElement(pager, { left: routeIndex * pager.clientWidth, behavior: 'instant' });
    setVisualIndex(routeIndex);
    displayProgress(routeIndex);
  }, [displayProgress, isPrimaryRoute, routeIndex]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return undefined;
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', usesDarkTheme);
    try {
      window.localStorage.setItem(THEME_KEY, themePreference);
    } catch {
      // A preference that cannot be stored still applies for this session.
    }
  }, [themePreference, usesDarkTheme]);

  const handlePagerScroll = (event: UIEvent<HTMLDivElement>) => {
    const pager = event.currentTarget;
    if (!pager.clientWidth) return;
    const progress = Math.max(0, Math.min(items.length - 1, pager.scrollLeft / pager.clientWidth));
    displayProgress(progress);
    const nearest = Math.round(progress);
    if (nearest !== nearestIndex.current) {
      nearestIndex.current = nearest;
      setVisualIndex(nearest);
    }
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settleAtCurrentPage, 90);
  };

  const selectTab = (index: number) => {
    const pager = pagerRef.current;
    if (!pager) {
      navigate(items[index].to);
      return;
    }
    scrollElement(pager, { left: index * pager.clientWidth, behavior: 'smooth' });
  };

  const pages = [
    <TogetherPage key="together" />,
    <CalendarPage key="calendar" />,
    <PeoplePage key="people" />,
    <SettingsPage key="more" theme={themePreference} onThemeChange={setThemePreference} />,
  ];

  return (
    <div className={`app-frame${usesDarkTheme ? ' app-frame--dark' : ''}`}>
      <div className="app-wallpaper" aria-hidden="true" />
      <header className="primary-tab-header">
        <h1 className="primary-tab-header__accessible-title">{items[visualIndex].title}</h1>
        <div aria-hidden="true" className="primary-tab-header__titles">
          {items.map((item, index) => (
            <span className={visualIndex === index ? 'is-visible' : ''} key={item.to}>{item.title}</span>
          ))}
        </div>
      </header>

      <div className="app-frame__content">
        <div className="primary-tab-pager" onScroll={handlePagerScroll} ref={pagerRef}>
          {pages.map((page, index) => (
            <div
              aria-hidden={visualIndex !== index}
              className="primary-tab-pager__page"
              inert={visualIndex !== index}
              key={items[index].to}
              ref={(element) => { pageRefs.current[index] = element; }}
            >
              {!saved && !demo ? <p className="notice" role="alert">Changes are not saved on this device. Export a backup in More before closing.</p> : null}
              {demo ? <p className="notice">Demo · not saved <button className="button button--ghost" onClick={endDemo}>Exit demo</button></p> : null}
              {page}
            </div>
          ))}
        </div>
      </div>

      <nav aria-label="Primary navigation" className="tab-dock" ref={navRef}>
        <span aria-hidden="true" className="tab-dock__indicator" />
        {items.map((item, index) => (
          <NavLink
            className={`tab-dock__item${visualIndex === index ? ' tab-dock__item--active' : ''}`}
            end={item.end}
            key={item.to}
            onClick={(event) => {
              event.preventDefault();
              selectTab(index);
            }}
            to={item.to}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
