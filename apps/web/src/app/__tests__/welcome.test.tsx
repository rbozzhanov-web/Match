import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MatchProvider, useMatch } from '../matchState';
import { TogetherPage } from '../../features/together/TogetherPage';
import { emptyState } from '../../storage/people';

function Probe() {
  const { demo, endDemo } = useMatch();
  const location = useLocation();
  return <><output data-testid="route">{location.pathname}</output><button onClick={endDemo} disabled={!demo}>End sample</button></>;
}
function setup() {
  render(<MemoryRouter><MatchProvider initialState={emptyState()}><TogetherPage /><Probe /></MatchProvider></MemoryRouter>);
  return userEvent.setup();
}
describe('first launch actions', () => {
  it('opens roster import from the welcome card', async () => {
    const user = setup();
    await user.click(screen.getByRole('link', { name: 'Add rosters' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/people');
  });
  it('previews a sample without saving it and returns to welcome on exit', async () => {
    const user = setup();
    const before = localStorage.getItem('match.state.v1');
    await user.click(screen.getByRole('button', { name: 'Try a sample month' }));
    expect(screen.queryByRole('heading', { name: 'Find your time together' })).not.toBeInTheDocument();
    expect(localStorage.getItem('match.state.v1')).toBe(before);
    await user.click(screen.getByRole('button', { name: 'End sample' }));
    expect(screen.getByRole('heading', { name: 'Find your time together' })).toBeInTheDocument();
  });
});
