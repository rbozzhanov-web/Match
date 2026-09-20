import { useRef, useState } from 'react';
import { buildTogetherIcs, minutesToHHMM, remainingMatches, togetherWindows } from '@match/core';

import { useMatch } from '../../app/matchState';
import { backupText, readBackup, type MatchState, DEFAULT_SETTINGS } from '../../storage/people';

type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsPageProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

/**
 * The knobs that change what counts as a day together, and the way out to a calendar.
 *
 * Every one of these is a judgement the match engine would otherwise make silently — how long
 * before a report the evening is really gone, how short a window still counts. They are here
 * because two couples would answer them differently and neither answer is the app's to assume.
 */
export function SettingsPage({ theme, onThemeChange }: SettingsPageProps) {
  const { state, settings, updateSettings, days, them, reset, replaceState, canUndo, undo, demo, you, updatePerson } = useMatch();
  const backupInput = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<MatchState>();
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const exportCalendar = () => {
    const windows = togetherWindows(remainingMatches(days, new Date(), settings));
    if (!windows.length) {
      setNotice('Nothing to export yet.');
      return;
    }
    const ics = buildTogetherIcs(windows, { partnerName: them.name, calendarName: 'Days together' });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'days-together.ics';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setNotice(`Exported ${windows.length} ${windows.length === 1 ? 'window' : 'windows'}.`);
  };

  return (
    <div className="page">
      {notice ? <p className="notice" role="status">{notice}</p> : null}

      <section className="panel">
        <h3 className="section-heading">What counts as together</h3>

        <label className="field">
          <span>Shortest day worth counting</span>
          <select
            onChange={(event) => updateSettings({ minimumMinutes: Number(event.target.value) })}
            value={settings.minimumMinutes ?? DEFAULT_SETTINGS.minimumMinutes}
          >
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={240}>4 hours</option>
            <option value={480}>8 hours</option>
          </select>
        </label>

        <label className="field">
          <span>The day runs from</span>
          <select
            onChange={(event) => updateSettings({ dayStartMinutes: Number(event.target.value) })}
            value={settings.dayStartMinutes ?? DEFAULT_SETTINGS.dayStartMinutes}
          >
            {[6, 7, 8, 9, 10].map((hour) => (
              <option key={hour} value={hour * 60}>{minutesToHHMM(hour * 60)}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>…until</span>
          <select
            onChange={(event) => updateSettings({ dayEndMinutes: Number(event.target.value) })}
            value={settings.dayEndMinutes ?? DEFAULT_SETTINGS.dayEndMinutes}
          >
            {[21, 22, 23, 24].map((hour) => (
              <option key={hour} value={hour * 60}>{hour === 24 ? 'midnight' : minutesToHHMM(hour * 60)}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Quiet hours before a report</span>
          <select
            onChange={(event) => updateSettings({ preDutyBufferMinutes: Number(event.target.value) })}
            value={settings.preDutyBufferMinutes ?? DEFAULT_SETTINGS.preDutyBufferMinutes}
          >
            {[0, 60, 90, 120, 180].map((value) => (
              <option key={value} value={value}>{value ? `${value / 60} h` : 'none'}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Getting home after release</span>
          <select
            onChange={(event) => updateSettings({ postDutyBufferMinutes: Number(event.target.value) })}
            value={settings.postDutyBufferMinutes ?? DEFAULT_SETTINGS.postDutyBufferMinutes}
          >
            {[0, 30, 60, 90, 120].map((value) => (
              <option key={value} value={value}>{value ? `${value} min` : 'none'}</option>
            ))}
          </select>
        </label>

        <label className="field field--switch">
          <span>Count days on standby</span>
          <input
            checked={settings.includeStandby ?? true}
            onChange={(event) => updateSettings({ includeStandby: event.target.checked })}
            type="checkbox"
          />
        </label>

        <label className="field field--switch">
          <span>Count a shared layover</span>
          <input
            checked={settings.allowLayoverMatches ?? true}
            onChange={(event) => updateSettings({ allowLayoverMatches: event.target.checked })}
            type="checkbox"
          />
        </label>
      </section>

      <section className="panel">
        <h3 className="section-heading">Individual buffers</h3>
        <p className="panel__hint">Override the shared settings for travel, preparation and recovery.</p>
        {([['you', you], ['them', them]] as const).map(([who, person]) => <div key={who}><h4>{person.name}</h4>
          {(['preDutyBufferMinutes', 'postDutyBufferMinutes'] as const).map(field => <label className="field" key={field}><span>{field === 'preDutyBufferMinutes' ? 'Before report' : 'After release / recovery'}</span><select aria-label={`${person.name} ${field}`} value={person[field] ?? ''} onChange={event => updatePerson(who, { [field]: event.target.value === '' ? undefined : Number(event.target.value) })}>
          <option value="">Use shared setting</option>{[0, 30, 60, 90, 120, 180, 360, 480, 600, 720].map(minutes => <option key={minutes} value={minutes}>{minutes / 60} h</option>)}</select></label>)}
        </div>)}
      </section>
      <section className="panel">
        <h3 className="section-heading">Calendar</h3>
        <p className="panel__hint">
          Writes every window ahead as all-day events you can open in any calendar app. The times are
          local to the station, with no time zone attached — the same way a roster prints them.
        </p>
        <button className="button" onClick={exportCalendar} type="button">Export days together</button>
      </section>

      <section className="panel">
        <h3 className="section-heading">Appearance</h3>
        <div className="segmented" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((option) => (
            <button
              aria-pressed={theme === option}
              className={`segmented__option${theme === option ? ' segmented__option--active' : ''}`}
              key={option}
              onClick={() => onThemeChange(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3 className="section-heading">Backup and recovery</h3>
        <p className="panel__hint">A backup contains both personal rosters. Keep it somewhere private.</p>
        <button className="button" disabled={demo} onClick={() => {
          const href = URL.createObjectURL(new Blob([backupText(state)], { type: 'application/json' }));
          const link = document.createElement('a'); link.href = href; link.download = 'match-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
        }}>Export backup</button>
        <button className="button button--ghost" disabled={demo} onClick={() => backupInput.current?.click()}>Restore backup</button>
        <input type="file" accept=".json,application/json" className="visually-hidden" ref={backupInput} onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
          try { if (file.size > 10_000_000) throw new Error('Backup is too large.'); setPendingBackup(readBackup(await file.text())); }
          catch (error) { setNotice(error instanceof Error ? error.message : 'Could not read backup.'); }
        }} />
        {pendingBackup ? <div className="import-preview"><p>Replace both rosters with the backup for {pendingBackup.you.name} and {pendingBackup.them.name}?</p><button className="button" onClick={() => { replaceState(pendingBackup); setPendingBackup(undefined); setNotice('Backup restored.'); }}>Restore</button><button className="button button--ghost" onClick={() => setPendingBackup(undefined)}>Cancel</button></div> : null}
        {canUndo ? <button className="button button--ghost" onClick={undo}>Undo last roster change</button> : null}
      </section>
      <section className="panel">
        <h3 className="section-heading">This device</h3>
        <p className="panel__hint">
          Both rosters live in this browser and nowhere else. There is no account and no server to
          send them to; clearing them here is the whole of deleting them.
        </p>
        <button
          className="button button--quiet"
          onClick={() => {
            reset();
            setNotice('Cleared both rosters.');
          }}
          type="button"
        >
          Clear both rosters
        </button>
      </section>
    </div>
  );
}
