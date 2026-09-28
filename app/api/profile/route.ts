import { requireSession } from '@/lib/server/auth';
import { withTransaction } from '@/lib/server/database';
import { appendAudit, requestContext } from '@/lib/server/audit';
import { ApiError, apiSuccess, handleApi, parseJsonObject } from '@/lib/server/http';
import { enumValue, finiteNumber, optionalString, requiredString } from '@/lib/server/validation';
import { genders, bloodTypes, type HealthProfile, type HealthProfileFields, type HealthProfileVersion } from '@/lib/profile';
import type { DatabaseSync } from 'node:sqlite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readProfile(database: DatabaseSync, ownerId: string, name: string): HealthProfile {
  const row = database.prepare('SELECT profile_json FROM health_profiles WHERE owner_id = ?').get(ownerId) as { profile_json: string } | undefined;
  return row ? JSON.parse(row.profile_json) as HealthProfile : {
    name, gender: 'unspecified', birthDate: null, heightCm: null, weightKg: null, bloodType: 'unknown',
    medicalHistory: '', familyHistory: '', allergies: '', medications: '', version: 0, updatedAt: null,
  };
}

function readHistory(database: DatabaseSync, ownerId: string): HealthProfileVersion[] {
  const rows = database.prepare(`
    SELECT version, snapshot_json, changed_at, actor_name, reason, baseline
    FROM health_profile_versions WHERE owner_id = ? ORDER BY version DESC
  `).all(ownerId) as Array<{
    version: number; snapshot_json: string; changed_at: string;
    actor_name: string | null; reason: string; baseline: number;
  }>;
  return rows.map((row) => ({
    version: row.version,
    profile: JSON.parse(row.snapshot_json) as HealthProfile,
    changedAt: row.changed_at,
    changedBy: row.actor_name,
    reason: row.reason,
    baseline: Boolean(row.baseline),
  }));
}

export async function GET(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const result = withTransaction((database) => {
      const profile = readProfile(database, session.user.id, session.user.name);
      const versions = readHistory(database, session.user.id);
      appendAudit(database, { subjectUserId: session.user.id, actorUserId: session.user.id, action: 'profile.list', resourceType: 'health_profile', resourceId: session.user.id, outcome: 'success', metadata: requestContext(request) });
      return { profile, versions };
    });
    return apiSuccess(result);
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const body = await parseJsonObject(request, ['name', 'gender', 'birthDate', 'heightCm', 'weightKg', 'bloodType', 'medicalHistory', 'familyHistory', 'allergies', 'medications', 'expectedVersion', 'reason']);
    const birthDate = optionalString(body.birthDate, 'birthDate', 10);
    if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(Date.parse(birthDate)) || new Date(birthDate).toISOString().slice(0, 10) !== birthDate || birthDate < '1900-01-01' || birthDate > new Date().toISOString().slice(0, 10))) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a valid birth date between 1900 and today.', { birthDate: 'Invalid birth date.' });
    }
    const expectedVersion = finiteNumber(body.expectedVersion, 'expectedVersion', { min: 0, max: Number.MAX_SAFE_INTEGER - 1 });
    if (!Number.isSafeInteger(expectedVersion)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid profile version.');
    const reason = expectedVersion === 0
      ? optionalString(body.reason, 'reason', 500) ?? 'Initial saved profile'
      : requiredString(body.reason, 'reason', { max: 500 });
    const fields: HealthProfileFields = {
      name: requiredString(body.name, 'name', { max: 100 }),
      gender: enumValue(body.gender, 'gender', genders), birthDate,
      heightCm: body.heightCm === null ? null : finiteNumber(body.heightCm, 'heightCm', { min: 20, max: 300 }),
      weightKg: body.weightKg === null ? null : finiteNumber(body.weightKg, 'weightKg', { min: 0.5, max: 700 }),
      bloodType: enumValue(body.bloodType, 'bloodType', bloodTypes),
      medicalHistory: optionalString(body.medicalHistory, 'medicalHistory', 2000) ?? '',
      familyHistory: optionalString(body.familyHistory, 'familyHistory', 2000) ?? '',
      allergies: optionalString(body.allergies, 'allergies', 2000) ?? '',
      medications: optionalString(body.medications, 'medications', 2000) ?? '',
    };
    const result = withTransaction((database) => {
      const previous = readProfile(database, session.user.id, session.user.name);
      if (previous.version !== expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'Your profile changed elsewhere. Copy your edits, reload the saved profile, then try again.');
      const changed = previous.version === 0 || (Object.keys(fields) as Array<keyof HealthProfileFields>).some((key) => previous[key] !== fields[key]);
      if (!changed) return { profile: previous, versions: readHistory(database, session.user.id), changed: false };
      const profile: HealthProfile = { ...fields, version: previous.version + 1, updatedAt: new Date().toISOString() };
      database.prepare(`INSERT INTO health_profiles (owner_id, profile_json, version, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(owner_id) DO UPDATE SET profile_json = excluded.profile_json, version = excluded.version, updated_at = excluded.updated_at`).run(session.user.id, JSON.stringify(profile), profile.version, profile.updatedAt);
      database.prepare(`INSERT INTO health_profile_versions
        (owner_id, version, snapshot_json, changed_at, actor_user_id, actor_name, reason, baseline)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)`).run(session.user.id, profile.version, JSON.stringify(profile), profile.updatedAt, session.user.id, session.user.name, reason);
      database.prepare('UPDATE users SET name = ? WHERE id = ?').run(profile.name, session.user.id);
      appendAudit(database, { subjectUserId: session.user.id, actorUserId: session.user.id, action: 'profile.update', resourceType: 'health_profile', resourceId: session.user.id, outcome: 'success', metadata: { ...requestContext(request), fromVersion: previous.version, toVersion: profile.version, reason } });
      return { profile, versions: readHistory(database, session.user.id), changed: true };
    });
    return apiSuccess(result);
  });
}
