import type { RecordType } from '@/lib/client/api';

export type View = 'overview' | 'records' | 'trends' | 'permissions' | 'audit' | 'security';
export type Modal = 'measure' | 'record' | 'grant' | 'detail' | null;
export type AuthState = 'checking' | 'anonymous' | 'authenticated' | 'error';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';
export type TrendKey = 'systolic' | 'diastolic' | 'glucose' | 'heart';
export type BloodPressureTrend = Extract<TrendKey, 'systolic' | 'diastolic'>;
export type PermissionScope = 'records:read' | 'measurements:read';
export type AuditFilter = 'All Activity' | 'Views' | 'Changes' | 'Failed';

export type TrendSummary = {
  name: string;
  value: string;
  unit: string;
  state: string;
  tone: string;
  updatedAt: string | null;
  detail: string;
};

export type DashboardMetric = TrendSummary & {
  key: string;
  trend: TrendKey;
};

export type TrendRow = {
  id: string;
  time: string;
  result: string;
  source: string;
  review: boolean;
};

export type AuditRow = {
  id: string;
  person: string;
  initials: string;
  action: string;
  target: string;
  time: string;
  place: string;
  result: string;
  risk: boolean;
  rawAction: string;
};

export type RecordForm = {
  type: RecordType;
  date: string;
  title: string;
  description: string;
};

export type MeasurementForm = {
  kind: 'blood_glucose' | 'blood_pressure' | 'heart_rate';
  result: string;
  measuredAt: string;
  notes: string;
};

export type PermissionForm = {
  recipient: 'carter' | 'chen';
  durationHours: number;
  scopes: PermissionScope[];
  confirmed: boolean;
};
