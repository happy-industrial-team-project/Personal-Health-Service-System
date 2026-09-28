import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from './http';
import type { HealthRecord, HealthRecordVersion } from './types';

export function ownedRecord(database: DatabaseSync, id: string, ownerId: string): HealthRecord {
  const row = database.prepare(`
    SELECT id, owner_id AS ownerId, type, title, description, occurred_at AS occurredAt,
      source, organization, created_at AS createdAt, updated_at AS updatedAt, version,
      voided_at AS voidedAt, void_reason AS voidReason
    FROM health_records WHERE id = ? AND owner_id = ?
  `).get(id, ownerId) as HealthRecord | undefined;
  if (!row) throw new ApiError(404, 'RECORD_NOT_FOUND', 'The health record does not exist.');
  return row;
}

export function recordHistory(database: DatabaseSync, id: string): HealthRecordVersion[] {
  const rows = database.prepare(`
    SELECT v.version, v.snapshot_json, v.changed_at, u.name AS changed_by, v.reason, v.baseline
    FROM health_record_versions v LEFT JOIN users u ON u.id = v.actor_user_id
    WHERE v.record_id = ? ORDER BY v.version DESC
  `).all(id) as Array<{
    version: number; snapshot_json: string; changed_at: string;
    changed_by: string | null; reason: string; baseline: number;
  }>;
  return rows.map((row) => ({
    version: row.version, record: { voidedAt: null, voidReason: null, ...JSON.parse(row.snapshot_json) } as HealthRecord,
    changedAt: row.changed_at, changedBy: row.changed_by, reason: row.reason,
    baseline: Boolean(row.baseline),
  }));
}

export function updateRecord(
  database: DatabaseSync, existing: HealthRecord,
  edits: Pick<HealthRecord, 'title' | 'description' | 'type' | 'occurredAt'>,
  expectedVersion: number, reason: string, actorId: string,
): { record: HealthRecord; changed: boolean } {
  if (existing.voidedAt) throw new ApiError(409, 'RECORD_VOIDED', 'This record is voided and cannot be edited. Its history remains available.');
  if (existing.version !== expectedVersion) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'This record was changed elsewhere. Reopen it to review the latest version before saving. Your edits have not been saved.');
  }
  const changed = Object.entries(edits).some(([key, value]) => existing[key as keyof typeof edits] !== value);
  if (!changed) return { record: existing, changed: false };
  const record = { ...existing, ...edits, version: existing.version + 1, updatedAt: new Date().toISOString() };
  database.prepare(`
    UPDATE health_records SET type = ?, title = ?, description = ?, occurred_at = ?, updated_at = ?, version = ?
    WHERE id = ? AND owner_id = ? AND version = ?
  `).run(record.type, record.title, record.description, record.occurredAt, record.updatedAt,
    record.version, record.id, record.ownerId, expectedVersion);
  database.prepare(`
    INSERT INTO health_record_versions (record_id, version, snapshot_json, changed_at, actor_user_id, reason, baseline)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(record.id, record.version, JSON.stringify(record), record.updatedAt, actorId, reason);
  return { record, changed: true };
}

export function voidRecord(database: DatabaseSync, existing: HealthRecord, expectedVersion: number, reason: string, actorId: string): HealthRecord {
  if (existing.version !== expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'This record changed elsewhere. Reopen it before voiding.');
  if (existing.voidedAt) throw new ApiError(409, 'RECORD_VOIDED', 'This record is already voided.');
  const now = new Date().toISOString();
  const record = { ...existing, voidedAt: now, voidReason: reason, updatedAt: now, version: existing.version + 1 };
  database.prepare(`UPDATE health_records SET voided_at = ?, void_reason = ?, updated_at = ?, version = ?
    WHERE id = ? AND owner_id = ? AND version = ?`).run(now, reason, now, record.version, record.id, record.ownerId, expectedVersion);
  database.prepare(`INSERT INTO health_record_versions (record_id, version, snapshot_json, changed_at, actor_user_id, reason, baseline)
    VALUES (?, ?, ?, ?, ?, ?, 0)`).run(record.id, record.version, JSON.stringify(record), now, actorId, reason);
  return record;
}
