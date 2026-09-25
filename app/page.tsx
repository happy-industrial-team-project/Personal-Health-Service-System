'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  apiRequest,
  ClientApiError,
  type AuditEvent,
  type HealthRecord,
  type Measurement,
  type MeasurementMetric,
  type Permission,
  type PublicUser,
  type RecordType,
} from '@/lib/client/api';

type View = 'overview' | 'records' | 'trends' | 'permissions' | 'audit' | 'security';
type Modal = 'measure' | 'record' | 'grant' | 'detail' | null;
type AuthState = 'checking' | 'anonymous' | 'authenticated' | 'error';
type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type TrendKey = 'systolic' | 'diastolic' | 'glucose' | 'heart';
type PermissionScope = 'records:read' | 'measurements:read';

const DEMO_EMAIL = 'demo@health.local';
const DEMO_PASSWORD = 'DemoHealth#2026';

const navItems: Array<{ id: View; label: string; hint: string }> = [
  { id: 'overview', label: 'Dashboard', hint: 'OV' },
  { id: 'records', label: 'Health Records', hint: 'HR' },
  { id: 'trends', label: 'Health Trends', hint: 'TR' },
  { id: 'permissions', label: 'Permissions', hint: 'PM' },
  { id: 'audit', label: 'Access Log', hint: 'AL' },
  { id: 'security', label: 'Account Security', hint: 'AS' },
];

const recordTypeLabels: Record<RecordType, string> = {
  medical_report: 'Medical Report',
  health_metric: 'Health Metric',
  medication: 'Medication',
  allergy: 'Allergy',
  medical_history: 'Medical History',
  other: 'Other',
};

const recordTypeIcons: Record<RecordType, string> = {
  medical_report: 'MR',
  health_metric: 'HM',
  medication: 'RX',
  allergy: 'AL',
  medical_history: 'MH',
  other: 'OT',
};

const recordSourceLabels: Record<HealthRecord['source'], string> = {
  self: 'Self-entered',
  hospital: 'Hospital source',
  clinician: 'Clinician entry',
  device: 'Connected device',
  other: 'Other source',
};

const pageTitle: Record<View, [string, string]> = {
  overview: ['Dashboard', 'A snapshot of your latest health data, reminders, and services'],
  records: ['Health Records', 'Manage medical history, medications, allergies, and reports in one place'],
  trends: ['Health Trends', 'Review saved blood pressure, glucose, and heart-rate measurements'],
  permissions: ['Permissions', 'Record who may receive specific health information and for how long'],
  audit: ['Access Log', 'Views, updates, sign-ins, and permission changes recorded by the local server'],
  security: ['Account Security', 'Review the protections that are implemented in this P0 course demo'],
};

const actionLabels: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'record.list': 'Viewed health records',
  'record.create': 'Added a health record',
  'measurement.list': 'Viewed measurements',
  'measurement.create': 'Added a measurement',
  'permission.list': 'Viewed permissions',
  'permission.create': 'Granted permission',
  'permission.expire': 'Permission expired automatically',
  'permission.revoke': 'Revoked permission',
  'audit.list': 'Viewed the access log',
};

function errorMessage(error: unknown): string {
  if (error instanceof ClientApiError) {
    const fieldMessage = error.fields ? Object.values(error.fields)[0] : null;
    return fieldMessage ? `${error.message} ${fieldMessage}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function localDateTimeInput(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function localDateInput(): string {
  return localDateTimeInput().slice(0, 10);
}

function initials(name: string): string {
  const letters = name.match(/[A-Za-z]+/g)?.slice(0, 2).map((part) => part[0]) ?? [];
  return letters.join('').toUpperCase() || 'PH';
}

function latestMeasurement(measurements: Measurement[], metric: MeasurementMetric): Measurement | undefined {
  return measurements.find((measurement) => measurement.metric === metric);
}

function valuesForTrend(measurements: Measurement[], trend: TrendKey): Measurement[] {
  const metric: MeasurementMetric = trend === 'systolic'
    ? 'blood_pressure_systolic'
    : trend === 'diastolic'
      ? 'blood_pressure_diastolic'
      : trend === 'glucose'
        ? 'blood_glucose'
        : 'heart_rate';
  return measurements.filter((measurement) => measurement.metric === metric);
}

type ChartScale = {
  minimum: number;
  maximum: number;
  step: number;
};

const chartScales: Record<TrendKey, ChartScale> = {
  systolic: { minimum: 110, maximum: 140, step: 10 },
  diastolic: { minimum: 60, maximum: 100, step: 10 },
  glucose: { minimum: 4.5, maximum: 7, step: 0.5 },
  heart: { minimum: 55, maximum: 90, step: 5 },
};

function chartNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function MeasurementLineChart({
  measurements,
  trend,
  label,
  compact = false,
}: {
  measurements: Measurement[];
  trend: TrendKey;
  label: string;
  compact?: boolean;
}) {
  const data = measurements.slice(0, 7).reverse();
  const preferredScale = chartScales[trend];
  const values = data.map((measurement) => measurement.value);
  const minimumValue = values.length > 0 ? Math.min(...values) : preferredScale.minimum;
  const maximumValue = values.length > 0 ? Math.max(...values) : preferredScale.maximum;
  const rawMinimum = Math.min(preferredScale.minimum, minimumValue);
  const rawMaximum = Math.max(preferredScale.maximum, maximumValue);
  const step = preferredScale.step * Math.max(1, Math.ceil((rawMaximum - rawMinimum) / (preferredScale.step * 6)));
  const minimum = Math.floor(rawMinimum / step) * step;
  const maximum = Math.ceil(rawMaximum / step) * step;
  const ticks: number[] = [];
  for (let value = maximum; value >= minimum; value -= step) ticks.push(value);

  const width = 680;
  const height = compact ? 210 : 260;
  const left = 52;
  const right = 18;
  const top = 16;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const valueRange = Math.max(maximum - minimum, preferredScale.step);
  const points = data.map((measurement, index) => ({
    measurement,
    x: data.length === 1 ? left + plotWidth / 2 : left + (index / (data.length - 1)) * plotWidth,
    y: top + ((maximum - measurement.value) / valueRange) * plotHeight,
  }));
  const stroke = trend === 'diastolic' || trend === 'glucose' ? 'var(--orange)' : 'var(--green-2)';

  return (
    <div className={compact ? 'line-chart compact' : 'line-chart'}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {ticks.map((tick) => {
          const y = top + ((maximum - tick) / valueRange) * plotHeight;
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="chart-y-label" x={left - 10} y={y + 4} textAnchor="end">{chartNumber(tick)}</text>
            </g>
          );
        })}
        {points.length > 0 && <polyline className="chart-line" points={points.map((point) => `${point.x},${point.y}`).join(' ')} style={{ stroke }} />}
        {points.map(({ measurement, x, y }) => (
          <g key={measurement.id}>
            <circle className="chart-point" cx={x} cy={y} r={compact ? 4 : 5} style={{ stroke }}>
              <title>{`${formatDate(measurement.measuredAt)}: ${measurement.value} ${measurement.unit}`}</title>
            </circle>
            <text className="chart-x-label" x={x} y={height - 12} textAnchor="middle">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(measurement.measuredAt))}</text>
          </g>
        ))}
        {points.length === 0 && <text className="chart-empty-label" x={left + plotWidth / 2} y={top + plotHeight / 2} textAnchor="middle">No saved readings</text>}
      </svg>
    </div>
  );
}

function recordStatus(record: HealthRecord): string {
  if (record.source === 'hospital') return 'Source retained';
  return 'Saved';
}

function scopeLabel(scopes: Permission['scopes']): string {
  return scopes.map((scope) => scope === 'records:read' ? 'Health records' : 'Measurements').join(' and ');
}

export default function Home() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
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
  const [dashboardPressureTrend, setDashboardPressureTrend] = useState<'systolic' | 'diastolic'>('systolic');
  const [auditFilter, setAuditFilter] = useState<'All Activity' | 'Views' | 'Changes' | 'Failed'>('All Activity');
  const [largeText, setLargeText] = useState(false);
  const [toast, setToast] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [recordForm, setRecordForm] = useState({ type: 'medical_report' as RecordType, date: '', title: '', description: '' });
  const [measurementForm, setMeasurementForm] = useState({ kind: 'blood_glucose' as 'blood_glucose' | 'blood_pressure' | 'heart_rate', result: '6.2', measuredAt: '', notes: '' });
  const [permissionForm, setPermissionForm] = useState({ recipient: 'carter' as 'carter' | 'chen', durationHours: 24, scopes: ['records:read', 'measurements:read'] as PermissionScope[], confirmed: false });
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
    if (authState === 'authenticated' && dataState === 'ready' && activeView === 'audit') {
      void refreshAudit();
    }
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
        event.preventDefault(); event.stopPropagation(); setModal(null); return;
      }
      if (event.key !== 'Tab') return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const focusIsOutsideDialog = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === firstElement || focusIsOutsideDialog)) { event.preventDefault(); lastElement.focus(); }
      else if (!event.shiftKey && (document.activeElement === lastElement || focusIsOutsideDialog)) { event.preventDefault(); firstElement.focus(); }
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
      systolic: { name: 'Systolic Pressure', value: systolic ? String(systolic.value) : '—', unit: 'mmHg', state: systolicNeedsReview ? 'Review reading' : 'Within demo range', tone: systolicNeedsReview ? 'orange' : 'green', updatedAt: systolic?.measuredAt ?? null, detail: systolic ? `Latest systolic pressure is ${systolic.value} mmHg.` : 'No systolic pressure reading has been saved yet.' },
      diastolic: { name: 'Diastolic Pressure', value: diastolic ? String(diastolic.value) : '—', unit: 'mmHg', state: diastolicNeedsReview ? 'Review reading' : 'Within demo range', tone: diastolicNeedsReview ? 'orange' : 'green', updatedAt: diastolic?.measuredAt ?? null, detail: diastolic ? `Latest diastolic pressure is ${diastolic.value} mmHg.` : 'No diastolic pressure reading has been saved yet.' },
      glucose: { name: 'Fasting Glucose', value: glucose ? String(glucose.value) : '—', unit: glucose?.unit ?? 'mmol/L', state: glucoseNeedsReview ? 'Review reading' : 'Within demo range', tone: glucoseNeedsReview ? 'orange' : 'green', updatedAt: glucose?.measuredAt ?? null, detail: glucose ? `Latest saved reading is ${glucose.value} ${glucose.unit}.` : 'No glucose reading has been saved yet.' },
      heart: { name: 'Resting Heart Rate', value: heart ? String(heart.value) : '—', unit: heart?.unit ?? 'bpm', state: heartNeedsReview ? 'Review reading' : 'Within demo range', tone: heartNeedsReview ? 'orange' : 'green', updatedAt: heart?.measuredAt ?? null, detail: heart ? `Latest saved reading is ${heart.value} ${heart.unit}.` : 'No heart-rate reading has been saved yet.' },
    } satisfies Record<TrendKey, { name: string; value: string; unit: string; state: string; tone: string; updatedAt: string | null; detail: string }>;
  }, [measurements]);

  const activePermissions = permissions.filter((permission) => permission.status === 'active');
  const expiredPermissions = permissions.filter((permission) => permission.status === 'expired');
  const revokedPermissions = permissions.filter((permission) => permission.status === 'revoked');
  const failedAuditEvent = auditEvents.find((event) => event.outcome === 'failure');
  const selectedTrendMeasurements = valuesForTrend(measurements, trend);
  const selectedTrendRows = selectedTrendMeasurements.slice(0, 7).map((measurement) => {
    const review = trend === 'systolic'
      ? measurement.value >= 130
      : trend === 'diastolic'
        ? measurement.value >= 85
        : trend === 'glucose'
          ? measurement.value > 6.1
          : measurement.value < 60 || measurement.value > 100;
    return { id: measurement.id, time: measurement.measuredAt, result: `${measurement.value} ${measurement.unit}`, source: measurement.source, review };
  });

  const auditRows = auditEvents.map((event) => {
    const linkedRecord = records.find((record) => record.id === event.resourceId);
    const linkedPermission = permissions.find((permission) => permission.id === event.resourceId);
    const actor = event.actorUserId === user?.id ? `${user.name} · Patient` : 'Security Center';
    const target = linkedRecord?.title ?? linkedPermission?.granteeName ?? (typeof event.metadata.metric === 'string' ? event.metadata.metric.replaceAll('_', ' ') : event.resourceType.replaceAll('_', ' '));
    const location = typeof event.metadata.ipAddress === 'string' && event.metadata.ipAddress !== 'unknown' ? `IP ${event.metadata.ipAddress}` : event.metadata.source === 'seed' ? 'Course seed data' : 'Local application';
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
      setUser(result.user); setSessionExpiresAt(result.expiresAt); setAuthState('authenticated'); showToast('Signed in to the local course demo');
    } catch (error) { setSessionError(errorMessage(error)); } finally { setBusy(''); }
  }

  async function handleLogout() {
    if (busy) return; setBusy('logout'); setSessionError('');
    try {
      await apiRequest<{ authenticated: false }>('/api/auth/logout', { method: 'POST' });
      setAuthState('anonymous'); setUser(null); setSessionExpiresAt(null); clearData();
    } catch (error) {
      showToast(`Sign out failed: ${errorMessage(error)}`);
    } finally { setBusy(''); }
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
        const systolic = Number(match[1]);
        const diastolic = Number(match[2]);
        if (systolic < 40 || systolic > 300 || diastolic < 20 || diastolic > 200) {
          throw new Error('Enter a plausible blood pressure between 40–300 / 20–200 mmHg.');
        }
        if (systolic <= diastolic) throw new Error('Systolic pressure must be greater than diastolic pressure.');
        await apiRequest('/api/measurements/blood-pressure', {
          method: 'POST',
          body: JSON.stringify({ ...common, systolic, diastolic }),
        });
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

  if (authState === 'checking') return <main className={largeText ? 'app-shell large-text' : 'app-shell'} style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24 }}><section className="panel" role="status" aria-live="polite" style={{ width: 'min(460px, 100%)' }}><p className="eyebrow">PERSONAL HEALTH SERVICE</p><h1>Checking your session…</h1><p>Your local demo data has not been loaded yet.</p></section></main>;

  if (authState === 'error') return <main className={largeText ? 'app-shell large-text' : 'app-shell'} style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24 }}><section className="panel" role="alert" style={{ width: 'min(520px, 100%)' }}><p className="eyebrow">LOCAL SERVER UNAVAILABLE</p><h1>We could not check your session</h1><p>{sessionError}</p><button className="primary" type="button" onClick={() => void checkSession()}>Try Again</button></section></main>;

  if (authState === 'anonymous') return (
    <main className={largeText ? 'app-shell large-text' : 'app-shell'} style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24 }}>
      <section className="panel" style={{ width: 'min(520px, 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}><div><p className="eyebrow">P0 COURSE DEMO</p><h1 style={{ marginBottom: 8 }}>Personal Health Service</h1><p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Sign in to review health records stored by the local demo server.</p></div><button className="a11y-button" type="button" onClick={() => setLargeText((value) => !value)} aria-pressed={largeText}>Aa <span>{largeText ? 'Standard text' : 'Larger text'}</span></button></div>
        <div style={{ margin: '20px 0', padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--green-soft)' }}><strong style={{ display: 'block', marginBottom: 8 }}>Demo credentials</strong><code style={{ display: 'block' }}>{DEMO_EMAIL}</code><code style={{ display: 'block', marginTop: 5 }}>{DEMO_PASSWORD}</code></div>
        {sessionError && <p role="alert" style={{ color: 'var(--red)' }}>{sessionError}</p>}
        <form onSubmit={handleLogin} aria-label="Demo sign in"><label className="full-field">Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="full-field">Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary" type="submit" disabled={busy === 'login'} style={{ width: '100%', marginTop: 20 }}>{busy === 'login' ? 'Signing In…' : 'Sign In to Demo'}</button></form>
        <p className="disclaimer" style={{ marginTop: 16 }}>Fictional course data only. This is not a clinical system and does not provide medical advice.</p>
      </section>
    </main>
  );

  return (
    <main className={largeText ? 'app-shell large-text' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">+</span><div><strong>Personal Health</strong><small>Health Service System</small></div></div>
        <nav aria-label="Primary navigation">{navItems.map((item, index) => <button className={activeView === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => switchView(item.id)} aria-label={item.label} aria-current={activeView === item.id ? 'page' : undefined}><span className="nav-glyph">{item.hint}</span><span><b>{item.label}</b><small>0{index + 1}</small></span></button>)}</nav>
        <div className="privacy-note"><span><i /> Local demo storage</span><small>Signed sessions and each data action are checked by the course-project server.</small></div>
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
            {activeView !== 'overview' && <header className="page-heading"><div><p className="eyebrow">PERSONAL HEALTH SERVICE</p><h1>{pageTitle[activeView][0]}</h1><p>{pageTitle[activeView][1]}</p></div><span className="demo-label">LOCAL DEMO DATA</span></header>}
            {activeView === 'overview' && <>
              <section className="welcome"><div><p className="eyebrow">SIGNED-IN LOCAL COURSE DEMO</p><h1>Welcome, {user?.name.split(' ')[0]}</h1><p>Your latest server-backed health summary is ready.</p></div><button className="primary" onClick={() => openModal('measure')}>＋ Record Health Data</button></section>
              <section className="metrics" aria-label="Latest health metrics">{(Object.entries(trendData) as Array<[TrendKey, (typeof trendData)[TrendKey]]>).map(([key, item]) => <button className="metric" key={key} onClick={() => { setTrend(key); switchView('trends'); }}><span className="metric-head"><span>{item.name}</span><b className={item.tone}>{item.value === '—' ? 'No data' : item.state}</b></span><span className="metric-value"><strong>{item.value}</strong><small>{item.unit}</small></span><span className="metric-foot">{item.updatedAt ? `Saved ${formatDateTime(item.updatedAt)}` : 'Add a measurement to begin'}</span></button>)}<article className="metric score"><span className="metric-head"><span>Saved Measurements</span><b>Server-backed</b></span><span className="metric-value"><strong>{measurements.length}</strong><small>entries</small></span><span className="metric-foot">Across {new Set(measurements.map((item) => item.metric)).size} metric types</span></article></section>
              <section className="dashboard-grid"><article className="panel trend-panel"><div className="panel-title"><div><p className="eyebrow">RECENT SAVED READINGS</p><h2>Blood Pressure Trend</h2></div><button className="text-button" onClick={() => { setTrend(dashboardPressureTrend); switchView('trends'); }}>View All</button></div><div className="pressure-chart-toolbar" role="group" aria-label="Choose blood pressure type"><button type="button" className={dashboardPressureTrend === 'systolic' ? 'selected' : ''} aria-pressed={dashboardPressureTrend === 'systolic'} onClick={() => setDashboardPressureTrend('systolic')}><i className="dot dark" />Systolic Pressure</button><button type="button" className={dashboardPressureTrend === 'diastolic' ? 'selected' : ''} aria-pressed={dashboardPressureTrend === 'diastolic'} onClick={() => setDashboardPressureTrend('diastolic')}><i className="dot orange" />Diastolic Pressure</button><small>mmHg</small></div><MeasurementLineChart compact trend={dashboardPressureTrend} measurements={valuesForTrend(measurements, dashboardPressureTrend)} label={`${dashboardPressureTrend === 'systolic' ? 'Systolic' : 'Diastolic'} blood pressure line chart in millimetres of mercury`} /></article>
                <aside className="panel alert-panel"><div className="panel-title"><div><p className="eyebrow">RULE-BASED SUMMARY</p><h2>Latest Reading Check</h2></div><span className="count">{Object.values(trendData).filter((item) => item.tone === 'orange').length}</span></div>{Object.values(trendData).some((item) => item.tone === 'orange') ? Object.values(trendData).filter((item) => item.tone === 'orange').slice(0, 1).map((item) => <div className="alert-card" key={item.name}><span className="alert-icon">!</span><div><strong>{item.name} is outside the demo threshold</strong><p>{item.detail} Recheck under comparable conditions or consult a qualified professional if concerned.</p></div></div>) : <div className="empty-state"><strong>No reading is flagged</strong><p>This simple demo rule is not a diagnosis.</p></div>}<div className="next-check"><span>Important limitation</span><strong>Course-demo guidance only</strong><small>Thresholds are illustrative and do not replace professional medical advice.</small></div></aside></section>
              <section className="lower-grid"><article className="panel compact-list"><div className="panel-title"><div><p className="eyebrow">RECENT RECORDS</p><h2>Saved Health Information</h2></div><button className="text-button" onClick={() => switchView('records')}>Open Records</button></div>{records.slice(0, 3).map((record) => <button className="mini-row" key={record.id} onClick={() => { setSelectedRecord(record); setModal('detail'); }}><span className="record-icon">{recordTypeIcons[record.type]}</span><span><strong>{record.title}</strong><small>{record.organization ?? recordSourceLabels[record.source]} · {formatDate(record.occurredAt)}</small></span><b aria-hidden="true">›</b></button>)}{records.length === 0 && <div className="empty-state"><strong>No records yet</strong><p>Add a record to populate this section.</p></div>}</article>
                <article className="panel consent-summary"><p className="eyebrow">ACTIVE PERMISSION RECORD</p>{activePermissions[0] ? <><h2>{activePermissions.length} temporary sharing decision{activePermissions.length === 1 ? ' is' : 's are'} recorded</h2><div className="doctor-line"><span className="doctor-avatar">{initials(activePermissions[0].granteeName)}</span><span><strong>{activePermissions[0].granteeName}</strong><small>{scopeLabel(activePermissions[0].scopes)} · Expires {formatDateTime(activePermissions[0].expiresAt)}</small></span></div></> : <><h2>No active sharing permission</h2><p>No active consent record exists right now.</p></>}<button className="secondary" onClick={() => switchView('permissions')}>Manage Permissions</button></article></section>
            </>}
            {activeView === 'records' && <section className="records-view"><div className="toolbar"><div className="filter-tabs">{([['all', 'All'], ...Object.entries(recordTypeLabels).filter(([type]) => type !== 'other')] as Array<[RecordType | 'all', string]>).map(([value, label]) => <button key={value} className={recordFilter === value ? 'selected' : ''} onClick={() => setRecordFilter(value)}>{label}</button>)}</div><button className="primary" onClick={() => openModal('record')}>＋ Add Record</button></div>{recordsError && <p role="alert" style={{ color: 'var(--red)' }}>{recordsError}</p>}<div className="records-layout"><article className="panel records-list"><div className="list-heading"><span>{recordsLoading ? 'Searching…' : `${records.length} records`}</span><small>Results come from the authenticated records API</small></div>{records.map((record) => <button className="record-row" key={record.id} onClick={() => { setSelectedRecord(record); setActionError(''); setModal('detail'); }}><span className="record-icon large">{recordTypeIcons[record.type]}</span><span className="record-main"><span><b>{record.title}</b><em>{recordStatus(record)}</em></span><small>{recordTypeLabels[record.type]} · {record.organization ?? recordSourceLabels[record.source]}</small><p>{record.description || 'No details were provided.'}</p></span><span className="record-date">{formatDate(record.occurredAt)}<b aria-hidden="true">›</b></span></button>)}{!recordsLoading && records.length === 0 && <div className="empty-state"><strong>No matching records</strong><p>Try a shorter search term or choose a different record type.</p></div>}</article><aside className="panel record-guide"><p className="eyebrow">RECORD RULES</p><h2>Clear Data Provenance</h2><dl><div><dt>Self-entered</dt><dd>Created through this form and persisted by the local API</dd></div><div><dt>Hospital source</dt><dd>Seeded source information is shown without pretending to sync a hospital</dd></div><div><dt>Search</dt><dd>Text and type filters are validated and applied by the server</dd></div></dl><button className="secondary" type="button" disabled title="Hospital integration is outside the P0 course-demo scope">Hospital Sync — Not Implemented</button></aside></div></section>}
            {activeView === 'trends' && <section className="trends-view"><div className="metric-switch">{(Object.entries(trendData) as Array<[TrendKey, (typeof trendData)[TrendKey]]>).map(([key, item]) => <button key={key} className={trend === key ? 'selected' : ''} onClick={() => setTrend(key)}><span>{item.name}</span><strong>{item.value}</strong><small>{item.unit}</small></button>)}</div><div className="trend-detail-grid"><article className="panel trend-large"><div className="panel-title"><div><p className="eyebrow">ALL SAVED READINGS</p><h2>{trendData[trend].name} Trend</h2></div><span className="demo-label">{selectedTrendMeasurements.length} DATA POINTS</span></div><div className="trend-summary"><strong>{trendData[trend].value}</strong><span>{trendData[trend].unit}<b>{trendData[trend].state}</b></span></div><MeasurementLineChart trend={trend} measurements={selectedTrendMeasurements} label={`${trendData[trend].name} line chart in ${trendData[trend].unit}`} /></article><aside className="panel insight"><p className="eyebrow">RULE-BASED SUMMARY</p><h2>{trendData[trend].state}</h2><p>{trendData[trend].detail}</p><div className="advice"><strong>Everyday guidance</strong><p>Measure under consistent conditions and contact a qualified professional if unusual readings persist or you feel unwell.</p></div><small className="disclaimer">This simple course-demo rule is general information only and is not a diagnosis or treatment recommendation.</small></aside></div><article className="panel history-table"><div className="panel-title"><h2>Recent Measurements</h2><button className="text-button" onClick={() => openModal('measure')}>Add Measurement</button></div><div className="table-head"><span>Measured At</span><span>Result</span><span>Demo Check</span><span>Source</span></div>{selectedTrendRows.map((row) => <div className="table-row" key={row.id}><span>{formatDateTime(row.time)}</span><strong>{row.result}</strong><span><i className={row.review ? 'status-dot warn' : 'status-dot'} />{row.review ? 'Review' : 'Within range'}</span><span>{row.source}</span></div>)}{selectedTrendRows.length === 0 && <div className="empty-state"><strong>No saved readings</strong><p>Add a measurement to begin this trend.</p></div>}</article></section>}
            {activeView === 'permissions' && <section className="permission-view"><div className="consent-hero"><div><p className="eyebrow">MINIMUM NECESSARY ACCESS</p><h2>Your information, your decision</h2><p>Record a recipient, intended read-only scope, and expiry. This P0 API stores and audits the consent decision; a clinician sign-in portal is not implemented yet.</p></div><button className="primary light" onClick={() => openModal('grant')}>＋ Record Permission</button></div>{dataError && <p role="alert" style={{ color: 'var(--red)' }}>{dataError}</p>}<div className="permission-stats"><div><strong>{activePermissions.length}</strong><span>Active Records</span></div><div><strong>{expiredPermissions.length}</strong><span>Expired</span></div><div><strong>{revokedPermissions.length}</strong><span>Revoked</span></div></div><div className="permission-grid"><article className="panel grants"><div className="panel-title"><div><p className="eyebrow">ACTIVE PERMISSION RECORDS</p><h2>Recorded Sharing Decisions</h2></div></div>{activePermissions.length === 0 ? <div className="empty-state"><strong>No active permissions</strong><p>A new sharing decision requires your confirmation.</p></div> : activePermissions.map((permission) => <div className="grant-card" key={permission.id}><div className="doctor-line"><span className="doctor-avatar">{initials(permission.granteeName)}</span><span><strong>{permission.granteeName}</strong><small>{permission.organization ?? permission.granteeType}</small></span><b className="verified">Active</b></div><div className="grant-scope"><span><small>Recorded scope</small><b>{scopeLabel(permission.scopes)}</b></span><span><small>Valid until</small><b>{formatDateTime(permission.expiresAt)}</b></span><span><small>P0 enforcement</small><b>Consent record only</b></span></div><div className="grant-actions"><button className="secondary" onClick={() => switchView('audit')}>View Access Log</button><button className="danger" disabled={busy === `revoke:${permission.id}`} onClick={() => void revokePermission(permission)}>{busy === `revoke:${permission.id}` ? 'Revoking…' : 'Revoke'}</button></div></div>)}</article><aside className="panel flow-panel"><p className="eyebrow">PERMISSION FLOW</p><h2>P0 Consent Lifecycle</h2>{['Recipient is selected', 'Patient chooses the scope', 'Server stores an expiry', 'Consent record is active', 'Permission expires or is revoked', 'Every change is logged'].map((step, index) => <div className="flow-step" key={step}><span>{index + 1}</span><b>{step}</b></div>)}</aside></div></section>}
            {activeView === 'audit' && <section className="audit-view">{failedAuditEvent && <div className="risk-banner"><span className="alert-icon">!</span><div><strong>A failed request was recorded</strong><p>{actionLabels[failedAuditEvent.action] ?? failedAuditEvent.action} · {formatDateTime(failedAuditEvent.createdAt)}. The event did not complete successfully.</p></div><button onClick={() => switchView('security')}>Review Account Security</button></div>}<div className="toolbar audit-toolbar"><div className="filter-tabs">{(['All Activity', 'Views', 'Changes', 'Failed'] as const).map((item) => <button key={item} className={auditFilter === item ? 'selected' : ''} onClick={() => setAuditFilter(item)}>{item}</button>)}</div><button className="secondary" type="button" disabled title="Audit export is outside the P0 course-demo scope">Export — Not Implemented</button></div><article className="panel audit-list"><div className="audit-head"><span>Actor</span><span>Action and Resource</span><span>Time and Context</span><span>Result</span></div>{filteredAudit.map((row) => <div className={row.risk ? 'audit-row risky' : 'audit-row'} key={row.id}><span><i className="person-dot">{row.initials}</i><b>{row.person}</b></span><span><b>{row.action}</b><small>{row.target}</small></span><span><b>{row.time}</b><small>{row.place}</small></span><span><em>{row.result}</em></span></div>)}{filteredAudit.length === 0 && <div className="empty-state"><strong>No matching audit events</strong><p>Actions performed through the local APIs will appear here.</p></div>}</article></section>}
            {activeView === 'security' && <section className="security-view"><div className="security-score panel"><div className="score-ring">P0</div><div><p className="eyebrow">IMPLEMENTED SECURITY BASELINE</p><h2>Authenticated Local Demo Session</h2><p>The server verifies a hashed password, issues a signed HttpOnly session cookie, limits repeated failed sign-ins, validates API input, and writes audit events.</p></div><button className="secondary" type="button" onClick={() => void checkSession()}>Recheck Session</button></div><div className="security-grid"><article className="panel"><p className="eyebrow">IMPLEMENTED NOW</p><h2>Server-Enforced Controls</h2>{[['Password verification', 'Enabled', 'Scrypt hash comparison on the server'], ['Signed session', 'Enabled', 'HttpOnly, SameSite=Lax cookie'], ['Login rate limit', 'Enabled', 'Repeated failed attempts are temporarily blocked']].map(([name, state, description], index) => <div className="setting-row" key={name}><span className="setting-icon">{index + 1}</span><span><b>{name}</b><small>{description}</small></span><button className="on" type="button" disabled>{state}</button></div>)}</article><article className="panel"><p className="eyebrow">NOT IN P0</p><h2>Future Integrations</h2>{[['Multi-factor authentication', 'Requires SMS or authenticator provider'], ['Trusted-device management', 'Requires device/session inventory'], ['Biometric sign-in', 'Requires a platform authenticator flow']].map(([name, description], index) => <div className="device-row" key={name}><span className="device-icon">{index + 1}</span><span><b>{name}</b><small>{description}</small></span><em>Not implemented</em></div>)}<button className="danger full" type="button" disabled>Sign Out Other Devices — Not Implemented</button></article></div><article className="panel security-events"><div className="panel-title"><div><p className="eyebrow">CURRENT SESSION</p><h2>Session Information</h2></div><button className="text-button" onClick={() => switchView('audit')}>View Full Log</button></div><div className="event-row"><span>✓</span><div><strong>Signed in as {user?.email}</strong><small>{sessionExpiresAt ? `Session expires ${formatDateTime(sessionExpiresAt)}` : 'Expiry unavailable'}</small></div><b>Active</b></div><button className="danger full" type="button" disabled={busy === 'logout'} onClick={() => void handleLogout()}>{busy === 'logout' ? 'Signing Out…' : 'Sign Out This Session'}</button></article></section>}
          </>}
        </div>
      </section>
      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!busy) setModal(null); }}><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title" aria-describedby={actionError ? 'action-dialog-error' : undefined} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="Close dialog" disabled={Boolean(busy)} onClick={() => setModal(null)}>×</button>{actionError && <p id="action-dialog-error" role="alert" style={{ color: 'var(--red)', paddingRight: 34 }}>{actionError}</p>}
        {modal === 'measure' && <form onSubmit={handleMeasurementSubmit}><p className="eyebrow">NEW MEASUREMENT</p><h2 id="action-dialog-title">Record Health Data</h2><div className="form-grid"><label>Metric Type<select data-modal-initial-focus="true" value={measurementForm.kind} onChange={(event) => { const kind = event.target.value as typeof measurementForm.kind; setMeasurementForm((current) => ({ ...current, kind, result: kind === 'blood_pressure' ? '126/78' : kind === 'heart_rate' ? '72' : '6.2' })); }}><option value="blood_glucose">Fasting Glucose</option><option value="blood_pressure">Blood Pressure</option><option value="heart_rate">Resting Heart Rate</option></select></label><label>{measurementForm.kind === 'blood_pressure' ? 'Result (systolic/diastolic)' : 'Result'}<input value={measurementForm.result} onChange={(event) => setMeasurementForm((current) => ({ ...current, result: event.target.value }))} inputMode={measurementForm.kind === 'blood_pressure' ? 'text' : 'decimal'} required /></label><label>Unit<input value={measurementForm.kind === 'blood_pressure' ? 'mmHg' : measurementForm.kind === 'blood_glucose' ? 'mmol/L' : 'bpm'} readOnly /></label><label>Measured At<input type="datetime-local" value={measurementForm.measuredAt} onChange={(event) => setMeasurementForm((current) => ({ ...current, measuredAt: event.target.value }))} required /></label></div><label className="full-field">Notes<textarea value={measurementForm.notes} onChange={(event) => setMeasurementForm((current) => ({ ...current, notes: event.target.value }))} maxLength={500} placeholder="Add meal, sleep, or measurement conditions" /></label><div className="modal-actions"><button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setModal(null)}>Cancel</button><button className="primary" type="submit" disabled={busy === 'measurement'}>{busy === 'measurement' ? 'Saving…' : 'Save Measurement'}</button></div></form>}
        {modal === 'record' && <form onSubmit={handleRecordSubmit}><p className="eyebrow">PERSONAL ENTRY</p><h2 id="action-dialog-title">Add a Health Record</h2><div className="form-grid"><label>Record Type<select data-modal-initial-focus="true" value={recordForm.type} onChange={(event) => setRecordForm((current) => ({ ...current, type: event.target.value as RecordType }))}>{Object.entries(recordTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Record Date<input type="date" value={recordForm.date} onChange={(event) => setRecordForm((current) => ({ ...current, date: event.target.value }))} required /></label></div><label className="full-field">Title<input value={recordForm.title} onChange={(event) => setRecordForm((current) => ({ ...current, title: event.target.value }))} maxLength={120} placeholder="Example: Annual community health examination" required /></label><label className="full-field">Details<textarea value={recordForm.description} onChange={(event) => setRecordForm((current) => ({ ...current, description: event.target.value }))} maxLength={2000} placeholder="Enter key results or information to retain" /></label><div className="version-note"><span>Attachment limitation</span><p>File upload is not implemented in P0, so this form stores text only.</p></div><div className="modal-actions"><button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setModal(null)}>Cancel</button><button className="primary" type="submit" disabled={busy === 'record'}>{busy === 'record' ? 'Saving…' : 'Save Record'}</button></div></form>}
        {modal === 'grant' && <form onSubmit={handlePermissionSubmit}><p className="eyebrow">MINIMUM NECESSARY ACCESS</p><h2 id="action-dialog-title">Record Temporary Permission</h2><div className="form-grid"><label>Clinician or Health Manager<select data-modal-initial-focus="true" value={permissionForm.recipient} onChange={(event) => setPermissionForm((current) => ({ ...current, recipient: event.target.value as 'carter' | 'chen' }))}><option value="carter">Dr. William Carter · Riverside General Hospital</option><option value="chen">Emma Chen · Lakeside Community Hospital</option></select></label><label>Duration<select value={permissionForm.durationHours} onChange={(event) => setPermissionForm((current) => ({ ...current, durationHours: Number(event.target.value) }))}><option value={24}>24 Hours</option><option value={72}>3 Days</option><option value={168}>7 Days</option></select></label></div><fieldset><legend>Intended read-only scope</legend><label className="check-row"><input type="checkbox" checked={permissionForm.scopes.includes('records:read')} onChange={() => togglePermissionScope('records:read')} />Health records</label><label className="check-row"><input type="checkbox" checked={permissionForm.scopes.includes('measurements:read')} onChange={() => togglePermissionScope('measurements:read')} />Health measurements</label></fieldset><label className="check-row consent-check"><input type="checkbox" checked={permissionForm.confirmed} onChange={(event) => setPermissionForm((current) => ({ ...current, confirmed: event.target.checked }))} />I have confirmed the recipient, scope, and expiry</label><div className="modal-actions"><button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setModal(null)}>Cancel</button><button className="primary" type="submit" disabled={busy === 'permission'}>{busy === 'permission' ? 'Creating…' : 'Save Permission Record'}</button></div></form>}
        {modal === 'detail' && selectedRecord && <><p className="eyebrow">{recordTypeLabels[selectedRecord.type]} · {recordSourceLabels[selectedRecord.source]}</p><h2 id="action-dialog-title">{selectedRecord.title}</h2><div className="detail-meta"><span><small>Record Date</small><b>{formatDate(selectedRecord.occurredAt)}</b></span><span><small>Data Source</small><b>{selectedRecord.organization ?? recordSourceLabels[selectedRecord.source]}</b></span><span><small>Status</small><b>{recordStatus(selectedRecord)}</b></span></div><div className="detail-copy"><strong>Record Summary</strong><p>{selectedRecord.description || 'No details were provided.'}</p></div><div className="version-note"><span>Stored metadata</span><p>Created {formatDateTime(selectedRecord.createdAt)} · Last updated {formatDateTime(selectedRecord.updatedAt)}</p></div><div className="modal-actions"><button className="secondary" type="button" disabled title="Version-history endpoints are outside P0">Version History — Not Implemented</button><button className="primary" type="button" data-modal-initial-focus="true" onClick={() => setModal(null)}>Done</button></div></>}
      </section></div>}
      {toast && <div className="toast" role="status" aria-live="polite" aria-atomic="true">✓ {toast}</div>}
      <footer className="demo-footer">Course Project · Fictional local data · Not medical advice · Not a production clinical system</footer>
    </main>
  );
}
