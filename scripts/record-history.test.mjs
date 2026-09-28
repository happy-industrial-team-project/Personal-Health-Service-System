import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'phss-record-history-'));
process.env.PHSS_DATABASE_FILE = path.join(directory, 'test.sqlite');
process.env.PHSS_DATA_FILE = path.resolve('data/seed.json');
process.env.PHSS_SESSION_SECRET = 'record-history-test-secret-only-0123456789';
const { getDatabase, withTransaction } = await import('../lib/server/database.ts');
const { firstUser } = await import('../lib/server/store.ts');
const { createAuthenticatedSession } = await import('../lib/server/auth.ts');
const { GET, PATCH, POST: voidRecord } = await import('../app/api/records/[id]/route.ts');
const { POST, GET: listRecords } = await import('../app/api/records/route.ts');

after(() => {
  globalThis.__phssDatabaseState?.connection.close();
  delete globalThis.__phssDatabaseState;
  rmSync(directory, { recursive: true, force: true });
});

test('record editing, snapshots, ownership, conflicts, audit, migration and persistence', async () => {
  let database = getDatabase();
  const user = firstUser(database);
  const originalCount = database.prepare('SELECT COUNT(*) AS n FROM health_records').get().n;
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM health_record_versions').get().n, originalCount);

  // Recreate the immediately preceding schema on this disposable database.
  database.exec(`DROP TRIGGER health_records_initial_version;
    DROP TABLE health_record_versions;
    ALTER TABLE health_records DROP COLUMN version;
    ALTER TABLE health_records DROP COLUMN voided_at;
    ALTER TABLE health_records DROP COLUMN void_reason;
    DROP TABLE health_profile_versions;
    DROP TABLE health_profiles;
    DELETE FROM schema_migrations WHERE version >= 3;`);
  database.close(); delete globalThis.__phssDatabaseState;
  database = getDatabase();
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM health_records').get().n, originalCount);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM health_record_versions WHERE baseline = 1').get().n, originalCount);

  const token = (await createAuthenticatedSession(user, new Request('http://localhost/test'))).token;
  function request(method = 'GET', body, authenticated = true) {
    return new Request('http://localhost/api/records/test', {
      method, headers: { 'content-type': 'application/json', ...(authenticated ? { cookie: `phss_session=${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  const payload = { type: 'allergy', title: 'Original allergy', description: 'Original details', occurredAt: '2026-09-01T04:00:00.000Z', source: 'self', organization: null };
  const createdResponse = await POST(request('POST', payload));
  assert.equal(createdResponse.status, 201);
  const original = (await createdResponse.json()).data.record;
  const context = { params: Promise.resolve({ id: original.id }) };
  const history = async () => (await (await GET(request(), context)).json()).data;
  assert.equal((await history()).versions.length, 1);
  assert.equal((await GET(request('GET', undefined, false), context)).status, 401);
  assert.equal((await PATCH(request('PATCH', {}, false), context)).status, 401);
  assert.equal((await voidRecord(request('POST', {}, false), context)).status, 401);

  const edits = { type: 'medication', title: 'Updated record', description: 'Updated details\nSecond line', occurredAt: original.occurredAt, expectedVersion: 1, reason: 'Corrected entry' };
  for (const bad of [{ reason: '' }, { title: '' }, { expectedVersion: 1.5 }, { occurredAt: 'invalid' }, { ownerId: 'another-user' }, { source: 'hospital' }]) {
    assert.equal((await PATCH(request('PATCH', { ...edits, ...bad }), context)).status, 400);
  }
  const updatedResponse = await PATCH(request('PATCH', edits), context);
  assert.equal(updatedResponse.status, 200);
  const updated = (await updatedResponse.json()).data.record;
  assert.equal(updated.version, 2);
  assert.equal(updated.source, original.source);
  assert.equal(updated.createdAt, original.createdAt);
  const result = await history();
  assert.equal(result.versions.length, 2);
  assert.deepEqual(result.versions[1].record, original);
  assert.deepEqual(result.versions[0].record, updated);
  assert.equal(result.versions[0].reason, edits.reason);
  assert.equal(result.versions[0].changedBy, user.name);
  assert.equal((await PATCH(request('PATCH', edits), context)).status, 409);
  const unchanged = await PATCH(request('PATCH', { ...edits, expectedVersion: 2 }), context);
  assert.equal((await unchanged.json()).data.changed, false);
  assert.equal((await history()).versions.length, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'record.update' AND resource_id = ?").get(original.id).n, 1);

  // Force an audit write failure: both the content and its new version must roll back.
  database.exec("CREATE TRIGGER fail_record_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'record.update' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END;");
  const savedError = console.error;
  console.error = () => {};
  try {
    assert.equal((await PATCH(request('PATCH', { ...edits, title: 'Must roll back', expectedVersion: 2 }), context)).status, 500);
  } finally { console.error = savedError; database.exec('DROP TRIGGER fail_record_audit'); }
  assert.equal((await history()).record.title, updated.title);
  assert.equal((await history()).versions.length, 2);

  database.prepare(`INSERT INTO users SELECT 'other-owner', 'other@test.local', name, role, password_algorithm, password_salt, password_hash, password_key_length, created_at FROM users WHERE id = ?`).run(user.id);
  withTransaction((db) => db.prepare('UPDATE health_records SET owner_id = ? WHERE id = ?').run('other-owner', original.id));
  assert.equal((await GET(request(), context)).status, 404);
  assert.equal((await PATCH(request('PATCH', { ...edits, expectedVersion: 2 }), context)).status, 404);
  assert.equal((await voidRecord(request('POST', { action: 'void', expectedVersion: 2, reason: 'Wrong owner' }), context)).status, 404);
  database.prepare('UPDATE health_records SET owner_id = ? WHERE id = ?').run(user.id, original.id);
  assert.equal((await GET(request(), { params: Promise.resolve({ id: 'missing' }) })).status, 404);
  const listed = (await (await listRecords(new Request('http://localhost/api/records', { headers: { cookie: `phss_session=${token}` } }))).json()).data.records;
  assert.equal(listed.find((record) => record.id === original.id).version, 2);
  const searchRecords = async (parameters) => listRecords(new Request(`http://localhost/api/records?${new URLSearchParams(parameters)}`, { headers: { cookie: `phss_session=${token}` } }));
  const sameDay = await searchRecords({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-01T23:59:59.999Z', type: 'medication', q: 'Updated record' });
  assert.ok((await sameDay.json()).data.records.some((record) => record.id === original.id));
  const previousDay = await searchRecords({ to: '2026-08-31T23:59:59.999Z', q: 'Updated record' });
  assert.equal((await previousDay.json()).data.records.length, 0);
  const followingDay = await searchRecords({ from: '2026-09-02T00:00:00.000Z', q: 'Updated record' });
  assert.equal((await followingDay.json()).data.records.length, 0);
  assert.equal((await searchRecords({ from: '2026-09-02T00:00:00.000Z', to: '2026-09-01T23:59:59.999Z' })).status, 400);

  const voidBody = { action: 'void', expectedVersion: 2, reason: 'Duplicate record entered by mistake' };
  assert.equal((await voidRecord(request('POST', { ...voidBody, reason: ' ' }), context)).status, 400);
  assert.equal((await voidRecord(request('POST', { ...voidBody, expectedVersion: 1 }), context)).status, 409);
  database.exec("CREATE TRIGGER fail_void_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'record.void' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END;");
  console.error = () => {};
  try {
    assert.equal((await voidRecord(request('POST', voidBody), context)).status, 500);
  } finally { console.error = savedError; database.exec('DROP TRIGGER fail_void_audit'); }
  assert.equal((await history()).record.voidedAt, null);
  assert.equal((await history()).versions.length, 2);
  const voidResponse = await voidRecord(request('POST', voidBody), context);
  assert.equal(voidResponse.status, 200);
  const voided = (await voidResponse.json()).data.record;
  assert.equal(voided.version, 3);
  assert.equal(voided.title, updated.title);
  assert.equal(voided.description, updated.description);
  assert.equal(voided.voidReason, voidBody.reason);
  assert.ok(voided.voidedAt);
  const voidHistory = await history();
  assert.equal(voidHistory.versions.length, 3);
  assert.deepEqual(voidHistory.versions[1].record, updated);
  assert.deepEqual(voidHistory.versions[0].record, voided);
  assert.equal(voidHistory.versions[0].reason, voidBody.reason);
  assert.equal((await voidRecord(request('POST', { ...voidBody, expectedVersion: 3 }), context)).status, 409);
  assert.equal((await PATCH(request('PATCH', { ...edits, expectedVersion: 3 }), context)).status, 409);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'record.void' AND resource_id = ?").get(original.id).n, 1);
  const retained = (await (await listRecords(new Request('http://localhost/api/records', { headers: { cookie: `phss_session=${token}` } }))).json()).data.records;
  assert.equal(retained.find((record) => record.id === original.id).voidReason, voidBody.reason);

  database.close(); delete globalThis.__phssDatabaseState;
  database = getDatabase();
  assert.deepEqual((await history()).record, voided);
  assert.equal((await history()).versions.length, 3);
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
});
