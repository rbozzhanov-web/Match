import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { MatchProvider } from '../matchState';
import { TogetherPage } from '../../features/together/TogetherPage';
import { buildQuickRoster } from '../../roster/quickRoster';
import { DEFAULT_SETTINGS, type MatchState } from '../../storage/people';

/**
 * Two rosters whose only free time is the days named.
 *
 * The working day deliberately fills the whole sociable window. A default nine-to-five would leave
 * both people free every evening — which is true, and which is exactly what these tests are not
 * about: they are about the page, so the days together have to be the ones the test chose.
 */
function stateWith(yourFree: string[], theirFree: string[], start: string, end: string): MatchState {
  const work = { workStart: '08:00', workEnd: '22:30' };
  return {
    you: { id: 'you', name: 'Ramil', base: 'ALA', roster: buildQuickRoster({ start, end, freeDates: yourFree, ...work }) },
    them: { id: 'them', name: 'Khava', base: 'ALA', roster: buildQuickRoster({ start, end, freeDates: theirFree, ...work }) },
    settings: { ...DEFAULT_SETTINGS },
  };
}

function renderTogether(state: MatchState) {
  return render(
    <MemoryRouter><MatchProvider initialState={state}>
      <TogetherPage />
    </MatchProvider></MemoryRouter>,
  );
}

describe('the page that answers the question', () => {
  it('asks for rosters before it has them', () => {
    renderTogether({
      you: { id: 'you', name: 'Ramil', base: 'ALA' },
      them: { id: 'them', name: 'Khava', base: 'ALA' },
      settings: { ...DEFAULT_SETTINGS },
    });
    expect(screen.getByRole('heading', { name: 'Find your time together' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add rosters' })).toHaveAttribute('href', '/people');
  });

  it('names the next stretch of days together', () => {
    // Far enough ahead that the run stays in the future however long this test lives.
    const state = stateWith(
      ['2099-06-05', '2099-06-06'],
      ['2099-06-05', '2099-06-06'],
      '2099-06-01',
      '2099-06-30',
    );
    renderTogether(state);

    // The hero answers the more useful question first: the next private daytime window.
    expect(screen.getByRole('heading', { level: 2, name: /Fri 5 Jun/ })).toBeInTheDocument();
    expect(screen.getByText('Together while the children are out')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: /Fri 5 Jun – Sat 6 Jun/ })).toBeInTheDocument();
    expect(screen.getAllByText('2 days together · 30h').length).toBeGreaterThan(0);
  });

  it('counts only what is still ahead', () => {
    const state = stateWith(['2099-06-05'], ['2099-06-05'], '2099-06-01', '2099-06-30');
    renderTogether(state);

    const summary = screen.getByLabelText('What is left in the loaded rosters');
    const privateTile = within(summary).getByText('just you two').closest('.summary-tile');
    expect(privateTile).not.toBeNull();
    expect(within(privateTile as HTMLElement).getByText('9h')).toBeInTheDocument();
    expect(within(summary).getByText('family time')).toBeInTheDocument();
  });

  it('says so plainly when two rosters never line up', () => {
    // Each is free exactly when the other is at work.
    const state = stateWith(['2099-06-05'], ['2099-06-06'], '2099-06-01', '2099-06-07');
    renderTogether(state);

    expect(screen.getByRole('heading', { name: 'Nothing ahead yet' })).toBeInTheDocument();
  });
});
