import { readFileSync } from 'node:fs';
import { getDatabase, withTransaction } from '../lib/server/database.ts';
import { appendAudit } from '../lib/server/audit.ts';

// Fill only an empty profile for the known fictional demo account. Never overwrite user edits.
const fields = JSON.parse(readFileSync(new URL('../data/demo-profile.json', import.meta.url), 'utf8'));
withTransaction((database) => {
  const user = database.prepare('SELECT id FROM users WHERE id = ? AND email = ?').get('user_demo_robert', 'demo@health.local');
  if (!user) throw new Error('The fictional demo account was not found.');
  if (database.prepare('SELECT 1 FROM health_profiles WHERE owner_id = ?').get(user.id)) {
    console.log('A profile already exists; it has been preserved.');
    return;
  }
  const profile = { ...fields, version: 1, updatedAt: new Date().toISOString() };
  database.prepare('INSERT INTO health_profiles (owner_id, profile_json, version, updated_at) VALUES (?, ?, ?, ?)').run(user.id, JSON.stringify(profile), profile.version, profile.updatedAt);
  appendAudit(database, { subjectUserId: user.id, actorUserId: null, action: 'profile.update', resourceType: 'health_profile', resourceId: user.id, outcome: 'success', metadata: { source: 'fictional_demo_seed', fromVersion: 0, toVersion: 1 } });
  console.log('Saved fictional personal health profile for Robert Lee.');
});
getDatabase().close();
