import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchProvider, useMatch } from '../matchState';
import { PeoplePage } from '../../features/people/PeoplePage';
import { emptyState, readBackup, backupText, saveState } from '../../storage/people';
import { parseDayCodeText } from '../../roster/quickRoster';

function Probe() {
  const {you,demo,reset,undo,canUndo} = useMatch();
  return <><output data-testid="roster">{JSON.stringify(you.roster)}</output><output data-testid="demo">{String(demo)}</output><button onClick={reset}>Reset probe</button><button disabled={!canUndo} onClick={undo}>Undo probe</button></>;
}
const initial = () => ({...emptyState(),you:{...emptyState().you,roster:parseDayCodeText('2099-01-01 OFF')}});
function renderPage() { return render(<StrictMode><MatchProvider initialState={initial()}><PeoplePage/><Probe/></MatchProvider></StrictMode>); }

describe('import and recovery flow', () => {
  it('stages typed dates without modifying the saved roster, then applies and undoes', async () => {
    const user = userEvent.setup(); renderPage();
    const before=screen.getByTestId('roster').textContent;
    await user.type(screen.getByLabelText('Day codes for You'), '2099-01-01 SIM');
    await user.click(screen.getAllByRole('button',{name:'Add these days'})[0]);
    expect(screen.getByTestId('roster').textContent).toBe(before);
    const preview=screen.getByLabelText('Import preview for You');
    await user.click(within(preview).getByRole('button',{name:'Apply import'}));
    expect(screen.getByTestId('roster').textContent).toContain('SIM');
    await user.click(screen.getByRole('button',{name:'Undo probe'}));
    expect(screen.getByTestId('roster').textContent).toBe(before);
  });
  it('keeps demo out of storage and restores the original state', async () => {
    const user=userEvent.setup();renderPage();const before=localStorage.getItem('match.state.v1');
    await user.click(screen.getByRole('button',{name:'Load a sample month'}));
    expect(screen.getByTestId('demo')).toHaveTextContent('true');
    expect(localStorage.getItem('match.state.v1')).toBe(before);
    expect(screen.getAllByRole('button',{name:'Import roster file'})[0]).toBeDisabled();
    await user.click(screen.getByRole('button',{name:'Exit demo'}));
    expect(localStorage.getItem('match.state.v1')).toBe(before);
  });
  it('can recover both rosters after a clear',async()=>{
    const user=userEvent.setup();renderPage();const before=screen.getByTestId('roster').textContent;
    await user.click(screen.getByRole('button',{name:'Reset probe'}));
    expect(screen.getByTestId('roster')).toBeEmptyDOMElement();
    await user.click(screen.getByRole('button',{name:'Undo probe'}));
    expect(screen.getByTestId('roster').textContent).toBe(before);
  });
  it('round trips a backup and rejects malformed or excessive input',()=>{
    const source = initial();
    expect(readBackup(backupText(source))).toEqual(source);
    expect(()=>readBackup('{"app":"Match","version":1,"state":{}}')).toThrow();
    const bad=initial();bad.you.roster!.period={start:'0001-01-01',end:'9999-12-31'};
    expect(()=>readBackup(backupText(bad))).toThrow();
  });
  it('does not invent blank days when restoring a legacy backup', () => {
    const source = initial();
    delete source.you.roster!.coveredDates;
    source.you.roster!.period.end = '2099-01-03';
    source.you.roster!.coverage!.end = '2099-01-03';
    const restored = readBackup(backupText(source));
    expect(restored.you.roster?.coveredDates).toEqual(['2099-01-01']);
  });
  it('reports storage failures',()=>{
    const mock=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
    expect(saveState(initial())).toBe(false);mock.mockRestore();
  });
});
