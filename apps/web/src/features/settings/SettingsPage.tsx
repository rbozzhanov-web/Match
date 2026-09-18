import { useState } from 'react';
import { buildTogetherIcs, minutesToHHMM } from '@match/core';

import { useMatch } from '../../app/matchState';
import { DEFAULT_SETTINGS } from '../../storage/people';

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
  const { settings, updateSettings, windows, them, reset } = useMatch();
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const exportCalendar = () => {
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
