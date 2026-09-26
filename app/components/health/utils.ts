import type { HealthRecord, Measurement, MeasurementMetric, Permission, RecordType } from '@/lib/client/api';
import type { TrendKey, View } from './types';

export const navItems: Array<{ id: View; label: string; hint: string }> = [
  { id: 'overview', label: 'Dashboard', hint: 'OV' },
  { id: 'records', label: 'Health Records', hint: 'HR' },
  { id: 'trends', label: 'Health Trends', hint: 'TR' },
  { id: 'permissions', label: 'Permissions', hint: 'PM' },
  { id: 'audit', label: 'Access Log', hint: 'AL' },
  { id: 'security', label: 'Account Security', hint: 'AS' },
];

export const recordTypeLabels: Record<RecordType, string> = {
  medical_report: 'Medical Report',
  health_metric: 'Health Metric',
  medication: 'Medication',
  allergy: 'Allergy',
  medical_history: 'Medical History',
  other: 'Other',
};

export const recordTypeIcons: Record<RecordType, string> = {
  medical_report: 'MR',
  health_metric: 'HM',
  medication: 'RX',
  allergy: 'AL',
  medical_history: 'MH',
  other: 'OT',
};

export const recordSourceLabels: Record<HealthRecord['source'], string> = {
  self: 'Self-entered',
  hospital: 'Hospital source',
  clinician: 'Clinician entry',
  device: 'Connected device',
  other: 'Other source',
};

export const pageTitle: Record<View, [string, string]> = {
  overview: ['Dashboard', 'A snapshot of your latest health data, reminders, and services'],
  records: ['Health Records', 'Manage medical history, medications, allergies, and reports in one place'],
  trends: ['Health Trends', 'Review saved blood pressure, glucose, and heart-rate measurements'],
  permissions: ['Permissions', 'Record who may receive specific health information and for how long'],
  audit: ['Access Log', 'Views, updates, sign-ins, and permission changes recorded by the local server'],
  security: ['Account Security', 'Review the protections currently applied to your account'],
};

export const actionLabels: Record<string, string> = {
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

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function localDateTimeInput(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function localDateInput(): string {
  return localDateTimeInput().slice(0, 10);
}

export function initials(name: string): string {
  const letters = name.match(/[A-Za-z]+/g)?.slice(0, 2).map((part) => part[0]) ?? [];
  return letters.join('').toUpperCase() || 'PH';
}

export function latestMeasurement(measurements: Measurement[], metric: MeasurementMetric): Measurement | undefined {
  return measurements.find((measurement) => measurement.metric === metric);
}

export function valuesForTrend(measurements: Measurement[], trend: TrendKey): Measurement[] {
  const metric: MeasurementMetric = trend === 'systolic'
    ? 'blood_pressure_systolic'
    : trend === 'diastolic'
      ? 'blood_pressure_diastolic'
      : trend === 'glucose'
        ? 'blood_glucose'
        : 'heart_rate';
  return measurements.filter((measurement) => measurement.metric === metric);
}

export function recordStatus(record: HealthRecord): string {
  return record.source === 'hospital' ? 'Source retained' : 'Saved';
}

export function scopeLabel(scopes: Permission['scopes']): string {
  return scopes.map((scope) => scope === 'records:read' ? 'Health records' : 'Measurements').join(' and ');
}
