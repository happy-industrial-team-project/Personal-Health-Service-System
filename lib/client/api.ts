export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: 'patient';
};

export type RecordType =
  | 'medical_report'
  | 'health_metric'
  | 'medication'
  | 'allergy'
  | 'medical_history'
  | 'other';

export type HealthRecord = {
  id: string;
  ownerId: string;
  type: RecordType;
  title: string;
  description: string;
  occurredAt: string;
  source: 'self' | 'hospital' | 'clinician' | 'device' | 'other';
  organization: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MeasurementMetric =
  | 'blood_pressure_systolic'
  | 'blood_pressure_diastolic'
  | 'blood_glucose'
  | 'heart_rate'
  | 'weight'
  | 'body_temperature'
  | 'oxygen_saturation';

export type Measurement = {
  id: string;
  ownerId: string;
  metric: MeasurementMetric;
  value: number;
  unit: string;
  measuredAt: string;
  source: 'manual' | 'device' | 'hospital' | 'clinician';
  notes: string | null;
  createdAt: string;
};

export type Permission = {
  id: string;
  ownerId: string;
  granteeName: string;
  granteeType: 'clinician' | 'hospital' | 'caregiver';
  organization: string | null;
  scopes: Array<'records:read' | 'measurements:read'>;
  status: 'active' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
};

export type AuditEvent = {
  id: string;
  subjectUserId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: 'success' | 'failure';
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
};

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string> };
};

export class ClientApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ClientApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  let payload: ApiSuccess<T> | ApiFailure;
  try {
    payload = await response.json() as ApiSuccess<T> | ApiFailure;
  } catch {
    throw new ClientApiError(response.status, 'INVALID_RESPONSE', 'The server returned an unreadable response.');
  }

  if (!response.ok || !payload.ok) {
    const error = payload.ok
      ? { code: 'REQUEST_FAILED', message: `Request failed with status ${response.status}.` }
      : payload.error;
    throw new ClientApiError(response.status, error.code, error.message, error.fields);
  }

  return payload.data;
}
