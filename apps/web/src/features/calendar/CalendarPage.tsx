import { useMemo, useState } from 'react';
import { addDays, eachDate, formatDuration, relationshipMoments, weekday, type DayAvailability, type MatchDay, type RelationshipMoment } from '@match/core';

import { useMatch } from '../../app/matchState';
import { formatDate, formatDayOfMonth, formatInterval, formatMonth, today } from '../format';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The month, with both rosters laid over each other.
 *
 * The Together tab answers "when"; this one answers "why not then". Each cell carries both
 * people's day states side by side, so a day that did not match shows its reason at a glance —
 * one of you down route, one of you flying, or simply a day nobody's roster covers.
 */
export function CalendarPage() {
  const { days, yourDays, theirDays, you, them, hasBothRosters } = useMatch();
  const now = today();
  const [pickedMonth, setPickedMonth] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);

  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const momentsByDate = useMemo(() => {
    const moments = new Map<string, RelationshipMoment[]>();
    for (const moment of relationshipMoments(days)) {
      moments.set(moment.date, [...(moments.get(moment.date) ?? []), moment]);
    }
    return moments;
  }, [days]);
  const yoursByDate = useMemo(() => new Map(yourDays.map((day) => [day.date, day])), [yourDays]);
  const theirsByDate = useMemo(() => new Map(theirDays.map((day) => [day.date, day])), [theirDays]);

  const months = useMemo(() => {
    const set = new Set([...yourDays, ...theirDays].map((day) => day.date.slice(0, 7)));
    if (!set.size) set.add(now.slice(0, 7));
    return [...set].sort();
  }, [yourDays, theirDays, now]);

  /*
   * Which month is on screen, derived rather than stored.
   *
   * Holding it in state alone meant it was decided on the first render — before any roster had
   * been imported — and then never moved, so importing a roster for another month left the grid
   * sitting on an empty one with both arrows disabled and no way out. The pick still wins while
   * it points at a month there is data for; otherwise this falls to today, or to wherever the
   * roster actually starts.
   */
  const monthAnchor = pickedMonth && months.includes(pickedMonth)
    ? pickedMonth
    : months.includes(now.slice(0, 7)) ? now.slice(0, 7) : months[0];

  const cells = useMemo(() => buildGrid(monthAnchor), [monthAnchor]);
  const selectedDay = selected ? byDate.get(selected) : undefined;

  if (!hasBothRosters) {
    return (
      <div className="page">
        <section className="empty-state">
          <p className="empty-state__mark" aria-hidden="true">▦</p>
          <h2>The month, once both rosters are in</h2>
          <p>Each day will show where {you.name} and {them.name} each are, and which days line up.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <nav aria-label="Month" className="month-switch">
        <button
          aria-label="Previous month"
          disabled={months.indexOf(monthAnchor) <= 0}
          onClick={() => setPickedMonth(months[Math.max(0, months.indexOf(monthAnchor) - 1)])}
          type="button"
        >
          ‹
        </button>
        <h2>{formatMonth(`${monthAnchor}-01`)}</h2>
        <button
          aria-label="Next month"
          disabled={months.indexOf(monthAnchor) >= months.length - 1}
          onClick={() => setPickedMonth(months[Math.min(months.length - 1, months.indexOf(monthAnchor) + 1)])}
          type="button"
        >
          ›
        </button>
      </nav>

      <div aria-hidden="true" className="calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>

      <div className="calendar-grid" role="grid" aria-label={`Days in ${formatMonth(`${monthAnchor}-01`)}`}>
        {cells.map((date, index) => {
          if (!date) return <span aria-hidden="true" className="calendar-cell calendar-cell--blank" key={`blank-${index}`} />;
          const match = byDate.get(date);
          const yours = yoursByDate.get(date);
          const theirs = theirsByDate.get(date);
          const matched = Boolean(match?.matched);
          const moments = momentsByDate.get(date) ?? [];
          const hasPrivate = moments.some(moment => moment.kind === 'private' || moment.kind === 'layover');
          const hasFamily = moments.some(moment => moment.kind === 'family');
          const context = hasPrivate ? 'time just for you two' : hasFamily ? 'family time' : matched ? 'shared roster time, but not an available date yet' : undefined;
          return (
            <button
              aria-label={`${formatDate(date)}: ${context ?? match?.headline ?? 'no roster'}`}
              aria-pressed={selected === date}
              className={[
                'calendar-cell',
                matched ? `calendar-cell--matched calendar-cell--${match?.quality}` : '',
                hasPrivate ? 'calendar-cell--private' : '',
                hasFamily ? 'calendar-cell--family' : '',
                match?.tentative ? 'calendar-cell--tentative' : '',
                date === now ? 'calendar-cell--today' : '',
                selected === date ? 'calendar-cell--selected' : '',
              ].filter(Boolean).join(' ')}
              key={date}
              onClick={() => setSelected(selected === date ? undefined : date)}
              type="button"
            >
              <span className="calendar-cell__day">{formatDayOfMonth(date)}</span>
              <span aria-hidden="true" className="calendar-cell__states">
                <span className={`state-dot state-dot--${yours?.state ?? 'unknown'}`} />
                <span className={`state-dot state-dot--${theirs?.state ?? 'unknown'}`} />
              </span>
              {hasPrivate ? <span aria-hidden="true" className="calendar-cell__mark">♥</span> : hasFamily ? <span aria-hidden="true" className="calendar-cell__mark">•</span> : null}
            </button>
          );
        })}
      </div>

      <section aria-live="polite" className="day-detail">
        {selectedDay ? (
          <DayDetail day={selectedDay} moments={momentsByDate.get(selectedDay.date) ?? []} youName={you.name} themName={them.name} />
        ) : (
          selected ? <article className="day-detail__card"><h3>{formatDate(selected)}</h3><p>No confirmed overlap — one or both rosters are missing.</p>{yoursByDate.get(selected) ? <PersonDay name={you.name} day={yoursByDate.get(selected)!} /> : <p>No roster for {you.name}.</p>}{theirsByDate.get(selected) ? <PersonDay name={them.name} day={theirsByDate.get(selected)!} /> : <p>No roster for {them.name}.</p>}</article> : <p className="day-detail__hint">Pick a day to see where you each are.</p>
        )}
      </section>

      <section aria-label="What the colours mean" className="legend">
        <span className="legend__item"><span className="calendar-legend__private" aria-hidden="true">♥</span> just you two</span>
        <span className="legend__item"><span className="calendar-legend__family" aria-hidden="true">•</span> family time</span>
        {(['free', 'leave', 'standby', 'duty', 'away'] as const).map((state) => (
          <span className="legend__item" key={state}>
            <span className={`state-dot state-dot--${state}`} aria-hidden="true" />
            {state === 'away' ? 'down route' : state}
          </span>
        ))}
      </section>
    </div>
  );
}

function DayDetail({ day, moments, youName, themName }: { day: MatchDay; moments: RelationshipMoment[]; youName: string; themName: string }) {
  const hasPrivate = moments.some(moment => moment.kind === 'private' || moment.kind === 'layover');
  const hasFamily = moments.some(moment => moment.kind === 'family');
  return (
    <article className="day-detail__card">
      <header>
        <h3>{formatDate(day.date)}</h3>
        <p className={day.matched ? 'day-detail__verdict day-detail__verdict--yes' : 'day-detail__verdict'}>
          {day.headline}
        </p>
      </header>
      <div className="day-detail__people">
        <PersonDay name={youName} day={day.you} />
        <PersonDay name={themName} day={day.them} />
      </div>
      {day.matched ? (
        <p className="day-detail__overlap">
          Shared: {(day.sessions ?? [{ station: day.station, overlap: day.overlap }]).map(session => `${session.station}: ${session.overlap.map(formatInterval).join(', ')}`).join(' / ')} · {formatDuration(day.minutes)}
        </p>
      ) : null}
      {hasPrivate ? <p className="day-detail__context">♥ Time just for you two: {moments.filter(moment => moment.kind !== 'family').map(moment => formatInterval(moment.interval)).join(', ')}</p> : null}
      {hasFamily ? <p className="day-detail__context">• Family time: {moments.filter(moment => moment.kind === 'family').map(moment => formatInterval(moment.interval)).join(', ')}</p> : null}
      {day.caution ? <p className="day-detail__caution">{day.caution}</p> : null}
    </article>
  );
}

function PersonDay({ name, day }: { name: string; day: DayAvailability }) {
  return (
    <div className="person-day">
      <p className="person-day__name">
        <span className={`state-dot state-dot--${day.state}`} aria-hidden="true" />
        {name}
      </p>
      {/* The label is the route in summary, so it would only repeat the list below it. */}
      {day.flights.length ? null : <p className="person-day__label">{day.label}</p>}
      <p className="person-day__station">End of day: {day.station}</p>
      {day.issue ? <p role="status">{day.issue}</p> : null}
      {day.state === 'unknown' ? <p>No verified availability</p> : (day.locations ?? []).map((slot, i) => <div className="availability-row" key={`${slot.station}-${i}`}>
        <span>{slot.station} · free {formatInterval(slot)}</span>
        <div className="availability-track" aria-hidden="true"><span style={{ left: `${slot.start / 1440 * 100}%`, width: `${(slot.end - slot.start) / 1440 * 100}%` }} /></div>
      </div>)}
      {day.flights.length ? (
        <ul className="person-day__flights">
          {day.flights.map((flight) => (
            <li key={`${flight.flightNumber}-${flight.departure}`}>
              {flight.flightNumber} {flight.origin}→{flight.destination} · {flight.departure}–{flight.arrival}
              {flight.deadhead ? ' · DHC' : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A Monday-first month grid, padded to whole weeks.
 *
 * `weekday` counts from Sunday, so the padding shifts by one to put Monday in the first column —
 * which is how both rosters this app reads are printed.
 */
function buildGrid(month: string): (string | undefined)[] {
  const first = `${month}-01`;
  const lead = (weekday(first) + 6) % 7;
  const last = lastDayOf(month);
  const dates = eachDate(first, last);
  const cells: (string | undefined)[] = Array.from({ length: lead }, () => undefined);
  cells.push(...dates);
  while (cells.length % 7) cells.push(undefined);
  return cells;
}

function lastDayOf(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`;
  return addDays(nextMonth, -1);
}
