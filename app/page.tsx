'use client';

import { useMemo, useState } from 'react';

type View = 'overview' | 'records' | 'trends' | 'permissions' | 'audit' | 'security';
type Modal = 'measure' | 'record' | 'grant' | 'detail' | null;

const navItems: Array<{ id: View; label: string; hint: string }> = [
  { id: 'overview', label: 'Dashboard', hint: 'OV' },
  { id: 'records', label: 'Health Records', hint: 'HR' },
  { id: 'trends', label: 'Health Trends', hint: 'TR' },
  { id: 'permissions', label: 'Permissions', hint: 'PM' },
  { id: 'audit', label: 'Access Log', hint: 'AL' },
  { id: 'security', label: 'Account Security', hint: 'AS' },
];

const records = [
  { type: 'Medical Report', icon: 'MR', title: 'Annual Health Examination', date: '2026-09-10', org: 'Riverside General Hospital', source: 'Hospital Sync', status: 'Archived', summary: 'Blood count, liver and kidney function, and ECG. Fasting glucose was slightly elevated; other key results were within the expected range.' },
  { type: 'Health Metric', icon: 'HM', title: 'Home Blood Pressure Log', date: '2026-09-09', org: 'Self-entered', source: 'Manual Entry', status: 'Updated', summary: 'Seven recent home readings. Systolic pressure ranged from 121–132 mmHg and diastolic pressure from 76–84 mmHg.' },
  { type: 'Medication', icon: 'RX', title: 'Atorvastatin 10 mg', date: '2026-08-21', org: 'Community Health Center', source: 'Clinician Entry', status: 'Active', summary: 'Take once each evening as directed. Contact a clinician if discomfort occurs.' },
  { type: 'Allergy', icon: 'AL', title: 'Penicillin Allergy', date: '2025-11-06', org: 'Patient Confirmed', source: 'Sensitive Record', status: 'Ongoing', summary: 'A rash occurred after previous penicillin use. Authorized clinicians can view but cannot edit this field.' },
  { type: 'Medical History', icon: 'MH', title: 'Hyperlipidemia Follow-up', date: '2025-07-14', org: 'Lakeside Community Hospital', source: 'Hospital Sync', status: 'Follow-up', summary: 'Diet management and regular lipid checks were recommended. The original hospital record cannot be overwritten.' },
];

const auditRows = [
  { person: 'Dr. William Carter', initials: 'WC', action: 'Viewed medical report', target: 'Annual Health Examination', time: 'Today · 14:32', place: 'Riverside General Hospital', result: 'Authorized', risk: false },
  { person: 'Robert Lee · Patient', initials: 'RL', action: 'Added health metric', target: 'Fasting glucose · 6.2 mmol/L', time: 'Today · 08:30', place: 'Seattle · Current device', result: 'Completed', risk: false },
  { person: 'Security Center', initials: 'SC', action: 'Blocked sign-in attempt', target: 'Five consecutive password errors', time: 'Yesterday · 23:16', place: 'Portland · Unknown device', result: 'Blocked', risk: true },
  { person: 'Emma Chen · Health Manager', initials: 'EC', action: 'Viewed medication record', target: 'Atorvastatin 10 mg', time: 'Sep 11 · 10:20', place: 'Lakeside Community Hospital', result: 'Authorized', risk: false },
  { person: 'Robert Lee · Patient', initials: 'RL', action: 'Revoked permission', target: 'Emma Chen · Health Manager', time: 'Sep 10 · 18:45', place: 'Seattle · Current device', result: 'Completed', risk: false },
];

const trendData = {
  pressure: { name: 'Blood Pressure', value: '126/78', unit: 'mmHg', state: 'Stable overall', className: 'pressure', detail: 'Your last seven systolic readings ranged from 121–132 mmHg, with no sustained increase.' },
  glucose: { name: 'Fasting Glucose', value: '6.2', unit: 'mmol/L', state: 'Monitor closely', className: 'glucose', detail: 'This reading is above your one-month average. Consider measuring again under similar conditions.' },
  heart: { name: 'Resting Heart Rate', value: '72', unit: 'bpm', state: 'Within personal range', className: 'heart', detail: 'Your last seven resting heart-rate readings changed only slightly; the latest was 72 bpm.' },
};

export default function Home() {
  const [activeView, setActiveView] = useState<View>('overview');
  const [modal, setModal] = useState<Modal>(null);
  const [query, setQuery] = useState('');
  const [recordFilter, setRecordFilter] = useState('All');
  const [selectedRecord, setSelectedRecord] = useState(records[0]);
  const [trend, setTrend] = useState<keyof typeof trendData>('pressure');
  const [auditFilter, setAuditFilter] = useState('All Activity');
  const [revoked, setRevoked] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [toast, setToast] = useState('');

  const filteredRecords = useMemo(() => records.filter((record) => {
    const matchType = recordFilter === 'All' || record.type === recordFilter;
    const needle = query.trim().toLowerCase();
    const matchText = !needle || `${record.title}${record.type}${record.org}${record.summary}`.toLowerCase().includes(needle);
    return matchType && matchText;
  }), [query, recordFilter]);

  const filteredAudit = auditRows.filter((row) => {
    if (auditFilter === 'All Activity') return true;
    if (auditFilter === 'Risk Events') return row.risk;
    if (auditFilter === 'View') return row.action.startsWith('Viewed');
    return row.action.startsWith('Added');
  });

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }

  function switchView(view: View) {
    setActiveView(view);
    setModal(null);
  }

  const pageTitle: Record<View, [string, string]> = {
    overview: ['Dashboard', 'A snapshot of your latest health data, reminders, and services'],
    records: ['Health Records', 'Manage medical history, medications, allergies, and reports in one place'],
    trends: ['Health Trends', 'Review long-term changes in blood pressure, glucose, and heart rate'],
    permissions: ['Permissions', 'Decide who can access specific health information and for how long'],
    audit: ['Access Log', 'Every view, update, export, and permission change is recorded'],
    security: ['Account Security', 'Manage sign-in verification, trusted devices, and security alerts'],
  };

  return (
    <main className={largeText ? 'app-shell large-text' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">+</span>
          <div><strong>Personal Health</strong><small>Health Service System</small></div>
        </div>
        <nav aria-label="Primary navigation">
          {navItems.map((item, index) => (
            <button className={activeView === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => switchView(item.id)}>
              <span className="nav-glyph">{item.hint}</span><span><b>{item.label}</b><small>0{index + 1}</small></span>
            </button>
          ))}
        </nav>
        <div className="privacy-note"><span><i /> Data protected</span><small>Health information is shared only with your authorization</small></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => switchView('overview')}>Personal Health</button>
          <label className="global-search"><span>⌕</span><input aria-label="Search health records" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') switchView('records'); }} placeholder="Search reports, history, or metrics; press Enter" /></label>
          <button className="a11y-button" onClick={() => setLargeText((value) => !value)} aria-pressed={largeText}>Aa <span>{largeText ? 'Standard text' : 'Larger text'}</span></button>
          <button className="user" onClick={() => switchView('security')}><span className="avatar">RL</span><span><strong>Robert Lee</strong><small>Personal Account</small></span></button>
        </header>

        <div className="content">
          {activeView !== 'overview' && <header className="page-heading"><div><p className="eyebrow">PERSONAL HEALTH SERVICE</p><h1>{pageTitle[activeView][0]}</h1><p>{pageTitle[activeView][1]}</p></div><span className="demo-label">DEMO DATA</span></header>}

          {activeView === 'overview' && <>
            <section className="welcome">
              <div><p className="eyebrow">SEPTEMBER 13, 2026 · SUNDAY</p><h1>Good evening, Robert</h1><p>Today's health summary is ready. One metric may need your attention.</p></div>
              <button className="primary" onClick={() => setModal('measure')}>＋ Record Health Data</button>
            </section>
            <section className="metrics" aria-label="Today's health metrics">
              {[
                ['Blood Pressure', '126/78', 'mmHg', 'Normal', 'green', 'pressure'],
                ['Fasting Glucose', '6.2', 'mmol/L', 'Review', 'orange', 'glucose'],
                ['Resting Heart Rate', '72', 'bpm', 'Normal', 'green', 'heart'],
              ].map(([label, value, unit, status, tone, trendKey]) => <button className="metric" key={label} onClick={() => { setTrend(trendKey as keyof typeof trendData); switchView('trends'); }}>
                <span className="metric-head"><span>{label}</span><b className={tone}>{status}</b></span><span className="metric-value"><strong>{value}</strong><small>{unit}</small></span><span className="metric-foot">Last updated · 08:30</span>
              </button>)}
              <article className="metric score"><span className="metric-head"><span>Today's Health Score</span><b>Good</b></span><span className="metric-value"><strong>86</strong><small>/ 100</small></span><span className="metric-foot">Up 2 points from yesterday</span></article>
            </section>
            <section className="dashboard-grid">
              <article className="panel trend-panel">
                <div className="panel-title"><div><p className="eyebrow">LAST SEVEN READINGS</p><h2>Blood Pressure Trend</h2></div><button className="text-button" onClick={() => switchView('trends')}>View All</button></div>
                <div className="legend"><span><i className="dot dark" />Systolic</span><span><i className="dot orange" />Diastolic</span><small>mmHg</small></div>
                <div className="chart" aria-label="Blood pressure trend chart"><div className="grid-lines"><span>140</span><span>120</span><span>100</span><span>80</span></div><div className="plot"><div className="area systolic" /><div className="area diastolic" /></div></div>
                <div className="dates"><span>09/01</span><span>09/03</span><span>09/05</span><span>09/07</span><span>09/09</span><span>09/11</span><span>Today</span></div>
              </article>
              <aside className="panel alert-panel">
                <div className="panel-title"><div><p className="eyebrow">HEALTH REMINDER</p><h2>Needs Your Attention</h2></div><span className="count">1</span></div>
                <div className="alert-card"><span className="alert-icon">!</span><div><strong>Fasting glucose is slightly elevated</strong><p>Today's 08:30 reading was 6.2 mmol/L. Consider measuring again under similar conditions.</p><button className="text-button" onClick={() => { setTrend('glucose'); switchView('trends'); }}>View Details</button></div></div>
                <div className="next-check"><span>Suggested next reading</span><strong>Tomorrow · 07:30</strong><small>Fasting glucose · Fast before measuring</small></div>
              </aside>
            </section>
            <section className="lower-grid">
              <article className="panel compact-list"><div className="panel-title"><div><p className="eyebrow">RECENT RECORDS</p><h2>New Health Information</h2></div><button className="text-button" onClick={() => switchView('records')}>Open Records</button></div>
                {records.slice(0, 3).map((record) => <button className="mini-row" key={record.title} onClick={() => { setSelectedRecord(record); setModal('detail'); }}><span className="record-icon">{record.icon}</span><span><strong>{record.title}</strong><small>{record.org} · {record.date}</small></span><b>›</b></button>)}
              </article>
              <article className="panel consent-summary"><p className="eyebrow">ACTIVE PERMISSION</p><h2>One clinician has temporary access</h2><div className="doctor-line"><span className="doctor-avatar">WC</span><span><strong>Dr. William Carter</strong><small>Reports and medications · Expires tomorrow at 18:00</small></span></div><button className="secondary" onClick={() => switchView('permissions')}>Manage Permissions</button></article>
            </section>
          </>}

          {activeView === 'records' && <section className="records-view">
            <div className="toolbar"><div className="filter-tabs">{['All', 'Medical Report', 'Health Metric', 'Medication', 'Allergy'].map((item) => <button key={item} className={recordFilter === item ? 'selected' : ''} onClick={() => setRecordFilter(item)}>{item}</button>)}</div><button className="primary" onClick={() => setModal('record')}>＋ Add Record</button></div>
            <div className="records-layout">
              <article className="panel records-list"><div className="list-heading"><span>{filteredRecords.length} records</span><small>Original hospital records are stored as read-only</small></div>{filteredRecords.map((record) => <button className="record-row" key={record.title} onClick={() => { setSelectedRecord(record); setModal('detail'); }}><span className="record-icon large">{record.icon}</span><span className="record-main"><span><b>{record.title}</b><em>{record.status}</em></span><small>{record.type} · {record.org}</small><p>{record.summary}</p></span><span className="record-date">{record.date}<b>›</b></span></button>)}{filteredRecords.length === 0 && <div className="empty-state"><strong>No matching records</strong><p>Try a shorter search term or choose a different record type.</p></div>}</article>
              <aside className="panel record-guide"><p className="eyebrow">RECORD RULES</p><h2>Clear Data Provenance</h2><dl><div><dt>Self-entered</dt><dd>Editable, with previous versions retained</dd></div><div><dt>Hospital sync</dt><dd>Original content is read-only; personal notes can be added</dd></div><div><dt>Sensitive fields</dt><dd>Clinicians receive read-only access within the authorized scope</dd></div></dl><button className="secondary" onClick={() => showToast('Demo mode: hospital synchronization started')}>Simulate Hospital Sync</button></aside>
            </div>
          </section>}

          {activeView === 'trends' && <section className="trends-view">
            <div className="metric-switch">{Object.entries(trendData).map(([key, item]) => <button key={key} className={trend === key ? 'selected' : ''} onClick={() => setTrend(key as keyof typeof trendData)}><span>{item.name}</span><strong>{item.value}</strong><small>{item.unit}</small></button>)}</div>
            <div className="trend-detail-grid"><article className="panel trend-large"><div className="panel-title"><div><p className="eyebrow">LAST 30 DAYS</p><h2>{trendData[trend].name} Trend</h2></div><select aria-label="Trend time range"><option>Last 30 Days</option><option>Last 3 Months</option><option>Last Year</option></select></div><div className="trend-summary"><strong>{trendData[trend].value}</strong><span>{trendData[trend].unit}<b>{trendData[trend].state}</b></span></div><div className={`dynamic-chart ${trendData[trend].className}`}><div className="chart-scale"><span>High</span><span>Mid</span><span>Low</span></div><div className="dynamic-plot"><i /></div></div><div className="month-labels"><span>08/15</span><span>08/20</span><span>08/25</span><span>08/30</span><span>09/05</span><span>09/10</span></div></article>
              <aside className="panel insight"><p className="eyebrow">DATA INSIGHT</p><h2>{trendData[trend].state}</h2><p>{trendData[trend].detail}</p><div className="advice"><strong>Everyday guidance</strong><p>{trend === 'glucose' ? 'Keep meals and measurement conditions consistent. Consult a qualified professional if unusual readings continue.' : trend === 'pressure' ? 'Continue measuring regularly and note factors such as exercise and sleep.' : 'Maintain a regular routine. Seek professional advice if you feel noticeably unwell.'}</p></div><small className="disclaimer">This rule-based information is for general guidance only and is not a diagnosis or treatment recommendation.</small></aside>
            </div>
            <article className="panel history-table"><div className="panel-title"><h2>Recent Measurements</h2><button className="text-button" onClick={() => setModal('measure')}>Add Measurement</button></div><div className="table-head"><span>Measured At</span><span>Result</span><span>Status</span><span>Source</span></div>{['Today · 08:30', 'Sep 11 · 07:42', 'Sep 09 · 08:05'].map((time, index) => <div className="table-row" key={time}><span>{time}</span><strong>{trend === 'pressure' ? ['126/78', '128/80', '124/76'][index] : trend === 'glucose' ? ['6.2', '5.7', '5.8'][index] : ['72', '70', '73'][index]} {trendData[trend].unit}</strong><span><i className={index === 0 && trend === 'glucose' ? 'status-dot warn' : 'status-dot'} />{index === 0 && trend === 'glucose' ? 'Review' : 'Normal'}</span><span>Personal device</span></div>)}</article>
          </section>}

          {activeView === 'permissions' && <section className="permission-view">
            <div className="consent-hero"><div><p className="eyebrow">MINIMUM NECESSARY ACCESS</p><h2>Your information, your decision</h2><p>Choose the clinician, record scope, and access period. Permission ends automatically at expiry, and you can revoke it at any time.</p></div><button className="primary light" onClick={() => setModal('grant')}>＋ Grant Permission</button></div>
            <div className="permission-stats"><div><strong>{revoked ? '0' : '1'}</strong><span>Active Permissions</span></div><div><strong>3</strong><span>Expired This Month</span></div><div><strong>12</strong><span>Authorized Views</span></div></div>
            <div className="permission-grid"><article className="panel grants"><div className="panel-title"><div><p className="eyebrow">ACTIVE PERMISSION</p><h2>Health Information Being Shared</h2></div></div>{revoked ? <div className="empty-state"><strong>No active permissions</strong><p>Any new access request requires your confirmation.</p></div> : <div className="grant-card"><div className="doctor-line"><span className="doctor-avatar">WC</span><span><strong>Dr. William Carter</strong><small>Riverside General Hospital · Verified</small></span><b className="verified">Active</b></div><div className="grant-scope"><span><small>Can view</small><b>Medical reports and medications</b></span><span><small>Valid until</small><b>Sep 14 · 18:00</b></span><span><small>Access method</small><b>Read-only · No export</b></span></div><div className="grant-actions"><button className="secondary" onClick={() => { switchView('audit'); showToast('Showing access activity for this permission'); }}>View Access Log</button><button className="danger" onClick={() => { setRevoked(true); showToast("Dr. Carter's permission has been revoked"); }}>Revoke</button></div></div>}</article>
              <aside className="panel flow-panel"><p className="eyebrow">PERMISSION FLOW</p><h2>Six Steps to Secure Sharing</h2>{['Clinician requests access', 'Patient selects the scope', 'System creates time-limited access', 'Clinician receives read-only access', 'Permission expires or is revoked', 'Every action is logged'].map((step, index) => <div className="flow-step" key={step}><span>{index + 1}</span><b>{step}</b></div>)}</aside></div>
          </section>}

          {activeView === 'audit' && <section className="audit-view">
            <div className="risk-banner"><span className="alert-icon">!</span><div><strong>One suspicious sign-in attempt was blocked</strong><p>Yesterday at 23:16, an unknown device in Portland entered an incorrect password five times. No health information was accessed.</p></div><button onClick={() => switchView('security')}>Review Account Security</button></div>
            <div className="toolbar audit-toolbar"><div className="filter-tabs">{['All Activity', 'View', 'Add', 'Risk Events'].map((item) => <button key={item} className={auditFilter === item ? 'selected' : ''} onClick={() => setAuditFilter(item)}>{item}</button>)}</div><button className="secondary" onClick={() => showToast('The access log was exported as a demo file')}>Export Log</button></div>
            <article className="panel audit-list"><div className="audit-head"><span>Actor</span><span>Action and Record</span><span>Time and Location</span><span>Result</span></div>{filteredAudit.map((row) => <div className={row.risk ? 'audit-row risky' : 'audit-row'} key={row.time}><span><i className="person-dot">{row.initials}</i><b>{row.person}</b></span><span><b>{row.action}</b><small>{row.target}</small></span><span><b>{row.time}</b><small>{row.place}</small></span><span><em>{row.result}</em></span></div>)}</article>
          </section>}

          {activeView === 'security' && <section className="security-view">
            <div className="security-score panel"><div className="score-ring">92</div><div><p className="eyebrow">ACCOUNT SECURITY SCORE</p><h2>Protection Looks Good</h2><p>Password and text-message verification are enabled. Keep sign-in alerts on and review trusted devices regularly.</p></div><button className="secondary" onClick={() => showToast('Security check complete. No new risks found')}>Run Security Check</button></div>
            <div className="security-grid"><article className="panel"><p className="eyebrow">SIGN-IN VERIFICATION</p><h2>Multiple Authentication Methods</h2>{[['Password', 'Configured', 'Last updated 30 days ago'], ['Text-message code', 'Enabled', 'Number: +1 *** *** 5612'], ['Device biometrics', 'Available', 'Uses on-device verification; no original biometric image is stored']].map(([name, state, desc], index) => <div className="setting-row" key={name}><span className="setting-icon">{index + 1}</span><span><b>{name}</b><small>{desc}</small></span><button className={state === 'Available' ? '' : 'on'} onClick={() => showToast(`${name} settings opened`)}>{state}</button></div>)}</article>
              <article className="panel"><p className="eyebrow">TRUSTED DEVICES</p><h2>Recent Sign-ins</h2><div className="device-row"><span className="device-icon">PC</span><span><b>Windows · Edge</b><small>Seattle · Current device · Today 19:42</small></span><em>Trusted</em></div><div className="device-row"><span className="device-icon">MB</span><span><b>iPhone · Mobile</b><small>Seattle · Sep 12 · 08:18</small></span><em>Trusted</em></div><button className="danger full" onClick={() => showToast('All other device sessions have been signed out')}>Sign Out Other Devices</button></article></div>
            <article className="panel security-events"><div className="panel-title"><div><p className="eyebrow">SECURITY EVENTS</p><h2>Recent Account Activity</h2></div><button className="text-button" onClick={() => switchView('audit')}>View Full Log</button></div><div className="event-row warning"><span>!</span><div><strong>Unknown-device sign-in blocked</strong><small>Yesterday · 23:16 · Portland · Five failed attempts</small></div><b>Resolved</b></div><div className="event-row"><span>✓</span><div><strong>Text-message verification succeeded</strong><small>Today · 19:42 · Seattle · Current device</small></div><b>Normal</b></div></article>
          </section>}
        </div>
      </section>

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-label="Action dialog" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" aria-label="Close" onClick={() => setModal(null)}>×</button>
        {modal === 'measure' && <><p className="eyebrow">NEW MEASUREMENT</p><h2>Record Health Data</h2><div className="form-grid"><label>Metric Type<select><option>Fasting Glucose</option><option>Blood Pressure</option><option>Resting Heart Rate</option></select></label><label>Result<input defaultValue="6.2" /></label><label>Unit<input defaultValue="mmol/L" readOnly /></label><label>Measured At<input type="datetime-local" defaultValue="2026-09-13T08:30" /></label></div><label className="full-field">Notes<textarea placeholder="Add meal, sleep, or measurement conditions" /></label><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" onClick={() => { setModal(null); showToast('Health data saved with a new version entry'); }}>Save Measurement</button></div></>}
        {modal === 'record' && <><p className="eyebrow">PERSONAL ENTRY</p><h2>Add a Health Record</h2><div className="form-grid"><label>Record Type<select><option>Medical Report</option><option>Medical History</option><option>Medication</option><option>Allergy</option></select></label><label>Record Date<input type="date" defaultValue="2026-09-13" /></label></div><label className="full-field">Title<input placeholder="Example: Annual community health examination" /></label><label className="full-field">Details<textarea placeholder="Enter key results or information to retain" /></label><label className="file-field"><input type="file" /><span>＋ Choose Report File</span><small>Files are not actually uploaded in this UI demo</small></label><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" onClick={() => { setModal(null); showToast('New health record saved'); }}>Save Record</button></div></>}
        {modal === 'grant' && <><p className="eyebrow">MINIMUM NECESSARY ACCESS</p><h2>Grant Temporary Permission</h2><div className="form-grid"><label>Clinician or Health Manager<select><option>Dr. William Carter · Riverside General Hospital</option><option>Emma Chen · Lakeside Community Hospital</option></select></label><label>Duration<select><option>24 Hours</option><option>3 Days</option><option>7 Days</option></select></label></div><fieldset><legend>Records This Person Can View</legend>{['Medical Reports', 'Medication Records', 'Allergies (read-only)', 'Health Metric Trends'].map((item, index) => <label className="check-row" key={item}><input type="checkbox" defaultChecked={index < 2} />{item}</label>)}</fieldset><label className="check-row consent-check"><input type="checkbox" defaultChecked />I have confirmed the recipient, scope, and expiry</label><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" onClick={() => { setRevoked(false); setModal(null); showToast('Temporary permission created. Every access will be logged'); }}>Confirm Permission</button></div></>}
        {modal === 'detail' && <><p className="eyebrow">{selectedRecord.type} · {selectedRecord.source}</p><h2>{selectedRecord.title}</h2><div className="detail-meta"><span><small>Record Date</small><b>{selectedRecord.date}</b></span><span><small>Data Source</small><b>{selectedRecord.org}</b></span><span><small>Status</small><b>{selectedRecord.status}</b></span></div><div className="detail-copy"><strong>Record Summary</strong><p>{selectedRecord.summary}</p></div><div className="version-note"><span>Version History</span><p>The system retains the source and modification time. Original hospital content cannot be overwritten.</p></div><div className="modal-actions"><button className="secondary" onClick={() => showToast('Version history opened')}>View Version History</button><button className="primary" onClick={() => setModal(null)}>Done</button></div></>}
      </section></div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
      <footer className="demo-footer">Course Project UI Demo · All records are fictional · Health guidance is not medical advice</footer>
    </main>
  );
}
