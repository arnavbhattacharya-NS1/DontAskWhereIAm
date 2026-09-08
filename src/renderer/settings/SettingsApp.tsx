import React, { useEffect, useState } from 'react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 24 }}>
    <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#57606a', borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>{title}</h3>
    {children}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: '#1f2328' }}>{label}</label>
    {children}
  </div>
);

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid #e5e7eb',
  borderRadius: 6, boxSizing: 'border-box', background: '#fff', color: '#1f2328',
};

const btnBase: React.CSSProperties = {
  padding: '7px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer', marginBottom: 0,
};

type LeaveRange = { from: string; to: string; label: string };

export const SettingsApp: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);

  // ICS URL test state
  const [icsTestStatus, setIcsTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [icsTestError, setIcsTestError] = useState('');
  const [icsTestCount, setIcsTestCount] = useState(0);

  // Manual leave dates
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  const [newLabel, setNewLabel] = useState('Annual Leave');

  // Monday.com OAuth re-auth
  const [mondaySigningIn, setMondaySigningIn] = useState(false);
  const [mondaySignInResult, setMondaySignInResult] = useState<{ ok: boolean; name?: string; error?: string } | null>(null);

  useEffect(() => { window.api.getSettings().then(setSettings); }, []);

  const update = (key: string, value: unknown) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const leaveDates: LeaveRange[] = Array.isArray(settings.leaveDates)
    ? (settings.leaveDates as LeaveRange[])
    : [];

  const saveLeaves = async (dates: LeaveRange[]) => {
    update('leaveDates', dates);
    await window.api.saveLeaveDates(dates);
  };

  const addLeave = async () => {
    if (!newFrom || !newTo) return;
    const to = newTo < newFrom ? newFrom : newTo; // ensure from ≤ to
    const next = [...leaveDates, { from: newFrom, to, label: newLabel || 'Leave' }]
      .sort((a, b) => a.from.localeCompare(b.from));
    await saveLeaves(next);
    setNewFrom(''); setNewTo(''); setNewLabel('Annual Leave');
  };

  const removeLeave = async (idx: number) => {
    await saveLeaves(leaveDates.filter((_, i) => i !== idx));
  };

  const handleTestIcs = async () => {
    const url = String(settings.icsUrl ?? '').trim();
    if (!url) return;
    setIcsTestStatus('testing');
    setIcsTestError('');
    try {
      const result = await window.api.testIcsUrl(url);
      if (result.ok) {
        await window.api.saveIcsUrl(url);
        setIcsTestCount(result.eventCount);
        setIcsTestStatus('ok');
      } else {
        setIcsTestError(result.error ?? 'Unknown error');
        setIcsTestStatus('error');
      }
    } catch (e) {
      setIcsTestError(String(e));
      setIcsTestStatus('error');
    }
  };

  const handleMondaySignIn = async () => {
    setMondaySigningIn(true);
    setMondaySignInResult(null);
    try {
      const result = await window.api.mondayOAuthStart();
      setMondaySignInResult(result);
      if (result.ok) {
        const fresh = await window.api.getSettings();
        setSettings(fresh);
      }
    } catch (e) {
      setMondaySignInResult({ ok: false, error: String(e) });
    } finally {
      setMondaySigningIn(false);
    }
  };

  const handleSave = async () => {
    await window.api.saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const mondayConnected = Boolean(settings.mondayAccessToken);
  const icsConfigured = Boolean(settings.icsUrl) || Boolean(settings.icsFilePath);

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', fontSize: 14, color: '#1f2328', padding: '20px 24px', maxWidth: 580, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>⚙️ Settings</h2>

      <Section title="Outlook Calendar (ICS)">
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#57606a', lineHeight: 1.6 }}>
          Your calendar is read via a private ICS source — no sign-in or admin approval needed.
          {icsConfigured
            ? <span style={{ color: '#16a34a' }}> ✓ Calendar is configured.</span>
            : <span style={{ color: '#b45309' }}> ⚠ No calendar configured yet.</span>}
        </p>

        <Field label="Live ICS URL (preferred — always up to date)">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={String(settings.icsUrl ?? '')}
              onChange={(e) => { update('icsUrl', e.target.value); setIcsTestStatus('idle'); setIcsTestError(''); }}
              placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
            />
            <button
              onClick={handleTestIcs}
              disabled={icsTestStatus === 'testing' || !String(settings.icsUrl ?? '').trim()}
              style={{ ...btnBase, border: '1px solid #e5e7eb', background: '#f7f8fa', whiteSpace: 'nowrap' }}
            >
              {icsTestStatus === 'testing' ? 'Checking…' : 'Test URL'}
            </button>
          </div>
          {icsTestStatus === 'ok' && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#16a34a' }}>✓ Valid — {icsTestCount} events found</p>
          )}
          {icsTestStatus === 'error' && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#b91c1c' }}>❌ {icsTestError}</p>
          )}
        </Field>

        <Field label="Or: local .ics file (fallback — re-export from Outlook when you add leave)">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1, fontSize: 12, color: '#57606a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(settings.icsFilePath ?? '') || 'No file selected'}
            </span>
            <button
              onClick={async () => {
                const result = await window.api.openIcsFileDialog();
                if (!result) return;
                if (result.ok && result.filePath) {
                  await window.api.saveIcsFilePath(result.filePath);
                  update('icsFilePath', result.filePath);
                } else {
                  alert(result?.error ?? 'Invalid file');
                }
              }}
              style={{ ...btnBase, border: '1px solid #e5e7eb', background: '#f7f8fa', whiteSpace: 'nowrap' }}
            >
              📂 Choose file…
            </button>
          </div>
          {!!settings.icsFilePath && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#57606a' }}>
              ⚠ This is a snapshot — re-select the file after exporting from Outlook when you add new leave.
            </p>
          )}
        </Field>

        <Field label="Leave event keywords (comma-separated)">
          <input style={inputStyle}
            value={Array.isArray(settings.leaveKeywords) ? (settings.leaveKeywords as string[]).join(', ') : ''}
            onChange={(e) => update('leaveKeywords', e.target.value.split(',').map((k) => k.trim()))}
            placeholder="Leave, Annual Leave, PTO, Vacation, Holiday" />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#57606a' }}>
            Any all-day event whose title contains one of these words is treated as a leave day.
          </p>
        </Field>
      </Section>

      <Section title="Leave Dates (manual — always works without calendar access)">
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#57606a', lineHeight: 1.6 }}>
          Enter your leave periods here if you can't connect a calendar. The app will mark those days as <strong>Vacation</strong> automatically.
          {leaveDates.length > 0 && <span style={{ color: '#16a34a' }}> {leaveDates.length} period{leaveDates.length !== 1 ? 's' : ''} set.</span>}
        </p>

        {/* Existing ranges */}
        {leaveDates.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {leaveDates.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 5, marginBottom: 5, fontSize: 12 }}>
                <span style={{ flex: 1 }}>
                  <strong>{r.label}</strong> &nbsp; {r.from} → {r.to === r.from ? r.from : r.to}
                  {r.from !== r.to && <span style={{ color: '#57606a' }}> ({Math.ceil((new Date(r.to).getTime() - new Date(r.from).getTime()) / 86400000) + 1} days)</span>}
                </span>
                <button onClick={() => removeLeave(i)} style={{ padding: '2px 8px', fontSize: 11, border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 4, cursor: 'pointer', color: '#b91c1c' }}>Remove</button>
              </div>
            ))}
          </div>
        )}

        {/* Add new range */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#57606a', marginBottom: 2 }}>From</label>
            <input type="date" style={inputStyle} value={newFrom} onChange={(e) => setNewFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#57606a', marginBottom: 2 }}>To</label>
            <input type="date" style={inputStyle} value={newTo} min={newFrom} onChange={(e) => setNewTo(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#57606a', marginBottom: 2 }}>Label</label>
            <input style={inputStyle} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Annual Leave" />
          </div>
          <button
            onClick={addLeave}
            disabled={!newFrom || !newTo}
            style={{ padding: '6px 12px', fontSize: 12, border: 'none', background: '#3b82d4', color: '#fff', borderRadius: 6, cursor: 'pointer', height: 34 }}
          >
            + Add
          </button>
        </div>
      </Section>

      <Section title="Monday.com">
        <div style={{ marginBottom: 10 }}>
          {mondayConnected
            ? <span style={{ fontSize: 13, color: '#16a34a' }}>✓ Connected as <strong>{String(settings.employeeName || 'unknown')}</strong></span>
            : <span style={{ fontSize: 13, color: '#b45309' }}>⚠ Not connected — sign in below</span>}
        </div>
        <Field label="Monday.com Account">
          <button
            onClick={handleMondaySignIn}
            disabled={mondaySigningIn}
            style={{ ...btnBase, border: '1px solid #e5e7eb', background: '#f7f8fa', whiteSpace: 'nowrap' }}
          >
            {mondaySigningIn ? 'Opening sign-in window…' : mondayConnected ? '🔄 Re-authenticate' : '🔐 Sign in with Monday.com'}
          </button>
          {mondaySignInResult?.ok && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#16a34a' }}>✓ Signed in as <strong>{mondaySignInResult.name}</strong></p>
          )}
          {mondaySignInResult && !mondaySignInResult.ok && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b91c1c' }}>❌ {mondaySignInResult.error}</p>
          )}
        </Field>
        <Field label="Board name prefix">
          <input style={inputStyle} value={String(settings.boardNamePrefix ?? '')}
            onChange={(e) => update('boardNamePrefix', e.target.value)}
            placeholder="e.g. David Gill NMI" />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#57606a' }}>
            Month + year are appended automatically (e.g. "David Gill NMI Sept Attendance 2026")
          </p>
        </Field>
        <Field label="Your name on the board">
          <input style={inputStyle} value={String(settings.employeeName ?? '')}
            onChange={(e) => update('employeeName', e.target.value)}
            placeholder="e.g. Arnav Bhattacharya" />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#57606a' }}>
            Auto-filled after connecting Monday.com — edit if it doesn't match your board row exactly.
          </p>
        </Field>
      </Section>

      <Section title="Wi-Fi">
        <Field label="IBM Wi-Fi Primary SSID">
          <input style={inputStyle} value={String(settings.primarySSID ?? '')}
            onChange={(e) => update('primarySSID', e.target.value)} placeholder="IBM Wifi" />
        </Field>
        <Field label="IBM Wi-Fi Guest SSID">
          <input style={inputStyle} value={String(settings.guestSSID ?? '')}
            onChange={(e) => update('guestSSID', e.target.value)} placeholder="IBM Wifi Guest" />
        </Field>
        <Field label="Polling interval (minutes)">
          <input style={{ ...inputStyle, width: 80 }} type="number" min={1} max={60}
            value={Number(settings.pollingIntervalMinutes ?? 5)}
            onChange={(e) => update('pollingIntervalMinutes', Number(e.target.value))} />
        </Field>
      </Section>

      <Section title="General">
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={Boolean(settings.launchAtLogin ?? true)}
              onChange={(e) => update('launchAtLogin', e.target.checked)} />
            Launch at login
          </label>
        </div>
        <div>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={Boolean(settings.showNotifications ?? true)}
              onChange={(e) => update('showNotifications', e.target.checked)} />
            Show desktop notifications when status is updated
          </label>
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={handleSave}
          style={{ padding: '8px 20px', fontSize: 13, borderRadius: 6, border: 'none', background: '#3b82d4', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
        <button onClick={() => window.api.closeSettings()}
          style={{ padding: '8px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f7f8fa', cursor: 'pointer' }}>
          Close
        </button>
      </div>
    </div>
  );
};
