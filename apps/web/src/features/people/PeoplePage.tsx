import { useEffect, useRef, useState } from 'react';
import { addDays, rosterCoverage, rosterDates, stationZone, type Roster } from '@match/core';

import { useMatch } from '../../app/matchState';
import { importRosterFile, mergeRoster } from '../../roster/importRoster';
import { parseDayCodeText, weekendsOff } from '../../roster/quickRoster';
import { sampleRosters } from '../../roster/sample';
import { validRoster } from '../../storage/people';
import { formatDate, today } from '../format';

/**
 * Where the two rosters come in.
 *
 * Several ways in, because two people rarely keep their time the same way: a roster file for
 * whoever flies — either export, PDF or web archive, the app works out which — a pasted list of
 * dates for whoever does not, and a plain working week for when even that is more effort than the
 * answer is worth.
 */
export function PeoplePage() {
  const { you, them, importRoster, removeRoster, renamePerson, startDemo, endDemo, demo, canUndo, undo, updatePerson } = useMatch();
  const [notice, setNotice] = useState<string | undefined>(undefined);
  useEffect(() => { if (!demo) setNotice(undefined); }, [demo]);

  const loadSample = () => {
    const start = `${today().slice(0, 7)}-01`;
    const { you: yours, them: theirs } = sampleRosters(start);
    startDemo(yours, theirs);
    setNotice(undefined);
  };

  return (
    <div className="page">
      {notice ? <p className="notice" role="status">{notice}</p> : null}

      {canUndo ? <button className="button button--ghost" onClick={() => { undo(); setNotice('Last roster change undone.'); }}>Undo last roster change</button> : null}
      <fieldset disabled={demo} className="roster-fields">
      <PersonPanel
        onImport={(roster) => importRoster('you', roster)}
        onRemove={() => removeRoster('you')}
        onRename={(name) => renamePerson('you', name)}
        onNotice={setNotice}
        person={you}
        onBase={(base) => updatePerson('you', { base, roster: you.roster ? { ...you.roster, base } : undefined })}
        who="you"
      />
      <PersonPanel
        onImport={(roster) => importRoster('them', roster)}
        onRemove={() => removeRoster('them')}
        onRename={(name) => renamePerson('them', name)}
        onNotice={setNotice}
        person={them}
        onBase={(base) => updatePerson('them', { base, roster: them.roster ? { ...them.roster, base } : undefined })}
        who="them"
      />

      </fieldset>
      <section className="panel">
        <h3 className="section-heading">Just looking</h3>
        <p className="panel__hint">
          Load an invented month for both people to see how the app reads a pair of rosters. Nothing
          about it is real, and importing over it is the only thing it is for.
        </p>
        <button className="button button--ghost" onClick={demo ? endDemo : loadSample} type="button">{demo ? 'Exit demo' : 'Load a sample month'}</button>
      </section>
    </div>
  );
}

interface PersonPanelProps {
  person: { id: string; name: string; base: string; roster?: Roster };
  who: 'you' | 'them';
  onImport: (roster: Roster) => void;
  onRemove: () => void;
  onBase: (base: string) => void;
  onRename: (name: string) => void;
  onNotice: (message: string | undefined) => void;
}

function PersonPanel({ person, who, onImport, onRemove, onRename, onNotice, onBase }: PersonPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ roster: Roster; label: string; unread: number }>();
  const [baseInput, setBaseInput] = useState(person.base);
  useEffect(() => setBaseInput(person.base), [person.base]);
  const stage = (roster: Roster, label: string, unread = 0) => {
    if (!validRoster(roster)) throw new Error('The roster contains invalid dates or times. Nothing was imported.');
    setPending({ roster, label, unread });
  };
  const [error, setError] = useState<string | undefined>(undefined);

  const readRosterFile = async (file: File) => {
    setBusy(true);
    setPending(undefined);
    setError(undefined);
    try {
      const imported = await importRosterFile(file, person.base);
      stage(imported.roster, imported.subjectName ?? file.name, imported.unreadCells.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that file.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const readPaste = () => {
    const parsed = parseDayCodeText(paste, person.base);
    if (!parsed) {
      setError('No dates found. Use one line per day, like "2026-10-03 OFF".');
      return;
    }
    setError(undefined);
    try { stage(parsed, 'Typed days'); setPaste(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'Invalid dates.'); }
  };

  const addWorkingWeeks = () => {
    const start = today();
    stage(weekendsOff(start, addDays(start, 55), person.base), 'Eight working weeks');
  };

  const coverage = person.roster ? rosterCoverage(person.roster) : undefined;

  return (
    <section className="panel">
      <header className="panel__header">
        <label className="panel__name">
          <span className="panel__name-label">{who === 'you' ? 'You' : 'Them'}</span>
          <input
            aria-label={who === 'you' ? 'Your name' : 'Their name'}
            onChange={(event) => onRename(event.target.value)}
            value={person.name}
          />
        </label>
        <span className="panel__base">{person.base}</span>
      </header>

      <label className="field"><span>Home base (IATA)</span><input aria-label={`Home base for ${person.name}`} value={baseInput} maxLength={3} onChange={event => setBaseInput(event.target.value.toUpperCase())} onBlur={() => {
        if (stationZone(baseInput)) { if (baseInput !== person.base) onBase(baseInput); setError(undefined); }
        else { setError('Choose a supported airport code, for example ALA or NQZ.'); setBaseInput(person.base); }
      }} /></label>
      {pending ? <section className="import-preview" aria-label={`Import preview for ${person.name}`}>
        <h3>Review import</h3><p>{pending.label} · {pending.roster.base ?? person.base}</p>
        <p>{formatDate(pending.roster.period.start)} – {formatDate(pending.roster.period.end)}</p>
        <p>{rosterDates(pending.roster).length} covered days · {pending.roster.duties.length} duties</p>
        <p>{rosterDates(pending.roster).filter(date => person.roster && rosterDates(person.roster).includes(date)).length} existing days will be replaced, including cancelled duties.</p>
        {pending.unread || pending.roster.uncertainDates?.length ? <p role="alert">Some entries were not recognised. Affected dates will not count as free: {pending.roster.uncertainDates?.join(', ') || 'check the source file'}.</p> : null}
        <div className="panel__actions"><button className="button" onClick={() => { const merged = mergeRoster(person.roster, pending.roster); if (!validRoster(merged)) { setError('The combined roster exceeds the supported five-year range. Remove older data or restore a smaller backup.'); return; } onImport(merged); onNotice(`Imported ${pending.label} for ${person.name}. You can undo this change.`); setPending(undefined); }}>Apply import</button><button className="button button--ghost" onClick={() => setPending(undefined)}>Cancel</button></div>
      </section> : null}
      {coverage ? (
        <p className="panel__coverage">
          {person.roster ? rosterDates(person.roster).length : 0} imported dates · {formatDate(coverage.start)} – {formatDate(coverage.end)}
          {person.roster?.duties.length ? ` · ${person.roster.duties.length} duties` : ''}
        </p>
      ) : (
        <p className="panel__coverage panel__coverage--empty">No roster yet.</p>
      )}

      <div className="panel__actions">
        <button className="button" disabled={busy} onClick={() => fileInput.current?.click()} type="button">
          {busy ? 'Reading…' : 'Import roster file'}
        </button>
        <button disabled={busy} className="button button--ghost" onClick={addWorkingWeeks} type="button">Weekends off</button>
        {person.roster ? (
          <button disabled={busy} className="button button--quiet" onClick={() => { setPending(undefined); onRemove(); }} type="button">Remove</button>
        ) : null}
      </div>

      <input
        accept=".pdf,application/pdf,.webarchive,.html,.htm,.mht,.mhtml"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readRosterFile(file);
        }}
        ref={fileInput}
        type="file"
      />
      <p className="panel__hint">
        Either AIMS export works: the Personal Crew Schedule Report as a PDF, or the Crew Schedule
        saved as a web archive.
      </p>

      <details className="panel__paste">
        <summary>Type the days instead</summary>
        <p className="panel__hint">One line per day: a date, then a code such as OFF, VAC or AVLB.</p>
        <textarea
          aria-label={`Day codes for ${person.name}`}
          onChange={(event) => setPaste(event.target.value)}
          placeholder={'2026-10-03 OFF\n2026-10-04 OFF\n2026-10-05 VAC'}
          rows={5}
          value={paste}
        />
        <button className="button button--ghost" onClick={readPaste} disabled={busy} type="button">Add these days</button>
      </details>

      {error ? <p className="panel__error" role="alert">{error}</p> : null}
    </section>
  );
}
