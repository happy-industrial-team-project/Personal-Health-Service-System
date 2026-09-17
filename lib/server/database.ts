import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DatabaseBootstrapV1 } from './types';

const DEFAULT_DATABASE_FILE = path.join('data', 'phss.sqlite');
const DEFAULT_LEGACY_FILE = path.join('data', 'store.json');
const SEED_FILE = path.join(process.cwd(), 'data', 'seed.json');
const LATEST_SCHEMA_VERSION = 2;
const CONNECTION_CONFIG_VERSION = 1;

type DatabaseState = {
  connection: DatabaseSync;
  filePath: string;
  schemaVersion: number;
  connectionConfigVersion: number;
};

const globalWithDatabase = globalThis as typeof globalThis & {
  __phssDatabaseState?: DatabaseState;
};
const activeTransactions = new WeakSet<DatabaseSync>();

function rollbackBestEffort(database: DatabaseSync): void {
  try {
    database.exec('ROLLBACK');
  } catch {
    // SQLite can end a transaction itself after some I/O failures. Preserve the
    // original error instead of replacing it with "no transaction is active".
  }
}

function configuredDatabasePath(): string {
  const configured = process.env.PHSS_DATABASE_FILE?.trim();
  return path.resolve(process.cwd(), configured || DEFAULT_DATABASE_FILE);
}

function bootstrapSourcePath(): string {
  const configured = process.env.PHSS_DATA_FILE?.trim();
  if (configured) {
    const configuredPath = path.resolve(process.cwd(), configured);
    if (!existsSync(configuredPath)) {
      throw new Error(`PHSS_DATA_FILE does not exist: ${configuredPath}`);
    }
    return configuredPath;
  }

  const legacyPath = path.resolve(process.cwd(), DEFAULT_LEGACY_FILE);
  return existsSync(legacyPath) ? legacyPath : SEED_FILE;
}

function assertSeedDatabase(value: unknown): asserts value is DatabaseBootstrapV1 {
  if (typeof value !== 'object' || value === null) {
    throw new Error('The database bootstrap file must contain an object.');
  }

  const candidate = value as Partial<DatabaseBootstrapV1>;
  if (candidate.schemaVersion !== 1) {
    throw new Error('The database bootstrap file uses an unsupported schema version.');
  }

  for (const key of ['users', 'sessions', 'records', 'measurements', 'permissions', 'auditEvents'] as const) {
    if (!Array.isArray(candidate[key])) {
      throw new Error(`The database bootstrap field "${key}" must be an array.`);
    }
  }
}

function migrationVersion(database: DatabaseSync): number {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const row = database
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as { version: number };
  return row.version;
}

function configureConnection(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
  `);
}

function applyMigrations(database: DatabaseSync): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    const currentVersion = migrationVersion(database);
    if (currentVersion > LATEST_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${currentVersion} is newer than this application supports (${LATEST_SCHEMA_VERSION}).`,
      );
    }

    if (currentVersion < 1) {
      database.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL COLLATE NOCASE UNIQUE,
          name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('patient')),
          password_algorithm TEXT NOT NULL CHECK (password_algorithm = 'scrypt'),
          password_salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_key_length INTEGER NOT NULL CHECK (password_key_length > 0),
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT
        ) STRICT;

        CREATE TABLE health_records (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN (
            'medical_report', 'health_metric', 'medication', 'allergy', 'medical_history', 'other'
          )),
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('self', 'hospital', 'clinician', 'device', 'other')),
          organization TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE measurements (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          metric TEXT NOT NULL CHECK (metric IN (
            'blood_pressure_systolic', 'blood_pressure_diastolic', 'blood_glucose',
            'heart_rate', 'weight', 'body_temperature', 'oxygen_saturation'
          )),
          value REAL NOT NULL,
          unit TEXT NOT NULL,
          measured_at TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('manual', 'device', 'hospital', 'clinician')),
          notes TEXT,
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE permissions (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          grantee_name TEXT NOT NULL,
          grantee_type TEXT NOT NULL CHECK (grantee_type IN ('clinician', 'hospital', 'caregiver')),
          organization TEXT,
          status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        ) STRICT;

        CREATE TABLE permission_scopes (
          permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
          scope TEXT NOT NULL CHECK (scope IN ('records:read', 'measurements:read')),
          position INTEGER NOT NULL CHECK (position >= 0),
          PRIMARY KEY (permission_id, scope),
          UNIQUE (permission_id, position)
        ) STRICT;

        CREATE TABLE audit_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          subject_user_id TEXT,
          actor_user_id TEXT,
          action TEXT NOT NULL,
          resource_type TEXT NOT NULL,
          resource_id TEXT,
          outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
          created_at TEXT NOT NULL,
          metadata_json TEXT NOT NULL
        ) STRICT;

        CREATE INDEX sessions_user_expiry_idx
          ON sessions(user_id, expires_at);
        CREATE INDEX health_records_owner_occurred_idx
          ON health_records(owner_id, occurred_at DESC);
        CREATE INDEX health_records_owner_type_idx
          ON health_records(owner_id, type);
        CREATE INDEX measurements_owner_measured_idx
          ON measurements(owner_id, measured_at DESC);
        CREATE INDEX measurements_owner_metric_idx
          ON measurements(owner_id, metric);
        CREATE INDEX permissions_owner_status_idx
          ON permissions(owner_id, status, created_at DESC);
        CREATE INDEX audit_events_subject_created_idx
          ON audit_events(subject_user_id, created_at DESC);

        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (1, 'initial_relational_schema', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    }

    if (currentVersion < 2) {
      database.exec(`
        CREATE TABLE app_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (2, 'bootstrap_state', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    }

    database.exec('COMMIT');
  } catch (error) {
    rollbackBestEffort(database);
    throw error;
  }
}

function readBootstrapData(): { data: DatabaseBootstrapV1; source: string } {
  const source = bootstrapSourcePath();
  const parsed = JSON.parse(readFileSync(source, 'utf8')) as unknown;
  assertSeedDatabase(parsed);
  return { data: parsed, source };
}

function bootstrapIfNeeded(database: DatabaseSync): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    const marker = database
      .prepare("SELECT value FROM app_metadata WHERE key = 'bootstrap_complete'")
      .get() as { value: string } | undefined;
    if (marker) {
      database.exec('COMMIT');
      return;
    }

    const row = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    if (row.count > 0) {
      database.prepare(`
        INSERT INTO app_metadata (key, value, updated_at)
        VALUES ('bootstrap_complete', 'existing_database', ?)
      `).run(new Date().toISOString());
      database.exec('COMMIT');
      return;
    }

    const { data, source } = readBootstrapData();
    const insertUser = database.prepare(`
      INSERT INTO users (
        id, email, name, role, password_algorithm, password_salt,
        password_hash, password_key_length, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const user of data.users) {
      insertUser.run(
        user.id,
        user.email,
        user.name,
        user.role,
        user.password.algorithm,
        user.password.salt,
        user.password.hash,
        user.password.keyLength,
        user.createdAt,
      );
    }

    const insertSession = database.prepare(`
      INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const session of data.sessions) {
      insertSession.run(
        session.id,
        session.userId,
        session.createdAt,
        session.expiresAt,
        session.revokedAt,
      );
    }

    const insertRecord = database.prepare(`
      INSERT INTO health_records (
        id, owner_id, type, title, description, occurred_at, source,
        organization, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of data.records) {
      insertRecord.run(
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

    const insertMeasurement = database.prepare(`
      INSERT INTO measurements (
        id, owner_id, metric, value, unit, measured_at, source, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const measurement of data.measurements) {
      insertMeasurement.run(
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

    const insertPermission = database.prepare(`
      INSERT INTO permissions (
        id, owner_id, grantee_name, grantee_type, organization,
        status, expires_at, created_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertScope = database.prepare(`
      INSERT INTO permission_scopes (permission_id, scope, position)
      VALUES (?, ?, ?)
    `);
    for (const permission of data.permissions) {
      insertPermission.run(
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
      permission.scopes.forEach((scope, index) => {
        insertScope.run(permission.id, scope, index);
      });
    }

    const insertAudit = database.prepare(`
      INSERT INTO audit_events (
        id, subject_user_id, actor_user_id, action, resource_type,
        resource_id, outcome, created_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of data.auditEvents) {
      insertAudit.run(
        event.id,
        event.subjectUserId,
        event.actorUserId,
        event.action,
        event.resourceType,
        event.resourceId,
        event.outcome,
        event.createdAt,
        JSON.stringify(event.metadata),
      );
    }

    database.prepare(`
      INSERT INTO app_metadata (key, value, updated_at)
      VALUES ('bootstrap_complete', ?, ?)
    `).run(path.relative(process.cwd(), source), new Date().toISOString());

    database.exec('COMMIT');
    console.info(`Initialized SQLite database from ${path.relative(process.cwd(), source)}.`);
  } catch (error) {
    rollbackBestEffort(database);
    throw error;
  }
}

export function getDatabase(): DatabaseSync {
  const filePath = configuredDatabasePath();
  const current = globalWithDatabase.__phssDatabaseState;
  if (current?.filePath === filePath) {
    if ((current.connectionConfigVersion ?? 0) < CONNECTION_CONFIG_VERSION) {
      configureConnection(current.connection);
      current.connectionConfigVersion = CONNECTION_CONFIG_VERSION;
    }
    if ((current.schemaVersion ?? 0) < LATEST_SCHEMA_VERSION) {
      applyMigrations(current.connection);
      bootstrapIfNeeded(current.connection);
      current.schemaVersion = LATEST_SCHEMA_VERSION;
    }
    return current.connection;
  }

  if (current) {
    current.connection.close();
    delete globalWithDatabase.__phssDatabaseState;
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  const connection = new DatabaseSync(filePath, {
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
  });
  try {
    configureConnection(connection);

    applyMigrations(connection);
    bootstrapIfNeeded(connection);
    globalWithDatabase.__phssDatabaseState = {
      connection,
      filePath,
      schemaVersion: LATEST_SCHEMA_VERSION,
      connectionConfigVersion: CONNECTION_CONFIG_VERSION,
    };
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

export function withDatabase<T>(operation: (database: DatabaseSync) => T): T {
  return operation(getDatabase());
}

export function withTransaction<T>(
  operation: (database: DatabaseSync) => T,
  ...mustBeSynchronous: T extends PromiseLike<unknown> ? [never] : []
): T;
export function withTransaction<T>(
  operation: (database: DatabaseSync) => T,
  ..._mustBeSynchronous: never[]
): T {
  if (_mustBeSynchronous.length > 0) {
    throw new Error('SQLite transactions accept exactly one synchronous callback.');
  }
  const database = getDatabase();
  if (activeTransactions.has(database)) {
    throw new Error('Nested SQLite transactions are not supported.');
  }
  if (operation.constructor.name === 'AsyncFunction') {
    throw new Error('SQLite transactions must use a synchronous callback.');
  }

  database.exec('BEGIN IMMEDIATE');
  activeTransactions.add(database);
  try {
    const result = operation(database);
    if (
      result !== null
      && (typeof result === 'object' || typeof result === 'function')
      && 'then' in result
    ) {
      throw new Error('SQLite transactions must use a synchronous callback.');
    }
    database.exec('COMMIT');
    return result;
  } catch (error) {
    rollbackBestEffort(database);
    throw error;
  } finally {
    activeTransactions.delete(database);
  }
}
