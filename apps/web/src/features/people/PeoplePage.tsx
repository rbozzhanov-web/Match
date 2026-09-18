import { useRef, useState } from 'react';
import { addDays, rosterCoverage, type Roster } from '@match/core';

import { useMatch } from '../../app/matchState';
import { mergeRoster, parseAimsArchive } from '../../roster/aims';
import { parseDayCodeText, weekendsOff } from '../../roster/quickRoster';
import { sampleRosters } from '../../roster/sample';
import { formatDate, today } from '../format';

/**
 * Where the two rosters come in.
 *
 * Three ways in, because two people rarely keep their time the same way: an AIMS Crew Schedule for
 * whoever flies, a pasted list of dates for whoever does not, and a plain working week for when
 * even that is more effort than the answer is worth.
 */
export function PeoplePage() {
  const { you, them, importRoster, removeRoster, renamePerson } = useMatch();
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const loadSample = () => {
    const start = `${today().slice(0, 7)}-01`;
    const { you: yours, them: theirs } = sampleRosters(start);
    importRoster('you', yours);
    importRoster('them', theirs);
    setNotice('Loaded an invented month for both of you. Importing a real roster replaces it.');
  };

  return (
    <div className="page">
      {notice ? <p className="notice" role="status">{notice}</p> : null}

      <PersonPanel
        onImport={(roster) => importRoster('you', roster)}
        onRemove={() => removeRoster('you')}
        onRename={(name) => renamePerson('you', name)}
        onNotice={setNotice}
        person={you}
        who="you"
      />
      <PersonPanel
        onImport={(roster) => importRoster('them', roster)}
        onRemove={() => removeRoster('them')}
        onRename={(name) => renamePerson('them', name)}
        onNotice={setNotice}
        person={them}
        who="them"
      />

      <section className="panel">
        <h3 className="section-heading">Just looking</h3>
        <p className="panel__hint">
          Load an invented month for both people to see how the app reads a pair of rosters. Nothing
          about it is real, and importing over it is the only thing it is for.
        </p>
        <button className="button button--ghost" onClick={loadSample} type="button">Load a sample month</button>
      </section>
    </div>
  );
}

interface PersonPanelProps {
  person: { id: string; name: string; base: string; roster?: Roster };
  who: 'you' | 'them';
  onImport: (roster: Roster) => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  onNotice: (message: string | undefined) => void;
}

function PersonPanel({ person, who, onImport, onRemove, onRename, onNotice }: PersonPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const readArchive = async (file: File) => {
    setBusy(true);
    setError(undefined);
    try {
      const parsed = await parseAimsArchive(file, person.base);
      // Merging rather than replacing: two people comparing months import several files each, and
      // a match only reaches as far as the narrower roster's coverage.
      onImport(mergeRoster(person.roster, parsed));
      onNotice(`Imported ${parsed.duties.length} duties for ${person.name}.`);
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
    onImport(mergeRoster(person.roster, parsed));
    onNotice(`Read ${parsed.dayCodes?.length ?? 0} days for ${person.name}.`);
    setPaste('');
  };

  const addWorkingWeeks = () => {
    const start = today();
    onImport(mergeRoster(person.roster, weekendsOff(start, addDays(start, 55), person.base)));
    onNotice(`Gave ${person.name} eight weeks of weekends off.`);
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

      {coverage ? (
        <p className="panel__coverage">
          Roster covers {formatDate(coverage.start)} – {formatDate(coverage.end)}
          {person.roster?.duties.length ? ` · ${person.roster.duties.length} duties` : ''}
        </p>
      ) : (
        <p className="panel__coverage panel__coverage--empty">No roster yet.</p>
      )}

      <div className="panel__actions">
        <button className="button" disabled={busy} onClick={() => fileInput.current?.click()} type="button">
          {busy ? 'Reading…' : 'Import AIMS schedule'}
        </button>
        <button className="button button--ghost" onClick={addWorkingWeeks} type="button">Weekends off</button>
        {person.roster ? (
          <button className="button button--quiet" onClick={onRemove} type="button">Remove</button>
        ) : null}
      </div>

      <input
        accept=".webarchive,.html,.htm,.mht,.mhtml"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readArchive(file);
        }}
        ref={fileInput}
        type="file"
      />

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
        <button className="button button--ghost" onClick={readPaste} type="button">Add these days</button>
      </details>

      {error ? <p className="panel__error" role="alert">{error}</p> : null}
    </section>
  );
}
