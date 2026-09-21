import { useMemo } from 'react';
import { formatDuration, remainingMatches, togetherWindows, totalTogetherMinutes } from '@match/core';

import { useNow } from '../useNow';
import { useMatch } from '../../app/matchState';
import { formatCountdown, formatDate, formatInterval, formatRange, today } from '../format';

/**
 * The answer the app exists to give: when can the two of you actually be in the same place.
 *
 * Ordered by what someone opening this on a phone wants first — the next window, then everything
 * after it. The days that did not match are not listed here at all; the calendar is where you go
 * to ask why a particular day is missing.
 */
export function TogetherPage() {
  const { days, settings, you, them, hasBothRosters, yourDays, theirDays } = useMatch();
  const clock = useNow();
  const now = today();
  const remaining = useMemo(() => remainingMatches(days, clock, settings), [days, clock, settings]);
  const upcoming = useMemo(() => togetherWindows(remaining), [remaining]);
  const next = upcoming[0];
  const unverified = new Set([...yourDays, ...theirDays].filter(day => day.state === 'unknown').map(day => day.date)).size;
  const minutes = totalTogetherMinutes(remaining);

  if (!hasBothRosters) {
    return (
      <div className="page">
        <section className="empty-state">
          <p className="empty-state__mark" aria-hidden="true">❥</p>
          <h2>Two rosters, one answer</h2>
          <p>
            Add a roster for {you.name} and for {them.name}, and this page fills with the days you can
            be together — at home, or down route in the same city.
          </p>
          <p className="empty-state__hint">Open the Rosters tab to import, or load the sample month to see how it reads.</p>
        </section>
      </div>
    );
  }

  if (!upcoming.length) {
    return (
      <div className="page">
        <section className="empty-state">
          <p className="empty-state__mark" aria-hidden="true">⌛</p>
          <h2>Nothing ahead yet</h2>
          {unverified ? <p>{unverified} dates have missing or unverified roster data and are excluded. Check Calendar or reimport the source roster.</p> : null}
          <p>
            The rosters you have loaded hold no more days where {you.name} and {them.name} are free in
            the same place. Import the next month when it is published.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      {unverified ? <p className="notice">{unverified} dates have missing or unverified data. Check Calendar; these dates do not count as free.</p> : null}
      {next ? (
        <section className="next-window" aria-labelledby="next-window-title">
          <p className="next-window__countdown">{formatCountdown(now, next.start)}</p>
          <h2 className="next-window__range" id="next-window-title">{formatRange(next.start, next.end)}</h2>
          <p className="next-window__headline">{next.headline}</p>
          {next.commonHours ? (
            <p className="next-window__detail">Free together every day {formatInterval(next.commonHours)}</p>
          ) : null}
          {next.kind === 'layover' ? (
            <p className="next-window__badge next-window__badge--layover">Both down route in {next.station}</p>
          ) : null}
          {next.tentative ? (
            <p className="next-window__badge next-window__badge--tentative">Rests on a standby day — it can still be called</p>
          ) : null}
        </section>
      ) : null}

      <section className="summary-row" aria-label="What is left in the loaded rosters">
        <div className="summary-tile">
          <span className="summary-tile__value">{new Set(remaining.map(day => day.date)).size}</span>
          <span className="summary-tile__label">days together</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile__value">{upcoming.length}</span>
          <span className="summary-tile__label">{upcoming.length === 1 ? 'window' : 'windows'}</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile__value">{formatDuration(minutes)}</span>
          <span className="summary-tile__label">shared time</span>
        </div>
      </section>

      <section aria-label="Every window ahead" className="window-list">
        <h3 className="section-heading">Ahead of you</h3>
        {upcoming.map((window) => (
          <article className={`window-card window-card--${window.quality}`} key={`${window.start}-${window.station}`}>
            <header className="window-card__header">
              <h4>{formatRange(window.start, window.end)}</h4>
              <span className="window-card__days">{window.days === 1 ? '1 day' : `${window.days} days`}</span>
            </header>
            <p className="window-card__headline">{window.headline}</p>
            <ul className="window-card__days-list">
              {window.dates.map((date) => {
                const day = remaining.find((candidate) => candidate.date === date);
                return (
                  <li key={date}>
                    <span className="window-card__day-date">{formatDate(date)}</span>
                    <span className="window-card__day-detail">{window.station} · {(day?.sessions?.find(session => session.station === window.station)?.overlap ?? day?.overlap)?.map(formatInterval).join(', ')}</span>
                  </li>
                );
              })}
            </ul>
            <footer className="window-card__footer">
              {window.kind === 'layover' ? <span className="chip chip--layover">{window.station}</span> : null}
              {window.tentative ? <span className="chip chip--tentative">standby</span> : null}
              {window.nights ? <span className="chip">{window.nights === 1 ? '1 night' : `${window.nights} nights`}</span> : null}
            </footer>
          </article>
        ))}
      </section>
    </div>
  );
}
