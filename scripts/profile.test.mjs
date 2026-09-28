import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
const directory = mkdtempSync(path.join(tmpdir(), 'phss-profile-'));
process.env.PHSS_DATABASE_FILE = path.join(directory, 'test.sqlite');
process.env.PHSS_DATA_FILE = path.resolve('data/seed.json');
process.env.PHSS_SESSION_SECRET = 'profile-test-secret-01234567890123456789';
const { getDatabase } = await import('../lib/server/database.ts');
const { firstUser } = await import('../lib/server/store.ts');
const { createAuthenticatedSession } = await import('../lib/server/auth.ts');
const { GET, PUT } = await import('../app/api/profile/route.ts');
after(() => { globalThis.__phssDatabaseState?.connection.close(); delete globalThis.__phssDatabaseState; rmSync(directory, { recursive: true, force: true }); });
test('profile validation, persistence, isolation, conflicts and atomic audit', async () => {
  let db = getDatabase();
  const user = firstUser(db);
  const token = (await createAuthenticatedSession(user, new Request('http://localhost/test'))).token;
  const req = (body, auth = token) => new Request('http://localhost/api/profile', { method: body ? 'PUT' : 'GET', headers: { 'content-type': 'application/json', cookie: `phss_session=${auth}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await GET(req(undefined, ''))).status, 401);
  const initial = (await (await GET(req())).json()).data.profile;
  assert.equal(initial.version, 1);
  assert.equal(initial.name, user.name);
  const demoProfile = JSON.parse(readFileSync('data/demo-profile.json', 'utf8'));
  for (const [key, value] of Object.entries(demoProfile)) assert.equal(initial[key], value);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE id = 'audit_seed_demo_profile'").get().n, 1);
  const { version, updatedAt, ...fields } = initial;
  void updatedAt;
  const body = { ...fields, name: '测试用户', birthDate: '1998-02-28', heightCm: 175.5, weightKg: 65, gender: 'male', bloodType: 'AB', medicalHistory: '既往病史', familyHistory: '家族病史', allergies: '过敏史', medications: '当前用药', expectedVersion: version };
  assert.equal((await PUT(req(body, ''))).status, 401);
  for (const patch of [{ name: '' }, { birthDate: '1998-02-30' }, { birthDate: '2999-01-01' }, { heightCm: -1 }, { weightKg: 0 }, { gender: 'invalid' }, { bloodType: 'invalid' }, { ownerId: 'other' }, { expectedVersion: 0.5 }]) {
    assert.equal((await PUT(req({ ...body, ...patch }))).status, 400);
  }
  assert.equal((await PUT(req(body))).status, 200);
  const saved = (await (await GET(req())).json()).data.profile;
  for (const key of Object.keys(fields)) assert.equal(saved[key], body[key]);
  assert.equal(saved.version, 2);
  assert.equal(db.prepare('SELECT name FROM users WHERE id = ?').get(user.id).name, body.name);
  assert.equal((await PUT(req(body))).status, 409);
  db.prepare(`INSERT INTO users SELECT 'other', 'other@health.local', 'Other', role, password_algorithm, password_salt, password_hash, password_key_length, created_at FROM users WHERE id = ?`).run(user.id);
  const otherToken = (await createAuthenticatedSession({ ...user, id: 'other', name: 'Other' }, new Request('http://localhost/test'))).token;
  const other = (await (await GET(req(undefined, otherToken))).json()).data.profile;
  assert.equal(other.version, 0); assert.equal(other.allergies, '');
  db.exec("CREATE TRIGGER fail_profile_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'profile.update' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END;");
  const oldError = console.error; console.error = () => {};
  try { assert.equal((await PUT(req({ ...body, expectedVersion: 2, name: 'Must roll back' }))).status, 500); }
  finally { console.error = oldError; db.exec('DROP TRIGGER fail_profile_audit'); }
  assert.equal(db.prepare('SELECT name FROM users WHERE id = ?').get(user.id).name, body.name);
  assert.deepEqual((await (await GET(req())).json()).data.profile, saved);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='profile.update' AND actor_user_id = ?").get(user.id).n, 1);
  db.close(); delete globalThis.__phssDatabaseState; db = getDatabase();
  assert.deepEqual((await (await GET(req())).json()).data.profile, saved);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
});
