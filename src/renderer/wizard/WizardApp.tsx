import React, { useState } from 'react';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #e5e7eb',
  borderRadius: 6, boxSizing: 'border-box', background: '#fff', color: '#1f2328',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px', fontSize: 13, borderRadius: 6, border: 'none',
  background: '#3b82d4', color: '#fff', cursor: 'pointer', fontWeight: 600,
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 14px', fontSize: 13, borderRadius: 6,
  border: '1px solid #e5e7eb', background: '#f7f8fa', cursor: 'pointer',
};

const btnConnect: React.CSSProperties = {
  padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1px solid #e5e7eb',
  background: '#f7f8fa', cursor: 'pointer', marginBottom: 0,
};

export const WizardApp: React.FC = () => {
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 4;

  // Step 1 — Outlook ICS calendar
  const [calTab, setCalTab] = useState<'url' | 'file'>('url');
  // URL mode
  const [icsUrl, setIcsUrl] = useState('');
  const [icsStatus, setIcsStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [icsError, setIcsError] = useState('');
  const [icsEventCount, setIcsEventCount] = useState(0);
  // File mode
  const [icsFilePath, setIcsFilePath] = useState('');
  const [fileStatus, setFileStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [fileError, setFileError] = useState('');
  const [fileEventCount, setFileEventCount] = useState(0);

  const [leaveKeywords, setLeaveKeywords] = useState('Leave, Annual Leave, PTO, Vacation, Holiday');
  const [skipCalendar, setSkipCalendar] = useState(false);

  // Step 2 — Monday.com OAuth
  const [mondaySigningIn, setMondaySigningIn] = useState(false);
  const [mondaySignedIn, setMondaySignedIn] = useState(false);
  const [mondayError, setMondayError] = useState('');
  const [mondayUserName, setMondayUserName] = useState('');
  const [boardPrefix, setBoardPrefix] = useState('');
  const [employeeName, setEmployeeName] = useState('');

  // Step 3 — Wi-Fi
  const [primarySSID, setPrimarySSID] = useState('IBM Wifi');
  const [guestSSID, setGuestSSID] = useState('IBM Wifi Guest');

  const handleTestIcs = async () => {
    if (!icsUrl.trim()) return;
    setIcsStatus('testing');
    setIcsError('');
    try {
      const result = await window.api.testIcsUrl(icsUrl.trim());
      if (result.ok) {
        await window.api.saveIcsUrl(icsUrl.trim());
        setIcsEventCount(result.eventCount);
        setIcsStatus('ok');
      } else {
        setIcsError(result.error ?? 'Unknown error');
        setIcsStatus('error');
      }
    } catch (e) {
      setIcsError(String(e));
      setIcsStatus('error');
    }
  };

  const handlePickFile = async () => {
    setFileStatus('idle');
    setFileError('');
    try {
      const result = await window.api.openIcsFileDialog();
      if (!result) return; // user cancelled
      if (result.ok && result.filePath) {
        await window.api.saveIcsFilePath(result.filePath);
        setIcsFilePath(result.filePath);
        setFileEventCount(result.eventCount);
        setFileStatus('ok');
      } else {
        setFileError(result?.error ?? 'Unknown error');
        setFileStatus('error');
      }
    } catch (e) {
      setFileError(String(e));
      setFileStatus('error');
    }
  };

  const handleMondaySignIn = async () => {
    setMondaySigningIn(true);
    setMondayError('');
    try {
      const result = await window.api.mondayOAuthStart();
      if (result.ok) {
        setMondayUserName(result.name ?? '');
        if (result.name) setEmployeeName(result.name);
        setMondaySignedIn(true);
      } else {
        setMondayError(result.error ?? 'Sign-in failed');
      }
    } catch (e) {
      setMondayError(String(e));
    } finally {
      setMondaySigningIn(false);
    }
  };

  const handleFinish = async () => {
    await window.api.saveSettings({
      leaveKeywords: leaveKeywords.split(',').map((k) => k.trim()),
      boardNamePrefix: boardPrefix,
      employeeName,
      primarySSID,
      guestSSID,
      launchAtLogin: true,
      showNotifications: true,
    });
    await window.api.closeWizard();
  };

  const calendarReady = skipCalendar || icsStatus === 'ok' || fileStatus === 'ok';
  const progress = `Step ${step} of ${TOTAL_STEPS}`;

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', fontSize: 14, color: '#1f2328', padding: '24px 28px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>👋 Welcome to DontAskWhereIAm</h2>
        <p style={{ margin: 0, fontSize: 12, color: '#57606a' }}>{progress}</p>
        <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, marginTop: 8 }}>
          <div style={{ height: 4, background: '#3b82d4', borderRadius: 2, width: `${(step / TOTAL_STEPS) * 100}%`, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* ── Step 1: Outlook ICS calendar ── */}
      {step === 1 && (
        <div>
          <h3 style={{ marginTop: 0 }}>Step 1 — Connect your Outlook calendar</h3>
          <p style={{ color: '#57606a', fontSize: 13, marginBottom: 10 }}>
            No admin approval or sign-in needed. Choose how to connect your calendar:
          </p>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '1px solid #e5e7eb' }}>
            {(['url', 'file'] as const).map((tab) => (
              <button key={tab} onClick={() => setCalTab(tab)} style={{
                padding: '6px 14px', fontSize: 13, border: 'none', borderBottom: calTab === tab ? '2px solid #3b82d4' : '2px solid transparent',
                background: 'none', cursor: 'pointer', color: calTab === tab ? '#3b82d4' : '#57606a', fontWeight: calTab === tab ? 600 : 400,
              }}>
                {tab === 'url' ? '🔗 ICS Link (live)' : '📄 .ics File (export)'}
              </button>
            ))}
          </div>

          {/* ── URL tab ── */}
          {calTab === 'url' && (
            <div>
              <div style={{ background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: 6, padding: '9px 13px', marginBottom: 12, fontSize: 12, color: '#57606a', lineHeight: 1.7 }}>
                <strong style={{ color: '#1f2328' }}>Get your ICS link from Outlook desktop:</strong>
                <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  <li>Open the <strong>Outlook desktop app</strong> (not the browser)</li>
                  <li>In the left sidebar, <strong>right-click your calendar</strong> (under <em>My Calendars</em>)</li>
                  <li>Click <strong>Share</strong> → <strong>Copy link to this calendar</strong></li>
                  <li>Paste the link below</li>
                </ol>
                <p style={{ margin: '6px 0 0' }}>Or try the NS1 Leave Calendar you can see in your sidebar — right-click it and look for a URL or subscription link.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={icsUrl}
                  onChange={(e) => { setIcsUrl(e.target.value); setIcsStatus('idle'); setIcsError(''); }}
                  placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
                />
                <button onClick={handleTestIcs} disabled={icsStatus === 'testing' || !icsUrl.trim()} style={btnConnect}>
                  {icsStatus === 'testing' ? 'Checking…' : 'Test & Save'}
                </button>
              </div>
              {icsStatus === 'ok' && <p style={{ fontSize: 13, color: '#16a34a', margin: '0 0 8px' }}>✓ Connected — {icsEventCount} events found</p>}
              {icsStatus === 'error' && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '7px 11px', marginBottom: 8, fontSize: 12, color: '#b91c1c' }}>❌ {icsError}</div>}
            </div>
          )}

          {/* ── File tab ── */}
          {calTab === 'file' && (
            <div>
              <div style={{ background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: 6, padding: '9px 13px', marginBottom: 12, fontSize: 12, color: '#57606a', lineHeight: 1.7 }}>
                <strong style={{ color: '#1f2328' }}>Export an .ics file from Outlook desktop:</strong>
                <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  <li>Open the <strong>Outlook desktop app</strong></li>
                  <li>Right-click your calendar (or <em>NS1 Leave Calendar</em>) in the sidebar</li>
                  <li>Click <strong>Export…</strong> (or <strong>Save as…</strong>) → save as <strong>.ics</strong></li>
                  <li>Click the button below to select that file</li>
                </ol>
                <p style={{ margin: '6px 0 0', color: '#b45309' }}>⚠ The file is a snapshot — re-export and re-select it whenever you add new leave.</p>
              </div>
              <button onClick={handlePickFile} style={{ ...btnConnect, marginBottom: 8 }}>
                📂 Choose .ics file…
              </button>
              {icsFilePath && <p style={{ fontSize: 11, color: '#57606a', margin: '0 0 6px', wordBreak: 'break-all' }}>{icsFilePath}</p>}
              {fileStatus === 'ok' && <p style={{ fontSize: 13, color: '#16a34a', margin: '0 0 8px' }}>✓ File loaded — {fileEventCount} events found</p>}
              {fileStatus === 'error' && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '7px 11px', marginBottom: 8, fontSize: 12, color: '#b91c1c' }}>❌ {fileError}</div>}
            </div>
          )}

          {/* Keywords — shown once either mode is connected */}
          {calendarReady && !skipCalendar && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Leave event keywords (comma-separated)</label>
              <input style={inputStyle} value={leaveKeywords} onChange={(e) => setLeaveKeywords(e.target.value)} />
              <p style={{ fontSize: 11, color: '#57606a', marginTop: 4 }}>
                Any all-day event whose title contains one of these words is treated as a leave day.
              </p>
            </div>
          )}

          {/* Skip option */}
          {!calendarReady && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#57606a', marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={skipCalendar} onChange={(e) => setSkipCalendar(e.target.checked)} />
              Skip for now — I don't need leave detection (Vacation will never be set automatically)
            </label>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(2)} disabled={!calendarReady} style={btnPrimary}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Monday.com OAuth ── */}
      {step === 2 && (
        <div>
          <h3 style={{ marginTop: 0 }}>Step 2 — Connect Monday.com</h3>
          <p style={{ color: '#57606a', fontSize: 13, marginBottom: 14 }}>
            Sign in with Monday.com to authorise this app. A browser window will open — sign in and you'll be redirected back automatically.
          </p>

          {!mondaySignedIn ? (
            <button
              onClick={handleMondaySignIn}
              disabled={mondaySigningIn}
              style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {mondaySigningIn ? 'Opening sign-in window…' : '🔐 Sign in with Monday.com'}
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#16a34a' }}>✓ Connected as <strong>{mondayUserName}</strong></span>
              <button onClick={() => { setMondaySignedIn(false); setMondayError(''); }} style={btnSecondary}>
                Sign in as someone else
              </button>
            </div>
          )}

          {mondayError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '7px 11px', margin: '10px 0', fontSize: 12, color: '#b91c1c' }}>
              ❌ {mondayError}
            </div>
          )}

          {mondaySignedIn && (
            <>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4, marginTop: 14 }}>Board name prefix</label>
              <input style={inputStyle} value={boardPrefix} onChange={(e) => setBoardPrefix(e.target.value)}
                placeholder="e.g. David Gill NMI" />
              <p style={{ fontSize: 11, color: '#57606a', marginTop: 4, marginBottom: 12 }}>
                Month + year are appended automatically (e.g. "David Gill NMI Sept Attendance 2026")
              </p>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Your name on the board</label>
              <input style={inputStyle} value={employeeName} onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="e.g. Arnav Bhattacharya" />
              <p style={{ fontSize: 11, color: '#57606a', marginTop: 4 }}>
                Auto-filled from your Monday.com account — edit if it doesn't match your board row exactly.
              </p>
            </>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)} style={btnSecondary}>← Back</button>
            <button onClick={() => setStep(3)} disabled={!mondaySignedIn || !boardPrefix || !employeeName} style={btnPrimary}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Wi-Fi ── */}
      {step === 3 && (
        <div>
          <h3 style={{ marginTop: 0 }}>Step 3 — Wi-Fi settings (optional)</h3>
          <p style={{ color: '#57606a', fontSize: 13 }}>
            Confirm the IBM Wi-Fi network names. Leave as-is if they look correct.
          </p>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Primary SSID</label>
          <input style={{ ...inputStyle, marginBottom: 12 }} value={primarySSID} onChange={(e) => setPrimarySSID(e.target.value)} />
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Guest SSID</label>
          <input style={inputStyle} value={guestSSID} onChange={(e) => setGuestSSID(e.target.value)} />
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(2)} style={btnSecondary}>← Back</button>
            <button onClick={() => setStep(4)} style={btnPrimary}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Step 4: Done ── */}
      {step === 4 && (
        <div>
          <h3 style={{ marginTop: 0 }}>✅ All set!</h3>
          <p style={{ color: '#57606a', fontSize: 13 }}>
            DontAskWhereIAm will now run silently in the background and keep your Monday.com board up to date — automatically.
          </p>
          <ul style={{ fontSize: 13, color: '#57606a', paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Wi-Fi checked every 5 minutes</li>
            <li>IBM Wi-Fi detected → <strong>Office</strong></li>
            {!skipCalendar && <li>Leave event in calendar → <strong>Vacation</strong></li>}
            <li>Irish bank holiday → <strong>Bank Holiday</strong></li>
            <li>Otherwise → <strong>WFH</strong></li>
          </ul>
          <p style={{ fontSize: 12, color: '#57606a' }}>
            You can change any of this later via Settings (right-click the tray icon).
          </p>
          <button onClick={handleFinish} style={{ ...btnPrimary, marginTop: 8 }}>
            🚀 Start the app
          </button>
        </div>
      )}
    </div>
  );
};
