import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
  HealthRecord,
  Measurement,
  MeasurementMetric,
  Permission,
  PermissionScope,
  PermissionStatus,
  RecordType,
  Session,
  User,
} from './types';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: User['role'];
  password_algorithm: User['password']['algorithm'];
  password_salt: string;
  password_hash: string;
  password_key_length: number;
  created_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

type HealthRecordRow = {
  id: string;
  owner_id: string;
  type: HealthRecord['type'];
  title: string;
  description: string;
  occurred_at: string;
  source: HealthRecord['source'];
  organization: string | null;
  created_at: string;
  updated_at: string;
};

type MeasurementRow = {
  id: string;
  owner_id: string;
  metric: Measurement['metric'];
  value: number;
  unit: string;
  measured_at: string;
  source: Measurement['source'];
  notes: string | null;
  created_at: string;
};

type PermissionRow = {
  id: string;
  owner_id: string;
  grantee_name: string;
  grantee_type: Permission['granteeType'];
  organization: string | null;
  status: Permission['status'];
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    password: {
      algorithm: row.password_algorithm,
      salt: row.password_salt,
      hash: row.password_hash,
      keyLength: row.password_key_length,
    },
    createdAt: row.created_at,
  };
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function toHealthRecord(row: HealthRecordRow): HealthRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type,
    title: row.title,
    description: row.description,
    occurredAt: row.occurred_at,
    source: row.source,
    organization: row.organization,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMeasurement(row: MeasurementRow): Measurement {
  return {
    id: row.id,
    ownerId: row.owner_id,
    metric: row.metric,
    value: row.value,
    unit: row.unit,
    measuredAt: row.measured_at,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function permissionScopes(database: DatabaseSync, permissionId: string): PermissionScope[] {
  const rows = database.prepare(`
    SELECT scope
    FROM permission_scopes
    WHERE permission_id = ?
    ORDER BY position ASC
  `).all(permissionId) as Array<{ scope: PermissionScope }>;
  return rows.map((row) => row.scope);
}

function toPermission(database: DatabaseSync, row: PermissionRow): Permission {
  return {
    id: row.id,
    ownerId: row.owner_id,
    granteeName: row.grantee_name,
    granteeType: row.grantee_type,
    organization: row.organization,
    scopes: permissionScopes(database, row.id),
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export function findUserByEmail(database: DatabaseSync, email: string): User | null {
  const row = database.prepare(`
    SELECT
      id, email, name, role, password_algorithm, password_salt,
      password_hash, password_key_length, created_at
    FROM users
    WHERE email = ? COLLATE NOCASE
    LIMIT 1
  `).get(email) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function firstUser(database: DatabaseSync): User | null {
  const row = database.prepare(`
    SELECT
      id, email, name, role, password_algorithm, password_salt,
      password_hash, password_key_length, created_at
    FROM users
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `).get() as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function findActiveSession(
  database: DatabaseSync,
  sessionId: string,
  userId: string,
  now: string,
): { session: Session; user: User } | null {
  const row = database.prepare(`
    SELECT
      s.id AS session_id,
      s.user_id AS session_user_id,
      s.created_at AS session_created_at,
      s.expires_at AS session_expires_at,
      s.revoked_at AS session_revoked_at,
      u.id AS user_id,
      u.email AS user_email,
      u.name AS user_name,
      u.role AS user_role,
      u.password_algorithm,
      u.password_salt,
      u.password_hash,
      u.password_key_length,
      u.created_at AS user_created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
      AND s.user_id = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
    LIMIT 1
  `).get(sessionId, userId, now) as {
    session_id: string;
    session_user_id: string;
    session_created_at: string;
    session_expires_at: string;
    session_revoked_at: string | null;
    user_id: string;
    user_email: string;
    user_name: string;
    user_role: User['role'];
    password_algorithm: User['password']['algorithm'];
    password_salt: string;
    password_hash: string;
    password_key_length: number;
    user_created_at: string;
  } | undefined;

  if (!row) return null;
  return {
    session: toSession({
      id: row.session_id,
      user_id: row.session_user_id,
      created_at: row.session_created_at,
      expires_at: row.session_expires_at,
      revoked_at: row.session_revoked_at,
    }),
    user: toUser({
      id: row.user_id,
      email: row.user_email,
      name: row.user_name,
      role: row.user_role,
      password_algorithm: row.password_algorithm,
      password_salt: row.password_salt,
      password_hash: row.password_hash,
      password_key_length: row.password_key_length,
      created_at: row.user_created_at,
    }),
  };
}

export function deleteInactiveSessions(database: DatabaseSync, now: string): void {
  database.prepare(`
    DELETE FROM sessions
    WHERE revoked_at IS NOT NULL OR expires_at <= ?
  `).run(now);
}

export function insertSession(database: DatabaseSync, session: Session): void {
  database.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(session.id, session.userId, session.createdAt, session.expiresAt, session.revokedAt);
}

export function revokeSessionById(database: DatabaseSync, sessionId: string, revokedAt: string): boolean {
  const result = database.prepare(`
    UPDATE sessions
    SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(revokedAt, sessionId);
  return Number(result.changes) > 0;
}

export type HealthRecordQuery = {
  ownerId: string;
  type: RecordType | null;
  from: string | null;
  to: string | null;
  query: string | null;
};

export function listHealthRecords(database: DatabaseSync, filters: HealthRecordQuery): HealthRecord[] {
  const conditions = ['owner_id = ?'];
  const parameters: SQLInputValue[] = [filters.ownerId];
  if (filters.type) {
    conditions.push('type = ?');
    parameters.push(filters.type);
  }
  if (filters.from) {
    conditions.push('occurred_at >= ?');
    parameters.push(filters.from);
  }
  if (filters.to) {
    conditions.push('occurred_at <= ?');
    parameters.push(filters.to);
  }

  const rows = database.prepare(`
    SELECT
      id, owner_id, type, title, description, occurred_at, source,
      organization, created_at, updated_at
    FROM health_records
    WHERE ${conditions.join(' AND ')}
    ORDER BY occurred_at DESC, created_at DESC, id ASC
  `).all(...parameters) as HealthRecordRow[];

  const records = rows.map(toHealthRecord);
  if (!filters.query) return records;
  return records.filter((record) =>
    `${record.title}\n${record.description}\n${record.organization ?? ''}`
      .toLocaleLowerCase()
      .includes(filters.query!),
  );
}

export function insertHealthRecord(database: DatabaseSync, record: HealthRecord): void {
  database.prepare(`
    INSERT INTO health_records (
      id, owner_id, type, title, description, occurred_at, source,
      organization, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.ownerId,
    record.type,
    record.title,
    record.description,
    record.occurredAt,
    record.source,
    record.organization,
    record.createdAt,
    record.updatedAt,
  );
}

export type MeasurementQuery = {
  ownerId: string;
  metric: MeasurementMetric | null;
  from: string | null;
  to: string | null;
};

export function listMeasurements(database: DatabaseSync, filters: MeasurementQuery): Measurement[] {
  const conditions = ['owner_id = ?'];
  const parameters: SQLInputValue[] = [filters.ownerId];
  if (filters.metric) {
    conditions.push('metric = ?');
    parameters.push(filters.metric);
  }
  if (filters.from) {
    conditions.push('measured_at >= ?');
    parameters.push(filters.from);
  }
  if (filters.to) {
    conditions.push('measured_at <= ?');
    parameters.push(filters.to);
  }

  const rows = database.prepare(`
    SELECT id, owner_id, metric, value, unit, measured_at, source, notes, created_at
    FROM measurements
    WHERE ${conditions.join(' AND ')}
    ORDER BY measured_at DESC, created_at DESC, id ASC
  `).all(...parameters) as MeasurementRow[];
  return rows.map(toMeasurement);
}

export function insertMeasurement(database: DatabaseSync, measurement: Measurement): void {
  database.prepare(`
    INSERT INTO measurements (
      id, owner_id, metric, value, unit, measured_at, source, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    measurement.id,
    measurement.ownerId,
    measurement.metric,
    measurement.value,
    measurement.unit,
    measurement.measuredAt,
    measurement.source,
    measurement.notes,
    measurement.createdAt,
  );
}

export function expirePermissions(database: DatabaseSync, ownerId: string, now: string): string[] {
  const rows = database.prepare(`
    SELECT id
    FROM permissions
    WHERE owner_id = ? AND status = 'active' AND expires_at <= ?
    ORDER BY id ASC
  `).all(ownerId, now) as Array<{ id: string }>;
  if (rows.length === 0) return [];

  database.prepare(`
    UPDATE permissions
    SET status = 'expired'
    WHERE owner_id = ? AND status = 'active' AND expires_at <= ?
  `).run(ownerId, now);
  return rows.map((row) => row.id);
}

export function listPermissions(
  database: DatabaseSync,
  ownerId: string,
  status: PermissionStatus | null,
): Permission[] {
  const parameters: SQLInputValue[] = [ownerId];
  const statusClause = status ? 'AND status = ?' : '';
  if (status) parameters.push(status);
  const rows = database.prepare(`
    SELECT
      id, owner_id, grantee_name, grantee_type, organization,
      status, expires_at, created_at, revoked_at
    FROM permissions
    WHERE owner_id = ? ${statusClause}
    ORDER BY created_at DESC, id ASC
  `).all(...parameters) as PermissionRow[];
  return rows.map((row) => toPermission(database, row));
}

export function insertPermission(database: DatabaseSync, permission: Permission): void {
  database.prepare(`
    INSERT INTO permissions (
      id, owner_id, grantee_name, grantee_type, organization,
      status, expires_at, created_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    permission.id,
    permission.ownerId,
    permission.granteeName,
    permission.granteeType,
    permission.organization,
    permission.status,
    permission.expiresAt,
    permission.createdAt,
    permission.revokedAt,
  );

  const insertScope = database.prepare(`
    INSERT INTO permission_scopes (permission_id, scope, position)
    VALUES (?, ?, ?)
  `);
  permission.scopes.forEach((scope, index) => {
    insertScope.run(permission.id, scope, index);
  });
}

export function findPermissionForOwner(
  database: DatabaseSync,
  permissionId: string,
  ownerId: string,
): Permission | null {
  const row = database.prepare(`
    SELECT
      id, owner_id, grantee_name, grantee_type, organization,
      status, expires_at, created_at, revoked_at
    FROM permissions
    WHERE id = ? AND owner_id = ?
    LIMIT 1
  `).get(permissionId, ownerId) as PermissionRow | undefined;
  return row ? toPermission(database, row) : null;
}

export function revokePermissionById(
  database: DatabaseSync,
  permissionId: string,
  ownerId: string,
  revokedAt: string,
): { permission: Permission; changed: boolean } | null {
  const existing = findPermissionForOwner(database, permissionId, ownerId);
  if (!existing) return null;

  if (existing.status !== 'active') return { permission: existing, changed: false };

  database.prepare(`
    UPDATE permissions
    SET status = 'revoked', revoked_at = ?
    WHERE id = ? AND owner_id = ? AND status = 'active'
  `).run(revokedAt, permissionId, ownerId);
  const permission = findPermissionForOwner(database, permissionId, ownerId);
  if (!permission) throw new Error('Permission disappeared after it was revoked.');
  return { permission, changed: true };
}
