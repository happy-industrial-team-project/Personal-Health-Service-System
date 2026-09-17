import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const configured = process.env.PHSS_DATABASE_FILE?.trim() || path.join('data', 'phss.sqlite');
const databasePath = path.resolve(process.cwd(), configured);

if (!existsSync(databasePath)) {
  console.error(`SQLite database not found: ${databasePath}`);
  console.error('Start the application and sign in once so the database can be initialized.');
  process.exitCode = 1;
} else {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').get()?.integrity_check;
    if (integrity !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${String(integrity)}`);
    }
    const foreignKeyErrors = database.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyErrors.length > 0) {
      throw new Error(`SQLite foreign-key check found ${foreignKeyErrors.length} violation(s).`);
    }
    const foreignKeysEnabled = database.prepare('PRAGMA foreign_keys').get()?.foreign_keys;
    if (foreignKeysEnabled !== 1) {
      throw new Error('SQLite foreign-key enforcement is disabled.');
    }
    const journalMode = database.prepare('PRAGMA journal_mode').get()?.journal_mode;
    if (journalMode !== 'delete') {
      throw new Error(`Expected SQLite rollback-journal mode, received: ${String(journalMode)}`);
    }

    const expectedTables = [
      'schema_migrations',
      'app_metadata',
      'users',
      'sessions',
      'health_records',
      'measurements',
      'permissions',
      'permission_scopes',
      'audit_events',
    ];
    const availableTables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name),
    );
    const missingTables = expectedTables.filter((table) => !availableTables.has(table));
    if (missingTables.length > 0) {
      throw new Error(`Missing SQLite table(s): ${missingTables.join(', ')}`);
    }

    const schemaVersion = database
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get().version;
    if (schemaVersion !== 2) {
      throw new Error(`Unsupported SQLite schema version: ${String(schemaVersion)}`);
    }
    console.log(`Database: ${databasePath}`);
    console.log(`Integrity: ${integrity}`);
    console.log('Foreign keys: ok');
    console.log(`Journal mode: ${journalMode}`);
    console.log(`Schema version: ${schemaVersion}`);
    for (const table of expectedTables.slice(2)) {
      const count = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
      console.log(`${table}: ${count}`);
    }
  } finally {
    database.close();
  }
}
