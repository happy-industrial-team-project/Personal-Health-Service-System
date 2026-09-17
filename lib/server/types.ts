export type PasswordHash = {
  algorithm: 'scrypt';
  salt: string;
  hash: string;
  keyLength: number;
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: 'patient';
  password: PasswordHash;
  createdAt: string;
};

export type Session = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export const recordTypes = [
  'medical_report',
  'health_metric',
  'medication',
  'allergy',
  'medical_history',
  'other',
] as const;

export type RecordType = (typeof recordTypes)[number];

export const recordSources = ['self', 'hospital', 'clinician', 'device', 'other'] as const;
export type RecordSource = (typeof recordSources)[number];

export type HealthRecord = {
  id: string;
  ownerId: string;
  type: RecordType;
  title: string;
  description: string;
  occurredAt: string;
  source: RecordSource;
  organization: string | null;
  createdAt: string;
  updatedAt: string;
};

export const measurementMetrics = [
  'blood_pressure_systolic',
  'blood_pressure_diastolic',
  'blood_glucose',
  'heart_rate',
  'weight',
  'body_temperature',
  'oxygen_saturation',
] as const;

export type MeasurementMetric = (typeof measurementMetrics)[number];

export const measurementSources = ['manual', 'device', 'hospital', 'clinician'] as const;
export type MeasurementSource = (typeof measurementSources)[number];

export type Measurement = {
  id: string;
  ownerId: string;
  metric: MeasurementMetric;
  value: number;
  unit: string;
  measuredAt: string;
  source: MeasurementSource;
  notes: string | null;
  createdAt: string;
};

export const granteeTypes = ['clinician', 'hospital', 'caregiver'] as const;
export type GranteeType = (typeof granteeTypes)[number];

export const permissionScopes = ['records:read', 'measurements:read'] as const;
export type PermissionScope = (typeof permissionScopes)[number];

export const permissionStatuses = ['active', 'expired', 'revoked'] as const;
export type PermissionStatus = (typeof permissionStatuses)[number];

export type Permission = {
  id: string;
  ownerId: string;
  granteeName: string;
  granteeType: GranteeType;
  organization: string | null;
  scopes: PermissionScope[];
  status: PermissionStatus;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
};

export type AuditOutcome = 'success' | 'failure';

export type AuditMetadataValue = string | number | boolean | null;

export type AuditEvent = {
  id: string;
  subjectUserId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  createdAt: string;
  metadata: Record<string, AuditMetadataValue>;
};

export type DatabaseBootstrapV1 = {
  schemaVersion: 1;
  users: User[];
  sessions: Session[];
  records: HealthRecord[];
  measurements: Measurement[];
  permissions: Permission[];
  auditEvents: AuditEvent[];
};

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'role'>;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
