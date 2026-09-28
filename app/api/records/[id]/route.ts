import { requireSession } from '@/lib/server/auth';
import { withTransaction } from '@/lib/server/database';
import { appendAudit, requestContext } from '@/lib/server/audit';
import { apiSuccess, handleApi, parseJsonObject } from '@/lib/server/http';
import { ownedRecord, recordHistory, updateRecord, voidRecord } from '@/lib/server/record-history';
import { enumValue, finiteNumber, isoDateTime, optionalString, requiredString } from '@/lib/server/validation';
import { recordTypes } from '@/lib/server/types';
import { ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const { id } = await context.params;
    const body = await parseJsonObject(request, ['action', 'expectedVersion', 'reason']);
    enumValue(body.action, 'action', ['void'] as const);
    const version = finiteNumber(body.expectedVersion, 'expectedVersion', { min: 1, max: Number.MAX_SAFE_INTEGER });
    if (!Number.isSafeInteger(version)) throw new ApiError(400, 'VALIDATION_ERROR', 'The expected version must be an integer.');
    const reason = requiredString(body.reason, 'reason', { max: 500 });
    const record = withTransaction((database) => {
      const existing = ownedRecord(database, id, session.user.id);
      const record = voidRecord(database, existing, version, reason, session.user.id);
      appendAudit(database, {
        subjectUserId: session.user.id, actorUserId: session.user.id, action: 'record.void',
        resourceType: 'health_record', resourceId: id, outcome: 'success',
        metadata: { ...requestContext(request), fromVersion: existing.version, toVersion: record.version },
      });
      return record;
    });
    return apiSuccess({ record });
  });
}

export async function GET(request: Request, context: Context): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const { id } = await context.params;
    const result = withTransaction((database) => {
      const record = ownedRecord(database, id, session.user.id);
      const versions = recordHistory(database, id);
      appendAudit(database, {
        subjectUserId: session.user.id, actorUserId: session.user.id,
        action: 'record.history.list', resourceType: 'health_record', resourceId: id,
        outcome: 'success', metadata: requestContext(request),
      });
      return { record, versions };
    });
    return apiSuccess(result);
  });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return handleApi(async () => {
    const session = await requireSession(request);
    const { id } = await context.params;
    const body = await parseJsonObject(request, ['type', 'title', 'description', 'occurredAt', 'expectedVersion', 'reason']);
    const edits = {
      type: enumValue(body.type, 'type', recordTypes),
      title: requiredString(body.title, 'title', { max: 120 }),
      description: optionalString(body.description, 'description', 2000) ?? '',
      occurredAt: isoDateTime(body.occurredAt, 'occurredAt'),
    };
    const expectedVersion = finiteNumber(body.expectedVersion, 'expectedVersion', { min: 1, max: Number.MAX_SAFE_INTEGER });
    if (!Number.isSafeInteger(expectedVersion)) throw new ApiError(400, 'VALIDATION_ERROR', 'The expected version must be an integer.');
    const reason = requiredString(body.reason, 'reason', { max: 500 });
    const result = withTransaction((database) => {
      const existing = ownedRecord(database, id, session.user.id);
      const result = updateRecord(database, existing, edits, expectedVersion, reason, session.user.id);
      if (result.changed) appendAudit(database, {
        subjectUserId: session.user.id, actorUserId: session.user.id,
        action: 'record.update', resourceType: 'health_record', resourceId: id, outcome: 'success',
        metadata: { ...requestContext(request), fromVersion: existing.version, toVersion: result.record.version },
      });
      return result;
    });
    return apiSuccess(result);
  });
}
