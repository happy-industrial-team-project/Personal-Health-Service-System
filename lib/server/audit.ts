import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { withTransaction } from './database';
import type { AuditEvent, AuditMetadataValue, AuditOutcome } from './types';

export type AuditInput = {
  subjectUserId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, AuditMetadataValue>;
};

type AuditRow = {
  id: string;
  subject_user_id: string | null;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: AuditOutcome;
  created_at: string;
  metadata_json: string;
};

export type AuditQuery = {
  subjectUserId: string;
  action: string | null;
  resourceType: string | null;
  outcome: AuditOutcome | null;
  from: string | null;
  to: string | null;
  limit: number;
};

function parseMetadata(raw: string): Record<string, AuditMetadataValue> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

    const result: Record<string, AuditMetadataValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) {
        result[key] = item as AuditMetadataValue;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function toAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    subjectUserId: row.subject_user_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    createdAt: row.created_at,
    metadata: parseMetadata(row.metadata_json),
  };
}

export function appendAudit(database: DatabaseSync, input: AuditInput): AuditEvent {
  const event: AuditEvent = {
    id: `audit_${randomUUID()}`,
    subjectUserId: input.subjectUserId,
    actorUserId: input.actorUserId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    outcome: input.outcome,
    createdAt: new Date().toISOString(),
    metadata: input.metadata ?? {},
  };

  database.prepare(`
    INSERT INTO audit_events (
      id, subject_user_id, actor_user_id, action, resource_type,
      resource_id, outcome, created_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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

  return event;
}

export function writeAudit(input: AuditInput): AuditEvent {
  return withTransaction((database) => appendAudit(database, input));
}

export function listAuditEvents(database: DatabaseSync, filters: AuditQuery): AuditEvent[] {
  const conditions = ['subject_user_id = ?'];
  const parameters: SQLInputValue[] = [filters.subjectUserId];
  if (filters.action) {
    conditions.push('action = ?');
    parameters.push(filters.action);
  }
  if (filters.resourceType) {
    conditions.push('resource_type = ?');
    parameters.push(filters.resourceType);
  }
  if (filters.outcome) {
    conditions.push('outcome = ?');
    parameters.push(filters.outcome);
  }
  if (filters.from) {
    conditions.push('created_at >= ?');
    parameters.push(filters.from);
  }
  if (filters.to) {
    conditions.push('created_at <= ?');
    parameters.push(filters.to);
  }
  parameters.push(filters.limit);

  const rows = database.prepare(`
    SELECT
      id, subject_user_id, actor_user_id, action, resource_type,
      resource_id, outcome, created_at, metadata_json
    FROM audit_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC, sequence DESC
    LIMIT ?
  `).all(...parameters) as AuditRow[];
  return rows.map(toAuditEvent);
}

export function requestContext(request: Request): Record<string, AuditMetadataValue> {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const userAgent = request.headers.get('user-agent')?.trim();
  return {
    ipAddress: (forwarded || realIp || 'unknown').slice(0, 100),
    userAgent: (userAgent || 'unknown').slice(0, 300),
  };
}
