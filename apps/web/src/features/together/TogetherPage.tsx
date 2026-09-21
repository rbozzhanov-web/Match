import { useMemo } from 'react';
import {
  DEFAULT_MOVE_IN_DATE,
  formatDuration,
  relationshipMinutes,
  relationshipMoments,
  remainingMatches,
  togetherWindows,
} from '@match/core';

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
  const moments = useMemo(() => relationshipMoments(remaining), [remaining]);
  const upcomingMoments = moments.filter(moment => moment.date >= now);
  const nextPrivate = upcomingMoments.find(moment => moment.kind === 'private' || moment.kind === 'layover');
  const nextFamily = upcomingMoments.find(moment => moment.kind === 'family');
  const nextRealMoment = nextPrivate ?? nextFamily;
  const quietMinutes = relationshipMinutes(upcomingMoments, 'private') + relationshipMinutes(upcomingMoments, 'layover');
  const familyMinutes = relationshipMinutes(upcomingMoments, 'family');
  const livingTogether = now >= DEFAULT_MOVE_IN_DATE;
  const unverified = new Set([...yourDays, ...theirDays].filter(day => day.state === 'unknown').map(day => day.date)).size;

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
      <p className="relationship-note">
        {livingTogether
          ? 'Weekday 08:00–17:00 is marked as time for just you two. Evenings and weekends are kept as family time.'
          : 'Until 1 Nov, home time counts only on weekdays from 08:00–17:00, while the children are at school or nursery. Shared layovers stay visible.'}
      </p>
      {nextRealMoment ? (
        <section className="next-window" aria-labelledby="next-window-title">
          <p className="next-window__countdown">{nextRealMoment.kind === 'family' ? 'NEXT FAMILY TIME' : 'NEXT TIME JUST FOR YOU TWO'}</p>
          <h2 className="next-window__range" id="next-window-title">{formatDate(nextRealMoment.date)}</h2>
          <p className="next-window__headline">
            {nextRealMoment.kind === 'layover' ? `Together in ${nextRealMoment.station}` : nextRealMoment.kind === 'family' ? 'Together at home with the children' : 'Together while the children are out'}
          </p>
          <p className="next-window__detail">{formatInterval(nextRealMoment.interval)} · {formatDuration(nextRealMoment.minutes)}</p>
          <p className="next-window__badge">{formatCountdown(now, nextRealMoment.date)}</p>
        </section>
      ) : null}

      <section className="summary-row" aria-label="What is left in the loaded rosters">
        <div className="summary-tile">
          <span className="summary-tile__value">{formatDuration(quietMinutes)}</span>
          <span className="summary-tile__label">just you two</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile__value">{formatDuration(familyMinutes)}</span>
          <span className="summary-tile__label">family time</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile__value">{upcoming.length}</span>
          <span className="summary-tile__label">shared windows</span>
        </div>
      </section>

      <section aria-label="Every shared window ahead" className="window-list">
        <h3 className="section-heading">All shared roster windows</h3>
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
