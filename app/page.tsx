'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AccessLogView } from './components/health/AccessLogView';
import { Dashboard } from './components/health/Dashboard';
import { HealthTrendsView } from './components/health/HealthTrendsView';
import { PermissionsView } from './components/health/PermissionsView';
import { RecordsView } from './components/health/RecordsView';
import { SecurityView } from './components/health/SecurityView';
import { MeasurementModal } from './components/health/modals/MeasurementModal';
import { ModalShell } from './components/health/modals/ModalShell';
import { PermissionModal } from './components/health/modals/PermissionModal';
import { RecordDetailModal } from './components/health/modals/RecordDetailModal';
import { RecordModal } from './components/health/modals/RecordModal';
import type {
  AuditFilter, AuditRow, AuthState, BloodPressureTrend, DashboardMetric, LoadState,
  MeasurementForm, Modal, PermissionForm, PermissionScope, RecordForm, TrendKey,
  TrendRow, TrendSummary, View,
} from './components/health/types';
import {
  actionLabels, formatDateTime, initials, latestMeasurement, localDateInput,
  localDateTimeInput, navItems, pageTitle, valuesForTrend,
} from './components/health/utils';
import {
  apiRequest, ClientApiError, type AuditEvent, type HealthRecord, type Measurement,
  type Permission, type PublicUser, type RecordType,
} from '@/lib/client/api';

const DEFAULT_ACCOUNT_EMAIL = 'demo@health.local';
const DEFAULT_ACCOUNT_PASSWORD = 'DemoHealth#2026';

function errorMessage(error: unknown): string {
  if (error instanceof ClientApiError) {
    const fieldMessage = error.fields ? Object.values(error.fields)[0] : null;
    return fieldMessage ? `${error.message} ${fieldMessage}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export default function Home() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [email, setEmail] = useState(DEFAULT_ACCOUNT_EMAIL);
  const [password, setPassword] = useState(DEFAULT_ACCOUNT_PASSWORD);
  const [dataState, setDataState] = useState<LoadState>('idle');
  const [dataError, setDataError] = useState('');
  const [recordsError, setRecordsError] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [activeView, setActiveView] = useState<View>('overview');
  const [modal, setModal] = useState<Modal>(null);
  const [query, setQuery] = useState('');
  const [recordFilter, setRecordFilter] = useState<RecordType | 'all'>('all');
  const [selectedRecord, setSelectedRecord] = useState<HealthRecord | null>(null);
  const [trend, setTrend] = useState<TrendKey>('systolic');
  const [dashboardPressureTrend, setDashboardPressureTrend] = useState<BloodPressureTrend>('systolic');
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('All Activity');
  const [largeText, setLargeText] = useState(false);
  const [toast, setToast] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [recordForm, setRecordForm] = useState<RecordForm>({ type: 'medical_report', date: '', title: '', description: '' });
  const [measurementForm, setMeasurementForm] = useState<MeasurementForm>({ kind: 'blood_glucose', result: '6.2', measuredAt: '', notes: '' });
  const [permissionForm, setPermissionForm] = useState<PermissionForm>({ recipient: 'carter', durationHours: 24, scopes: ['records:read', 'measurements:read'], confirmed: false });
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const busyRef = useRef('');

  const clearData = useCallback(() => {
    setRecords([]);
    setMeasurements([]);
    setPermissions([]);
    setAuditEvents([]);
    setDataState('idle');
  }, []);

  const handleRequestError = useCallback((error: unknown): string => {
    if (error instanceof ClientApiError && error.status === 401) {
      setAuthState('anonymous');
      setUser(null);
      setSessionExpiresAt(null);
      clearData();
      return 'Your session ended. Sign in again to continue.';
    }
    return errorMessage(error);
  }, [clearData]);

  const checkSession = useCallback(async () => {
    setAuthState('checking');
    setSessionError('');
    try {
      const result = await apiRequest<{ authenticated: boolean; user: PublicUser | null; expiresAt: string | null }>('/api/auth/session');
      if (result.authenticated && result.user) {
        setUser(result.user);
        setSessionExpiresAt(result.expiresAt);
        setAuthState('authenticated');
      } else {
        setUser(null);
        setSessionExpiresAt(null);
        setAuthState('anonymous');
      }
    } catch (error) {
      setSessionError(errorMessage(error));
      setAuthState('error');
    }
  }, []);

  const refreshAudit = useCallback(async () => {
    try {
      const result = await apiRequest<{ events: AuditEvent[] }>('/api/audit?limit=100');
      setAuditEvents(result.events);
    } catch (error) {
      setDataError(handleRequestError(error));
    }
  }, [handleRequestError]);

  const loadCoreData = useCallback(async () => {
    setDataState('loading');
    setDataError('');
    try {
      const [measurementResult, permissionResult, auditResult] = await Promise.all([
        apiRequest<{ measurements: Measurement[] }>('/api/measurements'),
        apiRequest<{ permissions: Permission[] }>('/api/permissions'),
        apiRequest<{ events: AuditEvent[] }>('/api/audit?limit=100'),
      ]);
      setMeasurements(measurementResult.measurements);
      setPermissions(permissionResult.permissions);
      setAuditEvents(auditResult.events);
      setDataState('ready');
    } catch (error) {
      setDataError(handleRequestError(error));
      setDataState('error');
    }
  }, [handleRequestError]);

  useEffect(() => { void checkSession(); }, [checkSession]);
  useEffect(() => { if (authState === 'authenticated') void loadCoreData(); }, [authState, loadCoreData]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => {
    if (authState === 'authenticated' && dataState === 'ready' && activeView === 'audit') void refreshAudit();
  }, [activeView, authState, dataState, refreshAudit]);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams();
      if (query.trim()) parameters.set('q', query.trim());
      if (recordFilter !== 'all') parameters.set('type', recordFilter);
      const suffix = parameters.size > 0 ? `?${parameters.toString()}` : '';
      setRecordsLoading(true);
      setRecordsError('');
      void apiRequest<{ records: HealthRecord[] }>(`/api/records${suffix}`, { signal: controller.signal })
        .then((result) => setRecords(result.records))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setRecordsError(handleRequestError(error));
        })
        .finally(() => { if (!controller.signal.aborted) setRecordsLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [authState, handleRequestError, query, recordFilter]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function handleMobileMenuKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMobileNavOpen(false);
      mobileMenuButtonRef.current?.focus();
    }
    document.addEventListener('keydown', handleMobileMenuKeyDown);
    return () => document.removeEventListener('keydown', handleMobileMenuKeyDown);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!modal || !modalRef.current) return;
    const dialog = modalRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const focusableSelector = ['button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])', 'textarea:not([disabled])', '[href]', '[tabindex]:not([tabindex="-1"])'].join(',');
    function getFocusableElements() {
      return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.getAttribute('aria-hidden') !== 'true');
    }
    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus = dialog.querySelector<HTMLElement>('[data-modal-initial-focus]') ?? getFocusableElements()[0] ?? dialog;
      initialFocus.focus();
    });
    function handleModalKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setModal(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const focusIsOutsideDialog = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === firstElement || focusIsOutsideDialog)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (document.activeElement === lastElement || focusIsOutsideDialog)) {
        event.preventDefault();
        firstElement.focus();
      }
    }
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleModalKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener('keydown', handleModalKeyDown);
      window.requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, [modal]);

  const trendData = useMemo(() => {
    const systolic = latestMeasurement(measurements, 'blood_pressure_systolic');
    const diastolic = latestMeasurement(measurements, 'blood_pressure_diastolic');
    const glucose = latestMeasurement(measurements, 'blood_glucose');
    const heart = latestMeasurement(measurements, 'heart_rate');
    const systolicNeedsReview = Boolean(systolic && systolic.value >= 130);
    const diastolicNeedsReview = Boolean(diastolic && diastolic.value >= 85);
    const glucoseNeedsReview = Boolean(glucose && glucose.value > 6.1);
    const heartNeedsReview = Boolean(heart && (heart.value < 60 || heart.value > 100));
    return {
      systolic: { name: 'Systolic Pressure', value: systolic ? String(systolic.value) : '—', unit: 'mmHg', state: systolicNeedsReview ? 'Review reading' : 'Within reference range', tone: systolicNeedsReview ? 'orange' : 'green', updatedAt: systolic?.measuredAt ?? null, detail: systolic ? `Latest systolic pressure is ${systolic.value} mmHg.` : 'No systolic pressure reading has been saved yet.' },
      diastolic: { name: 'Diastolic Pressure', value: diastolic ? String(diastolic.value) : '—', unit: 'mmHg', state: diastolicNeedsReview ? 'Review reading' : 'Within reference range', tone: diastolicNeedsReview ? 'orange' : 'green', updatedAt: diastolic?.measuredAt ?? null, detail: diastolic ? `Latest diastolic pressure is ${diastolic.value} mmHg.` : 'No diastolic pressure reading has been saved yet.' },
      glucose: { name: 'Fasting Glucose', value: glucose ? String(glucose.value) : '—', unit: glucose?.unit ?? 'mmol/L', state: glucoseNeedsReview ? 'Review reading' : 'Within reference range', tone: glucoseNeedsReview ? 'orange' : 'green', updatedAt: glucose?.measuredAt ?? null, detail: glucose ? `Latest saved reading is ${glucose.value} ${glucose.unit}.` : 'No glucose reading has been saved yet.' },
      heart: { name: 'Resting Heart Rate', value: heart ? String(heart.value) : '—', unit: heart?.unit ?? 'bpm', state: heartNeedsReview ? 'Review reading' : 'Within reference range', tone: heartNeedsReview ? 'orange' : 'green', updatedAt: heart?.measuredAt ?? null, detail: heart ? `Latest saved reading is ${heart.value} ${heart.unit}.` : 'No heart-rate reading has been saved yet.' },
    } satisfies Record<TrendKey, TrendSummary>;
  }, [measurements]);

  const hasBloodPressure = trendData.systolic.value !== '—' && trendData.diastolic.value !== '—';
  const bloodPressureNeedsReview = trendData.systolic.tone === 'orange' || trendData.diastolic.tone === 'orange';
  const dashboardTrendData: DashboardMetric[] = [
    {
      key: 'pressure', trend: dashboardPressureTrend, name: 'Blood Pressure',
      value: hasBloodPressure ? `${trendData.systolic.value}/${trendData.diastolic.value}` : '—', unit: 'mmHg',
      state: bloodPressureNeedsReview ? 'Review reading' : 'Within reference range', tone: bloodPressureNeedsReview ? 'orange' : 'green',
      updatedAt: trendData.systolic.updatedAt ?? trendData.diastolic.updatedAt,
      detail: hasBloodPressure ? `Latest saved reading is ${trendData.systolic.value}/${trendData.diastolic.value} mmHg.` : 'Add both systolic and diastolic readings to see a summary.',
    },
    { key: 'glucose', trend: 'glucose', ...trendData.glucose },
    { key: 'heart', trend: 'heart', ...trendData.heart },
  ];

  const activePermissions = permissions.filter((permission) => permission.status === 'active');
  const expiredPermissions = permissions.filter((permission) => permission.status === 'expired');
  const revokedPermissions = permissions.filter((permission) => permission.status === 'revoked');
  const failedAuditEvent = auditEvents.find((event) => event.outcome === 'failure');
  const selectedTrendMeasurements = valuesForTrend(measurements, trend);
  const selectedTrendRows: TrendRow[] = selectedTrendMeasurements.slice(0, 7).map((measurement) => {
    const review = trend === 'systolic' ? measurement.value >= 130 : trend === 'diastolic' ? measurement.value >= 85 : trend === 'glucose' ? measurement.value > 6.1 : measurement.value < 60 || measurement.value > 100;
    return { id: measurement.id, time: measurement.measuredAt, result: `${measurement.value} ${measurement.unit}`, source: measurement.source, review };
  });

  const auditRows: AuditRow[] = auditEvents.map((event) => {
    const linkedRecord = records.find((record) => record.id === event.resourceId);
    const linkedPermission = permissions.find((permission) => permission.id === event.resourceId);
    const actor = event.actorUserId === user?.id ? `${user.name} · Patient` : 'Security Center';
    const target = linkedRecord?.title ?? linkedPermission?.granteeName ?? (typeof event.metadata.metric === 'string' ? event.metadata.metric.replaceAll('_', ' ') : event.resourceType.replaceAll('_', ' '));
    const location = typeof event.metadata.ipAddress === 'string' && event.metadata.ipAddress !== 'unknown' ? `IP ${event.metadata.ipAddress}` : event.metadata.source === 'seed' ? 'System import' : 'Local application';
    return { id: event.id, person: actor, initials: initials(actor), action: event.outcome === 'failure' && event.action === 'auth.login' ? 'Failed sign-in attempt' : actionLabels[event.action] ?? event.action, target, time: formatDateTime(event.createdAt), place: location, result: event.outcome === 'success' ? 'Completed' : 'Failed', risk: event.outcome === 'failure', rawAction: event.action };
  });

  const filteredAudit = auditRows.filter((row) => {
    if (auditFilter === 'All Activity') return true;
    if (auditFilter === 'Failed') return row.risk;
    if (auditFilter === 'Views') return row.rawAction.endsWith('.list');
    return row.rawAction.endsWith('.create') || row.rawAction.endsWith('.revoke') || row.rawAction.endsWith('.expire');
  });

  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(''), 2600); }
  function switchView(view: View) { setActiveView(view); setModal(null); setMobileNavOpen(false); }
  function selectTrend(nextTrend: TrendKey) { setTrend(nextTrend); switchView('trends'); }
  function openRecord(record: HealthRecord) { setSelectedRecord(record); setActionError(''); setModal('detail'); }

  function openModal(nextModal: Exclude<Modal, 'detail' | null>) {
    setActionError('');
    if (nextModal === 'record') setRecordForm({ type: 'medical_report', date: localDateInput(), title: '', description: '' });
    if (nextModal === 'measure') setMeasurementForm({ kind: 'blood_glucose', result: '6.2', measuredAt: localDateTimeInput(), notes: '' });
    if (nextModal === 'grant') setPermissionForm({ recipient: 'carter', durationHours: 24, scopes: ['records:read', 'measurements:read'], confirmed: false });
    setModal(nextModal);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy('login'); setSessionError('');
    try {
      const result = await apiRequest<{ user: PublicUser; expiresAt: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setUser(result.user); setSessionExpiresAt(result.expiresAt); setAuthState('authenticated'); showToast('Signed in successfully');
    } catch (error) { setSessionError(errorMessage(error)); } finally { setBusy(''); }
  }

  async function handleLogout() {
    if (busy) return; setBusy('logout'); setSessionError('');
    try {
      await apiRequest<{ authenticated: false }>('/api/auth/logout', { method: 'POST' });
      setAuthState('anonymous'); setUser(null); setSessionExpiresAt(null); clearData();
    } catch (error) { showToast(`Sign out failed: ${errorMessage(error)}`); } finally { setBusy(''); }
  }

  async function handleRecordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy('record'); setActionError('');
    try {
      const occurredAt = new Date(`${recordForm.date}T12:00:00`).toISOString();
      const result = await apiRequest<{ record: HealthRecord }>('/api/records', { method: 'POST', body: JSON.stringify({ type: recordForm.type, title: recordForm.title, description: recordForm.description, occurredAt, source: 'self', organization: null }) });
      setQuery(''); setRecordFilter('all'); setRecords((current) => [result.record, ...current.filter((record) => record.id !== result.record.id)]); setModal(null); showToast('Health record saved to SQLite'); void refreshAudit();
    } catch (error) { setActionError(handleRequestError(error)); } finally { setBusy(''); }
  }

  async function handleMeasurementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy('measurement'); setActionError('');
    try {
      const measuredAt = new Date(measurementForm.measuredAt).toISOString();
      const common = { measuredAt, source: 'manual', notes: measurementForm.notes || null };
      if (measurementForm.kind === 'blood_pressure') {
        const match = measurementForm.result.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
        if (!match) throw new Error('Enter blood pressure as systolic/diastolic, for example 126/78.');
        const systolic = Number(match[1]); const diastolic = Number(match[2]);
        if (systolic < 40 || systolic > 300 || diastolic < 20 || diastolic > 200) throw new Error('Enter a plausible blood pressure between 40–300 / 20–200 mmHg.');
        if (systolic <= diastolic) throw new Error('Systolic pressure must be greater than diastolic pressure.');
        await apiRequest('/api/measurements/blood-pressure', { method: 'POST', body: JSON.stringify({ ...common, systolic, diastolic }) });
      } else {
        const value = Number(measurementForm.result);
        if (!Number.isFinite(value)) throw new Error('Enter a valid numeric result.');
        await apiRequest('/api/measurements', { method: 'POST', body: JSON.stringify({ ...common, metric: measurementForm.kind, value, unit: measurementForm.kind === 'blood_glucose' ? 'mmol/L' : 'bpm' }) });
      }
      const result = await apiRequest<{ measurements: Measurement[] }>('/api/measurements');
      setMeasurements(result.measurements); setModal(null); showToast('Measurement saved to SQLite'); void refreshAudit();
    } catch (error) { setActionError(handleRequestError(error)); } finally { setBusy(''); }
  }

  async function handlePermissionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (permissionForm.scopes.length === 0) { setActionError('Choose at least one type of information to share.'); return; }
    if (!permissionForm.confirmed) { setActionError('Confirm the recipient, scope, and expiry before continuing.'); return; }
    setBusy('permission'); setActionError('');
    const recipient = permissionForm.recipient === 'carter' ? { granteeName: 'Dr. William Carter', organization: 'Riverside General Hospital' } : { granteeName: 'Emma Chen', organization: 'Lakeside Community Hospital' };
    try {
      const result = await apiRequest<{ permission: Permission }>('/api/permissions', { method: 'POST', body: JSON.stringify({ ...recipient, granteeType: 'clinician', scopes: permissionForm.scopes, expiresAt: new Date(Date.now() + permissionForm.durationHours * 60 * 60 * 1_000).toISOString() }) });
      setPermissions((current) => [result.permission, ...current]); setModal(null); showToast('Temporary permission record created'); void refreshAudit();
    } catch (error) { setActionError(handleRequestError(error)); } finally { setBusy(''); }
  }

  async function revokePermission(permission: Permission) {
    if (busy || !window.confirm(`Revoke ${permission.granteeName}'s access now?`)) return;
    const busyKey = `revoke:${permission.id}`; setBusy(busyKey); setDataError('');
    try {
      const result = await apiRequest<{ permission: Permission }>('/api/permissions', { method: 'PATCH', body: JSON.stringify({ id: permission.id, action: 'revoke' }) });
      setPermissions((current) => current.map((item) => item.id === result.permission.id ? result.permission : item)); showToast(`${permission.granteeName}'s access was revoked`); void refreshAudit();
    } catch (error) { setDataError(handleRequestError(error)); } finally { setBusy(''); }
  }

  function togglePermissionScope(scope: PermissionScope) {
    setPermissionForm((current) => ({ ...current, scopes: current.scopes.includes(scope) ? current.scopes.filter((item) => item !== scope) : [...current.scopes, scope] }));
  }

  if (authState === 'checking') return <main className={largeText ? 'app-shell large-text' : 'app-shell'} style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24 }}><section className="panel" role="status" aria-live="polite" style={{ width: 'min(460px, 100%)' }}><p className="eyebrow">PERSONAL HEALTH SERVICE</p><h1>Checking your session…</h1><p>Your health information will load after your session is verified.</p></section></main>;
  if (authState === 'error') return <main className={largeText ? 'app-shell large-text' : 'app-shell'} style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24 }}><section className="panel" role="alert" style={{ width: 'min(520px, 100%)' }}><p className="eyebrow">SERVICE UNAVAILABLE</p><h1>We could not check your session</h1><p>{sessionError}</p><button className="primary" type="button" onClick={() => void checkSession()}>Try Again</button></section></main>;

  if (authState === 'anonymous') return (
    <main className={largeText ? 'app-shell large-text' : 'app-shell'} style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24 }}>
      <section className="panel" style={{ width: 'min(520px, 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}><div><p className="eyebrow">PERSONAL HEALTH RECORD MANAGEMENT</p><h1 style={{ marginBottom: 8 }}>Personal Health Service</h1><p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Sign in to securely review and manage your personal health records.</p></div><button className="a11y-button" type="button" onClick={() => setLargeText((value) => !value)} aria-pressed={largeText}>Aa <span>{largeText ? 'Standard text' : 'Larger text'}</span></button></div>
        <div style={{ margin: '20px 0', padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--green-soft)' }}><strong style={{ display: 'block', marginBottom: 8 }}>Sign-in account</strong><code style={{ display: 'block' }}>{DEFAULT_ACCOUNT_EMAIL}</code><code style={{ display: 'block', marginTop: 5 }}>{DEFAULT_ACCOUNT_PASSWORD}</code></div>
        {sessionError && <p role="alert" style={{ color: 'var(--red)' }}>{sessionError}</p>}
        <form onSubmit={handleLogin} aria-label="Account sign in"><label className="full-field">Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="full-field">Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary" type="submit" disabled={busy === 'login'} style={{ width: '100%', marginTop: 20 }}>{busy === 'login' ? 'Signing In…' : 'Sign In'}</button></form>
        <p className="disclaimer" style={{ marginTop: 16 }}>This service supports personal health record management. It does not provide medical diagnosis or treatment.</p>
      </section>
    </main>
  );

  return (
    <main className={largeText ? 'app-shell large-text' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">+</span><div><strong>Personal Health</strong><small>Health Service System</small></div></div>
        <nav aria-label="Primary navigation">{navItems.map((item, index) => <button className={activeView === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => switchView(item.id)} aria-label={item.label} aria-current={activeView === item.id ? 'page' : undefined}><span className="nav-glyph">{item.hint}</span><span><b>{item.label}</b><small>0{index + 1}</small></span></button>)}</nav>
        <div className="privacy-note"><span><i /> Protected health records</span><small>Signed sessions and every data action are verified by the server.</small></div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button ref={mobileMenuButtonRef} className="mobile-menu-button" type="button" aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileNavOpen} aria-controls="mobile-navigation" onClick={() => setMobileNavOpen((isOpen) => !isOpen)}><span aria-hidden="true">{mobileNavOpen ? '×' : '☰'}</span></button>
          <button className="mobile-brand" onClick={() => switchView('overview')}>Personal Health</button>
          <label className="global-search"><span aria-hidden="true">⌕</span><input aria-label="Search health records" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') switchView('records'); }} placeholder="Search saved records; press Enter" /></label>
          <button className="a11y-button" onClick={() => setLargeText((value) => !value)} aria-pressed={largeText}>Aa <span>{largeText ? 'Standard text' : 'Larger text'}</span></button>
          <button className="user" onClick={() => switchView('security')}><span className="avatar">{initials(user?.name ?? '')}</span><span><strong>{user?.name}</strong><small>Personal Account</small></span></button>
          <button className="secondary topbar-signout" type="button" disabled={busy === 'logout'} onClick={() => void handleLogout()}>{busy === 'logout' ? 'Signing Out…' : 'Sign Out'}</button>
          <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile primary navigation" hidden={!mobileNavOpen}>{navItems.map((item) => <button className={activeView === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => switchView(item.id)} aria-label={item.label} aria-current={activeView === item.id ? 'page' : undefined}><span className="nav-glyph">{item.hint}</span><span><b>{item.label}</b></span></button>)}</nav>
        </header>
        <div className="content">
          {dataState === 'loading' && <section className="panel" role="status" aria-live="polite"><h2>Loading your health data…</h2><p>The dashboard will appear after the local APIs respond.</p></section>}
          {dataState === 'error' && <section className="panel" role="alert"><h2>Health data could not be loaded</h2><p>{dataError}</p><button className="primary" type="button" onClick={() => void loadCoreData()}>Try Again</button></section>}
          {dataState === 'ready' && <>
            {activeView !== 'overview' && <header className="page-heading"><div><p className="eyebrow">PERSONAL HEALTH SERVICE</p><h1>{pageTitle[activeView][0]}</h1><p>{pageTitle[activeView][1]}</p></div><span className="status-label">PRIVATE HEALTH DATA</span></header>}
            {activeView === 'overview' && <Dashboard userName={user?.name ?? ''} metrics={dashboardTrendData} measurements={measurements} records={records} activePermissions={activePermissions} pressureTrend={dashboardPressureTrend} onPressureTrendChange={setDashboardPressureTrend} onSelectTrend={selectTrend} onOpenMeasurement={() => openModal('measure')} onOpenRecords={() => switchView('records')} onOpenPermissions={() => switchView('permissions')} onOpenRecord={openRecord} />}
            {activeView === 'records' && <RecordsView records={records} error={recordsError} loading={recordsLoading} filter={recordFilter} onFilterChange={setRecordFilter} onAddRecord={() => openModal('record')} onOpenRecord={openRecord} />}
            {activeView === 'trends' && <HealthTrendsView trend={trend} trendData={trendData} measurements={selectedTrendMeasurements} rows={selectedTrendRows} onTrendChange={setTrend} onAddMeasurement={() => openModal('measure')} />}
            {activeView === 'permissions' && <PermissionsView activePermissions={activePermissions} expiredCount={expiredPermissions.length} revokedCount={revokedPermissions.length} error={dataError} busy={busy} onAddPermission={() => openModal('grant')} onViewAudit={() => switchView('audit')} onRevoke={(permission) => void revokePermission(permission)} />}
            {activeView === 'audit' && <AccessLogView failedEvent={failedAuditEvent} filter={auditFilter} rows={filteredAudit} onFilterChange={setAuditFilter} onReviewSecurity={() => switchView('security')} />}
            {activeView === 'security' && <SecurityView email={user?.email} sessionExpiresAt={sessionExpiresAt} busy={busy} onRecheckSession={() => void checkSession()} onViewAudit={() => switchView('audit')} onLogout={() => void handleLogout()} />}
          </>}
        </div>
      </section>
      {modal && <ModalShell ref={modalRef} busy={Boolean(busy)} error={actionError} onClose={() => setModal(null)}>
        {modal === 'measure' && <MeasurementModal form={measurementForm} busy={busy === 'measurement'} onChange={(patch) => setMeasurementForm((current) => ({ ...current, ...patch }))} onSubmit={handleMeasurementSubmit} onCancel={() => setModal(null)} />}
        {modal === 'record' && <RecordModal form={recordForm} busy={busy === 'record'} onChange={(patch) => setRecordForm((current) => ({ ...current, ...patch }))} onSubmit={handleRecordSubmit} onCancel={() => setModal(null)} />}
        {modal === 'grant' && <PermissionModal form={permissionForm} busy={busy === 'permission'} onChange={(patch) => setPermissionForm((current) => ({ ...current, ...patch }))} onToggleScope={togglePermissionScope} onSubmit={handlePermissionSubmit} onCancel={() => setModal(null)} />}
        {modal === 'detail' && selectedRecord && <RecordDetailModal record={selectedRecord} onDone={() => setModal(null)} />}
      </ModalShell>}
      {toast && <div className="toast" role="status" aria-live="polite" aria-atomic="true">✓ {toast}</div>}
      <footer className="site-footer">Personal Health Service · Privacy-focused health record management · Not medical advice</footer>
    </main>
  );
}
